import type { Env } from './env'
import type { LlmReply, ModelMessage, ModelOptions, Provider, ToolSpec } from './llm-types'
import { z } from 'zod'
import { AppError } from './errors'
import { requestFailure } from './llm-policy'
import { parseArguments, workerAiMessages, workerAiTools } from './llm-wire'

const workerAiReplySchema = z.object({
  response: z.string().nullish(),
  tool_calls: z.array(z.object({
    name: z.string().min(1),
    arguments: z.unknown().optional(),
  })).nullish(),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
  }).nullish(),
})

type CallWorkersAiRequest = { messages: ModelMessage[], tools: ToolSpec[], options: ModelOptions }

export async function callWorkersAi(
  env: Env,
  provider: Extract<Provider, { kind: 'workers-ai' }>,
  request: CallWorkersAiRequest,
): Promise<LlmReply> {
  const { messages, tools, options } = request

  if (!(env.AI !== undefined)) {
    throw new AppError(
      'AGENT_NOT_CONFIGURED',
      'This deployment has no Workers AI binding, so the `workers-ai` provider cannot be used.',
    )
  }
  const input: Record<string, unknown> = {
    messages: workerAiMessages(messages),
    temperature: 0,
  }
  if (tools.length > 0) {
    input.tools = workerAiTools(tools)
  }
  if (options.maxOutputTokens !== undefined) {
    input.max_tokens = options.maxOutputTokens
  }

  let payload: unknown
  try {
    payload = await env.AI.run(provider.model, input)
  }
  catch (error) {
    const failure = requestFailure(error)
    throw new AppError(failure.code, failure.message, failure.retryable)
  }
  const parsed = workerAiReplySchema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError(
      'PROVIDER_ERROR',
      'Workers AI returned a body that does not match the text-generation schema.',
      false,
    )
  }
  return {
    content: parsed.data.response ?? null,
    toolCalls: (parsed.data.tool_calls ?? []).map((call, index) => ({
      // The binding does not return an identifier, and the loop needs one to
      // correlate the result it feeds back.
      id: `call_${index}`,
      name: call.name,
      arguments: parseArguments(call.arguments),
    })),
    status: 'completed',
    finishReason: 'completed',
    statusDetail: null,
    usage: {
      promptTokens: parsed.data.usage?.prompt_tokens,
      completionTokens: parsed.data.usage?.completion_tokens,
    },
  }
}
