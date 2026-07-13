import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/clients?userId=xxx&search=xxx&limit=100&page=1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = sanitizeSearchTerm(searchParams.get('search'))
    // Clamp the caller-supplied limit to a sane range so a huge `?limit=` can't
    // be used to extract the whole table / exhaust memory. Default 50, max 200.
    // Callers that need the full set walk `?page=` (lib/fetch-all-pages.ts).
    const requestedLimit = parseInt(searchParams.get('limit') || '50')
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50
    const requestedPage = parseInt(searchParams.get('page') || '1')
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1
    const from = (page - 1) * limit

    let query = supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone, status, nationality, preferred_language, internal_notes')
      // Secondary sort on id keeps page boundaries stable when names tie.
      .order('first_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + limit - 1)

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: clients, error } = await query

    if (error) {
      throw error
    }

    // Transform to include combined name field
    const transformedClients = (clients || []).map(client => ({
      id: client.id,
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      email: client.email,
      phone: client.phone,
      status: client.status,
      nationality: client.nationality,
      preferred_language: client.preferred_language,
      internal_notes: client.internal_notes
    }))

    return NextResponse.json({ clients: transformedClients })

  } catch (error: any) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST /api/clients - Create new client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.first_name) {
      return NextResponse.json(
        { success: false, error: 'First name is required' },
        { status: 400 }
      )
    }

    // Create client
    const clientData = {
      first_name: body.first_name,
      last_name: body.last_name || body.first_name,
      email: body.email || null,
      phone: body.phone || null,
      nationality: body.nationality || 'Unknown',
      status: body.status || 'prospect',
      client_type: body.client_type || 'individual',
      passport_type: body.passport_type || 'other',
      preferred_language: body.preferred_language || 'English',
      client_source: body.client_source || 'whatsapp',
      vip_status: body.vip_status || false
    }

    console.log('📝 Creating client:', clientData)

    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert(clientData)
      .select()
      .single()

    if (clientError) {
      console.error('❌ Client insert error:', clientError)
      return NextResponse.json(
        { success: false, error: clientMessage(clientError, 'Internal server error') },
        { status: 500 }
      )
    }

    console.log('✅ Client created:', newClient.id)

    // Save preferences if provided
    if (body.preferences) {
      try {
        await supabase
          .from('client_preferences')
          .insert({
            client_id: newClient.id,
            preferred_accommodation_type: body.preferences.accommodation_type || '3-star',
            tour_pace_preference: body.preferences.tour_pace || 'moderate',
            interests: body.preferences.interests || '',
            special_needs: body.preferences.special_needs || null,
            preferred_tier: body.preferences.tier || 'standard'
          })
        console.log('✅ Client preferences saved')
      } catch (e) {
        console.warn('⚠️ Could not save preferences:', e)
      }
    }

    // Save note if provided
    if (body.note) {
      try {
        await supabase
          .from('client_notes')
          .insert({
            client_id: newClient.id,
            note_text: body.note,
            note_type: 'general',
            is_internal: true
          })
        console.log('✅ Client note saved')
      } catch (e) {
        console.warn('⚠️ Could not save note:', e)
      }
    }

    // Link WhatsApp conversation if phone provided
    if (body.link_whatsapp_phone) {
      try {
        await supabase
          .from('whatsapp_conversations')
          .update({
            client_id: newClient.id,
            client_name: `${clientData.first_name} ${clientData.last_name}`.trim()
          })
          .eq('phone_number', body.link_whatsapp_phone)
        console.log('✅ WhatsApp conversation linked')
      } catch (e) {
        console.warn('⚠️ Could not link WhatsApp:', e)
      }
    }

    return NextResponse.json({
      success: true,
      data: newClient
    }, { status: 201 })

  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to create client') },
      { status: 500 }
    )
  }
}