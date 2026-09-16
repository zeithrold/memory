import { existsSync } from 'node:fs'
import process from 'node:process'
import { clerkIssuer, OAUTH_SCOPES } from '../lib/server/oauth'

// ChatGPT and other MCP hosts need an authorization server that can register a
// client without a human copying credentials. Clerk offers three ways to do that
// (CIMD, DCR, or a predefined client); this command reports which ones the
// configured instance actually advertises, so a missing dashboard toggle is
// diagnosed instead of guessed at.
interface Discovery {
  issuer?: string
  registration_endpoint?: string
  client_id_metadata_document_supported?: boolean
  authorization_response_iss_parameter_supported?: boolean
  token_endpoint_auth_methods_supported?: string[]
  code_challenge_methods_supported?: string[]
  scopes_supported?: string[]
}
async function main(): Promise<void> {
  if (existsSync('.env.local'))
    process.loadEnvFile('.env.local')
  const issuer = clerkIssuer({ CLERK_ISSUER: process.env.CLERK_ISSUER })
  if (issuer === null) {
    throw new Error(
      'No Clerk issuer. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY or CLERK_ISSUER first.',
    )
  }
  const response = await fetch(
    `${issuer}/.well-known/oauth-authorization-server`,
  )
  if (!response.ok)
    throw new Error(`${issuer} answered ${response.status}.`)
  const payload: unknown = await response.json()
  const metadata = payload as Discovery
  const methods = metadata.token_endpoint_auth_methods_supported ?? []
  const pkce = metadata.code_challenge_methods_supported ?? []
  const scopes = metadata.scopes_supported ?? []
  const missingScopes = OAUTH_SCOPES.filter(scope => !scopes.includes(scope))
  const registration = metadata.client_id_metadata_document_supported === true
    ? 'CIMD'
    : metadata.registration_endpoint !== undefined
      ? 'DCR'
      : 'none'
  process.stdout.write(`issuer: ${metadata.issuer ?? issuer}\n`)
  process.stdout.write(`client registration: ${registration}\n`)
  process.stdout.write(
    `stable ChatGPT callback (RFC 9207): ${metadata.authorization_response_iss_parameter_supported === true}\n`,
  )
  process.stdout.write(`token endpoint auth methods: ${methods.join(', ')}\n`)
  process.stdout.write(`PKCE methods: ${pkce.join(', ') || 'none'}\n`)
  process.stdout.write(
    `memory scopes advertised: ${OAUTH_SCOPES.filter(scope => scopes.includes(scope)).join(', ') || 'none'}\n`,
  )
  const problems: string[] = []
  if (!pkce.includes('S256'))
    problems.push('The authorization server does not advertise PKCE S256; MCP hosts are unsupported without it.')
  if (registration === 'none') {
    problems.push(
      'Neither CIMD nor DCR is advertised. Enable Publish DCR support under OAuth applications → Settings → Client onboarding.',
    )
  }
  if (!methods.includes('none') && !methods.includes('private_key_jwt')) {
    problems.push(
      'No public-client token endpoint authentication method. Enable it for the OAuth application or the instance.',
    )
  }
  if (missingScopes.length > 0) {
    problems.push(
      `Missing custom scopes: ${missingScopes.join(', ')}. Create them on the OAuth applications → Scopes tab and advertise them.`,
    )
  }
  if (problems.length === 0) {
    process.stdout.write('Ready for ChatGPT linking.\n')
    return
  }
  for (const problem of problems)
    process.stdout.write(`- ${problem}\n`)
  process.exitCode = 1
}
await main()
