import { z } from 'zod'

export const tokensResponse = z.looseObject(
  {
    tokens: z.array(
      z.looseObject({ id: z.string(), name: z.string(), prefix: z.string(), scopes: z.array(z.enum([
        'memory:read',
        'memory:write',
        'memory:delete',
      ])), project: z.union([
        z.null(),
        z.string(),
      ]), created_at: z.string(), expires_at: z.string(), revoked_at: z.union([
        z.null(),
        z.string(),
      ]), last_used_at: z.union([
        z.null(),
        z.string(),
      ]) }),
    ),
  },
)

export const tokenResponse = z.looseObject({ token: z.string() })

export const usageResponse = z.looseObject({
  usage: z.array(z.looseObject({
    operation: z.string(),
    calls: z.number(),
    errors: z.number(),
    average_ms: z.number(),
    day: z.string(),
    token_id: z.union([
      z.null(),
      z.string(),
    ]),
    token_name: z.union([
      z.null(),
      z.string(),
    ]),
    client_id: z.union([
      z.null(),
      z.string(),
    ]),
  })),
  degraded: z.boolean(),
})

export const statusResponse = z.looseObject({ index: z.looseObject({ pending: z.number() }) })
