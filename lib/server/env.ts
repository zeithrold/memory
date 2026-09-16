export interface Env {
  DB: D1Database
  VECTORIZE?: VectorizeIndex
  AI?: Ai
  CLERK_SECRET_KEY?: string
  APP_ORIGIN: string
}
