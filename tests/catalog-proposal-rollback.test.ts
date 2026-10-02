import { expect, it } from 'vitest'
import { decideProposals } from '../lib/server/catalog/query'
import { seedProposal } from './catalog-proposal-fixture'
import { assign, call, category, fixture, memory, session } from './catalog-runs-fixture'

it(
  'deciding a proposal > rolls back the whole merge if recording the approval fails',
  async () => {
    const from = await category('noise', 'Noise')
    const into = await category('backend', 'Backend')
    const mem = await memory('Overlapping memberships')
    await assign(mem.id, from)
    await assign(mem.id, into, 0)
    const proposalId = await seedProposal(
      'merge_category',
      {},
      { categoryId: from, targetCategoryId: into },
    )
    fixture.store.sqlite.exec(`
      CREATE TRIGGER fail_human_audit BEFORE INSERT ON catalog_actions
      WHEN NEW.batch = -3 BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END;
    `)
    const memberships = fixture.store.sqlite.prepare('SELECT * FROM memory_categories ORDER BY category_id').all()
    const categories = fixture.store.sqlite.prepare('SELECT * FROM categories ORDER BY id').all()

    await expect(decideProposals(
      fixture.env,
      session,
      { ownerId: 'alice', approve: true, ids: [proposalId] },
    ))
      .rejects
      .toThrow('forced audit failure')
    expect(
      fixture.store.sqlite.prepare('SELECT * FROM memory_categories ORDER BY category_id').all(),
    )
      .toEqual(
        memberships,
      )
    expect(fixture.store.sqlite.prepare('SELECT * FROM categories ORDER BY id').all()).toEqual(
      categories,
    )
    expect(
      await fixture.env.DB.prepare('SELECT status, resolved_at FROM catalog_proposals WHERE id = ?')
        .bind(proposalId)
        .first(),
    )
      .toEqual(
        { status: 'pending', resolved_at: null },
      )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_state').first('n')).toBe(
      0,
    )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_actions').first('n'))
      .toBe(
        0,
      )
  },
)

it.each([
  'source',
  'target',
  'self',
])(
  'deciding a proposal > refuses an invalid merge before changing memberships: %s',
  async (
    invalid,
  ) => {
    const from = await category('noise', 'Noise')
    const into = invalid === 'self' ? from : await category('backend', 'Backend')
    const mem = await memory('Keep this membership')
    await assign(mem.id, from)
    const proposalId = await seedProposal(
      'merge_category',
      {},
      { categoryId: from, targetCategoryId: into },
    )
    if (invalid !== 'self') {
      await fixture.env.DB.prepare('UPDATE categories SET state = \'retired\' WHERE id = ?')
        .bind(invalid === 'source' ? from : into)
        .run()
    }
    const result = await call('/api/v1/catalog/proposals', 'POST', { decision: 'approve' })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ decided: 0, failed: [
      { id: proposalId, code: 'CONFLICT' },
    ] })
    expect(
      await fixture.env.DB.prepare(
        'SELECT category_id, is_primary FROM memory_categories WHERE memory_id = ?',
      )
        .bind(
          mem.id,
        )
        .first(),
    )
      .toEqual(
        { category_id: from, is_primary: 1 },
      )
    expect(await fixture.env.DB.prepare('SELECT status FROM catalog_proposals WHERE id = ?')
      .bind(proposalId)
      .first('status')).toBe('pending')
  },
)

it(
  'deciding a proposal > refuses to decide twice',
  async () => {
    const proposalId = await seedProposal('retire_category', { categoryId: 'x' }, { categoryId: null })
    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'reject' })
    const again = await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ code: 'CONFLICT' })
  },
)
