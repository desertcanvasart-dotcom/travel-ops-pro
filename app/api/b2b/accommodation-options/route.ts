// ============================================
// GET /api/b2b/accommodation-options
//   ?kind=hotel&city=Cairo&tier=standard
//   ?kind=cruise&tier=standard[&embark=Luxor][&nights=4]
// ============================================
// The hotels (or ships) a programme stay can use at a tier, in the order the
// pricing engine reads them — the first is the one it picks when the day has
// no choice, so the day editor can show "Automatic: <that hotel>" and offer
// the rest. Same list as the engine: lib/pricing/property-candidates.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { cruiseCandidates, hotelCandidates } from '@/lib/pricing/property-candidates'
import { supplementsForRow } from '@/lib/rates/supplements'

export const dynamic = 'force-dynamic'

export interface AccommodationOption {
  id: string
  name: string
  city: string | null
  tier: string | null
  /** Cruises: "Luxor → Aswan". */
  route: string | null
  nights: number | null
  /** The supplements this property carries — the only ones a day can ask for. */
  supplements: { key: string; name: string }[]
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const kind = params.get('kind')
  const tier = (params.get('tier') ?? '').trim()
  if ((kind !== 'hotel' && kind !== 'cruise') || !tier) {
    return NextResponse.json({ success: false, error: 'kind (hotel|cruise) and tier are required' }, { status: 400 })
  }
  const city = (params.get('city') ?? '').trim()
  if (kind === 'hotel' && !city) {
    return NextResponse.json({ success: false, error: 'city is required for hotels' }, { status: 400 })
  }

  try {
    const db = createServerClient()
    const rows = kind === 'hotel'
      ? await hotelCandidates(db, city, tier)
      : await cruiseCandidates(db, tier, params.get('embark'), Number(params.get('nights')) || null)

    const options: AccommodationOption[] = rows.map(r => ({
      id: String(r.id),
      name: String((kind === 'hotel' ? r.property_name : r.ship_name) ?? ''),
      city: r.city ? String(r.city) : null,
      tier: r.tier ? String(r.tier) : null,
      route: kind === 'cruise' && r.embark_city ? `${r.embark_city} → ${r.disembark_city ?? ''}`.trim() : null,
      nights: kind === 'cruise' && Number(r.duration_nights) > 0 ? Number(r.duration_nights) : null,
      supplements: supplementsForRow(r),
    }))

    return NextResponse.json({ success: true, options, auto_id: options[0]?.id ?? null })
  } catch (error) {
    console.error('[accommodation-options] failed:', error)
    return NextResponse.json({ success: false, error: 'Could not load options' }, { status: 500 })
  }
}
