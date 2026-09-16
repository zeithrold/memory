import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Mirrors the `@/*` path alias in tsconfig.json. Tests import service modules
  // directly, but `app/` route modules use the alias, and the route module is
  // the only place a missing HTTP verb is observable.
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
