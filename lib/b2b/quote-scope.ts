// ============================================
// B2B QUOTE TENANT SCOPING
// ============================================
// Every /api/b2b/quotes route addresses a quote by an id from the URL and runs
// on the service-role client, which bypasses RLS. Before
// migrations/20260825_tour_quotes_org_id.sql there was no column to scope by at
// all, so one organisation could read, re-price, convert, revert or delete
// another's quotes — partner margins, net rates and customer contact details
// included.
//
// The shape mirrors ownedClientId() in app/api/clients/[id]/route.ts: establish
// ownership ONCE at the top of the handler, then let the existing queries run.
// A caller who does not own the quote gets a plain 404 — a 403 would confirm
// the id exists.

import { NextResponse } from 'next/server'

/** Minimal client shape: works with the service-role or an RLS-scoped client. */
type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** Does this quote belong to this organisation? Fails closed. */
export async function quoteInOrg(
  supabase: DbClient,
  quoteId: string,
  orgId: string
): Promise<boolean> {
  if (!quoteId || !orgId) return false
  const { data } = await supabase
    .from('tour_quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

/**
 * The refusal for a quote the caller does not own.
 *
 * Deliberately identical to the response for a quote that does not exist:
 * distinguishing them tells an attacker which ids are real.
 */
export function quoteNotFound() {
  return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
}
