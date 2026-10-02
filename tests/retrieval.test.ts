import { expect, it } from 'vitest'
import { allocate, deviation, scoreCategories, standardize } from '../lib/server/catalog/balance'
import { searchCatalog } from '../lib/server/catalog/search'
import { searchMemories } from '../lib/server/memories'
import { alice, assign, category, childCategory, fixture, memory, QUERY, starvedLibrary } from './retrieval-fixture'

it('balanced allocation > keeps a floor of one slot and a ceiling per category', () => {
  const sizes = new Map([
    ['big', 1000],
    ['small', 1],
  ])
  const allocation = allocate('sqrt', { sizes, deviations: new Map(), total: 8 })
  // Without the floor the small category rounds to zero and loses its only
  // chance to be seen, which is the entire point of routing.
  expect(allocation.get('small')).toBeGreaterThanOrEqual(1)
  expect(allocation.get('big')).toBeLessThanOrEqual(Math.ceil((8 / 2) * 1.5))
})

it('balanced allocation > orders the rules the way the literature does', () => {
  const sizes = new Map([
    ['big', 100],
    ['small', 1],
  ])
  const equal = allocate('equal', { sizes, deviations: new Map(), total: 10 })
  const sqrt = allocate('sqrt', { sizes, deviations: new Map(), total: 10 })
  // A small category whose scores are internally varied: Neyman allocation is
  // variance-optimal, so it earns more than power allocation gives it. It does
  // not beat proportional-to-size on its own, because the size factor still
  // dominates; what it beats is the floor that proportional allocation hits.
  const neyman = allocate('neyman', {
    sizes,
    deviations: new Map([
      ['big', 0.1],
      ['small', 2],
    ]),
    total: 10,
  })
  expect(equal.get('small')).toBe(equal.get('big'))
  expect(sqrt.get('big')).toBeGreaterThan(sqrt.get('small') ?? 0)
  expect(neyman.get('small')).toBeGreaterThan(sqrt.get('small') ?? 0)
})

it('balanced allocation > standardizes without letting an outlier set the scale', () => {
  const out = standardize([
    1,
    2,
    3,
    1000,
  ])
  expect(out).toHaveLength(4)
  expect(out[3]).toBeGreaterThan(1)
  expect(out[0]).toBeLessThan(0)
  expect(deviation([])).toBe(0)
  expect(standardize([
    5,
    5,
    5,
  ])).toEqual([
    0,
    0,
    0,
  ])
})

it('balanced allocation > scores categories by their own description text', () => {
  const scores = scoreCategories(
    [
      {
        id: 'a',
        label: 'Infrastructure',
        description: 'Database access and drivers.',
        boundary: 'x',
        member_count: 10,
      },
      {
        id: 'b',
        label: 'Compliance',
        description: 'Database retention.',
        boundary: 'x',
        member_count: 1,
      },
      {
        id: 'c',
        label: 'Travel',
        description: 'Flights and hotels.',
        boundary: 'x',
        member_count: 3,
      },
    ],
    ['database', 'access'],
  )
  expect([
    ...scores.keys(),
  ].sort()).toEqual(['a', 'b'])
  expect(scores.get('a')).toBeGreaterThan(scores.get('b') ?? 0)
})

it(
  'catalog-routed retrieval > surfaces a starved category that flat ranking buries',
  async () => {
    const { starved, compliance } = await starvedLibrary()
    const flat = await searchMemories(fixture.env, alice, { query: QUERY, project: 'global', limit: 8 })
    expect(flat.memories.map(entry => entry.id)).not.toContain(starved)
    expect(flat.catalog).toBeNull()

    const routed = await searchMemories(fixture.env, alice, {
      query: QUERY,
      project: 'global',
      limit: 8,
      mode: 'catalog',
      balance: 'sqrt',
    })
    // The floor of one slot is what puts it back on the page.
    expect(routed.memories.map(entry => entry.id)).toContain(starved)
    expect(routed.catalog).toMatchObject({ routed: true, balance: 'sqrt' })
    const labels = routed.catalog?.categories.map(entry => entry.id) ?? []
    expect(labels).toContain(compliance)
    // The large category still fills the rest: routing narrows the budget, it
    // does not replace ranking.
    expect(routed.memories.length).toBe(8)
  },
)

