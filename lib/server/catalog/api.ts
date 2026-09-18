import type { Principal } from '../../contracts'
import type { Env } from '../env'
import type { Provider } from '../llm'
import { z } from 'zod'
import { AppError } from '../errors'
import { probeProvider } from '../llm'
import {
  decideProposal,
  decideProposals,
  getCatalogView,
  getCategoryDetail,
  getMetrics,
  getRunDetail,
  listProposals,
  listRuns,
  revertRun,
} from './query'
import { claimRun } from './run'
import {
  getCatalogSettings,
  providerForOwner,
  providerKinds,
  recordProbe,
  updateCatalogSettings,
} from './settings'

/**
 * Everything in this module manages an account's configuration or triggers
 * work, so those routes are session-only. The separate read-only catalog search
 * service is intentionally available to memory:read credentials and does not
 * expose management state.
 */
const probeInputSchema = z
  .object({
    provider: z.enum(providerKinds),
    baseUrl: z.string().trim().max(500).optional(),
    model: z.string().trim().max(200).optional(),
    /** Omitted means "reuse the stored credential". */
    apiKey: z.string().trim().min(8).max(4096).optional(),
  })
  .strict()

const runInputSchema = z
  .object({
    /** A dry run records what would happen and changes nothing. */
    dryRun: z.boolean().default(false),
    /** Trusted operator notes for this run only. */
    prompt: z.string().trim().max(2000).optional(),
  })
  .strict()

const proposalDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    advice: z.string().trim().max(2000).optional(),
  })
  .strict()

const bulkProposalSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    ids: z.array(z.string().uuid()).max(100).optional(),
    advice: z.string().trim().max(2000).optional(),
  })
  .strict()

async function providerFromInput(
  env: Env,
  ownerId: string,
  input: z.infer<typeof probeInputSchema>,
): Promise<Provider> {
  if (input.provider === 'none')
    return { kind: 'none' }
  if (input.model === undefined || input.model.length === 0)
    throw new AppError('INVALID_INPUT', 'A model name is required to test a connection.')
  if (input.provider === 'workers-ai')
    return { kind: 'workers-ai', model: input.model }
  const stored = await providerForOwner(env, ownerId)
  const apiKey = input.apiKey ?? (stored.kind === 'responses-api' ? stored.apiKey : undefined)
  if (apiKey === undefined) {
    throw new AppError(
      'INVALID_INPUT',
      'Enter an API key to test this endpoint, because none is stored yet.',
    )
  }
  if (input.baseUrl === undefined || input.baseUrl.length === 0)
    throw new AppError('INVALID_INPUT', 'An endpoint URL is required to test a connection.')
  return { kind: 'responses-api', model: input.model, baseUrl: input.baseUrl, apiKey }
}

export async function readCatalogSettings(env: Env, ownerId: string): Promise<Response> {
  return Response.json(await getCatalogSettings(env, ownerId))
}

export async function saveCatalogSettings(env: Env, ownerId: string, raw: unknown): Promise<Response> {
  return Response.json(await updateCatalogSettings(env, ownerId, raw))
}

export async function testCatalogSettings(env: Env, ownerId: string, raw: unknown): Promise<Response> {
  // An empty object probes the saved configuration; a body probes the values
  // in the form, so a user can validate an endpoint before committing it.
  const isEmpty = raw !== null
    && typeof raw === 'object'
    && Object.keys(raw).length === 0
  const input = isEmpty ? null : probeInputSchema.parse(raw)
  const provider = input === null
    ? await providerForOwner(env, ownerId)
    : await providerFromInput(env, ownerId, input)
  const result = await probeProvider(env, provider)
  // Only a probe of the stored configuration is recorded: an unsaved form
  // must not overwrite the account's last known status.
  if (input === null && provider.kind !== 'none') {
    await recordProbe(env, ownerId, {
      ok: result.reachable && result.toolCallingOk,
      detail: result.detail,
    })
  }
  return Response.json(result)
}

export async function readCatalog(env: Env, ownerId: string): Promise<Response> {
  return Response.json(await getCatalogView(env, ownerId))
}

