-- Keep automatic Catalog maintenance bounded when there is no useful work,
-- and make the model usage already present in the turn journal visible at the
-- run and daily levels.

ALTER TABLE agent_settings
  ADD COLUMN daily_token_budget INTEGER NOT NULL DEFAULT 100000
  CHECK (daily_token_budget BETWEEN 10000 AND 5000000);

ALTER TABLE catalog_state
  ADD COLUMN awaiting_review INTEGER NOT NULL DEFAULT 0
  CHECK (awaiting_review IN (0, 1));
ALTER TABLE catalog_state
  ADD COLUMN failure_streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE catalog_skips ADD COLUMN retry_after TEXT;

ALTER TABLE catalog_runs
  ADD COLUMN usage_missing_turns INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_metrics_daily
  ADD COLUMN usage_missing_turns INTEGER NOT NULL DEFAULT 0;

CREATE TABLE catalog_memory_reviews (
  owner_id TEXT NOT NULL,
  memory_id TEXT NOT NULL REFERENCES memories(id),
  memory_version INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, memory_id)
);
CREATE INDEX catalog_memory_reviews_due
  ON catalog_memory_reviews(owner_id, reviewed_at);

-- Move accounts that still carry the original defaults onto the cost-aware
-- defaults. Explicitly customised accounts keep their choices, except that an
-- impossible batch/tool budget is normalised downward.
UPDATE agent_settings
SET max_batch = 6, max_turns = 2
WHERE max_batch = 10 AND max_turns = 3 AND max_tool_calls = 8;

UPDATE agent_settings SET max_tool_calls = max(3, max_tool_calls);
UPDATE agent_settings
SET max_batch = min(max_batch, max(1, max_tool_calls - 2));

-- A scheduled preview has already shown these accounts what the agent would
-- do. Do not immediately repeat it after deployment; a manual preview remains
-- available and explicitly disabling the review gate resumes live scheduling.
INSERT INTO catalog_state(owner_id, version)
SELECT owner_id, 1 FROM agent_settings WHERE true
ON CONFLICT(owner_id) DO NOTHING;

UPDATE catalog_state
SET awaiting_review = 1
WHERE owner_id IN (
  SELECT s.owner_id
  FROM agent_settings s
  WHERE s.dry_run_until_reviewed = 1
    AND EXISTS (
      SELECT 1 FROM catalog_runs r
      WHERE r.owner_id = s.owner_id
        AND r.trigger = 'schedule'
        AND r.mode = 'dry_run'
    )
);

-- The turn journal is the source of truth even when a run failed before its
-- batch finalizer. Restore the model usage that the original rollup omitted.
UPDATE catalog_runs
SET turns = (
      SELECT count(*) FROM catalog_turns t WHERE t.run_id = catalog_runs.id
    ),
    tool_calls = COALESCE((
      SELECT sum(json_array_length(t.tool_calls_json))
      FROM catalog_turns t WHERE t.run_id = catalog_runs.id
    ), 0),
    rejected = (
      SELECT count(*) FROM catalog_actions a
      WHERE a.run_id = catalog_runs.id AND a.decision = 'rejected_by_policy'
    ),
    actions_applied = (
      SELECT count(*) FROM catalog_actions a
      WHERE a.run_id = catalog_runs.id AND a.decision IN ('applied', 'skipped')
    ),
    prompt_tokens = CASE
      WHEN EXISTS (SELECT 1 FROM catalog_turns t WHERE t.run_id = catalog_runs.id)
      THEN COALESCE((
        SELECT sum(t.prompt_tokens) FROM catalog_turns t
        WHERE t.run_id = catalog_runs.id
      ), 0)
      ELSE prompt_tokens
    END,
    completion_tokens = CASE
      WHEN EXISTS (SELECT 1 FROM catalog_turns t WHERE t.run_id = catalog_runs.id)
      THEN COALESCE((
        SELECT sum(t.completion_tokens) FROM catalog_turns t
        WHERE t.run_id = catalog_runs.id
      ), 0)
      ELSE completion_tokens
    END,
    usage_missing_turns = (
      SELECT count(*) FROM catalog_turns t
      WHERE t.run_id = catalog_runs.id
        AND (t.prompt_tokens IS NULL OR t.completion_tokens IS NULL)
    );

UPDATE catalog_metrics_daily
SET prompt_tokens = COALESCE((
      SELECT sum(r.prompt_tokens) FROM catalog_runs r
      WHERE r.owner_id = catalog_metrics_daily.owner_id
        AND substr(r.started_at, 1, 10) = catalog_metrics_daily.day
    ), prompt_tokens),
    completion_tokens = COALESCE((
      SELECT sum(r.completion_tokens) FROM catalog_runs r
      WHERE r.owner_id = catalog_metrics_daily.owner_id
        AND substr(r.started_at, 1, 10) = catalog_metrics_daily.day
    ), completion_tokens),
    usage_missing_turns = COALESCE((
      SELECT sum(r.usage_missing_turns) FROM catalog_runs r
      WHERE r.owner_id = catalog_metrics_daily.owner_id
        AND substr(r.started_at, 1, 10) = catalog_metrics_daily.day
    ), 0);
