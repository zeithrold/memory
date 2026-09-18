import { existsSync } from 'node:fs'
import process from 'node:process'
import { accessIssuer } from '../lib/server/oauth'

// ChatGPT and other MCP hosts need an authorization server that can register a
// client without a human copying credentials. Cloudflare Access Managed OAuth
// advertises DCR and PKCE; this command reports what the configured team
// actually exposes so a missing dashboard toggle is diagnosed instead of guessed.
interface Discovery {
  issuer?: string
  registration_endpoint?: string
  authorization_endpoint?: string
  token_endpoint?: string
  client_id_metadata_document_supported?: boolean
  authorization_response_iss_parameter_supported?: boolean
  token_endpoint_auth_methods_supported?: string[]
  code_challenge_methods_supported?: string[]
  scopes_supported?: string[]
  resource_indicators_supported?: boolean
}
async function main(): Promise<void> {
  if (existsSync('.env.local'))
    process.loadEnvFile('.env.local')
  if (existsSync('.dev.vars'))
    process.loadEnvFile('.dev.vars')
  const issuer = accessIssuer({
    ACCESS_TEAM_DOMAIN: process.env.ACCESS_TEAM_DOMAIN,
  })
  if (issuer === null) {
    throw new Error(
      'No Access issuer. Set NEXT_PUBLIC_ACCESS_TEAM_DOMAIN or ACCESS_TEAM_DOMAIN first.',
    )
  }
  const response = await fetch(
    `${issuer}/.well-known/oauth-authorization-server`,
  )
  if (!response.ok) {
    // Managed OAuth may publish AS metadata on the protected application host.
    // Fall back to probing the app origin when the team domain has no document.
    const appOrigin = process.env.APP_ORIGIN?.replace(/\/+$/, '')
    if (appOrigin === undefined || appOrigin.length === 0) {
      throw new Error(
        `${issuer} answered ${response.status}. Set APP_ORIGIN to probe the application host instead.`,
      )
    }
    const appResponse = await fetch(
      `${appOrigin}/.well-known/oauth-authorization-server`,
    )
    if (!appResponse.ok) {
      throw new Error(
        `Neither ${issuer} nor ${appOrigin} served OAuth authorization-server metadata `
        + `(${response.status} / ${appResponse.status}). Enable Managed OAuth on the Access application.`,
      )
    }
    await report(await appResponse.json(), appOrigin)
    return
  }
  await report(await response.json(), issuer)
}

async function report(payload: unknown, fallbackIssuer: string): Promise<void> {
  const metadata = payload as Discovery
  const methods = metadata.token_endpoint_auth_methods_supported ?? []
  const pkce = metadata.code_challenge_methods_supported ?? []
  const registration = metadata.client_id_metadata_document_supported === true
    ? 'CIMD'
    : metadata.registration_endpoint !== undefined
      ? 'DCR'
      : 'none'
  process.stdout.write(`issuer: ${metadata.issuer ?? fallbackIssuer}\n`)
  process.stdout.write(`client registration: ${registration}\n`)
  process.stdout.write(
    `stable ChatGPT callback (RFC 9207): ${metadata.authorization_response_iss_parameter_supported === true}\n`,
  )
  process.stdout.write(
    `resource indicators (RFC 8707): ${metadata.resource_indicators_supported === true}\n`,
  )
  process.stdout.write(`token endpoint auth methods: ${methods.join(', ') || 'none'}\n`)
  process.stdout.write(`PKCE methods: ${pkce.join(', ') || 'none'}\n`)
  if (metadata.authorization_endpoint !== undefined)
    process.stdout.write(`authorization endpoint: ${metadata.authorization_endpoint}\n`)
  if (metadata.token_endpoint !== undefined)
    process.stdout.write(`token endpoint: ${metadata.token_endpoint}\n`)
  const problems: string[] = []
  if (!pkce.includes('S256'))
    problems.push('The authorization server does not advertise PKCE S256; MCP hosts are unsupported without it.')
  if (registration === 'none') {
    problems.push(
      'Neither CIMD nor DCR is advertised. Enable Managed OAuth and allow dynamic client registration on the Access application.',
    )
  }
  if (metadata.resource_indicators_supported !== true) {
    problems.push(
      'Resource indicators (RFC 8707) are not advertised. Access Managed OAuth requires the resource parameter; confirm Managed OAuth is enabled.',
    )
  }
  if (problems.length === 0) {
    process.stdout.write('Ready for Access Managed OAuth linking.\n')
    process.stdout.write(
      'Note: Access does not advertise memory:* scopes; linked agents receive the same full memory access as a browser session.\n',
    )
    return
  }
  for (const problem of problems)
    process.stdout.write(`- ${problem}\n`)
  process.exitCode = 1
}
await main()
