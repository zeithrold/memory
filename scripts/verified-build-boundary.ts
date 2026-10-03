import { z } from 'zod'

const metadataSchema = z.object({
  buildPurpose: z.literal('unsigned-verification'),
  revision: z.string().regex(/^[a-f0-9]{40}$/u),
  dirty: z.literal(false),
  lockfileSha256: z.string().regex(/^[a-f0-9]{64}$/u),
})
interface DeploymentContext {
  eventName: string
  ref: string
  revision: string
  lockfileSha256: string
}

// This verifies source provenance only. The downloaded preview bundle is never
// reused for production: pnpm deploy performs a fresh auth/Sentry build.
export function verifyBuildBoundary(value: unknown, context: DeploymentContext): void {
  if (context.eventName !== 'push' || context.ref !== 'refs/heads/main') {
    throw new Error('Production deployment requires a main push')
  }
  const metadata = metadataSchema.parse(value)
  if (metadata.revision !== context.revision) {
    throw new Error('Verified build revision differs from checkout')
  }
  if (metadata.lockfileSha256 !== context.lockfileSha256) {
    throw new Error('Verified build lockfile differs from checkout')
  }
}
