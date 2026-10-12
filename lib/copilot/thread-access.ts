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
// A thread with NO org_id is not visible to anyone: it cannot be placed in a
// company, and guessing is the leak this closes. The G1 backfill of
// communication_threads.org_id is still pending — until it runs, such
// threads are hidden rather than shown to both companies.

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
    .maybeSingle()
  if (error || !data) return null
  return (data as T).org_id === orgId ? (data as T) : null
}
