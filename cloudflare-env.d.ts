import type { Env as WorkerEnv } from './lib/server/env'

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      APP_ORIGIN: WorkerEnv['APP_ORIGIN']
    }
  }
}
