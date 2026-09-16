import type { Env } from './env'
import { AppError } from './errors'

/**
 * Per-user model credentials.
 *
 * Cloudflare offers no per-end-user secret store: `wrangler secret` is per
 * Worker and Secrets Store is account level, write-only, and capped at one
 * store with 100 secrets. A public deployment therefore has to keep each user's
 * key itself, encrypted with a deployment-wide master key.
 *
 * The master key is `AGENT_SETTINGS_KEY`, 64 hex characters (32 bytes), and is
 * supplied as a Worker secret. Without it the service refuses to store a key at
 * all rather than falling back to plaintext.
 *
 * Honest limitation, repeated in the settings UI: this is encryption at rest
 * against a database leak, not end-to-end encryption. The operator and
 * Cloudflare can read the plaintext, so users should configure a scoped,
 * revocable key.
 */
const KEY_HEX_LENGTH = 64
const IV_BYTES = 12
const HINT_LENGTH = 4

export interface SealedSecret {
  ciphertext: string
  iv: string
  /** Last characters of the plaintext, for telling two configured keys apart. */
  hint: string
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
/**
 * Web Crypto accepts only a view over a plain `ArrayBuffer`, so the allocation
 * names its buffer explicitly instead of relying on inference, which widens to
 * `ArrayBufferLike` and would also admit a `SharedArrayBuffer`.
 */
function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(value.length / 2))
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  return bytes
}
/**
 * Whether this deployment can hold a user credential at all. The settings
 * endpoint reports it so the UI can explain itself before a user types a key.
 */
export function settingsKeyConfigured(env: Env): boolean {
  return masterKeyBytes(env) !== null
}
function masterKeyBytes(env: Env): Uint8Array<ArrayBuffer> | null {
  const raw = env.AGENT_SETTINGS_KEY?.trim()
  if (raw === undefined || raw.length !== KEY_HEX_LENGTH)
    return null
  if (!/^[\da-f]+$/i.test(raw))
    return null
  return fromHex(raw)
}
async function masterKey(env: Env): Promise<CryptoKey> {
  const bytes = masterKeyBytes(env)
  if (bytes === null) {
    throw new AppError(
      'AGENT_KEY_UNCONFIGURED',
      'This deployment cannot store model credentials because AGENT_SETTINGS_KEY is missing or malformed.',
    )
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}
export function secretHint(plaintext: string): string {
  return plaintext.slice(-HINT_LENGTH)
}
export async function sealSecret(
  env: Env,
  plaintext: string,
): Promise<SealedSecret> {
  const key = await masterKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new Uint8Array(new TextEncoder().encode(plaintext)),
  )
  return {
    ciphertext: toHex(new Uint8Array(ciphertext)),
    iv: toHex(iv),
    hint: secretHint(plaintext),
  }
}
/**
 * Decrypts a stored credential. A failed decryption means the master key
 * changed or the row was tampered with; both are configuration faults, not
 * client errors, and neither should silently degrade to an unauthenticated
 * request.
 */
export async function openSecret(
  env: Env,
  sealed: Pick<SealedSecret, 'ciphertext' | 'iv'>,
): Promise<string> {
  const key = await masterKey(env)
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromHex(sealed.iv) },
      key,
      fromHex(sealed.ciphertext),
    )
    return new TextDecoder().decode(plaintext)
  }
  catch {
    throw new AppError(
      'AGENT_KEY_UNCONFIGURED',
      'The stored model credential could not be decrypted. Configure it again.',
    )
  }
}
