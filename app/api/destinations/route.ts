import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// GET — the destinations and their cities
// ============================================
// The vocabulary behind every city dropdown (docs/plans/multi-destination.md
// Phase 1). Until migration 20260827_destinations is applied this returns
// success with an empty list, and the client hook falls back to the
// hardcoded Egypt vocabulary — deploy-safe in either order.
export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data: destinations, error } = await supabaseAdmin
      .from('destinations')
      .select('id, country_code, name, name_ja, is_default, destination_cities(id, name, name_ja, aliases, lat, lng, airport_codes, timezone, sort_order, is_active)')
      .eq('is_active', true)
      .order('name')

    if (error) {
      // Table absent = migration not applied yet. An empty answer, not a 500:
      // the dropdowns have a fallback and the page must keep working.
      if (/destinations/.test(error.message) && /find|exist|relation/.test(error.message)) {
        return NextResponse.json({ success: true, data: [] })
      }
      throw error
    }

    const shaped = (destinations ?? []).map(d => ({
      id: d.id,
      country_code: d.country_code,
      name: d.name,
      name_ja: d.name_ja,
      is_default: d.is_default,
      cities: (d.destination_cities ?? [])
        .filter((c: { is_active: boolean }) => c.is_active)
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
    }))

    return NextResponse.json({ success: true, data: shaped })
  } catch (error) {
    console.error('GET destinations error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load destinations' }, { status: 500 })
  }
}
