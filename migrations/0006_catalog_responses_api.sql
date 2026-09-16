-- Replace the BYO Chat Completions contract with the OpenAI Responses API.
-- SQLite cannot alter a CHECK constraint in place, so rebuild only the
-- settings table. Historical catalog_runs.provider values intentionally keep
-- describing the protocol that produced those runs.

CREATE TABLE agent_settings_responses_api (
  owner_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'none'
    CHECK (provider IN ('none', 'responses-api', 'workers-ai')),
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
  updated_at TEXT NOT NULL,
  daily_token_budget INTEGER NOT NULL DEFAULT 100000
    CHECK (daily_token_budget BETWEEN 10000 AND 5000000)
);

INSERT INTO agent_settings_responses_api (
  owner_id, enabled, provider, base_url, model,
  api_key_ciphertext, api_key_iv, api_key_hint,
  include_content, interval_minutes, max_batch, max_turns, max_tool_calls,
  auto_apply_structural, dry_run_until_reviewed,
  last_probe_at, last_probe_ok, last_probe_error, updated_at,
  daily_token_budget
)
SELECT
  owner_id,
  enabled,
  CASE provider
    WHEN 'openai-compatible' THEN 'responses-api'
    ELSE provider
  END,
  base_url,
  model,
  api_key_ciphertext,
  api_key_iv,
  api_key_hint,
  include_content,
  interval_minutes,
  max_batch,
  max_turns,
  max_tool_calls,
  auto_apply_structural,
  dry_run_until_reviewed,
  CASE WHEN provider = 'openai-compatible' THEN NULL ELSE last_probe_at END,
  CASE WHEN provider = 'openai-compatible' THEN NULL ELSE last_probe_ok END,
  CASE WHEN provider = 'openai-compatible' THEN NULL ELSE last_probe_error END,
  updated_at,
  daily_token_budget
FROM agent_settings;

DROP TABLE agent_settings;
ALTER TABLE agent_settings_responses_api RENAME TO agent_settings;
