// ============================================
// Is this copilot thread the caller's organisation's?
// ============================================
// communication_threads carries org_id; its inbox messages and drafts do not
// and belong to it through thread_id. The copilot routes read and acted on
// any thread, inbox message or draft whose id they were given — every
// company's customer messages, AI drafts and the context they were built
// from. They load the thread through this first and answer 404 when it is
// null; send already did (drafts/[id]/send).
//
// communication_threads.org_id is NOT NULL since 20261204 (every thread
// assigned to a company), so the check is a plain filter.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The thread (the columns asked for, plus id and org_id), or null when it
 *  does not exist or is not this organisation's. */
export async function copilotThreadInOrg<T extends { id: string; org_id: string | null }>(
  db: Db,
  orgId: string,
  threadId: string | null | undefined,
  columns = '*',
): Promise<T | null> {
  if (!threadId) return null
  const { data, error } = await db
    .from('communication_threads')
    .select(columns === '*' ? '*' : `id, org_id, ${columns}`)
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error || !data) return null
  return data as T
}
