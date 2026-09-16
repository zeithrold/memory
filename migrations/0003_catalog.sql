-- Two-level memory catalog plus the audit trail of the agent that maintains it.
--
-- `categories` holds both levels: `parent_id IS NULL` is a depth-1 entry of the
-- master catalog, anything else is a depth-2 entry of that parent's catalog.
--
-- SQLite treats NULLs as distinct inside a UNIQUE constraint, so a table-level
-- UNIQUE(owner_id, parent_id, slug) would let two depth-1 categories share a
-- slug. Two partial indexes express the real invariant instead.

CREATE TABLE catalog_state (
  owner_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  -- No watermark column: a global cursor cannot represent "edited after it was
  -- classified" when a batch stops early, and would silently skip those edits.
  -- Batch selection compares each memory against its own classification time,
  -- which also makes a partial batch heal on the next run.
  last_run_at TEXT,
  next_run_at TEXT,
  category_count INTEGER NOT NULL DEFAULT 0,
  assigned_count INTEGER NOT NULL DEFAULT 0,
  orphan_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  -- Prose, not the label, is the semantic anchor: the maintenance agent reads
  -- it to decide membership, so an unclear name alone cannot misroute an entry.
  description TEXT NOT NULL,
  -- Explicit "NOT here: …" clause; sibling boundaries are the main source of
  -- misclassification in LLM-built taxonomies.
  boundary TEXT NOT NULL,
  axis_hint TEXT,
  depth INTEGER NOT NULL CHECK (depth IN (1, 2)),
  member_count INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'pending_merge', 'retired')),
  created_by TEXT NOT NULL CHECK (created_by IN ('agent', 'user')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((parent_id IS NULL) = (depth = 1))
);
CREATE UNIQUE INDEX categories_root_slug ON categories(owner_id, slug) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX categories_child_slug ON categories(owner_id, parent_id, slug) WHERE parent_id IS NOT NULL;
CREATE INDEX categories_owner ON categories(owner_id, depth, state);
CREATE INDEX categories_parent ON categories(owner_id, parent_id);

CREATE TABLE memory_categories (
  owner_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  confidence REAL NOT NULL,
  assigned_by TEXT NOT NULL CHECK (assigned_by IN ('agent', 'user')),
  catalog_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (memory_id, category_id)
);
CREATE INDEX memory_categories_lookup ON memory_categories(owner_id, category_id);
-- At most one primary category per memory, so routing has a single fallback.
CREATE UNIQUE INDEX memory_categories_primary ON memory_categories(memory_id) WHERE is_primary = 1;

CREATE TABLE catalog_runs (
  -- Also the Workflow instance id, so the audit record and the durable run
  -- share one identifier.
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'dry_run')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'reverted')),
  provider TEXT,
  model TEXT,
  batches INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  memories_seen INTEGER NOT NULL DEFAULT 0,
  actions_applied INTEGER NOT NULL DEFAULT 0,
  unorganized INTEGER NOT NULL DEFAULT 0,
  budget_exhausted INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  error_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX catalog_runs_owner ON catalog_runs(owner_id, started_at DESC);

-- One row per LLM call. This doubles as the durable transcript: the next turn
-- rebuilds its messages from these rows rather than from Workflow step state,
-- which keeps step results tiny and keeps memory text out of instance storage
-- (retained 3 days on Free, 30 on Paid).
CREATE TABLE catalog_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES catalog_runs(id),
  owner_id TEXT NOT NULL,
  batch INTEGER NOT NULL,
  turn INTEGER NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  tool_results_json TEXT,
  -- The counters this turn produced. Recorded so a retried step reports the
  -- same numbers instead of re-deriving them from the effects.
  action_summary_json TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  finish_reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, batch, turn)
);
CREATE INDEX catalog_turns_run ON catalog_turns(run_id, batch, turn);

