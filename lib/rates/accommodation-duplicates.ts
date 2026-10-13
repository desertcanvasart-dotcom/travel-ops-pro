// ============================================
// "Does this hotel / ship rate already exist?" — the create routes' key
// ============================================
// The hotel key was name + city + tier. A second contract for the same hotel
// — another board basis (BB vs HB), another supplier (direct vs a DMC), next
// year's rate sheet — could never be created, and the 409 told the operator
// to change the supplier or period, which did not help. The cruise key
// filtered on a column that does not exist (`route`; the column is
// route_name): PostgREST answered 42703, the error was ignored, and the check
// never fired at all.
//
// Rules (lib/rates/natural-key.ts): the key is every column the form lets the
// operator pick that makes it a different priced thing; blank compares as
// blank (IS NULL); a lookup that fails is an error, never "no duplicate".
//
// The name is compared here, case-insensitively and exactly — not with
// ilike, where a '%' or '_' (or PostgREST's '*') in a hotel's name is a
// wildcard.

import { whereNullable } from './natural-key'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }
type Row = Record<string, unknown>

const sameName = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

export const HOTEL_KEY_DESCRIPTION = 'hotel name, city, tier, board basis, hotel company and Rate Card Validity'
export const CRUISE_KEY_DESCRIPTION = 'ship, cabin type, route, nights, supplier and Rate Card Validity'

export type DuplicateLookup = { ok: true; existing: Row | null } | { ok: false; error: string }

async function lookup(
  db: Db,
  table: string,
  orgId: string,
  nameCol: string,
  name: unknown,
  keys: Array<[string, unknown, { ilike?: boolean }?]>
): Promise<DuplicateLookup> {
  let q = db.from(table).select('*').eq('org_id', orgId)
  for (const [col, value, opts] of keys) q = whereNullable(q, col, value, opts)
  const { data, error } = await q
  if (error) return { ok: false, error: String(error.message ?? error) }
  const hit = ((data ?? []) as Row[]).find(r => sameName(r[nameCol], name)) ?? null
  return { ok: true, existing: hit }
}

/** An accommodation_rates row with the same full key, if any. */
export function findDuplicateHotel(db: Db, orgId: string, row: Row): Promise<DuplicateLookup> {
  return lookup(db, 'accommodation_rates', orgId, 'property_name', row.property_name, [
    ['city', row.city, { ilike: true }],
    ['tier', row.tier],
    ['board_basis', row.board_basis, { ilike: true }],
    ['supplier_id', row.supplier_id],
    ['rate_valid_from', row.rate_valid_from],
    ['rate_valid_to', row.rate_valid_to],
  ])
}

/** A nile_cruises row with the same full key, if any. */
export function findDuplicateCruise(db: Db, orgId: string, row: Row): Promise<DuplicateLookup> {
  return lookup(db, 'nile_cruises', orgId, 'ship_name', row.ship_name, [
    ['cabin_type', row.cabin_type],
    ['route_name', row.route_name, { ilike: true }],
    ['duration_nights', row.duration_nights],
    ['supplier_id', row.supplier_id],
    ['rate_valid_from', row.rate_valid_from],
    ['rate_valid_to', row.rate_valid_to],
  ])
}

/** Postgres unique_violation: the service / cruise code is already taken. */
export const isUniqueViolation = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as { code?: string }).code === '23505'

/** Postgres foreign_key_violation: something still references the row. */
export const isForeignKeyViolation = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as { code?: string }).code === '23503'
