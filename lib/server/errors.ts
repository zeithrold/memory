import type { Principal, Scope } from '../contracts'
import type { ErrorCode } from '../error-catalog'
import { ZodError } from 'zod'
import { ERROR_DEFINITIONS, errorDefinition, problemType } from '../error-catalog'
import { captureRequestError } from './observability'

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    /** null means the caller owns retry policy; provider errors set this explicitly. */
    public retryable: boolean | null = null,
  ) {
    super(message)
  }

  /** The status is owned by the catalog so it cannot drift from the error page. */
  get status(): number {
    return ERROR_DEFINITIONS[this.code].status
  }
}
/**
 * RFC 9457 problem document. `type` resolves to a page under `/errors`, `title`
 * and `status` come from the catalog, `detail` is this occurrence, and `code` is
 * the stable machine identifier clients should branch on.
 */
export interface ProblemDocument {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  code: ErrorCode
  fields?: { path: (number | string)[], message: string }[]
}
export interface ProblemContext {
  /** The deployment origin that produced the response. */
  origin: string
  /** Path of the request, without a query string. */
  instance?: string
  /** HTTP method, used for error reporting only; never echoed in the document. */
  method?: string
}
export function problemDocument(
  code: ErrorCode,
  detail: string,
  context: ProblemContext,
  extra?: Pick<ProblemDocument, 'fields'>,
): ProblemDocument {
  const definition = errorDefinition(code)
  return {
    type: problemType(context.origin, code),
    title: definition.title,
    status: definition.status,
    detail,
    ...(context.instance === undefined
      ? {}
      : { instance: context.instance }),
    code,
    ...(extra ?? {}),
  }
}
export function problemResponse(
  document: ProblemDocument,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(document), {
    status: document.status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...headers,
    },
  })
}
export function errorResponse(
  error: unknown,
  context: ProblemContext,
): Response {
  const respond = (document: ProblemDocument): Response => {
    // Only failures the service did not intend (5xx) are worth an alert; 4xx is
    // normal traffic. Sentry stays inert when no DSN is configured.
    captureRequestError(error, document, context)
    return problemResponse(document)
  }
  if (error instanceof AppError)
    return respond(problemDocument(error.code, error.message, context))
  if (error instanceof ZodError) {
    return respond(
      problemDocument('INVALID_INPUT', 'Check the request fields.', context, {
        fields: error.issues.map(issue => ({
          // Zod reports symbol segments for non-JSON input; this API only reads JSON.
          path: issue.path.filter(
            (segment): segment is string | number =>
              typeof segment === 'string' || typeof segment === 'number',
          ),
          message: issue.message,
        })),
      }),
    )
  }
  // Do not log SQL bindings, memory text, credentials, or raw provider errors.
  console.error('Request failed', {
    type: error instanceof Error ? error.name : 'UnknownError',
  })
  return respond(
    problemDocument(
      'INTERNAL_ERROR',
      'The request could not be completed.',
      context,
    ),
  )
}
export function requirePermission(
  principal: Principal,
  scope: Scope,
  project?: string,
): void {
  if (
    !principal.scopes.includes(scope)
    || (project !== undefined
      && principal.project !== null
      && principal.project !== project)
  ) {
    throw new AppError(
      'FORBIDDEN',
      'This token cannot access this operation or project.',
    )
  }
}
