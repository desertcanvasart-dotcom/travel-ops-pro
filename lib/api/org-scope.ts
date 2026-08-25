// ============================================
// TENANT SCOPING HELPERS
// ============================================
// The service-role client bypasses RLS, so on every /api route that addresses a
// row by an id from the URL, an explicit org check is the only thing standing
// between one organisation and another's data. lib/b2b/quote-scope.ts introduced
// this for tour_quotes; this generalises it for the rest.
//
// Two shapes:
//   * a row that carries org_id directly (b2c_quotes, expenses, …) → rowInOrg
//   * a child keyed by a parent that carries org_id (quote_revisions →
//     b2c_quotes / tour_quotes) → parentQuoteInOrg
//
// A caller who does not own the row gets a plain 404 — a 403 would confirm the
// id exists.

import { NextResponse } from 'next/server'

/** Minimal client shape: works with the service-role or an RLS-scoped client. */
type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** Does a row in `table` with this id belong to this org? Fails closed. */
export async function rowInOrg(
  supabase: DbClient,
  table: string,
  id: string,
  orgId: string
): Promise<boolean> {
  if (!id || !orgId) return false
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

/**
 * Does the PARENT quote a revision/version hangs off belong to this org?
 *
 * quote_revisions and quote_versions carry no org_id of their own; the quote
 * they belong to does. `quoteType` selects the parent table.
 */
export async function parentQuoteInOrg(
  supabase: DbClient,
  quoteType: 'b2b' | 'b2c',
  quoteId: string,
  orgId: string
): Promise<boolean> {
  const table = quoteType === 'b2b' ? 'tour_quotes' : 'b2c_quotes'
  return rowInOrg(supabase, table, quoteId, orgId)
}

/** Uniform not-found — identical to the response for a row that does not exist. */
export function notFoundInOrg(what = 'Resource') {
  return NextResponse.json({ success: false, error: `${what} not found` }, { status: 404 })
}
