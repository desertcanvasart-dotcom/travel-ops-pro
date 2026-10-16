import { createClient } from '@supabase/supabase-js'
import { quoteInOrg, quoteNotFound } from '@/lib/b2b/quote-scope'
import { getCurrentOrgId, getCurrentUserId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { updateB2bQuote } from '@/lib/b2b/update-quote'
import { deleteQuote } from '@/lib/quotes/delete-quote'
import { bookingsFromQuote, quoteLockReason } from '@/lib/quotes/lock'
import { withEffectiveStatus } from '@/lib/quotes/validity'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()

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
          ...withEffectiveStatus(fallbackData),
          locked: quoteLockReason(fallbackData, await bookingsFromQuote(supabaseAdmin, 'b2b', id)),
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
        ...withEffectiveStatus(data),
        // 'converted' / 'booked': only the notes can change (lib/quotes/lock.ts).
        locked: quoteLockReason(data, await bookingsFromQuote(supabaseAdmin, 'b2b', id)),
        available_languages: Object.keys(versionsMap),
        versions: versionsMap
      }
    })

  } catch (error: any) {
    console.error('Error in GET /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT - Update quote. Only what a person edits — status, client details,
// notes, valid until — and nothing but notes once it is converted or booked
// (lib/b2b/update-quote.ts). The price, the quote number and the conversion
// fields are not the caller's to set.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()
    const body = await request.json().catch(() => ({}))
    const result = await updateB2bQuote(supabaseAdmin, { orgId, id, body, actor: await getCurrentUserId() })
    return NextResponse.json(result.body, { status: result.status })

  } catch (error: any) {
    console.error('Error in PUT /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE - Delete quote. Manager and above (as bulk delete), and refused with
// the reason for a quote that was converted or booked.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()
    return await deleteQuote(supabaseAdmin, { kind: 'b2b', orgId, id, role: await getCurrentUserRole() })

  } catch (error: any) {
    console.error('Error in DELETE /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
