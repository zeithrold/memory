import type { LlmReply, LlmToolCall, ModelMessage } from '../llm'
import type { ThinkResult, TurnInput } from './turn-store'
import { z } from 'zod'
import { AppError } from '../errors'
import { assertActionableReply, describeProvider, respondWithTools } from '../llm'
import { buildBatchMessage, buildSystemPrompt, rebuildMessages } from './prompt'
import { providerForOwner } from './settings'
import { toolsFor } from './tools'
import { loadTurn, loadTurnContext, loadTurns, now } from './turn-store'

interface PrepareTurnConversationContext {
  input: TurnInput
}
async function prepareTurnConversation(
  context: PrepareTurnConversationContext,
): Promise<{ messages: ModelMessage[] }> {
  const { input } = context
  const snapshot = await loadTurnContext(input)
  const runRow = await input.env.DB.prepare(
    'SELECT operator_prompt FROM catalog_runs WHERE id = ? AND owner_id = ?',
  )
    .bind(input.runId, input.ownerId)
    .first<{ operator_prompt: string | null }>()
  const systemPrompt = buildSystemPrompt(
    snapshot.categories,
    input.includeContent,
    runRow?.operator_prompt,
  )
  const batchMessage = buildBatchMessage(snapshot.memories)
  const messages: ModelMessage[] = rebuildMessages(
    systemPrompt,
    batchMessage,
    await loadTurns(input.env, input.runId, input.batch),
  )
  return { messages }
}

interface PersistModelTurnContext {
  input: TurnInput
  reply: LlmReply
  started: number
  provider: { kind: 'responses-api', model: string, baseUrl: string, apiKey: string }
    | { kind: 'workers-ai', model: string }
}
async function persistModelTurn(
  context: PersistModelTurnContext,
): Promise<void> {
  const { input, reply, started, provider } = context
  await input.env.DB.prepare(
    `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, tool_calls_json, prompt_tokens,
completion_tokens, latency_ms, finish_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, batch, turn) DO NOTHING`,
  )
    .bind(
      input.runId,
      input.ownerId,
      input.batch,
      input.turn,
      reply.content,
      JSON.stringify(reply.toolCalls),
      reply.usage.promptTokens ?? null,
      reply.usage.completionTokens ?? null,
      Date.now() - started,
      turnFinishReason(provider, reply),
      now(),
    )
    .run()
}
export async function thinkTurn(
  input: TurnInput,
): Promise<ThinkResult> {
  const existing = await loadTurn(input.env, input.runId, input.batch, input.turn)
  if (existing !== null && existing.tool_calls_json !== null) {
    const recordedCalls = z.array(z.looseObject({ id: z.string(), name: z.string(), arguments: z.json() })).parse(
      JSON.parse(existing.tool_calls_json),
    )
    // This turn already ran: a step retry must not pay for it twice.
    assertRecordedTurnActionable(existing.finish_reason, recordedCalls)
    return {
      turn: input.turn,
      content: existing.content,
      toolCallCount: recordedCalls.length,
      noToolCalls: recordedCalls.length === 0,
      promptTokens: null,
      completionTokens: null,
      provider: 'recorded',
      model: null,
    }
  }

  const provider = await providerForOwner(input.env, input.ownerId)
  if (provider.kind === 'none') {
    throw new AppError(
      'AGENT_NOT_CONFIGURED',
      'No model endpoint is configured for this account.',
    )
  }
  const { messages } = await prepareTurnConversation({ input })

  const started = Date.now()
  const reply = await respondWithTools(
    input.env,
    provider,
    {
      messages,
      tools: toolsFor({ includeSearch: false }),
      options: { maxOutputTokens: 4096 },
    },
  )
  const described = describeProvider(provider)

  await persistModelTurn({ input, reply, started, provider })

  // Persist the provider's terminal state and any paid usage before rejecting
  // an unusable response. A Workflow replay reads this row and raises the same
  // error without calling the provider again.
  if (provider.kind === 'responses-api') {
    assertActionableReply(reply)
  }

  return {
    turn: input.turn,
    content: reply.content,
    toolCallCount: reply.toolCalls.length,
    noToolCalls: reply.toolCalls.length === 0,
    promptTokens: reply.usage.promptTokens ?? null,
    completionTokens: reply.usage.completionTokens ?? null,
    provider: described.provider,
    model: described.model,
  }
}

function assertRecordedTurnActionable(
  finishReason: string | null,
  calls: LlmToolCall[],
): void {
  if (finishReason?.startsWith('incomplete:') === true) {
    throw new AppError(
      'PROVIDER_OUTPUT_INCOMPLETE',
      `The model response was incomplete (${finishReason.slice('incomplete:'.length)}).`,
      false,
    )
  }
  if (finishReason?.startsWith('failed:') === true) {
    throw new AppError(
      'PROVIDER_ERROR',
      `The model reported a failed response (${finishReason.slice('failed:'.length)}).`,
      false,
    )
  }
  if (finishReason === 'completed' && calls.length === 0) {
    throw new AppError(
      'PROVIDER_TOOL_UNSUPPORTED',
      'The model completed the request without calling a required tool.',
      false,
    )
  }
}

function turnFinishReason(
  provider: PersistModelTurnContext['provider'],
  reply: LlmReply,
): string | null {
  if (provider.kind === 'responses-api') {
    return reply.finishReason
  }
  return reply.toolCalls.length > 0 ? 'tool_calls' : 'stop'
}
