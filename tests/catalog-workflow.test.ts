import type { WorkflowStepConfig } from 'cloudflare:workers'
import type { WorkflowSteps } from '../lib/server/catalog/workflow-owner'
import { beforeEach, expect, it, vi } from 'vitest'
import { automaticTurnAllowed, claimRun, consolidate, finishRun, startBatch } from '../lib/server/catalog/run'
import { actTurn, thinkTurn } from '../lib/server/catalog/turn'
import { runOwner } from '../lib/server/catalog/workflow-owner'
import { AppError } from '../lib/server/errors'
import { fixture } from './catalog-loop-fixture'

vi.mock('cloudflare:workflows', () => ({ NonRetryableError: class extends Error {} }))

vi.mock('../lib/server/catalog/run', async original => ({
  ...await original<typeof import('../lib/server/catalog/run')>(),
  claimRun: vi.fn(),
  startBatch: vi.fn(),
  automaticTurnAllowed: vi.fn(),
  consolidate: vi.fn(),
  finishRun: vi.fn(),
  finalizeBatch: vi.fn(),
}))

vi.mock('../lib/server/catalog/turn', () => ({ thinkTurn: vi.fn(), actTurn: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

class Journal implements WorkflowSteps {
  readonly names: string[] = []
  readonly configurations: WorkflowStepConfig[] = []
  do<T extends Rpc.Serializable<T>>(name: string, operation: () => Promise<T>): Promise<T>
  do<T extends Rpc.Serializable<T>>(
    name: string,
    config: WorkflowStepConfig,
    operation: () => Promise<T>
  ): Promise<T>
  async do<T extends Rpc.Serializable<T>>(
    name: string,
    configOrOperation: WorkflowStepConfig | (() => Promise<T>),
    operation?: () => Promise<T>,
  ): Promise<T> {
    this.names.push(name)
    if (typeof configOrOperation === 'function') {
      return await configOrOperation()
    }
    this.configurations.push(configOrOperation)
    if (operation === undefined) {
      throw new Error('Missing journal operation')
    }
    return await operation()
  }
}

function openBatch(): void {
  vi.mocked(startBatch).mockResolvedValue({
    memoryIds: ['memory'],
    mode: 'live',
    includeContent: false,
    maxTurns: 2,
    maxToolCalls: 4,
  })
}
it(
  'does not execute another batch or finish a reused run',
  async () => {
    vi.mocked(claimRun).mockResolvedValue(
      { runId: 'existing', reused: true, dryRun: false, budgetWarning: false },
    )
    const step = new Journal()
    expect(
      await runOwner(fixture.env, step, 'alice', { trigger: 'schedule', dryRun: false, prefix: 'owner-0' }),
    )
      .toMatchObject(
        { outcome: 'already-running', runId: 'existing' },
      )
    expect(step.names).toEqual(['owner-0-claim'])
    expect(startBatch).not.toHaveBeenCalled()
    expect(finishRun).not.toHaveBeenCalled()
  },
)

it(
  'stops before a paid call when the scheduled daily budget is reached',
  async () => {
    openBatch()
    vi.mocked(automaticTurnAllowed).mockResolvedValue(false)
    const step = new Journal()
    await runOwner(
      fixture.env,
      step,
      'alice',
      { trigger: 'schedule', dryRun: false, existingRunId: 'run', prefix: 'owner-0', scheduledAt: 123 },
    )
    expect(thinkTurn).not.toHaveBeenCalled()
    expect(step.names).toEqual(
      [
        'owner-0-0-open',
        'owner-0-0-0-think',
        'owner-0-consolidate',
        'owner-0-finish',
      ],
    )
    expect(finishRun).toHaveBeenCalledWith(
      fixture.env,
      'alice',
      { runId: 'run', status: 'partial', errorCode: 'DAILY_TOKEN_BUDGET', scheduledAt: 123 },
    )
  },
)

it(
  'records terminal provider failure using the existing failure journal name',
  async () => {
    openBatch()
    vi.mocked(thinkTurn).mockRejectedValue(
      new AppError('PROVIDER_OUTPUT_INCOMPLETE', 'Incomplete', false),
    )
    const step = new Journal()
    await expect(
      runOwner(
        fixture.env,
        step,
        'alice',
        { trigger: 'manual', dryRun: false, existingRunId: 'run', prefix: 'run' },
      ),
    )
      .rejects
      .toThrow(
        'PROVIDER_OUTPUT_INCOMPLETE',
      )
    expect(step.names).toEqual([
      'run-0-open',
      'run-0-0-think',
      'run-fail',
    ])
    expect(step.configurations).toEqual(
      [
        { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
      ],
    )
    expect(actTurn).not.toHaveBeenCalled()
    expect(consolidate).not.toHaveBeenCalled()
    expect(finishRun).toHaveBeenCalledWith(
      fixture.env,
      'alice',
      { runId: 'run', status: 'failed', errorCode: 'PROVIDER_OUTPUT_INCOMPLETE', scheduledAt: undefined },
    )
  },
)
