import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// Service-role key — anon key + RLS on parent itineraries silently filters
// out the row before the app-layer org check below can run.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Confirm the itinerary belongs to the caller's org. Service versions are
// a grandchild of itineraries, so we gate access via the top-level parent.
async function assertItineraryInOrg(id: string, orgId: string) {
  const { data: parent } = await supabase
    .from('itineraries')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!parent) {
    return NextResponse.json(
      { success: false, error: 'Itinerary not found' },
      { status: 404 }
    )
  }
  return null
}

// GET - Fetch service version for a specific language
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string; lang: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, serviceId, lang } = await params

    if (!['en', 'ja'].includes(lang)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    const parentCheck = await assertItineraryInOrg(id, orgId)
    if (parentCheck) return parentCheck

    const { data, error } = await supabase
      .from('itinerary_service_versions')
      .select('*')
      .eq('itinerary_service_id', serviceId)
      .eq('language', lang)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is OK
      throw error
    }

    return NextResponse.json({
      success: true,
      data: data || null
    })
  } catch (error) {
    console.error('Error fetching service version:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch service version' },
      { status: 500 }
    )
  }
}

// PUT - Upsert (create or update) service version
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string; lang: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, serviceId, lang } = await params
    const body = await request.json()

    if (!['en', 'ja'].includes(lang)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    const parentCheck = await assertItineraryInOrg(id, orgId)
    if (parentCheck) return parentCheck

    // Check if version already exists
    const { data: existing } = await supabase
      .from('itinerary_service_versions')
      .select('id')
      .eq('itinerary_service_id', serviceId)
      .eq('language', lang)
      .single()

    if (existing) {
      // Update existing version
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString()
      }
      if (body.service_name !== undefined) updateData.service_name = body.service_name
      if (body.notes !== undefined) updateData.notes = body.notes

      const { data, error } = await supabase
        .from('itinerary_service_versions')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ success: true, data })
    } else {
      // Insert new version
      const { data, error } = await supabase
        .from('itinerary_service_versions')
        .insert({
          itinerary_service_id: serviceId,
          language: lang,
          service_name: body.service_name || null,
          notes: body.notes || null
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ success: true, data })
    }
  } catch (error) {
    console.error('Error upserting service version:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save service version' },
      { status: 500 }
    )
  }
}
