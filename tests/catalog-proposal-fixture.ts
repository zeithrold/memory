import { fixture, openRun } from './catalog-runs-fixture'

async function seedProposal(
  kind: string,
  payload: Record<string, unknown>,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const id = crypto.randomUUID()
  const runId = await openRun()
  await fixture.env.DB.prepare(
    `INSERT INTO catalog_proposals(id, owner_id, first_run_id, last_run_id, kind, category_id,
target_category_id, memory_id, target_project, payload_json, rationale, evidence_runs,
status, created_at)
       VALUES (?, 'alice', ?, ?, ?, ?, ?, ?, ?, ?, 'Because.', 2, 'pending', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(
      id,
      runId,
      runId,
      kind,
      fields.categoryId ?? null,
      fields.targetCategoryId ?? null,
      fields.memoryId ?? null,
      fields.targetProject ?? null,
      JSON.stringify(payload),
    )
    .run()
  return id
}
export { seedProposal }
