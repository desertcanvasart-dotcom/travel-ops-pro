// ============================================
// Which extras a trip is offered, and what they cost
// ============================================
// One list since 20270107 (Sell → Extras). Each extra is offered with EVERY
// booking (offered_with 'all') or only with the programmes linked to it
// (extras_catalogue_programmes), and a programme may carry its own price.
// An extra linked to an Activities rate takes its cost from there — the
// price is entered once (operator, 2026-10-19).
//
// Every reader goes through here: the B2B calculator's picker, the quote
// engine (calculate-price), and a booking's add-on list. The pure parts are
// tested; loadOfferedExtras() only fetches.

import { usableRate } from '@/lib/pricing/usable-rate'
import { priceByBasis, toPricingBasis } from '@/lib/pricing/pricing-basis'
import { pickTier, sanitizeTiers } from '@/lib/rates/activity-tiers'

export type OfferedWith = 'all' | 'programmes'
export const OFFERED_WITH: readonly OfferedWith[] = ['all', 'programmes']

export interface ExtraRow {
  id: string
  name: string
  description?: string | null
  category?: string | null
  supplier_cost: number | null
  supplier_id?: string | null
  selling_price: number | null
  unit: 'per_person' | 'per_booking'
  is_active?: boolean | null
  rate_currency?: string | null
  /** Missing on a database that has not run 20270107: every booking. */
  offered_with?: OfferedWith | string | null
  activity_rate_id?: string | null
}

export interface ProgrammeLink {
  id?: string
  extra_id: string
  template_id: string
  /** This programme's price, in the extra's currency. Null = the extra's. */
  selling_price: number | null
}

export interface ActivityRateRow {
  id: string
  activity_name?: string | null
  pricing_type?: string | null
  base_rate_eur?: number | string | null
  base_rate_non_eur?: number | string | null
  tiers?: unknown
  max_capacity?: number | null
  rate_currency?: string | null
  is_active?: boolean | null
}

/** An extra as offered on one trip: the programme's price applied. */
export type OfferedExtra = ExtraRow & {
  /** True when the price shown is this programme's own. */
  programme_price: boolean
}

export function offeredWith(row: Pick<ExtraRow, 'offered_with'>): OfferedWith {
  return row.offered_with === 'programmes' ? 'programmes' : 'all'
}

/**
 * The extras offered on a trip of programme `templateId` (null = a trip not
 * built from a programme: only the every-booking ones). A programme's own
 * price replaces the extra's; inactive extras are never offered.
 */
export function extrasForProgramme(
  extras: readonly ExtraRow[],
  links: readonly ProgrammeLink[],
  templateId: string | null | undefined
): OfferedExtra[] {
  const linkOf = new Map<string, ProgrammeLink>()
  if (templateId) {
    for (const l of links) if (l.template_id === templateId) linkOf.set(l.extra_id, l)
  }
  const out: OfferedExtra[] = []
  for (const x of extras) {
    if (x.is_active === false) continue
    const link = linkOf.get(x.id)
    if (offeredWith(x) === 'programmes' && !link) continue
    const own = link ? usableRate(link.selling_price) : null
    out.push(own != null
      ? { ...x, selling_price: own, programme_price: true }
      : { ...x, programme_price: false })
  }
  return out
}

/**
 * What an Activities rate costs for a group of `pax`, in the row's currency
 * (normalise the row first to have it in another). Tiered rates take the
 * group's band per person; the others follow their basis (per person, per
 * group, per unit of `max_capacity`). Null = no usable rate — a hole, never
 * free.
 */
export function activityGroupCost(
  activity: ActivityRateRow | null | undefined,
  pax: number,
  isEurPassport = false
): number | null {
  if (!activity || activity.is_active === false) return null
  const people = Math.max(1, Math.floor(pax) || 1)
  if (activity.pricing_type === 'tiered') {
    const tiers = sanitizeTiers(activity.tiers)
    if (!tiers) return null
    const tier = pickTier(tiers, people)
    const rate = usableRate(isEurPassport ? tier.rate_eur : (tier.rate_non_eur ?? tier.rate_eur))
    return rate == null ? null : Math.round(rate * people * 100) / 100
  }
  const rate = isEurPassport
    ? usableRate(activity.base_rate_eur)
    : (usableRate(activity.base_rate_non_eur) ?? usableRate(activity.base_rate_eur))
  if (rate == null) return null
  const basis = toPricingBasis(activity.pricing_type) ?? 'per_person'
  return priceByBasis(rate, basis, people, activity.max_capacity).lineTotal
}

/**
 * The extra with its cost taken from its Activities rate, for this group:
 * per person = the group's cost ÷ travellers, per booking = the group's cost.
 * Both rows must already be in the same currency. An extra with no activity
 * keeps its typed cost; one whose activity is gone or unpriced has none.
 */
export function withActivityCost<T extends ExtraRow>(
  extra: T,
  activity: ActivityRateRow | null | undefined,
  pax: number,
  isEurPassport = false
): T {
  if (!extra.activity_rate_id) return extra
  const group = activityGroupCost(activity, pax, isEurPassport)
  const people = Math.max(1, Math.floor(pax) || 1)
  const cost = group == null ? null
    : extra.unit === 'per_person' ? Math.round((group / people) * 100) / 100
    : group
  return { ...extra, supplier_cost: cost }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface LoadedExtras {
  extras: OfferedExtra[]
  /** The Activities rates the offered extras take their cost from, by id. */
  activities: Map<string, ActivityRateRow>
}

/**
 * Fetch the extras a trip of `templateId` is offered (optionally only `ids`),
 * with their programme prices applied and their Activities rows. Rows are as
 * stored — normalise currencies before pricing. `select('*')` on purpose:
 * the columns arrive by migration and an unmigrated database must still load.
 */
export async function loadOfferedExtras(
  db: Db,
  orgId: string,
  templateId: string | null | undefined,
  opts?: { ids?: readonly string[] }
): Promise<LoadedExtras> {
  let query = db.from('extras_catalogue').select('*').eq('org_id', orgId).eq('is_active', true)
  if (opts?.ids) {
    if (opts.ids.length === 0) return { extras: [], activities: new Map() }
    query = query.in('id', opts.ids)
  }
  const { data: rows, error } = await query
  if (error) {
    console.error('[extras] load extras_catalogue:', error)
    return { extras: [], activities: new Map() }
  }
  const extras = (rows ?? []) as ExtraRow[]

  let links: ProgrammeLink[] = []
  if (templateId && extras.length) {
    const { data, error: linkError } = await db
      .from('extras_catalogue_programmes')
      .select('id, extra_id, template_id, selling_price')
      .eq('org_id', orgId)
      .eq('template_id', templateId)
    // A database without the table yet: no links, every-booking extras only.
    if (linkError) console.warn('[extras] load programme links:', linkError.message)
    links = (data ?? []) as ProgrammeLink[]
  }

  const offered = extrasForProgramme(extras, links, templateId)
  const activityIds = [...new Set(offered.map(x => x.activity_rate_id).filter((v): v is string => !!v))]
  const activities = new Map<string, ActivityRateRow>()
  if (activityIds.length) {
    const { data, error: actError } = await db
      .from('activity_rates')
      .select('*')
      .eq('org_id', orgId)
      .in('id', activityIds)
    if (actError) console.error('[extras] load activity rates:', actError)
    for (const a of (data ?? []) as ActivityRateRow[]) activities.set(a.id, a)
  }
  return { extras: offered, activities }
}
