// ============================================
// tour_templates row → 日程表 context
// ============================================
// The decision half: which Japanese label each overnight gets, what each meal
// slot prints, how the schedule text splits into lines. Pure — the route does
// the I/O. NEVER invents: a fact the import did not capture renders as a blank
// or an ×, not as a guess.

import type { DailyItineraryContext, DailyItineraryDay } from './templates/ats-daily-itinerary'

/** The reverse of the importer's OVERNIGHT map — city back to the label the
 *  office writes in the 宿泊地 column. */
const CITY_JA: Record<string, string> = {
  Cairo: 'カイロ',
  Giza: 'ギザ',
  Aswan: 'アスワン',
  Luxor: 'ルクソール',
  'Abu Simbel': 'アブ・シンベル',
  Hurghada: 'ハルガダ',
  'Bahariya Oasis': 'バハレヤオアシス',
  Alexandria: 'アレキサンドリア',
  'Dead Sea': '死海',
  Petra: 'ペトラ',
  Amman: 'アンマン',
}

const KIND_JA: Record<string, string> = {
  cruise: '船中泊',
  flight: '機中泊',
  train: '列車泊',
  vehicle: '車中泊',
}

export interface SourceProgramDay {
  day: number
  description: string | null
  attractions: string[] | null
  meals: string[] | null
  meals_in_flight?: string[] | null
  menu?: { breakfast?: string; lunch?: string; dinner?: string } | null
  overnight_city: string | null
  overnight_kind?: string | null
  is_cruise_day?: boolean
}

function overnightLabel(day: SourceProgramDay): string {
  // Nights not spent in a bed ashore carry their kind, exactly as the office
  // writes them. Older rows imported before overnight_kind was stored fall
  // back to what can be said without guessing.
  const kind = day.overnight_kind ?? (day.is_cruise_day ? 'cruise' : null)
  if (kind && kind !== 'hotel' && KIND_JA[kind]) return KIND_JA[kind]
  if (day.overnight_city) return CITY_JA[day.overnight_city] ?? day.overnight_city
  return ''
}

function mealSlot(day: SourceProgramDay, slot: 'breakfast' | 'lunch' | 'dinner'): string {
  const dish = day.menu?.[slot]
  if (dish) return dish
  if (day.meals?.includes(slot)) return '〇'
  if (day.meals_in_flight?.includes(slot)) return '機内'
  return '×'
}

export interface OrgBranding {
  name: string | null
  logo_url: string | null
  company_phone: string | null
  contact_email: string | null
  company_website: string | null
  company_address: string | null
  document_contacts: Record<string, string> | null
}

export interface AssembleProgramInput {
  template_code: string
  itinerary: SourceProgramDay[] | null
  created_date: string
  font_face_css: string
  org: OrgBranding | null
}

export function assembleProgramItinerary(input: AssembleProgramInput): DailyItineraryContext {
  const days = [...(input.itinerary ?? [])].sort((a, b) => (a.day ?? 0) - (b.day ?? 0))

  const contextDays: DailyItineraryDay[] = days.map(day => ({
    day: day.day,
    overnight_label: overnightLabel(day),
    schedule_lines: String(day.description ?? '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean),
    attractions: (day.attractions ?? []).map(a => String(a).trim()).filter(Boolean),
    meals: {
      breakfast: mealSlot(day, 'breakfast'),
      lunch: mealSlot(day, 'lunch'),
      dinner: mealSlot(day, 'dinner'),
    },
  }))

  // One blank 利用ホテル line per distinct hotel city — the hotels themselves
  // are assigned per departure, so the rows are there to be filled, not filled
  // in here.
  const hotelCities = new Set(
    days
      .filter(d => (d.overnight_kind ?? 'hotel') === 'hotel' && d.overnight_city)
      .map(d => d.overnight_city as string)
  )

  const org = input.org
  const contacts = org?.document_contacts ?? {}

  return {
    program_code: input.template_code,
    created_date: input.created_date,
    days: contextDays,
    hotel_row_count: Math.max(hotelCities.size, 1),
    font_face_css: input.font_face_css,
    letterhead: {
      logo_url: org?.logo_url ?? null,
      company_name: org?.name ?? '',
      lines: [
        org?.company_address,
        [org?.company_phone, org?.contact_email].filter(Boolean).join(' · '),
        org?.company_website,
      ]
        .map(l => (l ?? '').trim())
        .filter(Boolean),
    },
    office_contacts: {
      cairo_guide: contacts.cairo_guide ?? '',
      south_guide: contacts.south_guide ?? '',
      emergency_japan: contacts.emergency_japan ?? '',
      cairo_office: contacts.cairo_office ?? '',
    },
  }
}
