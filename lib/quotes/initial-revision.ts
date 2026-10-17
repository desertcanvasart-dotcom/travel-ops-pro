// ============================================
// A new B2B quote's first revision
// ============================================
// A quote saved from the calculator (POST /api/b2b/quotes) starts its history
// with a "Quote created" revision; quotes made from a trip
// (quote-from-itinerary) or from a website order (lib/intake/process-order)
// had none, so their first edit showed as version 1 and the price they were
// created at could never be compared with or reverted to. Same database
// function, same reason, same rule: best-effort — a quote is never refused
// because its snapshot could not be taken.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc(fn: string, args?: Record<string, unknown>): any }

export async function createInitialQuoteRevision(db: RpcClient, quoteId: string, actor: string | null): Promise<void> {
  try {
    const { error } = (await db.rpc('create_quote_revision', {
      p_quote_id: quoteId,
      p_changed_by: actor,
      p_change_reason: 'Quote created',
    })) ?? {}
    if (error) console.warn('create_quote_revision (initial) failed (non-fatal):', error)
  } catch (revErr) {
    console.warn('create_quote_revision (initial) failed (non-fatal):', revErr)
  }
}
