import type { Env } from './lib/server/env'
import * as Sentry from '@sentry/cloudflare'
import handler from 'vinext/server/fetch-handler'
import { maintenance } from './lib/server/indexer'
import { sentryOptions } from './lib/server/observability'

// Workflows bind by exported class name, so the class has to survive the
// bundle as a named export of the entry module rather than as part of the
// default handler. `pnpm check:bundle` guards that.
export { CatalogWorkflow } from './lib/server/catalog/workflow'

const base = handler as unknown as ExportedHandler<Env>

const worker = {
  ...base,
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // Beyond the automatic `faas.cron` span, this upserts a Sentry Crons monitor
    // so a silently stopped indexer becomes visible.
    await Sentry.withMonitor(
      'shared-memory-maintenance',
      async () => maintenance(env),
      {
        schedule: { type: 'crontab', value: '* * * * *' },
        checkinMargin: 2,
        maxRuntime: 5,
      },
    )
  },
} satisfies ExportedHandler<Env>
/**
 * Wraps `fetch` and `scheduled` in place. With no DSN the options callback
 * returns undefined and the SDK stays inert, which is how local development and
 * the e2e preview behave.
 */
export default Sentry.withSentry((env: Env) => sentryOptions(env), worker)
