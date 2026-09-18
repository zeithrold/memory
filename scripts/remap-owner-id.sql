-- One-time owner_id remap from a Clerk user id to a Cloudflare Access `sub`.
-- Do NOT place this file under migrations/: wrangler and tests would apply it
-- unconditionally. Run against production with:
--
--   wrangler d1 execute DB --remote --file=scripts/remap-owner-id.sql
--
-- Replace the two literals below before executing. Do not commit real IDs.
-- Fresh Access installs do not need this script.

CREATE TABLE IF NOT EXISTS _owner_id_remap (
  old_owner_id TEXT NOT NULL,
  new_owner_id TEXT NOT NULL
);

DELETE FROM _owner_id_remap;
INSERT INTO _owner_id_remap(old_owner_id, new_owner_id) VALUES (
  'user_REPLACE_OLD_OWNER_ID',
  '00000000-0000-0000-0000-000000000000'
);

-- Tenant integrity + memories_update block owner_id remaps / revision PK collisions.
DROP TRIGGER IF EXISTS categories_owner_immutable;
DROP TRIGGER IF EXISTS categories_parent_owner_insert;
DROP TRIGGER IF EXISTS categories_parent_owner_update;
DROP TRIGGER IF EXISTS memories_owner_immutable;
DROP TRIGGER IF EXISTS api_tokens_owner_immutable;
DROP TRIGGER IF EXISTS memory_categories_owner_insert;
DROP TRIGGER IF EXISTS memory_categories_owner_update;
DROP TRIGGER IF EXISTS catalog_runs_owner_immutable;
DROP TRIGGER IF EXISTS catalog_turns_owner_insert;
DROP TRIGGER IF EXISTS catalog_turns_owner_update;
DROP TRIGGER IF EXISTS catalog_actions_owner_insert;
DROP TRIGGER IF EXISTS catalog_actions_owner_update;
DROP TRIGGER IF EXISTS catalog_proposals_owner_immutable;
DROP TRIGGER IF EXISTS catalog_proposals_refs_insert;
DROP TRIGGER IF EXISTS catalog_proposals_refs_update;
DROP TRIGGER IF EXISTS catalog_proposal_evidence_owner_insert;
DROP TRIGGER IF EXISTS catalog_proposal_evidence_owner_update;
DROP TRIGGER IF EXISTS catalog_skips_owner_insert;
DROP TRIGGER IF EXISTS catalog_skips_owner_update;
DROP TRIGGER IF EXISTS catalog_memory_reviews_owner_insert;
DROP TRIGGER IF EXISTS catalog_memory_reviews_owner_update;
DROP TRIGGER IF EXISTS usage_events_owner_insert;
DROP TRIGGER IF EXISTS usage_events_owner_update;
DROP TRIGGER IF EXISTS memories_update;

UPDATE memories SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE api_tokens SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE usage_events SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE categories SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE memory_categories SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_runs SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_turns SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_actions SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_proposals SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_skips SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_state SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE agent_settings SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_metrics_daily SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);
UPDATE catalog_memory_reviews SET owner_id = (SELECT new_owner_id FROM _owner_id_remap)
WHERE owner_id = (SELECT old_owner_id FROM _owner_id_remap);

CREATE TRIGGER memories_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, search_text) VALUES('delete', old.rowid, old.search_text);
  INSERT INTO memories_fts(rowid, search_text) VALUES(new.rowid, new.search_text);
  INSERT INTO revisions SELECT new.id, new.version, new.title, new.content, new.kind, new.tags, new.source, new.updated_at WHERE new.deleted = 0;
  DELETE FROM revisions WHERE memory_id = new.id AND new.deleted = 1;
  INSERT INTO index_jobs(memory_id, version) VALUES(new.id, new.version);
END;

CREATE TRIGGER categories_owner_immutable
BEFORE UPDATE OF owner_id ON categories
WHEN NEW.owner_id != OLD.owner_id
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:categories.owner_id'); END;

CREATE TRIGGER categories_parent_owner_insert
BEFORE INSERT ON categories
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM categories p WHERE p.id = NEW.parent_id AND p.owner_id = NEW.owner_id
)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:categories.parent'); END;

CREATE TRIGGER categories_parent_owner_update
BEFORE UPDATE OF owner_id, parent_id ON categories
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM categories p WHERE p.id = NEW.parent_id AND p.owner_id = NEW.owner_id
)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:categories.parent'); END;

CREATE TRIGGER memories_owner_immutable
BEFORE UPDATE OF owner_id ON memories
WHEN NEW.owner_id != OLD.owner_id
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:memories.owner_id'); END;

CREATE TRIGGER api_tokens_owner_immutable
BEFORE UPDATE OF owner_id ON api_tokens
WHEN NEW.owner_id != OLD.owner_id
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:api_tokens.owner_id'); END;