it(
  'catalog-routed retrieval > always fuses the flat ranking, so a routing miss costs ranking quality but never recall',
  async () => {
    const { buried } = await starvedLibrary()
    const flat = await searchMemories(fixture.env, alice, { query: QUERY, project: 'global', limit: 5 })
    const routed = await searchMemories(fixture.env, alice, {
      query: QUERY,
      project: 'global',
      limit: 5,
      mode: 'catalog',
      balance: 'sqrt',
    })
    // Everything flat found is still reachable after routing.
    for (const id of flat.memories.map(entry => entry.id)) {
      expect(routed.memories.map(entry => entry.id)).toContain(id)
    }
    expect(routed.memories.map(entry => entry.id).sort()).toEqual(
      expect.arrayContaining(buried.slice(0, 3).sort()),
    )
  },
)

it(
  'catalog-routed retrieval > reports a routing miss instead of pretending to route',
  async () => {
    await starvedLibrary()
    const result = await searchMemories(fixture.env, alice, {
      query: 'invoice reimbursement',
      project: 'global',
      limit: 5,
      mode: 'catalog',
    })
    expect(result.catalog).toEqual({ routed: false, balance: 'sqrt', categories: [] })
    const flat = await searchMemories(fixture.env, alice, {
      query: 'invoice reimbursement',
      project: 'global',
      limit: 5,
    })
    expect(result.memories).toEqual(flat.memories)
  },
)

it('catalog-routed retrieval > leaves an empty catalog alone', async () => {
  const result = await searchMemories(fixture.env, alice, {
    query: QUERY,
    project: 'global',
    limit: 5,
    mode: 'catalog',
  })
  expect(result.catalog).toEqual({ routed: false, balance: 'sqrt', categories: [] })
  expect(result.memories).toEqual([])
})

it(
  'catalog-routed retrieval > keeps every balance rule on the page when one is starved',
  async () => {
    const { starved } = await starvedLibrary()
    for (const balance of [
      'equal',
      'sqrt',
      'neyman',
    ] as const) {
      const result = await searchMemories(fixture.env, alice, {
        query: QUERY,
        project: 'global',
        limit: 8,
        mode: 'catalog',
        balance,
      })
      expect(result.memories.map(entry => entry.id)).toContain(starved)
    }
  },
)

it(
  'catalog-routed retrieval > honours an explicit category scope returned by catalog search',
  async () => {
    const { compliance, starved } = await starvedLibrary()
    const scoped = await searchMemories(fixture.env, alice, {
      query: QUERY,
      project: 'global',
      categoryIds: [compliance],
      limit: 8,
    })
    expect(scoped.memories.map(entry => entry.id)).toEqual([starved])
  },
)

it(
  'catalog search > returns paths and project-filtered counts without exposing empty categories',
  async () => {
    const root = await category(
      'engineering',
      'Engineering',
      'Software and database engineering.',
      'NOT here: travel.',
    )
    const database = await childCategory(
      root,
      'database',
      {
        label: 'Database',
        description: 'Database access and storage.',
        boundary: 'NOT here: application UI.',
      },
    )
    const hidden = await category(
      'private-database',
      'Private database',
      'Database notes for another project.',
      'NOT here: global notes.',
    )
    const visibleMemory = await memory('Database driver', 'Use a database driver.')
    await assign(visibleMemory.id, database)
    const privateMemory = await memory(
      'Private database',
      'A database note in another project.',
      [],
      'private-project',
    )
    await assign(privateMemory.id, hidden)

    const result = await searchCatalog(fixture.env, alice, {
      query: 'database',
      project: 'global',
      limit: 10,
    })
    expect(result.project).toBe('global')
    expect(result.categories.map(entry => entry.id)).toEqual(
      expect.arrayContaining([root, database]),
    )
    expect(result.categories.map(entry => entry.id)).not.toContain(hidden)
    expect(result.categories.find(entry => entry.id === root)?.visibleMemberCount).toBe(1)
    expect(result.categories.find(entry => entry.id === database)?.path).toEqual([
      { id: root, slug: 'engineering', label: 'Engineering' },
      { id: database, slug: 'database', label: 'Database' },
    ])
  },
)

it(
  'catalog search > enforces a project-restricted credential before searching categories',
  async () => {
    await expect(searchCatalog(fixture.env, { ...alice, project: 'private-project' }, {
      query: 'database',
      project: 'global',
    })).rejects.toMatchObject({ status: 403 })
  },
)
