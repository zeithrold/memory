import type { Env } from './env'
import type { ProbeResult, Provider, ToolSpec } from './llm-types'
import { AppError } from './errors'
import { assertActionableReply, truncate } from './llm-policy'
import { respondWithTools } from './llm-respond'

export const DEFAULT_PROBE_MODEL_TIMEOUT_MS = 30_000

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

/**
 * Validates a saved configuration by using it once. Configuration mistakes are
 * the most likely failure of a bring-your-own-endpoint design, so they are
 * caught here rather than in a scheduled run the user never watches.
 *
 * The probe never throws: "your credential is wrong" is a successful probe with
 * a negative result, not a server fault.
 */
export async function probeProvider(
  env: Env,
  provider: Provider,
): Promise<ProbeResult> {
  if (provider.kind === 'none') {
    return {
      reachable: false,
      modelOk: false,
      toolCallingOk: false,
      detail: 'No model endpoint is configured.',
    }
  }
  try {
    const reply = await respondWithTools(
      env,
      provider,
      {
        messages: [
          {
            role: 'system',
            content:
            'You are a connectivity probe. Reply only by calling the provided tool.',
          },
          { role: 'user', content: 'Call the ping tool with ok set to true.' },
        ],
        tools: [PROBE_TOOL],
        options: { maxOutputTokens: 64, timeoutMs: DEFAULT_PROBE_MODEL_TIMEOUT_MS },
      },
    )
    assertActionableReply(reply)
    return {
      reachable: true,
      modelOk: true,
      toolCallingOk: true,
      detail: `The endpoint answered and called ${reply.toolCalls[0]?.name ?? 'a tool'}.`,
    }
  }
  catch (error) {
    if (error instanceof AppError && error.code === 'PROVIDER_TOOL_UNSUPPORTED') {
      return {
        reachable: true,
        modelOk: true,
        toolCallingOk: false,
        detail: truncate(`${error.code}: ${error.message}`),
      }
    }
    const message = probeFailureMessage(error)
    return {
      reachable: false,
      modelOk: false,
      toolCallingOk: false,
      detail: truncate(message),
    }
  }
}

function probeFailureMessage(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.code}: ${error.message}`
  }
  return error instanceof Error ? error.message : 'The endpoint could not be reached.'
}
