import type { Principal, UsageSummary } from '../contracts'
import type { Env } from './env'
import { z } from 'zod'

const analyticsRows = z.array(z.looseObject({
  day: z.string(),
  token_id: z.string(),
  client_id: z.string(),
  operation: z.string(),
  calls: z.coerce.number(),
  errors: z.coerce.number(),
  average_ms: z.coerce.number(),
}))

type AnalyticsRow = {
  day: string
  token_id: string
  client_id: string
  operation: string
  calls: number
  errors: number
  average_ms: number
}

export function recordUsage(
  env: Env,
  principal: Principal,
  options: { operation: string, status: number, started: number },
): void {
  const { operation, status, started } = options

  try {
    env.USAGE_ANALYTICS?.writeDataPoint({
      indexes: [principal.ownerId],
      blobs: [
        principal.tokenId ?? '',
        principal.clientId ?? '',
        operation,
      ],
      doubles: [
        Date.now() - started,
        status >= 400 ? 1 : 0,
      ],
    })
  }
  catch {
    console.error('Usage recording failed')
  }
}

function key(row: Pick<UsageSummary, 'day' | 'token_id' | 'client_id' | 'operation'>): string {
  return JSON.stringify([
    row.day,
    row.token_id,
    row.client_id,
    row.operation,
  ])
}

async function analyticsUsage(
  env: Env,
  ownerId: string,
): Promise<AnalyticsRow[]> {
  if (env.CLOUDFLARE_ACCOUNT_ID === undefined || env.CLOUDFLARE_ACCOUNT_ID.length === 0
    || env.ANALYTICS_READ_TOKEN === undefined || env.ANALYTICS_READ_TOKEN.length === 0) {
    throw new Error('Analytics query credentials are not configured.')
  }
  const owner = ownerId.replaceAll('\'', '\'\'')
  const query = `SELECT toString(toDate(timestamp)) AS day, blob1 AS token_id, blob2 AS client_id, blob3
AS operation, sum(_sample_interval) AS calls, sum(double2 * _sample_interval) AS errors,
round(sum(double1 * _sample_interval) / sum(_sample_interval)) AS average_ms FROM memory_usage
WHERE index1 = '${owner}' AND timestamp >= NOW() - INTERVAL '30' DAY GROUP BY day, token_id,
client_id, operation ORDER BY day DESC, calls DESC LIMIT 500`
  const response = await fetch(
    ('https://api.cloudflare.com/client/v4/accounts/'
      + `${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}`
      + '/analytics_engine/sql'),
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.ANALYTICS_READ_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: query,
    },
  )
  if (!response.ok) {
    throw new Error(`Analytics query failed with ${response.status}.`)
  }
  const body: unknown = await response.json()
  if (body === null || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
    throw new Error('Analytics query returned no rows.')
  }
  return analyticsRows.parse(body.data)
}

type LoadUsageTokenNamesContext = {
  analytics: AnalyticsRow[]
  env: Env
  ownerId: string
}
async function loadUsageTokenNames(
  context: LoadUsageTokenNamesContext,
): Promise<{ tokenNames: Map<string, string> }> {
  const { analytics, env, ownerId } = context
  const tokenIds = [
    ...new Set(analytics.map(row => row.token_id).filter(Boolean)),
  ]
  const tokenNames = new Map<string, string>()
  if (tokenIds.length > 0) {
    const placeholders = tokenIds.map(() => '?').join(', ')
    const rows = await env.DB.prepare(
      `SELECT id, name FROM api_tokens WHERE owner_id = ? AND id IN (${placeholders})`,
    ).bind(ownerId, ...tokenIds).all<{ id: string, name: string }>()
    for (const row of rows.results) {
      tokenNames.set(row.id, row.name)
    }
  }
  return { tokenNames }
}

type MergeUsageSourcesContext = {
  legacy: D1Result<UsageSummary>
  analytics: AnalyticsRow[]
  tokenNames: Map<string, string>
}
function mergeUsageSources(
  context: MergeUsageSourcesContext,
): { merged: Map<string, UsageSummary> } {
  const { legacy, analytics, tokenNames } = context
  const merged = new Map<string, UsageSummary>()
  for (const row of legacy.results) {
    merged.set(key(row), row)
  }
  for (const row of analytics) {
    const normalized: UsageSummary = {
      ...row,
      token_id: row.token_id.length === 0 ? null : row.token_id,
      token_name: (row.token_id.length > 0) ? (tokenNames.get(row.token_id) ?? null) : null,
      client_id: row.client_id.length === 0 ? null : row.client_id,
      calls: Number(row.calls),
      errors: Number(row.errors),
      average_ms: Number(row.average_ms),
    }
    const current = merged.get(key(normalized))
    if (!(current !== undefined)) {
      merged.set(key(normalized), normalized)
      continue
    }
    const calls = current.calls + normalized.calls
    merged.set(
      key(normalized),
      {
        ...normalized,
        calls,
        errors: current.errors + normalized.errors,
        average_ms: Math.round(

          (current.average_ms * current.calls + normalized.average_ms * normalized.calls) / calls,
        ),
      },
    )
  }
  return { merged }
}
export async function getUsage(
  env: Env,
  ownerId: string,
): Promise<{ usage: UsageSummary[], degraded: boolean }> {
  const legacy = await env.DB.prepare(
    `SELECT substr(u.created_at, 1, 10) AS day, u.token_id, t.name AS token_name, u.client_id,
u.operation, count(*) AS calls, sum(CASE WHEN u.status >= 400 THEN 1 ELSE 0 END) AS errors,
round(avg(u.duration_ms)) AS average_ms FROM usage_events u LEFT JOIN api_tokens t ON t.id
= u.token_id AND t.owner_id = u.owner_id WHERE u.owner_id = ? AND u.created_at >= ? GROUP
BY day, u.token_id, t.name, u.client_id, u.operation ORDER BY day DESC, calls DESC LIMIT
500`,
  )
    .bind(ownerId, new Date(Date.now() - 30 * 86400000).toISOString())
    .all<UsageSummary>()
  let analytics: AnalyticsRow[]
  try {
    analytics = await analyticsUsage(env, ownerId)
  }
  catch {
    return { usage: legacy.results, degraded: true }
  }
  const { tokenNames } = await loadUsageTokenNames({ analytics, env, ownerId })
  const { merged } = mergeUsageSources({ legacy, analytics, tokenNames })
  return {
    usage: [
      ...merged.values(),
    ]
      .sort(usageOrder)
      .slice(0, 500),
    degraded: false,
  }
}

function usageOrder(left: UsageSummary, right: UsageSummary): number {
  const day = right.day.localeCompare(left.day)
  return day === 0 ? right.calls - left.calls : day
}
