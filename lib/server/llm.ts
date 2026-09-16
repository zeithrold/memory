import type { Env } from './env'
import { z } from 'zod'
import { AppError } from './errors'

/**
 * One provider-neutral conversation interface over two backends.
 *
 * The catalog agent acts exclusively through tool calls, so tool calling is a
 * hard requirement rather than an optimisation: without it there is nothing to
 * audit. `openai-compatible` is the primary path because it is what makes the
 * deployment platform neutral; `workers-ai` is kept as an alternative for
 * deployments that already hold Workers AI quota.
 *
 * Two deliberate refusals:
 * - a redirect is never followed, so a bearer credential is never forwarded to
 *   another host (the same stance `examples/deepseek.py` takes);
 * - nothing is retried here. Retry policy belongs to the Workflow step, which
 *   can checkpoint around it.
 */
const TIMEOUT_MS = 120_000
const DETAIL_LIMIT = 400
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export const DEFAULT_PROBE_MODEL_TIMEOUT_MS = 30_000

export interface ToolSpec {
  name: string
  description: string
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>
}
/**
 * A JSON value. Tool arguments are typed rather than `unknown` so a model reply
 * can travel through a Workflow step, whose results must be serializable; the
 * tool layer still validates them before anything happens.
 */
export type JsonValue
  = | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue }
export interface LlmToolCall {
  /** Synthesised when a backend omits the identifier. */
  id: string
  name: string
  /** Parsed JSON when the backend returned a JSON string, otherwise the raw value. */
  arguments: JsonValue
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: LlmToolCall[]
}
export interface LlmReply {
  content: string | null
  toolCalls: LlmToolCall[]
  usage: { promptTokens?: number, completionTokens?: number }
}
export type Provider
  = | { kind: 'none' }
    | { kind: 'openai-compatible', model: string, baseUrl: string, apiKey: string }
    | { kind: 'workers-ai', model: string }

export interface ChatOptions {
  maxTokens?: number
  timeoutMs?: number
}

/** Everything except the plaintext credential, which never leaves the request. */
export function describeProvider(provider: Provider): { provider: string, model: string | null } {
  switch (provider.kind) {
    case 'none':
      return { provider: 'none', model: null }
    case 'workers-ai':
      return { provider: 'workers-ai', model: provider.model }
    case 'openai-compatible':
      return { provider: 'openai-compatible', model: provider.model }
  }
}

/**
 * Normalises a user-supplied base URL. A path is allowed because providers
 * commonly version it (`https://openrouter.ai/api/v1`); a query string or
 * fragment is not, because the service appends its own route.
 */
export function normalizeBaseUrl(raw: string, allowLoopbackHttp: boolean): string {
  const value = raw.trim()
  if (value.length === 0)
    throw new AppError('PROVIDER_ENDPOINT_INVALID', 'Enter a model endpoint URL.')
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new AppError('PROVIDER_ENDPOINT_INVALID', 'The model endpoint is not a valid URL.')
  }
  const loopback = LOOPBACK.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && allowLoopbackHttp)) {
    throw new AppError(
      'PROVIDER_ENDPOINT_INVALID',
      'The model endpoint must use HTTPS. Plain HTTP is accepted only for a loopback host outside production.',
    )
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new AppError(
      'PROVIDER_ENDPOINT_INVALID',
      'The model endpoint must not carry a query string or fragment.',
    )
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

function chatUrl(baseUrl: string): string {
  return `${baseUrl}/chat/completions`
}

function truncate(value: string): string {
  return value.length > DETAIL_LIMIT ? `${value.slice(0, DETAIL_LIMIT)}…` : value
}

const toolCallSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  function: z.object({
    name: z.string().min(1),
    // Providers disagree: a JSON string, a JSON string that is empty, or an
    // object. All three are accepted and normalised by the caller.
    arguments: z.unknown().optional(),
  }),
})
const replySchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z.array(toolCallSchema).nullish(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .nullish(),
})

/**
 * Narrows anything a provider sent into a JSON value. Providers disagree about
 * tool arguments: a JSON string, an object, or nothing at all.
 */
function toJsonValue(value: unknown): JsonValue {
  if (value === undefined || value === null)
    return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (Array.isArray(value))
    return value.map(item => toJsonValue(item))
  if (typeof value === 'object') {
    const object: { [key: string]: JsonValue } = {}
    for (const [key, item] of Object.entries(value))
      object[key] = toJsonValue(item)
    return object
  }
  return null
}

