import type { Env } from './env'
import type { LlmReply, ModelMessage, ModelOptions, Provider, ToolSpec } from './llm-types'
import { AppError } from './errors'
import { callResponsesApi } from './llm-response'
import { callWorkersAi } from './llm-workers'

type RespondWithToolsRequest = { messages: ModelMessage[], tools: ToolSpec[], options?: ModelOptions }

export async function respondWithTools(
  env: Env,
  provider: Provider,
  request: RespondWithToolsRequest,
): Promise<LlmReply> {
  const { messages, tools, options = {} } = request

  if (provider.kind === 'none') {
    throw new AppError(
      'AGENT_NOT_CONFIGURED',
      'No model endpoint is configured for this account.',
    )
  }
  if (provider.kind === 'responses-api') {
    return await callResponsesApi(provider, messages, tools, options)
  }
  return await callWorkersAi(env, provider, { messages, tools, options })
}
