import type { Env } from './lib/server/env'
import handler from 'vinext/server/fetch-handler'
import { maintenance } from './lib/server/indexer'

export default {
  ...handler,
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await maintenance(env)
  },
}
