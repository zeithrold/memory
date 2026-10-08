import { expect, it } from 'vitest'
import { seedProposal } from './catalog-proposal-fixture'
import { assign, call, category, fixture, memory } from './catalog-runs-fixture'

it.each([
  { sourcePrimary: 1, targetPrimary: 0, otherPrimary: 0 },
  { sourcePrimary: 0, targetPrimary: 1, otherPrimary: 0 },
  { sourcePrimary: 0, targetPrimary: 0, otherPrimary: 1 },
  { sourcePrimary: 0, targetPrimary: 0, otherPrimary: 0 },
])(
  ('approves overlapping memberships without losing primary routing: %o'),
  async (
    { sourcePrimary, targetPrimary, otherPrimary },
  ) => {
    const from = await category('noise', 'Noise')
    const into = await category('backend', 'Backend')
    const other = await category('other', 'Other')
    const overlap = await memory('Shared membership')
    const sourceOnly = await memory('Source only')
    const targetOnly = await memory('Target only')
    await assign(overlap.id, from, sourcePrimary)
    await assign(overlap.id, into, targetPrimary)
    await assign(overlap.id, other, otherPrimary)
    await assign(sourceOnly.id, from)
    await assign(targetOnly.id, into)
    await fixture.env.DB.prepare(
      'UPDATE memory_categories SET confidence = 0.7, assigned_by = \'user\' WHERE memory_id = ? AND category_id = ?',
    )
      .bind(
        overlap.id,
        into,
      )
      .run()
    const proposalId = await seedProposal(
      'merge_category',
      { fromId: from, intoId: into },
      { categoryId: from, targetCategoryId: into },
    )

    const approved = await call('/api/v1/catalog/proposals', 'POST', { decision: 'approve' })
    expect(approved.status).toBe(200)
    expect(approved.body).toEqual({ decided: 1, failed: [] })
    await expectOverlap({ into, overlap, sourceOnly, targetOnly, sourcePrimary, targetPrimary })
    await expectMergedCatalog({ from, into, other, overlap, otherPrimary, proposalId })
  },
)

type MergeEvidence = {
  into: string
  from: string
  other: string
  overlap: { id: string }
  sourceOnly: { id: string }
  targetOnly: { id: string }
  sourcePrimary: number
  targetPrimary: number
  otherPrimary: number
  proposalId: string
}
async function expectOverlap(context: OverlapEvidence): Promise<void> {
  const { into, overlap, sourceOnly, targetOnly, sourcePrimary, targetPrimary } = context
  expect(
    await fixture.env.DB.prepare(
      'SELECT memory_id, is_primary FROM memory_categories WHERE category_id = ? ORDER BY memory_id',
    )
      .bind(

        into,
      )
      .all(),
  )
    .toMatchObject(
      {
        results: [
          { memory_id: overlap.id, is_primary: sourcePrimary === 1 ? 1 : targetPrimary },
          { memory_id: sourceOnly.id, is_primary: 1 },
          { memory_id: targetOnly.id, is_primary: 1 },
        ].sort((a, b) => a.memory_id.localeCompare(b.memory_id)),
      },
    )
  expect(
    await fixture.env.DB.prepare(
      'SELECT confidence, assigned_by FROM memory_categories WHERE memory_id = ? AND category_id = ?',
    )
      .bind(

        overlap.id,

        into,
      )
      .first(),
  )
    .toEqual(
      sourcePrimary === 1
        ? { confidence: 0.9, assigned_by: 'agent' }
        : { confidence: 0.7, assigned_by: 'user' },
    )
}
async function expectMergedCatalog(context: CatalogMergeEvidence): Promise<void> {
  const { from, into, other, overlap, otherPrimary, proposalId } = context
  expect(await fixture.env.DB.prepare(
    'SELECT is_primary FROM memory_categories WHERE memory_id = ? AND category_id = ?',
  ).bind(overlap.id, other).first('is_primary')).toBe(otherPrimary)
  expect(
    await fixture.env.DB.prepare('SELECT count(*) AS n FROM memory_categories WHERE category_id = ?')
      .bind(from)
      .first('n'),
  )
    .toBe(
      0,
    )
  expect(await fixture.env.DB.prepare('SELECT state, member_count FROM categories WHERE id = ?')
    .bind(from)
    .first()).toEqual({ state: 'retired', member_count: 0 })
  expect(await fixture.env.DB.prepare('SELECT member_count FROM categories WHERE id = ?')
    .bind(into)
    .first('member_count')).toBe(3)
  expect(
    await fixture.env.DB.prepare(
      ('SELECT category_count, assigned_count, orphan_count FROM catalog_state '
        + 'WHERE owner_id = \'alice\''),
    )
      .first(),
  )
    .toEqual(
      { category_count: 2, assigned_count: 4, orphan_count: 0 },
    )
  expect(await fixture.env.DB.prepare('SELECT status FROM catalog_proposals WHERE id = ?')
    .bind(proposalId)
    .first('status')).toBe('approved')
  expect(
    await fixture.env.DB.prepare(
      'SELECT count(*) AS n FROM catalog_actions WHERE batch = -3 AND decision = \'applied\'',
    )
      .first(

        'n',
      ),
  )
    .toBe(
      1,
    )
}

type OverlapKeys = 'into' | 'overlap' | 'sourceOnly' | 'targetOnly' | 'sourcePrimary' | 'targetPrimary'
type OverlapEvidence = Pick<MergeEvidence, OverlapKeys>
type CatalogMergeEvidence = Pick<MergeEvidence, 'from' | 'into' | 'other' | 'overlap' | 'otherPrimary' | 'proposalId'>
