import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'

// ============================================
// B2B QUOTES API - Single Quote Operations
// File: app/api/b2b/quotes/[id]/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Single quote by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (
          variation_name, variation_code, tier, group_type,
          inclusions, exclusions,
          tour_templates (
            template_name, template_code, duration_days, duration_nights,
            short_description
          )
        ),
        b2b_partners (company_name, partner_code, contact_name, email),
        itineraries (id, trip_name, itinerary_code, total_days, tier, start_date, end_date)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching quote:', error)
      // If the join fails (e.g. schema cache stale), try without itineraries join
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from('tour_quotes')
        .select(`
          *,
          tour_variations (
            variation_name, variation_code, tier, group_type,
            inclusions, exclusions,
            tour_templates (
              template_name, template_code, duration_days, duration_nights,
              short_description
            )
          ),
          b2b_partners (company_name, partner_code, contact_name, email)
        `)
        .eq('id', id)
        .single()

      if (fallbackError) {
        console.error('Fallback also failed:', fallbackError)
        return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
      }

      // Return data without itineraries join
      const versionsRes = await supabaseAdmin
        .from('quote_versions')
        .select('*')
        .eq('quote_id', id)
      const vMap: Record<string, any> = {}
      if (!versionsRes.error && versionsRes.data) {
        versionsRes.data.forEach(v => { vMap[v.language] = v })
      }
      return NextResponse.json({
        success: true,
        data: {
          ...fallbackData,
          itineraries: null,
          available_languages: Object.keys(vMap),
          versions: vMap
        }
      })
    }

    // Fetch language versions
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('quote_versions')
      .select('*')
      .eq('quote_id', id)

    // Build versions object keyed by language
    const versionsMap: Record<string, any> = {}
    if (!versionsError && versions) {
      versions.forEach(v => {
        versionsMap[v.language] = v
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        available_languages: Object.keys(versionsMap),
        versions: versionsMap
      }
    })

  } catch (error: any) {
    console.error('Error in GET /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load quote') }, { status: 500 })
  }
}

// PUT - Update quote
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Remove id from body if present to avoid conflicts
    const { id: _, ...updates } = body
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating quote:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to update quote') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    console.error('Error in PUT /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to update quote') }, { status: 500 })
  }
}

// DELETE - Delete quote
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('tour_quotes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting quote:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to delete quote') }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error in DELETE /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to delete quote') }, { status: 500 })
  }
}