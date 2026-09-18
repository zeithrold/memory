#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const DEFAULT_ENDPOINT = 'https://memory.ztd.me'
const CONFIG_VERSION = 1

function usage() {
  return `Shared Memory credential setup

Usage:
  node configure.mjs [--endpoint URL] [--config FILE]
  node configure.mjs --check [--json] [--config FILE]
  node configure.mjs [--config FILE] --run -- COMMAND [ARG ...]

The token is read from a hidden terminal prompt or MEMORY_API_TOKEN. A literal
token is deliberately not accepted as a command-line argument. The default
endpoint is ${DEFAULT_ENDPOINT}.
`
}

function parseArguments(argv) {
  const options = {
    check: false,
    configPath: undefined,
    endpoint: undefined,
    help: false,
    json: false,
    run: undefined,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
    }
    else if (argument === '--check') {
      options.check = true
    }
    else if (argument === '--json') {
      options.json = true
    }
    else if (argument === '--endpoint' || argument === '--config') {
      const value = argv[index + 1]
      if (!value)
        throw new Error(`${argument} requires a value.`)
      if (argument === '--endpoint')
        options.endpoint = value
      else
        options.configPath = value
      index += 1
    }
    else if (argument === '--run') {
      const command = argv.slice(index + 1).filter((value, position) => position > 0 || value !== '--')
      if (command.length === 0)
        throw new Error('--run requires a command after --.')
      options.run = command
      break
    }
    else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (options.check && options.run)
    throw new Error('Use either --check or --run, not both.')
  if (options.json && !options.check)
    throw new Error('--json is supported only with --check.')
  return options
}

function defaultConfigPath() {
  if (process.env.MEMORY_CONFIG_PATH)
    return path.resolve(process.env.MEMORY_CONFIG_PATH)
  if (process.env.XDG_CONFIG_HOME)
    return path.join(process.env.XDG_CONFIG_HOME, 'shared-memory', 'credentials.json')
  if (platform() === 'win32' && process.env.APPDATA)
    return path.join(process.env.APPDATA, 'shared-memory', 'credentials.json')
  return path.join(homedir(), '.config', 'shared-memory', 'credentials.json')
}

function normalizeEndpoint(raw) {
  let parsed
  try {
    parsed = new URL(raw.trim())
  }
  catch {
    throw new Error('Endpoint must be an absolute URL.')
  }
  if (parsed.username || parsed.password)
    throw new Error('Endpoint must not contain embedded credentials.')
  if (parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname))
    throw new Error('Endpoint must be an origin without a path, query, or fragment.')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local))
    throw new Error('Endpoint must use HTTPS; plain HTTP is allowed only for loopback development.')
  return parsed.origin
}

function validateToken(token) {
  if (!token)
    throw new Error('No token is configured. Run this script in an interactive terminal or set MEMORY_API_TOKEN.')
  if (/\s/.test(token))
    throw new Error('The token must not contain whitespace.')
  return token
}

async function readConfiguration(configPath) {
  try {
    const metadata = await stat(configPath)
    if (platform() !== 'win32' && (metadata.mode & 0o077) !== 0)
      throw new Error('The credential file is accessible by other users. Restrict it to mode 0600 before continuing.')
    const parsed = JSON.parse(await readFile(configPath, 'utf8'))
    if (parsed?.version !== CONFIG_VERSION || typeof parsed.endpoint !== 'string' || typeof parsed.token !== 'string')
      throw new Error('The credential file has an unsupported format.')
    return {
      version: CONFIG_VERSION,
      endpoint: normalizeEndpoint(parsed.endpoint),
      token: validateToken(parsed.token),
    }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return null
    if (error instanceof SyntaxError)
      throw new Error('The credential file is not valid JSON.')
    throw error
  }
}

async function promptText(label, fallback) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await terminal.question(`${label} [${fallback}]: `)).trim()
    return answer || fallback
  }
  finally {
    terminal.close()
  }
}

async function promptSecret(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function')
    throw new Error('A hidden token prompt needs an interactive terminal. Alternatively set MEMORY_API_TOKEN for this command.')
  const wasPaused = process.stdin.isPaused()
  const wasRaw = process.stdin.isRaw
  process.stdout.write(label)
  process.stdin.setEncoding('utf8')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let value = ''
    let onData = () => undefined
    const finish = (error) => {
      process.stdin.removeListener('data', onData)
      process.stdin.setRawMode(Boolean(wasRaw))
      if (wasPaused)
        process.stdin.pause()
      process.stdout.write('\n')
      if (error)
        reject(error)
      else
        resolve(value)
    }
    onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Credential setup cancelled.'))
          return
        }
        if (character === '\r' || character === '\n') {
          finish()
          return
        }
        if (character === '\u007F' || character === '\b') {
          value = value.slice(0, -1)
          continue
        }
        if (character >= ' ')
          value += character
      }
    }
    process.stdin.on('data', onData)
  })
}

