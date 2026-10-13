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

/**
 * Are the trip, partner and tour variation a quote points at this organisation's? A quote
 * stored another org's itinerary_id or partner_id as given: the quote and its
 * PDF then carried that org's client, supplier costs or partner contact, and
 * converting it re-priced THEIR trip. An absent reference passes. Fails closed.
 */
export async function quoteRefsInOrg(
  supabase: DbClient,
  orgId: string,
  refs: { itinerary_id?: unknown; partner_id?: unknown; variation_id?: unknown }
): Promise<boolean> {
  if (!orgId) return false
  // The variation too: a tour variation is one company's (20261207).
  const checks: Array<[string, unknown]> = [
    ['itineraries', refs.itinerary_id], ['b2b_partners', refs.partner_id], ['tour_variations', refs.variation_id],
  ]
  for (const [table, id] of checks) {
    if (id === undefined || id === null || id === '') continue
    if (typeof id !== 'string') return false
    const { data } = await supabase.from(table).select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
    if (!data) return false
  }
  return true
}

export const INACTIVE_PARTNER =
  'That partner is deactivated. Reactivate it on the Partners page, or choose another partner.'

/**
 * Is this partner (the org's own) deactivated? Deactivation is honoured by the
 * pickers but a stale tab or a direct call could still start a NEW quote, trip
 * or booking for one. Call it where something new is created, never where an
 * existing record is only read or re-saved: quotes and trips already made for
 * the partner stay valid. An absent partner is not inactive; a lookup error
 * counts as not inactive (quoteRefsInOrg has already proved the partner exists).
 */
export async function partnerIsInactive(supabase: DbClient, orgId: string, partnerId: unknown): Promise<boolean> {
  if (typeof partnerId !== 'string' || !partnerId || !orgId) return false
  const { data } = await supabase.from('b2b_partners').select('id, is_active').eq('id', partnerId).eq('org_id', orgId).maybeSingle()
  return !!data && data.is_active === false
}

/** The refusal for a new record against a deactivated partner. */
export function inactivePartnerResponse() {
  return NextResponse.json({ success: false, error: INACTIVE_PARTNER }, { status: 409 })
}

/** The refusal for a trip or partner that is not the caller's — the same 404 as a missing one. */
export function quoteRefNotFound() {
  return NextResponse.json({ success: false, error: 'Itinerary or partner not found' }, { status: 404 })
}
