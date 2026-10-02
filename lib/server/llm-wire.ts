import type { JsonValue, ModelMessage, ToolSpec } from './llm-types'

/**
 * Narrows anything a provider sent into a JSON value. Providers disagree about
 * tool arguments: a JSON string, an object, or nothing at all.
 */
function toJsonValue(value: unknown): JsonValue {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item))
  }
  if (typeof value === 'object') {
    const object: { [key: string]: JsonValue } = {}
    for (const [key, item] of Object.entries(value)) {
      object[key] = toJsonValue(item)
    }
    return object
  }
  return null
}

export function parseArguments(value: unknown): JsonValue {
  if (typeof value !== 'string') {
    return toJsonValue(value)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return {}
  }
  try {
    return toJsonValue(JSON.parse(trimmed))
  }
  catch {
    // Left as a string on purpose: schema validation rejects it and the
    // rejection is fed back to the model as a tool result.
    return value
  }
}

/**
 * Renders the neutral conversation into the shape a backend accepts. The two
 * backends differ in how a tool result is correlated with its call, so the
 * translation lives here rather than in the loop.
 */
export function responsesInput(
  messages: ModelMessage[],
): { instructions?: string, input: unknown[] } {
  let instructions: string | undefined
  const input: unknown[] = []
  for (const message of messages) {
    if (message.role === 'system' && instructions === undefined) {
      instructions = message.content
      continue
    }
    if (message.role === 'assistant' && message.toolCalls !== undefined) {
      if (message.content.length > 0) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: message.content },
          ],
        })
      }
      input.push(...message.toolCalls.map(call => ({
        type: 'function_call',
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments ?? {}),
      })))
      continue
    }
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: message.content,
      })
      continue
    }
    input.push({
      type: 'message',
      role: message.role,
      content: [
        {
          type: message.role === 'assistant' ? 'output_text' : 'input_text',
          text: message.content,
        },
      ],
    })
  }
  return { ...(instructions === undefined ? {} : { instructions }), input }
}

export function workerAiMessages(messages: ModelMessage[]): unknown[] {
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

export function responsesTools(tools: ToolSpec[]): unknown[] {
  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

export function workerAiTools(tools: ToolSpec[]): unknown[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}
