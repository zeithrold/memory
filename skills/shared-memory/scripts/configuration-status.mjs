import process from 'node:process'

export function safeStatus(
  payload,
  endpoint,
  token,
) {
  const credential = payload && typeof payload === 'object' ? payload.credential : null
  if (!credential || typeof credential !== 'object' || typeof credential.ready !== 'boolean') {
    throw new Error('The status endpoint returned an invalid credential response.')
  }
  const scopes = supportedScopes(credential.scopes)
  const missingScopes = supportedScopes(credential.missingScopes)
  const project = safeProject(credential.project, token)
  return {
    endpoint,
    mcpUrl: `${endpoint}/mcp`,
    credential: {
      ready: credential.ready,
      scopes,
      missingScopes,
      project,
    },
  }
}
export async function checkCredential(
  endpoint,
  token,
) {
  let response
  try {
    response = await fetch(`${endpoint}/api/v1/status`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown network error'
    throw new Error(`Could not reach ${endpoint}: ${detail}`)
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(('Status check refused a redirect so the bearer token is not forwarded to '
      + 'another host.'))
  }
  let payload
  try {
    payload = await response.json()
  }
  catch {
    throw new Error(`Status check returned HTTP ${response.status} without a JSON response.`)
  }
  if (!response.ok) {
    const code = safeProblemCode(payload)
    throw new Error(`Credential check failed with HTTP ${response.status}${code}.`)
  }
  const status = safeStatus(payload, endpoint, token)
  if (!status.credential.ready) {
    const missing = status.credential.missingScopes.join(', ') || 'memory:read, memory:write'
    throw new Error(`Credential is valid but not ready; missing scopes: ${missing}.`)
  }
  return status
}
export function printStatus(status, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(status)}\n`)
    return
  }
  const project = status.credential.project ?? 'all projects'
  process.stdout.write(`Credential ready for ${status.endpoint}\n`)
  process.stdout.write(`Scopes: ${status.credential.scopes.join(', ')}\n`)
  process.stdout.write(`Project: ${project}\n`)
}
export function supportedScopes(
  value,
) {
  const allowedScopes = new Set([
    'memory:read',
    'memory:write',
    'memory:delete',
  ])
  return Array.isArray(value)
    ? value.filter(scope => typeof scope === 'string' && allowedScopes.has(scope))
    : []
}
export function safeProject(
  project,
  token,
) {
  return typeof project === 'string' && /^[\w.-]{1,64}$/.test(project) && !project.includes(token)
    ? project
    : null
}
export function safeProblemCode(
  payload,
) {
  const code = payload && typeof payload === 'object' && typeof payload.code === 'string'
    && /^[A-Z0-9_]+$/.test(payload.code)
    ? ` (${payload.code})`
    : ''
  return code
}
