import type { Principal } from '../../contracts'
import type { Env } from '../env'
import type { Provider } from '../llm'
import { z } from 'zod'
import { requireSession } from '../auth'
import { AppError } from '../errors'
import { readJson } from '../http'
import { probeProvider } from '../llm'
import {
  decideProposal,
  getCatalogView,
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
 * Everything under `/api/v1/catalog` manages an account's configuration or
 * triggers work, so the whole surface is session-only. A personal token or an
 * OAuth link must not be able to re-arrange a catalog, read a provider
 * configuration, or spend the account's model quota.
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
  })
  .strict()

const proposalDecisionSchema = z
  .object({ decision: z.enum(['approve', 'reject']) })
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

export async function catalogApi(
  request: Request,
  env: Env,
  principal: Principal,
  segments: string[],
): Promise<Response> {
  if (segments[0] !== 'catalog')
    throw new AppError('NOT_FOUND', 'Endpoint not found.')
  requireSession(principal)
  const resource = segments[1] ?? ''
  const tail = segments[2] ?? ''

  if (resource === 'settings' && tail === '') {
    if (request.method === 'GET')
      return Response.json(await getCatalogSettings(env, principal.ownerId))
    if (request.method === 'PUT') {
      return Response.json(
        await updateCatalogSettings(env, principal.ownerId, await readJson(request)),
      )
    }
  }
  if (resource === 'settings' && tail === 'test' && request.method === 'POST') {
    const raw = await readJson(request)
    // An empty object probes the saved configuration; a body probes the values
    // in the form, so a user can validate an endpoint before committing it.
    const isEmpty = raw !== null
      && typeof raw === 'object'
      && Object.keys(raw).length === 0
    const input = isEmpty ? null : probeInputSchema.parse(raw)
    const provider = input === null
      ? await providerForOwner(env, principal.ownerId)
      : await providerFromInput(env, principal.ownerId, input)
    const result = await probeProvider(env, provider)
    // Only a probe of the stored configuration is recorded: an unsaved form
    // must not overwrite the account's last known status.
    if (input === null && provider.kind !== 'none') {
      await recordProbe(env, principal.ownerId, {
        ok: result.reachable && result.toolCallingOk,
        detail: result.detail,
      })
    }
    return Response.json(result)
  }
  // The bare `/catalog` path leaves `resource` empty.
  if (resource === '' && request.method === 'GET')
    return Response.json(await getCatalogView(env, principal.ownerId))

  if (resource === 'metrics' && tail === '' && request.method === 'GET')
    return Response.json(await getMetrics(env, principal.ownerId))

  if (resource === 'runs' && tail === '') {
    if (request.method === 'GET') {
      const limit = z.coerce.number().int().min(1).max(50).parse(
        new URL(request.url).searchParams.get('limit') ?? 20,
      )
      return Response.json({ runs: await listRuns(env, principal.ownerId, limit) })
    }
    if (request.method === 'POST') {
      const body = runInputSchema.parse(await readJson(request))
      if (!env.CATALOG_WORKFLOW) {
        throw new AppError(
          'CATALOG_DISABLED',
          'This deployment declares no catalog Workflow, so a run cannot be started here.',
        )
      }
      // The row is claimed first so the response can carry an identifier the
      // caller can poll, and so a second click cannot start a parallel run.
      const claim = await claimRun(env, principal.ownerId, 'manual', body.dryRun)
      try {
        await env.CATALOG_WORKFLOW.create({
          id: claim.runId,
          params: {
            ownerId: principal.ownerId,
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
  }
  if (resource === 'runs' && tail.length > 0) {
    const runId = z.string().uuid().parse(tail)
    const action = segments[3] ?? ''
    if (action === '' && request.method === 'GET')
      return Response.json(await getRunDetail(env, principal.ownerId, runId))
    if (action === 'revert' && request.method === 'POST')
      return Response.json(await revertRun(env, principal.ownerId, runId))
  }

  if (resource === 'proposals' && tail === '' && request.method === 'GET') {
    const status = z.enum(['pending', 'approved', 'rejected', 'superseded']).parse(
      new URL(request.url).searchParams.get('status') ?? 'pending',
    )
    return Response.json({ proposals: await listProposals(env, principal.ownerId, status) })
  }
  if (resource === 'proposals' && tail.length > 0 && request.method === 'POST') {
    const proposalId = z.string().uuid().parse(tail)
    const body = proposalDecisionSchema.parse(await readJson(request))
    return Response.json(
      await decideProposal(env, principal, principal.ownerId, proposalId, body.decision === 'approve'),
    )
  }
  throw new AppError('NOT_FOUND', 'Endpoint not found.')
}
