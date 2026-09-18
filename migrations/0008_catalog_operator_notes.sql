-- Per-run operator notes and deferred rejection advice for the next run.
-- operator_prompt lives on the run row so Workflow step state never carries
-- the user's text; pending_advice is consumed into the next claim.

ALTER TABLE catalog_runs ADD COLUMN operator_prompt TEXT;

ALTER TABLE catalog_state ADD COLUMN pending_advice TEXT;
