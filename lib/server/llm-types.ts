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

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: LlmToolCall[]
}

export interface LlmReply {
  content: string | null
  toolCalls: LlmToolCall[]
  status: 'completed' | 'incomplete' | 'failed'
  /** Persisted verbatim enough to distinguish completion from truncation/failure. */
  finishReason: string
  statusDetail: string | null
  usage: { promptTokens?: number, completionTokens?: number }
}

export type Provider
  = | { kind: 'none' }
    | { kind: 'responses-api', model: string, baseUrl: string, apiKey: string }
    | { kind: 'workers-ai', model: string }

export interface ModelOptions {
  maxOutputTokens?: number
  timeoutMs?: number
}

export interface ProbeResult {
  reachable: boolean
  modelOk: boolean
  toolCallingOk: boolean
  detail: string
}

export interface RequestFailure {
  code: 'PROVIDER_TIMEOUT' | 'PROVIDER_ERROR'
  message: string
  retryable: boolean
}
