import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ERROR_BY_SLUG,
  ERROR_CODES,
  ERROR_DEFINITIONS,
  ERROR_ENTRIES,
  errorDefinition,
  problemType,
} from '../lib/error-catalog'
import { AppError, errorResponse, problemDocument } from '../lib/server/errors'

const context = { origin: 'https://memory.example', instance: '/api/v1/memories' }

describe('error catalog', () => {
  it('covers the documented codes exactly once', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
    expect(ERROR_ENTRIES.map(entry => entry.code)).toEqual(ERROR_CODES)
    expect(ERROR_BY_SLUG.size).toBe(ERROR_CODES.length)
  })
  it('gives every entry a usable slug, status and copy', () => {
    for (const entry of ERROR_ENTRIES) {
      expect(entry.slug).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(entry.status).toBeGreaterThanOrEqual(400)
      expect(entry.status).toBeLessThanOrEqual(599)
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.summary.length).toBeGreaterThan(40)
      expect(entry.remediation.length).toBeGreaterThan(0)
      expect(ERROR_BY_SLUG.get(entry.slug)).toBe(entry)
      expect(problemType(context.origin, entry.code)).toBe(
        `https://memory.example/errors/${entry.slug}`,
      )
    }
  })
  it('treats the trailing origin slash and the documented codes as canonical', () => {
    expect(problemType('https://memory.example/', 'UNAUTHORIZED')).toBe(
      'https://memory.example/errors/unauthorized',
    )
    expect(errorDefinition('VERSION_CONFLICT').status).toBe(409)
    expect(Object.keys(ERROR_DEFINITIONS)).toContain('METHOD_NOT_ALLOWED')
  })
})

describe('problem documents', () => {
  it('renders every member of an application error', async () => {
    const response = errorResponse(
      new AppError('VERSION_CONFLICT', 'The memory changed.'),
      context,
    )
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toEqual({
      type: 'https://memory.example/errors/version-conflict',
      title: 'Version conflict',
      status: 409,
      detail: 'The memory changed.',
      instance: '/api/v1/memories',
      code: 'VERSION_CONFLICT',
    })
  })
  it('derives status from the catalog so it cannot drift from the page', () => {
    for (const code of ERROR_CODES)
      expect(new AppError(code, 'x').status).toBe(ERROR_DEFINITIONS[code].status)
  })
  it('omits instance when the caller has no request path', () => {
    const document = problemDocument('RATE_LIMITED', 'Slow down.', {
      origin: 'https://memory.example',
    })
    expect(document).not.toHaveProperty('instance')
    expect(document.type).toBe('https://memory.example/errors/rate-limited')
  })
  it('reports validation failures as fields instead of leaking the schema', async () => {
    const parsed = z
      .object({ content: z.string().max(4) })
      .safeParse({ content: 'too long' })
    const response = errorResponse(parsed.error, context)
    expect(response.status).toBe(400)
    const body: unknown = await response.json()
    expect(body).toMatchObject({
      type: 'https://memory.example/errors/invalid-input',
      title: 'Invalid input',
      status: 400,
      detail: 'Check the request fields.',
      instance: '/api/v1/memories',
      code: 'INVALID_INPUT',
    })
    const fields = (body as { fields: { path: string[], message: string }[] }).fields
    expect(fields).toHaveLength(1)
    expect(fields[0]?.path).toEqual(['content'])
    expect(fields[0]?.message.length).toBeGreaterThan(0)
  })
  it('hides unexpected failures behind INTERNAL_ERROR', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = errorResponse(
      new Error('D1_ERROR: no such table: api_tokens'),
      context,
    )
    const body = await response.text()
    expect(response.status).toBe(500)
    expect(body).not.toContain('api_tokens')
    expect(JSON.parse(body)).toMatchObject({
      type: 'https://memory.example/errors/internal-error',
      code: 'INTERNAL_ERROR',
      status: 500,
    })
    expect(logged).toHaveBeenCalledWith('Request failed', { type: 'Error' })
  })
})
