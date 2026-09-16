// ============================================
// A template day, as the calculator's editor holds it
// ============================================
// The calculator loads a programme's days, lets the operator edit them, and
// saves the WHOLE list back over tour_templates.itinerary. It used to rebuild
// each day from a fixed list of fields — and that list left out the travel
// mode, the picked ticket, the overnight-in-flight marker, the per-day
// transport override and the extras. So a stored flight showed as "Road", and
// the next save erased it: on NMS803-CR-ABS seven of eight days had lost their
// travel mode and day 1 had lost the marker that stops the engine booking a
// Cairo hotel on the flight night (operator, 2026-09-16).
//
// The rule now: KEEP every field the stored day has, and only fill in
// defaults for the ones the editor needs to render. Anything the editor does
// not know about travels through untouched.

export interface EditableDayServices {
  airport_arrival: boolean
  airport_departure: boolean
  hotel_checkin: boolean
  hotel_checkout: boolean
  guide_required: boolean
  /** Assistance boarding the ship. Absent = the engine decides from the days. */
  cruise_embark?: boolean
  /** Assistance leaving the ship. Absent = the engine decides from the days. */
  cruise_disembark?: boolean
  [key: string]: boolean | undefined
}

export interface EditableDay {
  day: number
  title: string
  description: string
  meals: string[]
  city: string
  overnight_city: string | null
  is_cruise_day: boolean
  attractions: string[]
  attraction_ids: string[]
  supplements?: string[]
  accommodation_type: string
  transport_type?: string
  transport_rate_id?: string
  road_transfers?: boolean
  services: EditableDayServices
  [key: string]: unknown
}

export function toEditableDay(raw: unknown, index: number): EditableDay {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const s = (d.services && typeof d.services === 'object' ? d.services : {}) as Record<string, unknown>
  return {
    // Everything stored first — the fields below only normalise what the
    // editor renders, never drop what it does not.
    ...d,
    day: d.day || index + 1,
    title: d.title || `Day ${index + 1}`,
    description: d.description || '',
    meals: Array.isArray(d.meals) ? d.meals : [],
    city: d.city || '',
    overnight_city: d.overnight_city || null,
    is_cruise_day: d.is_cruise_day || false,
    attractions: Array.isArray(d.attractions) ? d.attractions : [],
    attraction_ids: Array.isArray(d.attraction_ids) ? d.attraction_ids.filter(Boolean) : [],
    supplements: Array.isArray(d.supplements) && d.supplements.length ? d.supplements.filter(Boolean) : undefined,
    accommodation_type: d.accommodation_type || 'hotel',
    services: {
      ...(s as Record<string, boolean | undefined>),
      airport_arrival: Boolean(s.airport_arrival),
      airport_departure: Boolean(s.airport_departure),
      hotel_checkin: Boolean(s.hotel_checkin),
      hotel_checkout: Boolean(s.hotel_checkout),
      guide_required: Boolean(s.guide_required),
    },
  }
}