export async function readCategory(
  env: Env,
  ownerId: string,
  rawId: unknown,
  rawOffset: string | null,
): Promise<Response> {
  const id = z.string().uuid().parse(rawId)
  const offset = z.coerce.number().int().min(0).max(100000).parse(rawOffset ?? 0)
  return Response.json(await getCategoryDetail(env, ownerId, id, offset))
}

export async function readCatalogMetrics(env: Env, ownerId: string): Promise<Response> {
  return Response.json(await getMetrics(env, ownerId))
}

export async function readCatalogRuns(
  env: Env,
  ownerId: string,
  rawLimit: string | null,
  rawOffset: string | null,
): Promise<Response> {
  const limit = z.coerce.number().int().min(1).max(50).parse(rawLimit ?? 20)
  const offset = z.coerce.number().int().min(0).max(100000).parse(rawOffset ?? 0)
  return Response.json(await listRuns(env, ownerId, limit, offset))
}

export async function startCatalogRun(env: Env, ownerId: string, raw: unknown): Promise<Response> {
  const body = runInputSchema.parse(raw)
  if (!env.CATALOG_WORKFLOW) {
    throw new AppError(
      'CATALOG_DISABLED',
      'This deployment declares no catalog Workflow, so a run cannot be started here.',
    )
  }
  // The row is claimed first so the response can carry an identifier the
  // caller can poll, and so a second click cannot start a parallel run.
  // Operator prompt stays on the run row; Workflow params never carry it.
  const claim = await claimRun(env, ownerId, 'manual', body.dryRun, body.prompt)
  try {
    await env.CATALOG_WORKFLOW.create({
      id: claim.runId,
      params: {
        ownerId,
        runId: claim.runId,
        dryRun: body.dryRun,
      },
    })
  }
  catch (error) {
    // Instance ids are unique; an id collision means this run already has
    // an instance, which is the outcome the caller wanted anyway.
    if (!(error instanceof Error) || !error.message.includes('already exists'))
      throw error
  }
  return Response.json(
    {
      runId: claim.runId,
      status: 'queued',
      mode: claim.dryRun ? 'dry_run' : 'live',
      budgetWarning: claim.budgetWarning,
    },
    { status: 202 },
  )
}

export async function readCatalogRun(
  env: Env,
  ownerId: string,
  rawId: unknown,
  rawOffset: string | null,
  rawLimit: string | null,
): Promise<Response> {
  const offset = z.coerce.number().int().min(0).max(100000).parse(rawOffset ?? 0)
  const limit = z.coerce.number().int().min(1).max(100).parse(rawLimit ?? 40)
  return Response.json(
    await getRunDetail(env, ownerId, z.string().uuid().parse(rawId), offset, limit),
  )
}

export async function undoCatalogRun(env: Env, ownerId: string, rawId: unknown): Promise<Response> {
  return Response.json(await revertRun(env, ownerId, z.string().uuid().parse(rawId)))
}

export async function readCatalogProposals(env: Env, ownerId: string, rawStatus: string | null): Promise<Response> {
  const status = z.enum(['pending', 'approved', 'rejected', 'superseded']).parse(rawStatus ?? 'pending')
  return Response.json({ proposals: await listProposals(env, ownerId, status) })
}

export async function decideCatalogProposals(
  env: Env,
  principal: Principal,
  raw: unknown,
): Promise<Response> {
  const body = bulkProposalSchema.parse(raw)
  if (body.decision === 'approve' && body.advice !== undefined) {
    throw new AppError('INVALID_INPUT', 'Advice is only accepted when rejecting proposals.')
  }
  return Response.json(
    await decideProposals(
      env,
      principal,
      principal.ownerId,
      body.decision === 'approve',
      body.ids,
      body.advice,
    ),
  )
}

export async function decideCatalogProposal(
  env: Env,
  principal: Principal,
  rawId: unknown,
  raw: unknown,
): Promise<Response> {
  const proposalId = z.string().uuid().parse(rawId)
  const body = proposalDecisionSchema.parse(raw)
  if (body.decision === 'approve' && body.advice !== undefined) {
    throw new AppError('INVALID_INPUT', 'Advice is only accepted when rejecting a proposal.')
  }
  return Response.json(
    await decideProposal(
      env,
      principal,
      principal.ownerId,
      proposalId,
      body.decision === 'approve',
      body.advice,
    ),
  )
}