function parseArguments(value: unknown): JsonValue {
  if (typeof value !== 'string')
    return toJsonValue(value)
  const trimmed = value.trim()
  if (trimmed.length === 0)
    return {}
  try {
    return toJsonValue(JSON.parse(trimmed))
  }
  catch {
    // Left as a string on purpose: schema validation rejects it and the
    // rejection is fed back to the model as a tool result.
    return value
  }
}

function normalizeToolCalls(
  calls: z.infer<typeof toolCallSchema>[] | null | undefined,
): LlmToolCall[] {
  return (calls ?? []).map((call, index) => ({
    id: call.id ?? `call_${index}`,
    name: call.function.name,
    arguments: parseArguments(call.function.arguments),
  }))
}

/**
 * Renders the neutral conversation into the shape a backend accepts. The two
 * backends differ in how a tool result is correlated with its call, so the
 * translation lives here rather than in the loop.
 */
function openAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls !== undefined) {
      return {
        role: 'assistant',
        content: message.content.length > 0 ? message.content : null,
        tool_calls: message.toolCalls.map(call => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
        })),
      }
    }
    if (message.role === 'tool')
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
    return { role: message.role, content: message.content }
  })
}
function workerAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls !== undefined) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map(call => ({
          name: call.name,
          arguments: call.arguments ?? {},
        })),
      }
    }
    return { role: message.role, content: message.content }
  })
}
function openAiTools(tools: ToolSpec[]): unknown[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}
function workerAiTools(tools: ToolSpec[]): unknown[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

interface RequestFailure {
  code: 'PROVIDER_TIMEOUT' | 'PROVIDER_ERROR'
  message: string
  retryable: boolean
}

function requestFailure(error: unknown): RequestFailure {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return {
      code: 'PROVIDER_TIMEOUT',
      message: `The model endpoint did not answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`,
      retryable: true,
    }
  }
  const status = typeof error === 'object' && error !== null && 'status' in error
    && typeof error.status === 'number'
    ? error.status
    : null
  return {
    code: 'PROVIDER_ERROR',
    message: error instanceof Error
      ? `The model endpoint could not be reached: ${truncate(error.message)}`
      : 'The model endpoint could not be reached.',
    retryable: status === 429 || (status !== null && status >= 500),
  }
}

async function readFailureBody(response: Response): Promise<string> {
  try {
    return truncate((await response.text()).replace(/\s+/g, ' ').trim())
  }
  catch {
    return ''
  }
}
function isRedirect(response: Response): boolean {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)
}

async function callOpenAiCompatible(
  provider: Extract<Provider, { kind: 'openai-compatible' }>,
  messages: ChatMessage[],
  tools: ToolSpec[],
  options: ChatOptions,
): Promise<LlmReply> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: openAiMessages(messages),
    // Reproducibility matters for a system whose whole point is an auditable
    // trail of what the model decided.
    temperature: 0,
  }
  if (tools.length > 0) {
    body.tools = openAiTools(tools)
    body.tool_choice = 'auto'
  }
  if (options.maxTokens !== undefined)
    body.max_tokens = options.maxTokens

  let response: Response
  try {
    response = await fetch(chatUrl(provider.baseUrl), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    })
  }
  catch (error) {
    const failure = requestFailure(error)
    throw new AppError(failure.code, failure.message, failure.retryable)
  }
  if (isRedirect(response)) {
    throw new AppError(
      'PROVIDER_ENDPOINT_INVALID',
      'The model endpoint redirected the request. A redirect is refused so the credential is not forwarded to another host.',
      false,
    )
  }
  if (!response.ok) {
    const detail = await readFailureBody(response)
    throw new AppError(
      'PROVIDER_ERROR',
      `The model endpoint returned HTTP ${response.status}${detail.length > 0 ? `: ${detail}` : '.'}`,
      response.status === 408 || response.status === 429 || response.status >= 500,
    )
  }
  let payload: unknown
  try {
    payload = await response.json()
  }
  catch {
    throw new AppError('PROVIDER_ERROR', 'The model endpoint returned a body that is not JSON.', false)
  }
  const parsed = replySchema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError(
      'PROVIDER_ERROR',
      'The model endpoint returned a body that does not match the chat-completions schema.',
      false,
    )
  }
  const choice = parsed.data.choices[0]
  if (choice === undefined)
    throw new AppError('PROVIDER_ERROR', 'The model endpoint returned no completion choices.', false)
  return {
    content: choice.message.content ?? null,
    toolCalls: normalizeToolCalls(choice.message.tool_calls),
    usage: {
      promptTokens: parsed.data.usage?.prompt_tokens,
      completionTokens: parsed.data.usage?.completion_tokens,
    },
  }
}

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

