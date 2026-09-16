export interface Env {
  DB: D1Database
  VECTORIZE?: VectorizeIndex
  AI?: Ai
  CLERK_SECRET_KEY?: string
  /** Optional explicit Clerk issuer. Derived from the publishable key when unset. */
  CLERK_ISSUER?: string
  /** Absent in local development and the e2e preview, which disables Sentry. */
  SENTRY_DSN?: string
  SENTRY_RELEASE?: string
  /** `stage` or `production`; derived from APP_ORIGIN when unset. */
  SENTRY_ENVIRONMENT?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
  APP_ORIGIN: string
}
