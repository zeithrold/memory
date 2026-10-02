import { expect, it } from 'vitest'
import { z } from 'zod'
import { selectBatch } from '../lib/server/catalog/model'
import { listProposals } from '../lib/server/catalog/query'
import { seedProposal } from './catalog-proposal-fixture'
import { assign, call, category, fixture, memory } from './catalog-runs-fixture'

it(
  'deciding a proposal > moves a memory only after the proposal is approved',
  async () => {
    const mem = await memory('Database access')
    const proposalId = await seedProposal(
      'project_move',
      { memoryId: mem.id, from: 'global', to: 'billing' },
      { memoryId: mem.id, targetProject: 'billing' },
    )
    // Still where it was while the proposal is merely pending.
    let row = await fixture.env.DB.prepare('SELECT project FROM memories WHERE id = ?')
      .bind(mem.id)
      .first<{ project: string, version: number }>()
    expect(row?.project).toBe('global')

    const { status, body } = await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'approved' })
    row = await fixture.env.DB.prepare('SELECT project, version FROM memories WHERE id = ?')
      .bind(mem.id)
      .first<{ project: string, version: number }>()
    expect(row?.project).toBe('billing')
    expect(row?.version).toBe(2)
    // The move queued a fresh index job, so the vector follows the memory.
    const jobs = await fixture.env.DB.prepare('SELECT count(*) AS n FROM index_jobs WHERE memory_id = ?')
      .bind(mem.id)
      .first<{ n: number }>()
    expect(jobs?.n).toBeGreaterThan(1)
    // The human decision is recorded against the proposal.
    const decision = await fixture.env.DB.prepare('SELECT decision FROM catalog_actions WHERE batch = -3')
      .first<{ decision: string }>()
    expect(decision?.decision).toBe('applied')
  },
)

it(
  'deciding a proposal > records a rejection without touching anything',
  async () => {
    const mem = await memory('Database access')
    const proposalId = await seedProposal(
      'project_move',
      { memoryId: mem.id, from: 'global', to: 'billing' },
      { memoryId: mem.id, targetProject: 'billing' },
    )
    const { body } = await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'reject' })
    expect(body).toMatchObject({ status: 'rejected' })
    const row = await fixture.env.DB.prepare('SELECT project FROM memories WHERE id = ?')
      .bind(mem.id)
      .first<{ project: string }>()
    expect(row?.project).toBe('global')
    const decision = await fixture.env.DB.prepare('SELECT decision FROM catalog_actions WHERE batch = -3')
      .first<{ decision: string }>()
    expect(decision?.decision).toBe('rejected_by_user')
  },
)

it(
  'deciding a proposal > accepts a package in create-then-merge order and stores reject advice',
  async () => {
    const { root, tiny, mergeId, createId } = await seedProposalPackage()
    const approved = await call('/api/v1/catalog/proposals', 'POST', {
      decision: 'approve',
      ids: [mergeId, createId],
    })
    expect(approved.status).toBe(200)
    expect(approved.body).toMatchObject({ decided: 2, failed: [] })
    expect(
      await fixture.env.DB.prepare(
        'SELECT count(*) AS n FROM categories WHERE slug = \'caches\' AND parent_id = ?',
      ).bind(root).first('n'),
    ).toBe(1)
    expect(
      await fixture.env.DB.prepare('SELECT state FROM categories WHERE id = ?').bind(tiny).first('state'),
    )
      .toBe(
        'retired',
      )

    const leftover = await seedProposal('create_category', {
      parentId: null,
      slug: 'travel',
      label: 'Travel',
      description: 'Trips.',
      boundary: 'NOT here: work.',
      axisHint: null,
    })
    const rejected = await call('/api/v1/catalog/proposals', 'POST', {
      decision: 'reject',
      advice: 'Keep travel under life admin instead.',
    })
    expect(rejected.body).toMatchObject({ decided: 1, failed: [] })
    expect(
      await fixture.env.DB.prepare('SELECT status FROM catalog_proposals WHERE id = ?')
        .bind(leftover)
        .first('status'),
    ).toBe('rejected')
    expect(
      await fixture.env.DB.prepare('SELECT pending_advice FROM catalog_state WHERE owner_id = \'alice\'')
        .first('pending_advice'),
    )
      .toBe(
        'Keep travel under life admin instead.',
      )
  },
)

