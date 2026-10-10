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
