// ============================================
// DEPARTURE MIRROR — turning canonical departures into row writes
// ============================================
// The decision half is pure so it can be tested without a database. The route
// does the I/O.
//
// Mirrored departures live in `tour_departures` alongside local ones (one place
// for the calendar, availability check and booking flow to read). The price of
// that is a partner sync could clobber an operator's own row, so:
//
//   * a mirrored row is stamped externally_managed + source_integration_id
//   * we NEVER convert a local departure into a managed one, even if the ids
//     happen to line up — that would silently transfer ownership of a row the
//     operator maintains
//   * the upsert key is (source_integration_id, external_id), enforced by a
//     unique index, so a retried webhook updates rather than duplicates

import type { CanonicalDeparture } from './types'

/** The subset of tour_departures this module reasons about. */
export interface ExistingDeparture {
  id: string
  external_id: string | null
  source_integration_id: string | null
  externally_managed: boolean
  booked_pax: number | null
  max_pax: number | null
  status: string | null
}

export interface DepartureWrite {
  external_id: string
  /** Present when updating an existing mirrored row. */
  id?: string
  values: Record<string, unknown>
}

export interface SyncConflict {
  external_id: string
  existing_id: string
  reason: string
}

export interface SyncPlan {
  inserts: DepartureWrite[]
  updates: DepartureWrite[]
  /** Rows we refused to touch, with why. Surfaced to the partner and the log. */
  conflicts: SyncConflict[]
  unchanged: string[]
}

/**
 * Columns a mirrored departure carries. Kept in one place so insert and update
 * cannot drift apart — a field added to one and not the other would mean a
 * departure that syncs correctly on creation and then goes stale forever.
 */
function mirroredValues(
  d: CanonicalDeparture,
  ctx: { orgId: string; integrationId: string; syncedAt: string }
): Record<string, unknown> {
  return {
    org_id: ctx.orgId,
    source_integration_id: ctx.integrationId,
    external_id: d.external_id,
    externally_managed: true,
    external_synced_at: ctx.syncedAt,

    tour_name: d.tour_name,
    tour_code: d.tour_code ?? null,
    start_date: d.start_date,
    end_date: d.end_date ?? d.start_date,
    duration_days: d.duration_days ?? 1,
    max_pax: d.max_pax,
    booked_pax: d.booked_pax,
    min_pax: d.min_pax ?? null,
    status: d.status ?? 'open',
    price_per_person: d.price_per_person ?? null,
    currency: d.currency ?? 'EUR',
    is_guaranteed: d.is_guaranteed ?? false,
    cutoff_days: d.cutoff_days ?? null,
    public_notes: d.public_notes ?? null,
  }
}

/** Has anything the partner owns actually changed? */
function differs(existing: ExistingDeparture, values: Record<string, unknown>): boolean {
  return (
    Number(existing.booked_pax ?? -1) !== Number(values.booked_pax) ||
    Number(existing.max_pax ?? -1) !== Number(values.max_pax) ||
    String(existing.status ?? '') !== String(values.status)
  )
}

/**
 * Decide what to write.
 *
 * `existing` should be every tour_departures row for this org that either
 * belongs to this integration or shares an external_id with the incoming batch
 * — the caller fetches by external_id so local collisions are visible here
 * rather than surfacing as a unique-constraint error mid-write.
 */
export function planDepartureSync(
  departures: CanonicalDeparture[],
  existing: ExistingDeparture[],
  ctx: { orgId: string; integrationId: string; syncedAt: string }
): SyncPlan {
  const plan: SyncPlan = { inserts: [], updates: [], conflicts: [], unchanged: [] }

  const byExternalId = new Map<string, ExistingDeparture[]>()
  for (const row of existing) {
    if (!row.external_id) continue
    const list = byExternalId.get(row.external_id) ?? []
    list.push(row)
    byExternalId.set(row.external_id, list)
  }

  // A partner sending the same external_id twice in one delivery would produce
  // two writes racing for the same unique key. Last one wins, which matches how
  // a partner would expect their own later record to be the current one.
  const deduped = new Map<string, CanonicalDeparture>()
  for (const d of departures) deduped.set(d.external_id, d)

  for (const d of deduped.values()) {
    const values = mirroredValues(d, ctx)
    const candidates = byExternalId.get(d.external_id) ?? []

    const mine = candidates.find(r => r.source_integration_id === ctx.integrationId)
    if (mine) {
      if (differs(mine, values)) {
        plan.updates.push({ external_id: d.external_id, id: mine.id, values })
      } else {
        // Still touched, to record that the mirror is fresh — but not counted as
        // a change, so an operator watching the log sees real movement only.
        plan.unchanged.push(d.external_id)
      }
      continue
    }

    // Same external_id, but the row is local or belongs to a DIFFERENT partner.
    // Refuse: adopting it would hand a row the operator maintains (or another
    // integration owns) to this partner, and the next sync would overwrite it.
    const foreign = candidates.find(r => r.source_integration_id !== ctx.integrationId)
    if (foreign) {
      plan.conflicts.push({
        external_id: d.external_id,
        existing_id: foreign.id,
        reason: foreign.externally_managed
          ? 'A departure with this external_id is already mirrored from a different integration'
          : 'A locally-managed departure already uses this external_id',
      })
      continue
    }

    plan.inserts.push({ external_id: d.external_id, values })
  }

  return plan
}
