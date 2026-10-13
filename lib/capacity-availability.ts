// ============================================
// Capacity availability decision (pure)
// ============================================
// Turns per-date capacity rows into an overall availability verdict + a
// customer-facing message. Extracted from /api/capacity/check so it can be unit
// tested and reused (e.g. by the WhatsApp AI agent's availability replies).

export type CapacityStatus = 'available' | 'limited' | 'busy' | 'blackout'

export interface CapacityDayDetail {
  date: string
  status: CapacityStatus
  available_slots: number
  reason?: string | null
}

export interface CapacityCheckResult {
  available: boolean
  status: CapacityStatus | 'unknown'
  message: string
  details: CapacityDayDetail[]
}

export function determineCapacityResult(
  details: CapacityDayDetail[],
  groupSize: number
): CapacityCheckResult {
  const hasBlackout = details.some((d) => d.status === 'blackout')
  const hasBusy = details.some((d) => d.status === 'busy' && d.available_slots < groupSize)
  const hasLimited = details.some((d) => d.status === 'limited')
  const allAvailable = details.every((d) => d.status === 'available' || d.available_slots >= groupSize)

  if (hasBlackout) {
    const blackoutDates = details.filter((d) => d.status === 'blackout')
    const reasons = blackoutDates.map((d) => d.reason).filter(Boolean)
    return {
      available: false,
      status: 'blackout',
      message: `We're not operating on ${blackoutDates.length > 1 ? 'some of those dates' : blackoutDates[0].date}${reasons.length > 0 ? ` (${reasons[0]})` : ''}. Would you like to check alternative dates?`,
      details,
    }
  }

  if (hasBusy) {
    const busyDates = details.filter((d) => d.status === 'busy' && d.available_slots < groupSize)
    return {
      available: false,
      status: 'busy',
      message: `We're fully booked on ${busyDates.length > 1 ? 'some dates in that range' : busyDates[0].date}. Would you like me to suggest alternative dates?`,
      details,
    }
  }

  if (hasLimited) {
    return {
      available: true,
      status: 'limited',
      message:
        "Those dates work for us, though we have limited availability. I recommend booking soon to secure your spot. We'll confirm hotel and service availability once you proceed.",
      details,
    }
  }

  if (allAvailable) {
    return {
      available: true,
      status: 'available',
      message:
        "Great news! Those dates work on our end. We'll confirm hotel availability and finalize the booking details once you're ready to proceed.",
      details,
    }
  }

  return {
    available: true,
    status: 'unknown',
    message: 'Let me check those dates and get back to you with confirmation.',
    details,
  }
}

// ============================================
// Saving a day: what the request left out is KEPT
// ============================================
// The capacity editor sends only the fields the operator touched (status,
// max_groups, reason, notes …). The save routes built every row from the
// request alone — `booked_groups: entry.booked_groups ?? 0`, internal_notes
// straight from the body — and upserted it, so each save of a day reset its
// booked groups/guides/vehicles to 0 and blanked its internal notes. The
// availability check then reported a fully booked day as open.

export const CAPACITY_FIELDS = [
  'status', 'max_groups', 'booked_groups', 'max_guides', 'booked_guides',
  'max_vehicles', 'booked_vehicles', 'notes', 'internal_notes', 'reason',
] as const
export type CapacityField = (typeof CAPACITY_FIELDS)[number]

const CAPACITY_DEFAULTS: Record<CapacityField, unknown> = {
  status: 'available',
  max_groups: 3,
  booked_groups: 0,
  max_guides: null,
  booked_guides: 0,
  max_vehicles: null,
  booked_vehicles: 0,
  notes: null,
  internal_notes: null,
  reason: null,
}

/** A day's row to write: each field from the request when it was given, else
 *  the day's stored value, else the default for a new day. Pure. */
export function mergeCapacityEntry(
  input: Partial<Record<CapacityField, unknown>>,
  existing: Partial<Record<CapacityField, unknown>> | null | undefined,
): Record<CapacityField, unknown> {
  const out = {} as Record<CapacityField, unknown>
  for (const f of CAPACITY_FIELDS) {
    if (input[f] !== undefined) out[f] = input[f]
    else if (existing && existing[f] !== undefined && existing[f] !== null) out[f] = existing[f]
    else out[f] = CAPACITY_DEFAULTS[f]
  }
  return out
}

