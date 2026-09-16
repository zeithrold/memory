import type { Principal } from '../contracts'
import type { Env } from './env'

export async function recordUsage(
  env: Env,
  principal: Principal,
  operation: string,
  status: number,
  started: number,
): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO usage_events(id, owner_id, token_id, operation, status, duration_ms, created_at, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        crypto.randomUUID(),
        principal.ownerId,
        principal.tokenId,
        operation,
        status,
        Date.now() - started,
        new Date().toISOString(),
        principal.clientId ?? null,
      )
      .run()
  }
  catch {
    console.error('Usage recording failed')
  }
}
