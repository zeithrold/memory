/**
 * Read models and human-driven mutations: the catalog tree, the run timeline,
 * reverting a run, and deciding a structural proposal.
 *
 * Everything here is reached only through a browser session. An agent token
 * must not be able to approve a project move, because a move changes which
 * project-restricted tokens can see a memory.
 */
export function isoNow(): string {
  return new Date().toISOString()
}
