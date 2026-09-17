-- Fail closed when a write would connect data owned by different accounts.
-- Existing rows are deliberately untouched: run the read-only integrity check
-- before this migration and resolve every reported relationship manually.

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
