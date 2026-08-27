import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// Admin writes for destinations and their cities
// ============================================
// One route, action-keyed — the settings page is the only caller. Reads for
// dropdowns live in GET /api/destinations. Everything here requires admin.
//
//   { action: 'create_destination', country_code, name, name_ja? }
//   { action: 'update_destination', id, name?, name_ja?, is_active?, is_default? }
//   { action: 'add_city',    destination_id, name, name_ja?, lat?, lng? }
//   { action: 'update_city', id, name?, name_ja?, lat?, lng?, is_active? }
//   { action: 'delete_city', id }   — only a city no rate references by name
//
// City DELETE checks rate references by NAME (rates key city as free text):
// deleting "Luxor" while transportation rates say "Luxor" would strand them
// behind a vocabulary that no longer offers the word. Deactivate instead.
const CITY_RATE_TABLES = [
  'transportation_rates', 'guide_rates', 'meal_rates', 'activity_rates',
  'entrance_fees', 'accommodation_rates',
] as const

export async function POST(request: NextRequest) {
  try {
    const denied = await requireRole(['admin'])
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json().catch(() => null)
    const action = String(body?.action ?? '')

    if (action === 'create_destination') {
      const country_code = String(body.country_code ?? '').trim().toUpperCase()
      const name = String(body.name ?? '').trim()
      if (!/^[A-Z]{2}$/.test(country_code) || !name) {
        return NextResponse.json({ success: false, error: 'A two-letter country code and a name are required' }, { status: 400 })
      }
      const { data, error } = await supabaseAdmin
        .from('destinations')
        .insert({ country_code, name, name_ja: body.name_ja || null })
        .select()
        .single()
      if (error) {
        const friendly = /duplicate|unique/i.test(error.message) ? `${country_code} already exists` : error.message
        return NextResponse.json({ success: false, error: friendly }, { status: 400 })
      }
      return NextResponse.json({ success: true, data })
    }

    if (action === 'update_destination') {
      const id = String(body.id ?? '')
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('name' in body) update.name = String(body.name).trim()
      if ('name_ja' in body) update.name_ja = body.name_ja || null
      if ('is_active' in body) update.is_active = body.is_active === true
      if (body.is_default === true) {
        // Exactly one default: quoting and new itineraries start from it.
        await supabaseAdmin.from('destinations').update({ is_default: false }).eq('is_default', true)
        update.is_default = true
      }
      const { data, error } = await supabaseAdmin.from('destinations').update(update).eq('id', id).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    if (action === 'add_city') {
      const destination_id = String(body.destination_id ?? '')
      const name = String(body.name ?? '').trim()
      if (!destination_id || !name) {
        return NextResponse.json({ success: false, error: 'Destination and city name are required' }, { status: 400 })
      }
      const { data: last } = await supabaseAdmin
        .from('destination_cities')
        .select('sort_order')
        .eq('destination_id', destination_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const { data, error } = await supabaseAdmin
        .from('destination_cities')
        .insert({
          destination_id,
          name,
          name_ja: body.name_ja || null,
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          sort_order: (last?.sort_order ?? 0) + 1,
        })
        .select()
        .single()
      if (error) {
        const friendly = /duplicate|unique/i.test(error.message) ? `"${name}" is already in this destination` : error.message
        return NextResponse.json({ success: false, error: friendly }, { status: 400 })
      }
      return NextResponse.json({ success: true, data })
    }

    if (action === 'update_city') {
      const id = String(body.id ?? '')
      const update: Record<string, unknown> = {}
      if ('name' in body) update.name = String(body.name).trim()
      if ('name_ja' in body) update.name_ja = body.name_ja || null
      if ('lat' in body) update.lat = body.lat ?? null
      if ('lng' in body) update.lng = body.lng ?? null
      if ('is_active' in body) update.is_active = body.is_active === true
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
      }
      const { data, error } = await supabaseAdmin.from('destination_cities').update(update).eq('id', id).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    if (action === 'delete_city') {
      const id = String(body.id ?? '')
      const { data: city } = await supabaseAdmin.from('destination_cities').select('name').eq('id', id).single()
      if (!city) return NextResponse.json({ success: false, error: 'City not found' }, { status: 404 })

      for (const table of CITY_RATE_TABLES) {
        const { count } = await supabaseAdmin
          .from(table)
          .select('id', { count: 'exact', head: true })
          .ilike('city', city.name)
        if ((count ?? 0) > 0) {
          return NextResponse.json(
            { success: false, error: `"${city.name}" is used by ${count} rate(s) in ${table} — deactivate it instead of deleting` },
            { status: 409 }
          )
        }
      }

      const { error } = await supabaseAdmin.from('destination_cities').delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}"` }, { status: 400 })
  } catch (error) {
    console.error('destinations manage error:', error)
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 })
  }
}
