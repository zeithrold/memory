export interface TenantIntegrityFinding {
  relationship: string
  count: number
  sample_id: string
}

interface IntegrityCheck {
  relationship: string
  from: string
  where: string
  sample: string
}

const checks: IntegrityCheck[] = [
  { relationship: 'categories.parent', from: 'categories c LEFT JOIN categories p ON p.id = c.parent_id', where: 'c.parent_id IS NOT NULL AND (p.id IS NULL OR p.owner_id != c.owner_id)', sample: 'substr(c.id, 1, 8) || \':\' || substr(c.parent_id, 1, 8)' },
  { relationship: 'memory_categories.memory', from: 'memory_categories mc LEFT JOIN memories m ON m.id = mc.memory_id', where: 'm.id IS NULL OR m.owner_id != mc.owner_id', sample: 'substr(mc.memory_id, 1, 8) || \':\' || substr(mc.category_id, 1, 8)' },
  { relationship: 'memory_categories.category', from: 'memory_categories mc LEFT JOIN categories c ON c.id = mc.category_id', where: 'c.id IS NULL OR c.owner_id != mc.owner_id', sample: 'substr(mc.memory_id, 1, 8) || \':\' || substr(mc.category_id, 1, 8)' },
  { relationship: 'catalog_turns.run', from: 'catalog_turns t LEFT JOIN catalog_runs r ON r.id = t.run_id', where: 'r.id IS NULL OR r.owner_id != t.owner_id', sample: 'CAST(t.id AS TEXT) || \':\' || substr(t.run_id, 1, 8)' },
  { relationship: 'catalog_actions.run', from: 'catalog_actions a LEFT JOIN catalog_runs r ON r.id = a.run_id', where: 'r.id IS NULL OR r.owner_id != a.owner_id', sample: 'CAST(a.id AS TEXT) || \':\' || substr(a.run_id, 1, 8)' },
  { relationship: 'catalog_proposals.first_run', from: 'catalog_proposals p LEFT JOIN catalog_runs r ON r.id = p.first_run_id', where: 'r.id IS NULL OR r.owner_id != p.owner_id', sample: 'substr(p.id, 1, 8) || \':\' || substr(p.first_run_id, 1, 8)' },
  { relationship: 'catalog_proposals.last_run', from: 'catalog_proposals p LEFT JOIN catalog_runs r ON r.id = p.last_run_id', where: 'r.id IS NULL OR r.owner_id != p.owner_id', sample: 'substr(p.id, 1, 8) || \':\' || substr(p.last_run_id, 1, 8)' },
  { relationship: 'catalog_proposals.memory', from: 'catalog_proposals p LEFT JOIN memories m ON m.id = p.memory_id', where: 'p.memory_id IS NOT NULL AND (m.id IS NULL OR m.owner_id != p.owner_id)', sample: 'substr(p.id, 1, 8) || \':\' || substr(p.memory_id, 1, 8)' },
  { relationship: 'catalog_proposals.category', from: 'catalog_proposals p LEFT JOIN categories c ON c.id = p.category_id', where: 'p.category_id IS NOT NULL AND (c.id IS NULL OR c.owner_id != p.owner_id)', sample: 'substr(p.id, 1, 8) || \':\' || substr(p.category_id, 1, 8)' },
  { relationship: 'catalog_proposals.target_category', from: 'catalog_proposals p LEFT JOIN categories c ON c.id = p.target_category_id', where: 'p.target_category_id IS NOT NULL AND (c.id IS NULL OR c.owner_id != p.owner_id)', sample: 'substr(p.id, 1, 8) || \':\' || substr(p.target_category_id, 1, 8)' },
  { relationship: 'catalog_proposal_evidence.run', from: 'catalog_proposal_evidence e LEFT JOIN catalog_proposals p ON p.id = e.proposal_id LEFT JOIN catalog_runs r ON r.id = e.run_id', where: 'p.id IS NULL OR r.id IS NULL OR p.owner_id != r.owner_id', sample: 'substr(e.proposal_id, 1, 8) || \':\' || substr(e.run_id, 1, 8)' },
  { relationship: 'catalog_skips.memory', from: 'catalog_skips s LEFT JOIN memories m ON m.id = s.memory_id', where: 'm.id IS NULL OR m.owner_id != s.owner_id', sample: 'substr(s.memory_id, 1, 8)' },
  { relationship: 'catalog_memory_reviews.memory', from: 'catalog_memory_reviews v LEFT JOIN memories m ON m.id = v.memory_id', where: 'm.id IS NULL OR m.owner_id != v.owner_id', sample: 'substr(v.memory_id, 1, 8)' },
  { relationship: 'usage_events.token', from: 'usage_events u LEFT JOIN api_tokens t ON t.id = u.token_id', where: 'u.token_id IS NOT NULL AND (t.id IS NULL OR t.owner_id != u.owner_id)', sample: 'substr(u.id, 1, 8) || \':\' || substr(u.token_id, 1, 8)' },
]

export const TENANT_INTEGRITY_QUERIES = checks.map(check =>
  `SELECT '${check.relationship}' AS relationship, count(*) AS count, min(${check.sample}) AS sample_id FROM ${check.from} WHERE ${check.where} HAVING count(*) > 0`,
)

export async function checkTenantIntegrity(db: D1Database): Promise<TenantIntegrityFinding[]> {
  const findings: TenantIntegrityFinding[] = []
  for (const query of TENANT_INTEGRITY_QUERIES) {
    const result = await db.prepare(query).all<TenantIntegrityFinding>()
    findings.push(...result.results.map(row => ({ ...row, count: Number(row.count) })))
  }
  return findings.sort((a, b) => a.relationship.localeCompare(b.relationship))
}
