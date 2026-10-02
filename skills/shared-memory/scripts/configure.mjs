#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { checkCredential, printStatus } from './configuration-status.mjs'
import {
  CONFIG_VERSION,
  DEFAULT_ENDPOINT,
  defaultConfigPath,
  normalizeEndpoint,
  readConfiguration,
  validateToken,
  writeConfiguration,
} from './configuration-storage.mjs'
import { promptSecret, promptText, runCommand } from './configuration-terminal.mjs'

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
    index = applyArgument(options, argv, index)
  }
  if (options.check && options.run) {
    throw new Error('Use either --check or --run, not both.')
  }
  if (options.json && !options.check) {
    throw new Error('--json is supported only with --check.')
  }
  return options
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
    await checkOrRun(options, saved)
    return
  }
  await configure(options, saved, configPath)
}

async function configure(options, saved, configPath) {
  const defaultEndpoint = normalizeEndpoint(
    suggestedEndpoint(options, saved),
  )
  const endpoint = options.endpoint || !process.stdin.isTTY
    ? defaultEndpoint
    : normalizeEndpoint(await promptText('Endpoint', defaultEndpoint))
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

function applyArgument(options, argv, index) {
  const argument = argv[index]
  if (['--help', '-h'].includes(argument)) {
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
    if (!value) {
      throw new Error(`${argument} requires a value.`)
    }
    if (argument === '--endpoint') {
      options.endpoint = value
    }
    else {
      options.configPath = value
    }
    return index + 1
  }
  else if (argument === '--run') {
    const command = runArguments(argv, index)
    if (command.length === 0) {
      throw new Error('--run requires a command after --.')
    }
    options.run = command
    return argv.length
  }
  else {
    throw new Error(`Unknown argument: ${argument}`)
  }
  return index
}
function runArguments(argv, index) {
  return argv.slice(index + 1).filter((value, position) => position > 0 || value !== '--')
}

async function checkOrRun(options, saved) {
  const endpoint = normalizeEndpoint(
    suggestedEndpoint(options, saved),
  )
  const token = validateToken(process.env.MEMORY_API_TOKEN ?? saved?.token)
  const status = await checkCredential(endpoint, token)
  printStatus(status, options.json)
  if (options.run) {
    await runCommand(options.run, { endpoint, token })
  }
}

function suggestedEndpoint(
  options,
  saved,
) {
  return options.endpoint ?? process.env.MEMORY_API_ENDPOINT ?? process.env.MEMORY_BASE_URL
    ?? saved?.endpoint
    ?? DEFAULT_ENDPOINT
}
