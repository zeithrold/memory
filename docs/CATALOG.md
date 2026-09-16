# Catalog

A two-level catalog of a memory library, maintained by a tool-driven agent that
runs on a schedule and can be triggered by hand. Every action it takes is
recorded, visible in the UI, and reversible.

This document is the design record: what the feature does, which decisions have
evidence behind them, and what is knowingly unfinished.

## What it adds

- **A master catalog** (depth-1 categories) and **one catalog per category**
  (depth-2 children plus the memories assigned to it).
- **An agent loop** that reads a small batch of memories and works through the
  same tools a human would use, rather than emitting one constrained answer.
- **An audit trail** that doubles as the loop's memory: the conversation is
  rebuilt from the audit tables, so the recorded history is provably the history
  the model saw.
- **Reversible runs**: any run can be undone from its own before/after state.

## Where it runs

| Piece | Choice |
| --- | --- |
| Runtime | Cloudflare Workflows, one class |
| Model | Bring your own OpenAI-compatible endpoint. The platform never pays for inference. |
| Storage | D1 (catalog, audit, settings) |
| Trigger | the existing minute Cron Trigger dispatches one instance per 30-minute window, plus `POST /api/v1/catalog/runs` |

A `schedules` entry on the Workflow binding would be the obvious way to run this
on a timer, and it is what this feature first used. **It does not work on the
Free plan**: the deployment rejects the trigger configuration with *"Workflow
has `schedules` configured, but scheduled Workflows require a paid Workers
plan"*, after the upload, as a partial trigger update. Workflows themselves are
available on Free — only the automatic schedule is not.

So the dispatch lives in the Cron Trigger this Worker already had. It fires every
minute and starts an instance only when the clock lands on a 30-minute boundary,
using the window as the instance id so a retried cron event collapses onto the
instance it already created. `scripts/deploy-check.ts` fails the build if a
`schedules` entry reappears, because the alternative is rediscovering this at
deploy time.

Per-account intervals are 30-minute multiples. A scheduled run computes its
next due time from the dispatch window rather than from model completion, so
provider latency cannot turn a 30-minute cadence into almost an hour. A manual
run does not postpone an already scheduled run.

The cost is that the minute cron now also carries the dispatch, so the two share
one Sentry Crons monitor. Creating 48 instances a day is negligible against the
Free plan's 100,000 daily requests, and it keeps the minute-level index
maintenance and the catalog on one trigger rather than two.

### Why not the Agents SDK

Durable Objects would add a second stateful system for streamed progress and
per-user scheduling. Polling the run row every few seconds reaches the same
result for a job whose output is a list of applied changes, and the audit log is
the thing users actually read. The LLM, catalog, policy and audit layers are
runtime-agnostic, so this is reversible.

## The Free-plan budget shapes everything

Workers Free allows **3,000 Workflow steps per day**, **1,024 steps per
instance**, and **10 ms of CPU per step** (paid is 30 s). Long model waits do
not consume CPU, so the binding constraints are step count and per-step work.

One owner costs at most `1 + batches x (1 + 2 per turn + 1) + 2` steps. With two
owners, two batches and three turns that is 38 steps per firing; 48 firings a
day is 1,824 steps, leaving a third of the allowance for manual runs. Those caps
are constants in `lib/server/catalog/run.ts`, with the arithmetic written next to
them: raising one without redoing the sum spends a day's budget before the day
is over.

Two consequences worth knowing:

- **Accounts take turns.** The queue is ordered by `next_run_at`, so a library
  is not re-organized every 30 minutes; it is re-organized every few cycles,
  depending on how many accounts are due.
- **A step must stay tiny.** One D1 query and one fetch per step. That is why
  the batch step returns memory *identifiers* only and the prompt is assembled
  inside the model step.

Under a 10 ms ceiling, splitting each turn into two steps is a safety feature
rather than overhead: every step gets a fresh CPU budget, and each half is
checkpointed independently.

## The tool loop

The agent is given a tool set and decides what to do. Two properties make that
tractable:

1. **Constraints live in a gateway, not in a prompt.** `policy.ts` decides what
   may happen to each call, and its refusal is returned to the model as the tool
   result, so the model can adapt. This is the whole advantage over validating a
   single response after the fact.
2. **Rejections and effects are recorded in the same journal.** A retried step
   finds its own row by `(run_id, batch, turn, call_index)` and returns the
   recorded result instead of applying the effect twice.

