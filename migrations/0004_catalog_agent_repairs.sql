-- Repair proposal evidence and skip semantics from the first Catalog MVP.
--
-- `source` is nullable during the rolling migration: an older Worker may still
-- insert a row between this migration and the following deploy. The new code
-- treats a NULL row carrying the legacy system reason as implicit, and every
-- other NULL row as explicit.
ALTER TABLE catalog_skips ADD COLUMN source TEXT CHECK (source IN ('explicit', 'implicit'));

UPDATE catalog_skips
SET source = CASE
  WHEN reason = 'Left unclassified by the agent.' THEN 'implicit'
  ELSE 'explicit'
END;

-- Every legacy implicit row came from the broken finalizer: dry runs wrote
-- them, and the selection predicate then prevented them from being retried.
DELETE FROM catalog_skips WHERE source = 'implicit';

-- Evidence is a set of supporting runs, not a count of tool calls. Keeping it
-- in its own table makes a Workflow replay and repeated calls in one run
-- idempotent by construction.
CREATE TABLE catalog_proposal_evidence (
  proposal_id TEXT NOT NULL REFERENCES catalog_proposals(id),
  run_id TEXT NOT NULL REFERENCES catalog_runs(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (proposal_id, run_id)
);
CREATE INDEX catalog_proposal_evidence_run ON catalog_proposal_evidence(run_id, proposal_id);

-- Rebuild evidence from the immutable action journal where possible. The
-- earliest proposal row is retained; distinct suggestions that were formerly
-- collapsed will be regenerated after the implicit skips are cleared.
INSERT OR IGNORE INTO catalog_proposal_evidence(proposal_id, run_id, created_at)
SELECT p.id, a.run_id, min(a.created_at)
FROM catalog_proposals p
JOIN catalog_actions a
  ON json_extract(a.result_json, '$.proposalId') = p.id
GROUP BY p.id, a.run_id;

INSERT OR IGNORE INTO catalog_proposal_evidence(proposal_id, run_id, created_at)
SELECT id, first_run_id, created_at FROM catalog_proposals;

UPDATE catalog_proposals
SET evidence_runs = (
  SELECT count(*) FROM catalog_proposal_evidence e
  WHERE e.proposal_id = catalog_proposals.id
);

UPDATE catalog_proposals
SET rationale = COALESCE(
  (
    SELECT a.rationale
    FROM catalog_actions a
    WHERE json_extract(a.result_json, '$.proposalId') = catalog_proposals.id
      AND a.rationale IS NOT NULL
    ORDER BY a.created_at, a.id
    LIMIT 1
  ),
  rationale
);

-- The dispatcher runs on a 30-minute grid. Round legacy settings upward so an
-- account is never run more frequently than it requested.
UPDATE agent_settings
SET interval_minutes = min(
  1440,
  max(30, CAST((interval_minutes + 29) / 30 AS INTEGER) * 30)
)
WHERE interval_minutes < 30 OR interval_minutes % 30 != 0;

-- Proposal approval happened after the last batch snapshot in the affected
-- deployment, leaving the materialized counters stale.
UPDATE catalog_state
SET category_count = (
      SELECT count(*) FROM categories c
      WHERE c.owner_id = catalog_state.owner_id AND c.state != 'retired'
    ),
    assigned_count = (
      SELECT count(*) FROM memory_categories mc
      WHERE mc.owner_id = catalog_state.owner_id
    ),
    orphan_count = (
      SELECT count(*) FROM memories m
      WHERE m.owner_id = catalog_state.owner_id AND m.deleted = 0
        AND NOT EXISTS (
          SELECT 1 FROM memory_categories mc WHERE mc.memory_id = m.id
        )
    ),
    skipped_count = (
      SELECT count(*) FROM catalog_skips s
      WHERE s.owner_id = catalog_state.owner_id
    );