it(
  'deciding a proposal > applies an approved new category and lists pending proposals',
  async () => {
    const proposalId = await seedProposal('create_category', {
      parentId: null,
      slug: 'databases',
      label: 'Databases',
      description: 'Database choices.',
      boundary: 'NOT here: application code.',
      axisHint: null,
    })
    const pending = await call('/api/v1/catalog/proposals')
    expect((z.array(z.unknown()).parse(pending.body?.proposals)).length).toBe(1)
    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    const { body } = await call('/api/v1/catalog')
    const categories = z.array(z.looseObject({ slug: z.string(), createdBy: z.string() })).parse(body?.categories)
    expect(categories).toEqual([
      expect.objectContaining({ slug: 'databases', createdBy: 'user' }),
    ])
    expect(await listProposals(fixture.env, 'alice')).toHaveLength(0)
  },
)

it(
  'deciding a proposal > clears implicit skips and refreshes counters after approving a category',
  async () => {
    const mem = await memory('Database access')
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at,
source)
       VALUES ('alice', ?, 'Left unclassified by the agent.', 1, 2, '2026-09-16T00:00:00.000Z',
'implicit')`,
    )
      .bind(
        mem.id,
      )
      .run()
    const proposalId = await seedProposal('create_category', {
      parentId: null,
      slug: 'databases',
      label: 'Databases',
      description: 'Database choices.',
      boundary: 'NOT here: application code.',
      axisHint: null,
    })

    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })

    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_skips').first('n')).toBe(
      0,
    )
    expect(
      await selectBatch(fixture.env, 'alice', { limit: 10, reviewCutoff: '2000-01-01T00:00:00.000Z' }),
    )
      .toContain(
        mem.id,
      )
    expect(
      await fixture.env.DB.prepare(
        'SELECT category_count, orphan_count, skipped_count FROM catalog_state WHERE owner_id = \'alice\'',
      )
        .first(),
    )
      .toEqual(
        { category_count: 1, orphan_count: 1, skipped_count: 0 },
      )
  },
)

it(
  'deciding a proposal > merges an approved category into its target',
  async () => {
    const from = await category('noise', 'Noise')
    const into = await category('backend', 'Backend')
    const mem = await memory('Database access')
    await assign(mem.id, from)
    const proposalId = await seedProposal(
      'merge_category',
      { fromId: from, intoId: into },
      { categoryId: from, targetCategoryId: into },
    )
    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    const membership = await fixture.env.DB.prepare('SELECT category_id FROM memory_categories WHERE memory_id = ?')
      .bind(mem.id)
      .first<{ category_id: string }>()
    expect(membership?.category_id).toBe(into)
    const retired = await fixture.env.DB.prepare('SELECT state FROM categories WHERE id = ?')
      .bind(from)
      .first<{ state: string }>()
    expect(retired?.state).toBe('retired')
  },
)

async function seedProposalPackage(): Promise<{ root: string, tiny: string, mergeId: string, createId: string }> {
  const root = await category('backend', 'Backend')
  const createId = await seedProposal('create_category', {
    parentId: root,
    slug: 'caches',
    label: 'Caches',
    description: 'Cache decisions.',
    boundary: 'NOT here: databases.',
    axisHint: null,
  })
  const tiny = await category('tiny', 'Tiny')
  await fixture.env.DB.prepare('UPDATE categories SET parent_id = ?, depth = 2 WHERE id = ?')
    .bind(root, tiny)
    .run()
  const mergeId = await seedProposal(
    'merge_category',
    { fromId: tiny, intoId: root },
    { categoryId: tiny, targetCategoryId: root },
  )

  return { root, tiny, mergeId, createId }
}
