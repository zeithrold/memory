export interface Env {
  DB: D1Database
  USAGE_ANALYTICS?: AnalyticsEngineDataset
  AUTH_RATE_LIMITER?: RateLimit
  API_RATE_LIMITER?: RateLimit
  CLOUDFLARE_ACCOUNT_ID?: string
  ANALYTICS_READ_TOKEN?: string
  VECTORIZE?: VectorizeIndex
  AI?: Ai
  /** Absent when the deployment (or the e2e preview) declares no Workflow. */
  CATALOG_WORKFLOW?: Workflow<unknown>
  /**
   * 64 hex characters (32 bytes). Encrypts each account's model credential;
   * without it the service refuses to store one rather than keeping plaintext.
   */
  AGENT_SETTINGS_KEY?: string
  CLERK_SECRET_KEY?: string
  /** Optional explicit Clerk issuer. Derived from the publishable key when unset. */
  CLERK_ISSUER?: string
  /** Optional publishable key override; otherwise the built-in public key is used. */
  CLERK_PUBLISHABLE_KEY?: string
  /** Absent in local development and the e2e preview, which disables Sentry. */
  SENTRY_DSN?: string
  SENTRY_RELEASE?: string
  /** `stage` or `production`; derived from APP_ORIGIN when unset. */
  SENTRY_ENVIRONMENT?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
  APP_ORIGIN: string
}