async function callWorkersAi(
  env: Env,
  provider: Extract<Provider, { kind: 'workers-ai' }>,
  messages: ChatMessage[],
  tools: ToolSpec[],
  options: ChatOptions,
): Promise<LlmReply> {
  if (!env.AI) {
    throw new AppError(
      'AGENT_NOT_CONFIGURED',
      'This deployment has no Workers AI binding, so the `workers-ai` provider cannot be used.',
    )
  }
  const input: Record<string, unknown> = {
    messages: workerAiMessages(messages),
    temperature: 0,
  }
  if (tools.length > 0)
    input.tools = workerAiTools(tools)
  if (options.maxTokens !== undefined)
    input.max_tokens = options.maxTokens

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
    usage: {
      promptTokens: parsed.data.usage?.prompt_tokens,
      completionTokens: parsed.data.usage?.completion_tokens,
    },
  }
}

export async function chatWithTools(
  env: Env,
  provider: Provider,
  messages: ChatMessage[],
  tools: ToolSpec[],
  options: ChatOptions = {},
): Promise<LlmReply> {
  if (provider.kind === 'none') {
    throw new AppError(
      'AGENT_NOT_CONFIGURED',
      'No model endpoint is configured for this account.',
    )
  }
  if (provider.kind === 'openai-compatible')
    return callOpenAiCompatible(provider, messages, tools, options)
  return callWorkersAi(env, provider, messages, tools, options)
}

const PROBE_TOOL: ToolSpec = {
  name: 'ping',
  description: 'Report that the connection works. Call this tool immediately.',
  parameters: {
    type: 'object',
    properties: { ok: { type: 'boolean', description: 'Always true.' } },
    required: ['ok'],
    additionalProperties: false,
  },
}

export interface ProbeResult {
  reachable: boolean
  modelOk: boolean
  toolCallingOk: boolean
  detail: string
}
/**
 * Validates a saved configuration by using it once. Configuration mistakes are
 * the most likely failure of a bring-your-own-endpoint design, so they are
 * caught here rather than in a scheduled run the user never watches.
 *
 * The probe never throws: "your credential is wrong" is a successful probe with
 * a negative result, not a server fault.
 */
export async function probeProvider(env: Env, provider: Provider): Promise<ProbeResult> {
  if (provider.kind === 'none') {
    return {
      reachable: false,
      modelOk: false,
      toolCallingOk: false,
      detail: 'No model endpoint is configured.',
    }
  }
  try {
    const reply = await chatWithTools(
      env,
      provider,
      [
        {
          role: 'system',
          content:
            'You are a connectivity probe. Reply only by calling the provided tool.',
        },
        { role: 'user', content: 'Call the ping tool with ok set to true.' },
      ],
      [PROBE_TOOL],
      { maxTokens: 64, timeoutMs: DEFAULT_PROBE_MODEL_TIMEOUT_MS },
    )
    if (reply.toolCalls.length === 0) {
      const answered = reply.content?.trim() ?? ''
      return {
        reachable: true,
        modelOk: true,
        toolCallingOk: false,
        detail: answered.length > 0
          ? `The model answered without calling the tool: ${truncate(answered)}`
          : 'The model answered without calling the tool, so the catalog agent could not act.',
      }
    }
    return {
      reachable: true,
      modelOk: true,
      toolCallingOk: true,
      detail: `The endpoint answered and called ${reply.toolCalls[0]?.name ?? 'a tool'}.`,
    }
  }
  catch (error) {
    const message = error instanceof AppError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : 'The endpoint could not be reached.'
    return {
      reachable: false,
      modelOk: false,
      toolCallingOk: false,
      detail: truncate(message),
    }
  }
}