-- Audit log and idempotency journal in one table: a retried step finds its own
-- row by (run_id, batch, turn, call_index) and returns the recorded result
-- instead of applying the effect twice. Only calls that had an effect or were
-- rejected are recorded; read-only tools are not, because writes cost 1000x
-- reads on D1.
CREATE TABLE catalog_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES catalog_runs(id),
  owner_id TEXT NOT NULL,
  batch INTEGER NOT NULL,
  turn INTEGER NOT NULL,
  call_index INTEGER NOT NULL,
  tool TEXT NOT NULL,
  kind TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('read', 'immediate', 'proposal', 'control')),
  memory_id TEXT,
  category_id TEXT,
  target_category_id TEXT,
  target_project TEXT,
  arguments_json TEXT NOT NULL,
  result_json TEXT,
  -- Prior and resulting state, so a run can be undone. Without `before_json` a
  -- reversal could only delete a membership, not restore what it displaced.
  before_json TEXT,
  after_json TEXT,
  rationale TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('applied', 'proposed', 'rejected_by_policy', 'rejected_by_user', 'cached', 'skipped')),
  policy_reason TEXT,
  revert_of INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, batch, turn, call_index)
);
CREATE INDEX catalog_actions_run ON catalog_actions(run_id, batch, turn, call_index);
CREATE INDEX catalog_actions_owner_time ON catalog_actions(owner_id, created_at DESC);

-- Structural edits are backlogged, not applied: pending rows accumulate the
-- evidence a later consolidation step arbitrates.
CREATE TABLE catalog_proposals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  first_run_id TEXT NOT NULL,
  last_run_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('create_category', 'merge_category', 'retire_category', 'project_move')),
  category_id TEXT,
  target_category_id TEXT,
  memory_id TEXT,
  target_project TEXT,
  payload_json TEXT NOT NULL,
  rationale TEXT,
  evidence_runs INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX catalog_proposals_pending ON catalog_proposals(owner_id, status, kind);

-- An explicit skip keeps an intentionally unclassified memory from being
-- retried every run. The row expires when the memory itself changes, and
-- `attempts` caps how often an implicit skip is retried, so one unclassifiable
-- memory cannot occupy the head of every batch forever.
CREATE TABLE catalog_skips (
  owner_id TEXT NOT NULL,
  memory_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  memory_version INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX catalog_skips_owner ON catalog_skips(owner_id);

-- Long-term rollup. Raw turns and actions are pruned after 90 days, so the
-- trends the project measures live here.
CREATE TABLE catalog_metrics_daily (
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  dry_runs INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  applied INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  unorganized INTEGER NOT NULL DEFAULT 0,
  reassignments INTEGER NOT NULL DEFAULT 0,
  category_count INTEGER NOT NULL DEFAULT 0,
  orphan_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day)
);

-- Per-user model endpoint. The API key is stored as AES-GCM ciphertext; the
-- plaintext is never selected, returned, or copied into Workflow step state.
CREATE TABLE agent_settings (
  owner_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'openai-compatible', 'workers-ai')),
  base_url TEXT,
  model TEXT,
  api_key_ciphertext TEXT,
  api_key_iv TEXT,
  api_key_hint TEXT,
  include_content INTEGER NOT NULL DEFAULT 0 CHECK (include_content IN (0, 1)),
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  max_batch INTEGER NOT NULL DEFAULT 10,
  max_turns INTEGER NOT NULL DEFAULT 3,
  max_tool_calls INTEGER NOT NULL DEFAULT 8,
  auto_apply_structural INTEGER NOT NULL DEFAULT 0 CHECK (auto_apply_structural IN (0, 1)),
  dry_run_until_reviewed INTEGER NOT NULL DEFAULT 1 CHECK (dry_run_until_reviewed IN (0, 1)),
  last_probe_at TEXT,
  last_probe_ok INTEGER,
  last_probe_error TEXT,
  updated_at TEXT NOT NULL
);
