// ============================================
// Keep the trip linked to its client — even when the database drops the link
// ============================================
// Verified against production on 2026-08-22: an INSERT into itineraries that
// carries client_id comes back with client_id NULL, under the service role and
// under a user's own JWT alike; every other column survives, and an UPDATE of
// client_id sticks. That is a BEFORE INSERT-time rewrite on the table which
// exists only in production — it is in no migration, no sibling migration and
// no version of any .sql file this repo has ever held. Until it is identified
// and removed, every trip created "from a client's page" silently lost its
// client.
//
// This is the app-side safeguard: after an insert, if the client we asked for
// is not the client we got back, assert it with an UPDATE. It is a no-op on a
// healthy database, so it stays correct after the trigger is gone, and it is
// loud (console.warn) while the trigger is alive so the drift stays visible.
// ============================================

type ClientIdRow = { id: string; client_id?: string | null } | null | undefined

type Db = {
  from(table: 'itineraries'): {
    update(values: { client_id: string }): {
      eq(column: 'id', value: string): {
        select(columns: 'id, client_id'): { single(): PromiseLike<{ data: ClientIdRow; error: { message: string } | null }> }
      }
    }
  }
}

export type ReassertResult =
  | { outcome: 'kept' }
  | { outcome: 'reasserted'; client_id: string }
  | { outcome: 'failed'; error: string }
  | { outcome: 'not_requested' }

/**
 * Make sure the inserted itinerary carries the client_id that was sent.
 * Returns what happened so callers (and tests) can see it; never throws — a
 * failed re-link is reported, the created trip is not rolled back.
 */
export async function reassertClientId(
  db: Db,
  inserted: ClientIdRow,
  wantedClientId: string | null | undefined
): Promise<ReassertResult> {
  if (!wantedClientId) return { outcome: 'not_requested' }
  if (!inserted?.id) return { outcome: 'failed', error: 'no inserted row' }
  if (inserted.client_id === wantedClientId) return { outcome: 'kept' }

  const { data, error } = await db
    .from('itineraries')
    .update({ client_id: wantedClientId })
    .eq('id', inserted.id)
    .select('id, client_id')
    .single()

  if (error || !data || data.client_id !== wantedClientId) {
    const message = error?.message || 'client_id still not set after update'
    console.error(`[itineraries] client link LOST on insert and could not be re-asserted for ${inserted.id}: ${message}`)
    return { outcome: 'failed', error: message }
  }

  console.warn(
    `[itineraries] client_id was dropped on INSERT for ${inserted.id} and re-asserted by update — ` +
      'a BEFORE INSERT rewrite on itineraries is still live in this database'
  )
  // Keep the caller's row object truthful for whatever it does next.
  if (inserted) inserted.client_id = wantedClientId
  return { outcome: 'reasserted', client_id: wantedClientId }
}
