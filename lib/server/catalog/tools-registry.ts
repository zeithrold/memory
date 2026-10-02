import type { ToolSpec } from '../llm'
import type { ToolContext, ToolDefinition, ToolOutcome } from './tool-common'
import { z } from 'zod'
import { AppError } from '../errors'

import { rejected } from './tool-common'
import { assignTool, confirmMembershipsTool, skipTool, unassignTool } from './tool-memberships'
import {
  finishTool,
  proposeCategoryTool,
  proposeMergeTool,
  proposeProjectMoveTool,
  proposeRetireTool,
} from './tool-proposals'
import {
  batchListTool,
  catalogListTool,
  catalogMembersTool,
  catalogOverviewTool,
  memoryLookupTool,
  memorySearchTool,
} from './tool-reads'

const DEFINITIONS: ToolDefinition[] = [
  catalogOverviewTool,
  catalogListTool,
  catalogMembersTool,
  batchListTool,
  memoryLookupTool,
  memorySearchTool,
  assignTool,
  confirmMembershipsTool,
  unassignTool,
  skipTool,
  proposeCategoryTool,
  proposeMergeTool,
  proposeRetireTool,
  proposeProjectMoveTool,
  finishTool,
]

const BY_NAME = new Map(DEFINITIONS.map(definition => [definition.name, definition]))

/** JSON Schema for every offered tool, derived from the validating schema. */
export function toolsFor(options: { includeSearch: boolean }): ToolSpec[] {
  const classificationTools = new Set([
    'assign',
    'confirm_memberships',
    'unassign',
    'skip',
    'propose_category',
    'propose_merge',
    'propose_retire',
    'propose_project_move',
    'finish',
  ])
  return DEFINITIONS.filter(
    definition => classificationTools.has(definition.name)
      || (options.includeSearch && definition.name === 'memory_search'),
  ).map(definition => ({
    name: definition.name,
    description: definition.description,
    parameters: toolSchema(definition.schema),
  }))
}

function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>
  // `$schema` is noise for a model, and some gateways reject unknown keys.
  delete json.$schema
  return json
}

export const toolNames = DEFINITIONS.map(definition => definition.name)

/**
 * Validates and runs one tool call. An unknown tool or invalid arguments are
 * recorded and returned to the model as a rejection, so a malformed call is
 * steered rather than fatal.
 */
export async function executeTool(
  ctx: ToolContext,
  name: string,
  rawArguments: unknown,
): Promise<ToolOutcome> {
  const definition = BY_NAME.get(name)
  if (definition === undefined) {
    return rejected(
      name,
      'read',
      `There is no tool named "${name}". Available tools: ${toolNames.join(', ')}.`,
    )
  }
  const parsed = definition.schema.safeParse(rawArguments)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map(
        issue => `${issue.path.length === 0 ? 'arguments' : issue.path.join('.')}: ${issue.message}`,
      )
      .join(
        '; ',
      )
    return rejected(definition.name, definition.effect, `The arguments were not valid (${issues}).`)
  }
  try {
    return await definition.run(ctx, parsed.data)
  }
  catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    // A tool that fails unexpectedly must not take the run down with it; the
    // model is told what happened and can choose another approach.
    return rejected(
      definition.name,
      definition.effect,
      `The tool failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
    )
  }
}
