// ============================================
// Deleting one quote (B2B or B2C)
// ============================================
// Bulk delete was manager-and-above while the single delete beside it was
// open to agents, and neither asked whether the quote had been converted or
// booked (lib/quotes/lock.ts). Every single-quote DELETE now comes here.

import { NextResponse } from 'next/server'
import { bookingsFromQuote, canDeleteQuotes, deleteRefusalMessage, quoteLockReason, type QuoteKind } from '@/lib/quotes/lock'
import { clientMessage } from '@/lib/api-errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const TABLE: Record<QuoteKind, string> = { b2b: 'tour_quotes', b2c: 'b2c_quotes' }

export async function deleteQuote(
  db: Db,
  opts: { kind: QuoteKind; orgId: string; id: string; role: string | null }
): Promise<NextResponse> {
  const { kind, orgId, id, role } = opts
  if (!canDeleteQuotes(role)) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions. Deleting a quote requires manager role or higher.' }, { status: 403 })
  }
  const table = TABLE[kind]
  const { data: quote } = await db
    .from(table)
    .select(kind === 'b2b' ? 'id, status, converted_to_itinerary_id' : 'id, status')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!quote) return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })

  const reason = quoteLockReason(quote, await bookingsFromQuote(db, kind, id))
  if (reason) return NextResponse.json({ success: false, error: deleteRefusalMessage(reason), reason }, { status: 409 })

  const { data, error } = await db.from(table).delete().eq('id', id).eq('org_id', orgId).select('id')
  if (error) {
    console.error(`Error deleting ${kind} quote:`, error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
