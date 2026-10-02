import type { LlmReply, ModelMessage, ModelOptions, Provider, ToolSpec } from './llm-types'
import { z } from 'zod'
import { AppError } from './errors'
import { isRedirect, readFailureBody, requestFailure, TIMEOUT_MS } from './llm-policy'
import { parseArguments, responsesInput, responsesTools } from './llm-wire'

const responseOutputItemSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  call_id: z.string().optional(),
  name: z.string().optional(),
  arguments: z.unknown().optional(),
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  }).loose()).nullish(),
}).loose()

const responseSchema = z.object({
  status: z.enum([
    'completed',
    'incomplete',
    'failed',
  ]),
  output: z.array(responseOutputItemSchema),
  incomplete_details: z.object({ reason: z.string().optional() }).nullish(),
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }).nullish(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .nullish(),
})

export async function callResponsesApi(
  provider: Extract<Provider, { kind: 'responses-api' }>,
  messages: ModelMessage[],
  tools: ToolSpec[],
  options: ModelOptions,
): Promise<LlmReply> {
  const response = await requestResponse(provider, requestBody(provider, messages, tools, options), options)
  await assertResponse(response)
  let payload: unknown
  try {
    payload = await response.json()
  }
  catch {
    throw new AppError(
      'PROVIDER_ERROR',
      'The model endpoint returned a body that is not JSON.',
      false,
    )
  }
  const parsed = responseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError(
      'PROVIDER_ERROR',
      'The model endpoint returned a body that does not match the Responses API schema.',
      false,
    )
  }
  return responseReply(parsed.data)
}

function requestBody(
  provider: Extract<Provider, { kind: 'responses-api' }>,
  messages: ModelMessage[],
  tools: ToolSpec[],
  options: ModelOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: provider.model,
    ...responsesInput(messages),
    reasoning: { effort: 'none' },
  }
  if (tools.length > 0) {
    body.tools = responsesTools(tools)
    body.tool_choice = 'required'
  }
  if (options.maxOutputTokens !== undefined) {
    body.max_output_tokens = options.maxOutputTokens
  }
  return body
}

async function requestResponse(
  provider: Extract<Provider, { kind: 'responses-api' }>,
  body: Record<string, unknown>,
  options: ModelOptions,
): Promise<Response> {
  try {
    return await fetch(`${provider.baseUrl}/responses`, {
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
}

async function assertResponse(response: Response): Promise<void> {
  if (isRedirect(response)) {
    throw new AppError(
      'PROVIDER_ENDPOINT_INVALID',
      'The model endpoint redirected the request. A redirect is refused so the '
      + 'credential is not forwarded to another host.',
      false,
    )
  }
  if (!response.ok) {
    const detail = await readFailureBody(response)
    const suffix = detail.length > 0 ? `: ${detail}` : '.'
    throw new AppError(
      'PROVIDER_ERROR',
      `The model endpoint returned HTTP ${response.status}${suffix}`,
      response.status === 408 || response.status === 429 || response.status >= 500,
    )
  }
}

type ResponsePayload = z.infer<typeof responseSchema>
type OutputItem = z.infer<typeof responseOutputItemSchema>

function toolOutput(item: OutputItem): item is OutputItem & { name: string } {
  return item.type === 'function_call' && item.name !== undefined
}

function responseDetail(data: ResponsePayload): string | null {
  if (data.status === 'incomplete') {
    return data.incomplete_details?.reason ?? 'unknown'
  }
  if (data.status === 'failed') {
    return data.error?.code ?? data.error?.message ?? 'provider_error'
  }
  return null
}

function responseReply(data: ResponsePayload): LlmReply {
  const text = data.output
    .flatMap(item => item.content ?? [])
    .map(part => part.text?.trim() ?? '')
    .filter(part => part.length > 0)
    .join('\n')
  const toolCalls = data.output
    .filter(toolOutput)
    .map((item, index) => ({
      id: item.call_id ?? item.id ?? `call_${index}`,
      name: item.name,
      arguments: parseArguments(item.arguments),
    }))
  const statusDetail = responseDetail(data)
  return {
    content: text.length > 0 ? text : null,
    toolCalls,
    status: data.status,
    finishReason: statusDetail === null ? data.status : `${data.status}:${statusDetail}`,
    statusDetail,
    usage: {
      promptTokens: data.usage?.input_tokens,
      completionTokens: data.usage?.output_tokens,
    },
  }
}
