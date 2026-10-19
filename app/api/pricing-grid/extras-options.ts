// The extras a grid trip is offered, in the org's rate currency — the one
// read the extras route and the save share, so a line is saved at the price
// the grid showed for it (like rate-options.ts for the rates).

import { loadOfferedExtras, type ActivityRateRow } from '@/lib/extras/offered'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { rowInOrg } from '@/lib/api/org-scope'
import type { GridExtraOption } from '@/app/pricing-grid/lib/extras'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface GridExtraRows {
  extras: GridExtraOption[]
  /** The Activities rates the extras cost from — an extra's cost depends on
   *  the group, so the page prices it for the pax it has (gridExtraOptions). */
  activities: ActivityRateRow[]
  rateCurrency: string
  /** Rows whose currency has no exchange rate: priced as unpriced, named. */
  warnings: string[]
}

/**
 * Every-booking extras plus those of programme `templateId` (null = a trip
 * not built from one), at the programme's price, each row and its Activities
 * rate converted into the rate currency at the fetch boundary.
 */
export async function loadGridExtraRows(
  db: Db,
  orgId: string,
  templateId: string | null,
  opts?: { ids?: readonly string[]; rateCurrency?: string }
): Promise<GridExtraRows> {
  const rateCurrency = opts?.rateCurrency ?? await getOrgRateCurrency(db, orgId)
  const { extras, activities } = await loadOfferedExtras(db, orgId, templateId, opts?.ids ? { ids: opts.ids } : undefined)
  const normalizer = createRateNormalizer(rateCurrency)
  const rows = (await normalizer.normalize('extras_catalogue', extras as unknown as Record<string, unknown>[])) as unknown as GridExtraOption[]
  const activityRows = (await normalizer.normalize('activity_rates', [...activities.values()] as unknown as Record<string, unknown>[])) as unknown as ActivityRateRow[]
  const nameOf = new Map(activityRows.map(a => [a.id, a.activity_name ?? null]))
  const warnings = normalizer.misses.map(m =>
    `An extra's ${m.table === 'activity_rates' ? 'Activities rate' : 'price'} is in ${m.currency}, which has no exchange rate to ${rateCurrency} — it is unpriced.`)
  return {
    extras: rows
      .map(x => ({ ...x, activity_name: x.activity_rate_id ? nameOf.get(x.activity_rate_id) ?? null : null }))
      .sort((a, b) => String(a.category ?? '').localeCompare(String(b.category ?? '')) || a.name.localeCompare(b.name)),
    activities: activityRows,
    rateCurrency,
    warnings: [...new Set(warnings)],
  }
}

/**
 * The programme a grid trip is priced for: a saved trip's own (read from it,
 * never the request); otherwise the one the request names, if it is this
 * company's. Null = none — every-booking extras only.
 */
export async function gridTripProgramme(
  db: Db,
  orgId: string,
  ref: { itineraryId?: string | null; templateId?: string | null }
): Promise<string | null> {
  if (ref.itineraryId) {
    const { data } = await db.from('itineraries').select('template_id').eq('id', ref.itineraryId).eq('org_id', orgId).maybeSingle()
    if (data) return data.template_id ?? null
  }
  if (ref.templateId && (await rowInOrg(db, 'tour_templates', ref.templateId, orgId))) return ref.templateId
  return null
}
