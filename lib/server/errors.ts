import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    )
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: 'Check the request fields.',
          fields: error.issues.map(issue => ({
            path: issue.path,
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    )
  }
  // Do not log SQL bindings, memory text, credentials, or raw provider errors.
  console.error('Request failed', {
    type: error instanceof Error ? error.name : 'UnknownError',
  })
  return Response.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
      },
    },
    { status: 500 },
  )
}
export function requirePermission(
  principal: import('../contracts').Principal,
  scope: import('../contracts').Scope,
  project?: string,
): void {
  if (
    !principal.scopes.includes(scope)
    || (project !== undefined
      && principal.project !== null
      && principal.project !== project)
  ) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'This token cannot access this operation or project.',
    )
  }
}
