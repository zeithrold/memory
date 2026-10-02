import type { Messages } from '@/lib/i18n/messages'
import { z } from 'zod'

export type Api = <T>(path: string, schema: z.ZodType<T>, init?: RequestInit) => Promise<T>
export type AuthState = 'ready' | 'unconfigured'
const problemSchema = z.object({ code: z.string(), detail: z.string().optional(), title: z.string().optional() })

export class ProblemError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ProblemError'
  }
}

/** The session cookie remains the only browser credential. Parse every response at this boundary. */
export function createApi(
  authState: AuthState,
  t: Pick<Messages, 'signIn' | 'loadError'>,
): Api {
  return async <T>(
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> => {
    if (authState === 'unconfigured') {
      throw new Error(t.signIn)
    }
    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    const response = await fetch(`/api/v1/${path}`, { ...init, credentials: 'include', headers })
    if (!response.ok) {
      const parsed = problemSchema.safeParse(await response.json())
      if (parsed.success) {
        throw new ProblemError(parsed.data.detail ?? parsed.data.title ?? t.loadError, parsed.data.code)
      }
      throw new Error(t.loadError)
    }
    return schema.parse(response.status === 204 ? undefined : await response.json())
  }
}