// ============================================
// What is booked on a day: counted, not typed
// ============================================
// operator_capacity.booked_groups (and booked_guides / booked_vehicles) were
// never written by anything — no input, no trigger — so every day read
// "0/3 groups · 3 free" and a Busy day's slot test compared against
// max_groups alone. The groups out on a day are now COUNTED from what the
// app already knows (lib/capacity-load.ts reads them):
//   * each sold trip (itinerary confirmed or completed) on the road that day
//     — start_date ≤ day ≤ end_date — is one group;
//   * each running departure (Open, Limited, Full or Guaranteed, with at
//     least one seat taken — lib/departures/seats) on the road is one group.
// Guides and vehicles are the distinct assigned_guide_id / assigned_vehicle_id
// among those, so a day over its Max guides / Max vehicles can be flagged.
// The stored booked_* columns are no longer read.

/** A day with no capacity row: available, this many groups. */
export const DEFAULT_MAX_GROUPS = 3

export interface DayLoad {
  groups: number
  guides: number
  vehicles: number
}

export interface LoadSource {
  start_date: string
  end_date: string | null
  assigned_guide_id?: string | null
  assigned_vehicle_id?: string | null
}

/** Groups, guides and vehicles out on each of `dates`. Pure. */
export function dayLoads(dates: string[], sources: LoadSource[]): Map<string, DayLoad> {
  const out = new Map<string, DayLoad>()
  for (const date of dates) {
    const on = sources.filter(s => s.start_date <= date && (s.end_date ?? s.start_date) >= date)
    out.set(date, {
      groups: on.length,
      guides: new Set(on.map(s => s.assigned_guide_id).filter(Boolean)).size,
      vehicles: new Set(on.map(s => s.assigned_vehicle_id).filter(Boolean)).size,
    })
  }
  return out
}

/** One day's verdict input: its status, and the group slots left once the
 *  groups already out are counted. Never negative. The availability check
 *  and the WhatsApp assistant both build their days with this. */
export function capacityDayDetail(
  date: string,
  row: { status: string; max_groups: number | null; reason?: string | null } | null | undefined,
  load: DayLoad | null | undefined,
): CapacityDayDetail {
  const groups = load?.groups ?? 0
  if (!row) return { date, status: 'available', available_slots: Math.max(0, DEFAULT_MAX_GROUPS - groups) }
  return {
    date,
    status: row.status as CapacityStatus,
    available_slots: Math.max(0, (Number(row.max_groups) || 0) - groups),
    reason: row.reason ?? null,
  }
}

/** What a day is over: "guides 4/3", "vehicles 2/1". Empty when within its
 *  limits, or when no limit is set. */
export function overLimits(
  row: { max_groups?: number | null; max_guides?: number | null; max_vehicles?: number | null } | null | undefined,
  load: DayLoad | null | undefined,
): string[] {
  if (!load) return []
  const out: string[] = []
  const maxGroups = row ? row.max_groups : DEFAULT_MAX_GROUPS
  if (maxGroups != null && load.groups > maxGroups) out.push(`groups ${load.groups}/${maxGroups}`)
  if (row?.max_guides != null && load.guides > row.max_guides) out.push(`guides ${load.guides}/${row.max_guides}`)
  if (row?.max_vehicles != null && load.vehicles > row.max_vehicles) out.push(`vehicles ${load.vehicles}/${row.max_vehicles}`)
  return out
}

const COUNT_FIELDS = ['max_groups', 'max_guides', 'max_vehicles', 'booked_groups', 'booked_guides', 'booked_vehicles'] as const
const CLEARABLE = new Set(['max_guides', 'max_vehicles'])

/** A day's input as the save routes take it: counts are whole numbers ≥ 0
 *  (max_guides / max_vehicles may be null — no limit); status one of four.
 *  Returns the problem, or null. Nothing checked them: max_groups could be
 *  -2 or 1.5, and the check route then reported negative slots. */
export function capacityInputError(entry: Record<string, unknown>): string | null {
  if (entry.status !== undefined && entry.status !== null &&
      !['available', 'limited', 'busy', 'blackout'].includes(String(entry.status))) {
    return `Invalid status: ${entry.status}`
  }
  for (const f of COUNT_FIELDS) {
    const v = entry[f]
    if (v === undefined) continue
    if (v === null) {
      if (CLEARABLE.has(f)) continue
      return `${f} must be a whole number of 0 or more`
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1000) {
      return `${f} must be a whole number of 0 or more`
    }
  }
  return null
}