function safeStatus(payload, endpoint, token) {
  const credential = payload && typeof payload === 'object' ? payload.credential : null
  if (!credential || typeof credential !== 'object' || typeof credential.ready !== 'boolean')
    throw new Error('The status endpoint returned an invalid credential response.')
  const allowedScopes = new Set(['memory:read', 'memory:write', 'memory:delete'])
  const scopes = Array.isArray(credential.scopes)
    ? credential.scopes.filter(scope => typeof scope === 'string' && allowedScopes.has(scope))
    : []
  const missingScopes = Array.isArray(credential.missingScopes)
    ? credential.missingScopes.filter(scope => typeof scope === 'string' && allowedScopes.has(scope))
    : []
  const project = typeof credential.project === 'string'
    && /^[\w.-]{1,64}$/.test(credential.project)
    && !credential.project.includes(token)
    ? credential.project
    : null
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

async function checkCredential(endpoint, token) {
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
  if (response.status >= 300 && response.status < 400)
    throw new Error('Status check refused a redirect so the bearer token is not forwarded to another host.')
  let payload
  try {
    payload = await response.json()
  }
  catch {
    throw new Error(`Status check returned HTTP ${response.status} without a JSON response.`)
  }
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof payload.code === 'string' && /^[A-Z0-9_]+$/.test(payload.code)
      ? ` (${payload.code})`
      : ''
    throw new Error(`Credential check failed with HTTP ${response.status}${code}.`)
  }
  const status = safeStatus(payload, endpoint, token)
  if (!status.credential.ready) {
    const missing = status.credential.missingScopes.join(', ') || 'memory:read, memory:write'
    throw new Error(`Credential is valid but not ready; missing scopes: ${missing}.`)
  }
  return status
}

async function writeConfiguration(configPath, configuration) {
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

function printStatus(status, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(status)}\n`)
    return
  }
  const project = status.credential.project ?? 'all projects'
  process.stdout.write(`Credential ready for ${status.endpoint}\n`)
  process.stdout.write(`Scopes: ${status.credential.scopes.join(', ')}\n`)
  process.stdout.write(`Project: ${project}\n`)
}

async function runCommand(command, configuration) {
  await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      env: {
        ...process.env,
        MEMORY_API_ENDPOINT: configuration.endpoint,
        MEMORY_BASE_URL: configuration.endpoint,
        MEMORY_API_TOKEN: configuration.token,
      },
      stdio: 'inherit',
      shell: false,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal)
        reject(new Error(`Command stopped by signal ${signal}.`))
      else if (code !== 0)
        reject(new Error(`Command exited with status ${code ?? 1}.`))
      else
        resolve()
    })
  })
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  const configPath = path.resolve(options.configPath ?? defaultConfigPath())
  const saved = await readConfiguration(configPath)

  if (options.check || options.run) {
    const endpoint = normalizeEndpoint(
      options.endpoint
      ?? process.env.MEMORY_API_ENDPOINT
      ?? process.env.MEMORY_BASE_URL
      ?? saved?.endpoint
      ?? DEFAULT_ENDPOINT,
    )
    const token = validateToken(process.env.MEMORY_API_TOKEN ?? saved?.token)
    const status = await checkCredential(endpoint, token)
    printStatus(status, options.json)
    if (options.run)
      await runCommand(options.run, { endpoint, token })
    return
  }

  const suggestedEndpoint = normalizeEndpoint(
    options.endpoint
    ?? process.env.MEMORY_API_ENDPOINT
    ?? process.env.MEMORY_BASE_URL
    ?? saved?.endpoint
    ?? DEFAULT_ENDPOINT,
  )
  const endpoint = options.endpoint || !process.stdin.isTTY
    ? suggestedEndpoint
    : normalizeEndpoint(await promptText('Endpoint', suggestedEndpoint))
  const environmentToken = process.env.MEMORY_API_TOKEN
  const enteredToken = environmentToken ?? await promptSecret(
    saved ? 'Token (leave blank to keep the saved token): ' : 'Token: ',
  )
  const token = validateToken(enteredToken || saved?.token)
  const status = await checkCredential(endpoint, token)
  await writeConfiguration(configPath, { version: CONFIG_VERSION, endpoint, token })
  printStatus(status, options.json)
  process.stdout.write(`Saved to ${configPath} with owner-only permissions.\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Shared Memory setup failed: ${message}\n`)
    process.exitCode = 1
  })
}