CREATE TRIGGER memory_categories_owner_insert
BEFORE INSERT ON memory_categories
WHEN NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:memory_categories'); END;

CREATE TRIGGER memory_categories_owner_update
BEFORE UPDATE OF owner_id, memory_id, category_id ON memory_categories
WHEN NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:memory_categories'); END;

CREATE TRIGGER catalog_runs_owner_immutable
BEFORE UPDATE OF owner_id ON catalog_runs
WHEN NEW.owner_id != OLD.owner_id
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_runs.owner_id'); END;

CREATE TRIGGER catalog_turns_owner_insert
BEFORE INSERT ON catalog_turns
WHEN NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_turns.run'); END;

CREATE TRIGGER catalog_turns_owner_update
BEFORE UPDATE OF owner_id, run_id ON catalog_turns
WHEN NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_turns.run'); END;

CREATE TRIGGER catalog_actions_owner_insert
BEFORE INSERT ON catalog_actions
WHEN NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_actions'); END;

CREATE TRIGGER catalog_actions_owner_update
BEFORE UPDATE OF owner_id, run_id ON catalog_actions
WHEN NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_actions'); END;

CREATE TRIGGER catalog_proposals_owner_immutable
BEFORE UPDATE OF owner_id ON catalog_proposals
WHEN NEW.owner_id != OLD.owner_id
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_proposals.owner_id'); END;

CREATE TRIGGER catalog_proposals_refs_insert
BEFORE INSERT ON catalog_proposals
WHEN NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.first_run_id AND r.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.last_run_id AND r.owner_id = NEW.owner_id)
  OR (NEW.memory_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id))
  OR (NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.owner_id = NEW.owner_id))
  OR (NEW.target_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.target_category_id AND c.owner_id = NEW.owner_id))
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_proposals'); END;

CREATE TRIGGER catalog_proposals_refs_update
BEFORE UPDATE OF owner_id, first_run_id, last_run_id, memory_id, category_id, target_category_id ON catalog_proposals
WHEN NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.first_run_id AND r.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM catalog_runs r WHERE r.id = NEW.last_run_id AND r.owner_id = NEW.owner_id)
  OR (NEW.memory_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id))
  OR (NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.owner_id = NEW.owner_id))
  OR (NEW.target_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.target_category_id AND c.owner_id = NEW.owner_id))
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_proposals'); END;

CREATE TRIGGER catalog_proposal_evidence_owner_insert
BEFORE INSERT ON catalog_proposal_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM catalog_proposals p JOIN catalog_runs r ON r.id = NEW.run_id
  WHERE p.id = NEW.proposal_id AND p.owner_id = r.owner_id
)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_proposal_evidence'); END;

CREATE TRIGGER catalog_proposal_evidence_owner_update
BEFORE UPDATE OF proposal_id, run_id ON catalog_proposal_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM catalog_proposals p JOIN catalog_runs r ON r.id = NEW.run_id
  WHERE p.id = NEW.proposal_id AND p.owner_id = r.owner_id
)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_proposal_evidence'); END;

CREATE TRIGGER catalog_skips_owner_insert
BEFORE INSERT ON catalog_skips
WHEN NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_skips'); END;

CREATE TRIGGER catalog_skips_owner_update
BEFORE UPDATE OF owner_id, memory_id ON catalog_skips
WHEN NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_skips'); END;

CREATE TRIGGER catalog_memory_reviews_owner_insert
BEFORE INSERT ON catalog_memory_reviews
WHEN NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_memory_reviews'); END;

CREATE TRIGGER catalog_memory_reviews_owner_update
BEFORE UPDATE OF owner_id, memory_id ON catalog_memory_reviews
WHEN NOT EXISTS (SELECT 1 FROM memories m WHERE m.id = NEW.memory_id AND m.owner_id = NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:catalog_memory_reviews'); END;

CREATE TRIGGER usage_events_owner_insert
BEFORE INSERT ON usage_events
WHEN NEW.token_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM api_tokens t WHERE t.id = NEW.token_id AND t.owner_id = NEW.owner_id
)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:usage_events.token'); END;

CREATE TRIGGER usage_events_owner_update
BEFORE UPDATE OF owner_id, token_id ON usage_events
WHEN NEW.token_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM api_tokens t WHERE t.id = NEW.token_id AND t.owner_id = NEW.owner_id
)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity:usage_events.token'); END;

INSERT INTO index_jobs(memory_id, version, attempts, available_at)
SELECT id, version, 0, 0 FROM memories WHERE deleted = 0
ON CONFLICT(memory_id, version) DO UPDATE SET
  attempts = 0,
  available_at = 0,
  last_error = NULL;

DROP TABLE _owner_id_remap;
