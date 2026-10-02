import { expect, it } from 'vitest'
import { call, openRun } from './catalog-runs-fixture'

it('reverting a run > refuses to revert a run that is still going', async () => {
  const runId = await openRun('live', 'running')
  const { status, body } = await call(`/api/v1/catalog/runs/${runId}/revert`, 'POST', {})
  expect(status).toBe(409)
  expect(body).toMatchObject({ code: 'RUN_IN_PROGRESS' })
})
