import { spawn } from 'node:child_process'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

export async function promptText(label, fallback) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await terminal.question(`${label} [${fallback}]: `)).trim()
    return answer || fallback
  }
  finally {
    terminal.close()
  }
}
export async function promptSecret(
  label,
) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error(('A hidden token prompt needs an interactive terminal. Alternatively set '
      + 'MEMORY_API_TOKEN for this command.'))
  }
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
      if (wasPaused) {
        process.stdin.pause()
      }
      process.stdout.write('\n')
      if (error) {
        reject(error)
      }
      else {
        resolve(value)
      }
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
        if (character >= ' ') {
          value += character
        }
      }
    }
    process.stdin.on('data', onData)
  })
}
export async function runCommand(command, configuration) {
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
      if (signal) {
        reject(new Error(`Command stopped by signal ${signal}.`))
      }
      else
        if (code !== 0) {
          reject(new Error(`Command exited with status ${code ?? 1}.`))
        }
        else {
          resolve()
        }
    })
  })
}