| Tool | Effect |
| --- | --- |
| `catalog_overview`, `catalog_list`, `catalog_members`, `batch_list`, `memory_lookup` | read, not recorded |
| `memory_search` | read, withheld by default (it would embed, and both the CPU budget and the shared Workers AI allowance are tight) |
| `assign`, `unassign` | immediate, reversible |
| `skip` | immediate; an explicit skip suppresses re-proposal until the memory changes |
| `propose_category`, `propose_merge`, `propose_retire`, `propose_project_move` | backlogged only |
| `finish` | ends the batch |

There is no memory delete, no raw SQL and no arbitrary fetch. Effects are
confined to the catalog tables; the one exception, moving a memory's project,
stays a proposal until a human approves it.

### Structural edits are never applied inline

Removing an arbitration stage from an LLM-built taxonomy took the node count
from 25 to 70 while every coherence metric got worse (EvoTaxo,
[arXiv:2603.19711](https://arxiv.org/pdf/2603.19711v1)). So `assign` and
`unassign` apply immediately — they are per-memory and reversible — while
creation, merging and retirement accumulate evidence across runs and are applied
by the consolidation pass, and only with evidence from more than one run.
Evidence is unique by proposal and run: repeated calls or a Workflow replay in
one run do not advance the threshold. New-category identity is its parent plus
normalized slug, so sibling proposals are not collapsed merely because their
target identifiers are initially null.

Other rules come from the same place ([A2X, arXiv:2605.29270](https://export.arxiv.org/pdf/2605.29270)):
siblings must share one classification axis, every category carries an explicit
"NOT here" boundary because sibling ambiguity is the main source of misfiling, a
category with two or fewer members is proposed for a merge rather than deleted,
and a memory that genuinely spans two areas may hold a second, non-primary
membership.

Mem0's product history is the industrial version of the same conclusion: its
write path became ADD-only (UPDATE/DELETE were removed from what extraction
returns) and the rewriting moved into a separate asynchronous maintenance job
with run grouping, provenance and a dry run. That is this design.

### Hysteresis, so runs do not oscillate

A memory keeps its classification unless the memory itself changed or the
classification is older than seven days. Re-classifications are additionally
capped per batch at `min(10, 25% of the batch)`. Without both, two plausible
categories trade the same memories back and forth.

### The threat model of giving an agent write tools

It reads text the user wrote, and it holds tools. Defences, in order: no delete
tool exists; structural changes only ever backlog; a project move only ever
backlogs; tools are addressed by the identifiers of the current batch, so the
agent cannot wander the library; tool results are labelled as untrusted data,
not instructions; and every action is replayable and reversible, so an injected
instruction lands in the audit log instead of quietly changing the library.

## Privacy

- Memory **bodies are not sent unless the account opts in**. The default batch
  carries title, kind, tags, project and timestamps.
- **The decrypted credential never leaves the step that uses it.** Each model
  step reads and decrypts it itself, because Workflow step results are persisted
  as instance state and retained for days.
- **Memory text does not enter instance state either.** Steps exchange
  identifiers; the prompt is built inside the step that needs it.
- Prompts are never logged, and the Sentry configuration already strips genAI
  content attributes.

## Credentials

Cloudflare has no per-end-user secret store: `wrangler secret` is per Worker and
Secrets Store is account level, write-only, and capped at one store with 100
secrets. A deployment therefore has to hold each account's key itself.

Keys are sealed with AES-GCM under `AGENT_SETTINGS_KEY` (64 hex characters, set
with `wrangler secret put`). Without that secret the service **refuses to store
a key at all** rather than falling back to plaintext. The API returns only a
four-character hint, and the settings form is validated by a live probe before
saving, because "your endpoint cannot call tools" is the most likely failure of
a bring-your-own-endpoint design.

This is encryption at rest against a database leak, not end-to-end encryption:
the operator and Cloudflare can read the plaintext. Accounts should configure a
scoped, revocable key.

AI Gateway's BYOK is deliberately not used for this. It stores keys in the
account-level Secrets Store, and any AI Gateway token with the `Run` permission
can call every gateway in the account — including ones with stored provider
keys — so a BYOK alias is not a per-user boundary.

## Watching it work

The Catalog tab shows the taxonomy as a tree, the pending suggestions with the
number of runs behind each, and the run history. Opening a run replays it turn by
turn: the model's reasoning, each tool call with its arguments, the decision, and
the policy reason whenever a call was refused. A run can be undone from the same
view.

Two things it deliberately does not do: it will not start a run for an account
with no endpoint (the button explains why instead), and it is the only place a
project move can be approved. The tab polls every three seconds **only while a
run is in flight**, because a maintenance run's output is a list of applied
changes and a socket would be more machinery than the answer needs.

Before a provider is configured the panel renders its own explanation rather
than a loading skeleton: an endless shimmer on a page where nothing is loading
is a lie, and it also keeps the page from ever settling for a test driver.

## Retrieval: catalog routing is opt-in

`POST /api/v1/search` accepts `mode` (`flat`, the default, or `catalog`) and
`balance` (`equal`, `sqrt` — the default — or `neyman`). With `mode: 'catalog'`
the query also routes through the taxonomy:

1. Categories are scored against the query using their own label, description
   and boundary text — no second index and no embedding call, which matters
   under a 10 ms per-step CPU budget.
2. Up to three categories are selected. Each contributes a truncated candidate
   list sized by the allocation rule, with a **floor of one slot** per selected
   category and a ceiling so one category cannot take everything.
3. A category with no candidates in the flat pool is not empty, it is crowded
   out, so one bounded query asks for it directly.
4. Everything is fused through the existing RRF, **including the flat ranking,
   always**.

That last point is the safety net, not a nicety. Measured router precision is
poor enough that a routing miss has to cost ranking quality and never recall:
the best supervised vertical selection reached 0.583 precision, 26.3% of queries
had no relevant vertical at all (Arguello et al., SIGIR 2009), and RAPTOR
measured flattened retrieval beating level-by-level tree traversal. The response
reports what happened in `catalog`, so a caller can see that routing missed.

The benchmark gate lives in `tests/retrieval.test.ts`. On a fixture with one
large category that fills the page and one small relevant category, it reports
`recall@8: {flat: 0, catalog: 1}` — the anti-starvation property, demonstrated
rather than asserted. A real multilingual query set does not exist yet, so
**the default is unchanged and flat remains the honest baseline**.

## Retention

Raw turns and tool calls are pruned after 90 days by the existing minute cron,
alongside the usage events it already clears. Two guards: only rows belonging to
a **finished** run are deleted, because an action row is also the idempotency
journal of a step that may still retry; and a run left `running` for an hour is
swept to `failed`, so an abandoned run cannot block its account forever.

The daily rollup in `catalog_metrics_daily` is written when a run finishes and is
never pruned, which is what keeps the trends after the raw rows are gone.
`GET /api/v1/catalog/metrics` returns both.

An unclassified memory receives an implicit deferral, distinct from an explicit
`skip`. It is retried up to three times, and creating a category clears implicit
deferrals so the memories that motivated it can be classified. Dry runs write
only audit, metrics and scheduling metadata; they never write either kind of
skip or change catalog content.

## What the audit log measures

Five things the published work does not measure, computed from
`catalog_metrics_daily` and shown in the Catalog tab and at
`GET /api/v1/catalog/metrics`: reclassification churn against corpus growth,
drift under repeated runs over a fixed corpus, how often the category caps bind,
orphan accumulation, and how often a dry run agrees with a live run. Run rows
also carry `unorganized` and `rejected` counts, which show when the Free-plan
budget, rather than the model, is the limiting factor.

## Known gaps

- **The scheduled path has never run against real Cloudflare.** Everything else
  is covered by unit and service tests against real SQLite and a scripted
  provider, plus browser tests against the unsigned preview. A scheduled firing,
  a live model endpoint, and a Workflow replay are unverified; `docs/ACCEPTANCE.md`
  lists them.
- **Consolidation applies only category creation**, and only when an account
  turns off approval. Merges, retirements and project moves always wait for a
  human, which is what the evidence supports, but an idle catalog accumulates
  suggestions rather than resolving them.
- **The retrieval benchmark is synthetic and English-only.** It proves the
  anti-starvation property and nothing about real query quality.
- **No reranker.** The catalog narrows and balances candidates; the final
  ordering is still RRF over keyword and vector ranks.
- Batch selection reviews older memories once nothing needs attention, so a
  large library spends turns on review rather than on new entries.

## Related

- [Architecture](ARCHITECTURE.md)
- [API](API.md)
- [Setup](SETUP.md)
- [Acceptance](ACCEPTANCE.md)
