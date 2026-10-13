// ============================================
// One edit path for a B2B quote
// ============================================
// PUT /api/b2b/quotes/[id] and PUT /api/b2b/quotes ({ id, … }) both edited a
// quote, each with its own copy of the rules (and the collection one with
// none). Both now come here: what may change is lib/b2b/quote-updates.ts,
// when a quote is locked is lib/quotes/lock.ts, and the actor is the
// signed-in user. Scoped by org_id in every statement.

import { pickB2bQuoteUpdates } from '@/lib/b2b/quote-updates'
import { bookingsFromQuote, quoteLockReason } from '@/lib/quotes/lock'
import { withEffectiveStatus } from '@/lib/quotes/validity'
import { clientMessage } from '@/lib/api-errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

export async function updateB2bQuote(
  db: Db,
  opts: { orgId: string; id: string; body: Record<string, unknown>; actor: string | null }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { orgId, id, body, actor } = opts
  const { data: current } = await db
    .from('tour_quotes')
    .select('id, status, valid_until, converted_to_itinerary_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!current) return { status: 404, body: { success: false, error: 'Quote not found' } }

  const lock = quoteLockReason(current, await bookingsFromQuote(db, 'b2b', id))
  const picked = pickB2bQuoteUpdates(body, { valid_until: current.valid_until, lock })
  if (!picked.ok) return { status: picked.status, body: { success: false, error: picked.error } }
  if (Object.keys(picked.updates).length === 0) {
    return { status: 400, body: { success: false, error: 'Nothing to change: a quote\'s status, client details, notes and valid-until date can be edited; its price comes from the calculator.' } }
  }

  const { data, error } = await db
    .from('tour_quotes')
    .update({ ...picked.updates, updated_at: new Date().toISOString(), last_modified_by: actor })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()
  if (error) {
    console.error('Error updating quote:', error)
    return { status: 500, body: { success: false, error: clientMessage(error, 'Internal server error') } }
  }

  // Snapshot the updated state as a new revision (best-effort — never blocks
  // the save). Authorship is the signed-in user, never a client-supplied one.
  try {
    await db.rpc('create_quote_revision', {
      p_quote_id: id,
      p_changed_by: actor,
      p_change_reason: typeof body.change_reason === 'string' && body.change_reason ? body.change_reason : 'Quote updated',
    })
  } catch (revErr) {
    console.warn('create_quote_revision failed (non-fatal):', revErr)
  }

  return { status: 200, body: { success: true, data: withEffectiveStatus(data) } }
}
