import { createClient } from '@supabase/supabase-js'
import { quoteInOrg, quoteNotFound } from '@/lib/b2b/quote-scope'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
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
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT - Update quote
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()
    const body = await request.json()

    // Strip id, org_id and the authorship fields from the update: a caller must
    // not re-home the quote to another org, nor stamp who last touched it. The
    // actor is the signed-in user.
    const { id: _, org_id: _dropOrg, changed_by: _c, last_modified_by: _l, created_by: _cb, ...updates } = body
    const actor = await getCurrentUserId()
    updates.updated_at = new Date().toISOString()
    updates.last_modified_by = actor

    const { data, error } = await supabaseAdmin
      .from('tour_quotes')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) {
      console.error('Error updating quote:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Snapshot the updated state as a new revision (best-effort — never blocks
    // the save). Reason can be supplied by the caller.
    try {
      await supabaseAdmin.rpc('create_quote_revision', {
        p_quote_id: id,
        // Authorship is the signed-in user — never a client-supplied changed_by.
        p_changed_by: actor,
        p_change_reason: body.change_reason ?? 'Quote updated',
      })
    } catch (revErr) {
      console.warn('create_quote_revision failed (non-fatal):', revErr)
    }

    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    console.error('Error in PUT /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE - Delete quote
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()

    const { error } = await supabaseAdmin
      .from('tour_quotes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting quote:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error in DELETE /api/b2b/quotes/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}