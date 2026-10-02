import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import path from 'node:path'
import process from 'node:process'

export const DEFAULT_ENDPOINT = 'https://memory.ztd.me'
export const CONFIG_VERSION = 1
export function defaultConfigPath() {
  if (process.env.MEMORY_CONFIG_PATH) {
    return path.resolve(process.env.MEMORY_CONFIG_PATH)
  }
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'shared-memory', 'credentials.json')
  }
  if (platform() === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'shared-memory', 'credentials.json')
  }
  return path.join(homedir(), '.config', 'shared-memory', 'credentials.json')
}
export function normalizeEndpoint(
  raw,
) {
  let parsed
  try {
    parsed = new URL(raw.trim())
  }
  catch {
    throw new Error('Endpoint must be an absolute URL.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Endpoint must not contain embedded credentials.')
  }
  if (parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('Endpoint must be an origin without a path, query, or fragment.')
  }
  const local = [
    'localhost',
    '127.0.0.1',
    '[::1]',
  ].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error(('Endpoint must use HTTPS; plain HTTP is allowed only for loopback development.'))
  }
  return parsed.origin
}
export function validateToken(
  token,
) {
  if (!token) {
    throw new Error(('No token is configured. Run this script in an interactive terminal or set '
      + 'MEMORY_API_TOKEN.'))
  }
  if (/\s/.test(token)) {
    throw new Error('The token must not contain whitespace.')
  }
  return token
}
export async function readConfiguration(configPath) {
  try {
    const metadata = await stat(configPath)
    assertPrivatePermissions(metadata)
    const parsed = JSON.parse(await readFile(configPath, 'utf8'))
    validateConfiguration(parsed)
    return {
      version: CONFIG_VERSION,
      endpoint: normalizeEndpoint(parsed.endpoint),
      token: validateToken(parsed.token),
    }
  }
  catch (error) {
    if (isMissingFile(error)) {
      return null
    }
    if (error instanceof SyntaxError) {
      throw new Error('The credential file is not valid JSON.')
    }
    throw error
  }
}
export async function writeConfiguration(
  configPath,
  configuration,
) {
  const directory = path.dirname(configPath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = path.join(directory, `.credentials-${process.pid}-${randomUUID()}.tmp`)
  const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  try {
    await file.writeFile(`${JSON.stringify(configuration, null, 2)}\n`, 'utf8')
    await file.sync()
  }
  finally {
    await file.close()
  }
  try {
    await rename(temporary, configPath)
    await chmod(configPath, 0o600)
  }
  catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
export function validateConfiguration(
  parsed,
) {
  if (parsed?.version !== CONFIG_VERSION || typeof parsed.endpoint !== 'string'
    || typeof parsed.token !== 'string') {
    throw new Error('The credential file has an unsupported format.')
  }
}
export function assertPrivatePermissions(
  metadata,
) {
  if (platform() !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error(
      'The credential file is accessible by other users. Restrict it to mode 0600 before continuing.',
    )
  }
}
export function isMissingFile(error) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}
