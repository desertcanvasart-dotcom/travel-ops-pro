// ============================================
// INDIVIDUAL ATTRACTION API
// File: app/api/rates/attractions/[id]/route.ts
// 
// Handles GET, PUT, DELETE for single attraction
// Uses entrance_fees table
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createActorAdminClient } from '@/lib/supabase-actor'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabase = createActorAdminClient()

// GET - Fetch single attraction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const language = searchParams.get('language') || 'en'

    const { data, error } = await supabase
      .from('entrance_fees')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('[Attraction API] Error fetching:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'Attraction not found' }, { status: 404 })
    }

    // Merge language version if non-English
    let versionName = null
    let versionNotes = null
    if (language !== 'en') {
      const { data: version } = await supabase
        .from('entrance_fee_versions')
        .select('attraction_name, notes')
        .eq('entrance_fee_id', id)
        .eq('language', language)
        .single()

      if (version) {
        versionName = version.attraction_name
        versionNotes = version.notes
      }
    }

    // Transform for frontend
    const transformed = {
      id: data.id,
      service_code: data.service_code,
      attraction_name: versionName || data.attraction_name,
      city: data.city,
      fee_type: data.fee_type,
      eur_rate: data.eur_rate,
      non_eur_rate: data.non_eur_rate,
      egyptian_rate: data.egyptian_rate,
      student_discount_percentage: data.student_discount_percentage,
      child_discount_percent: data.child_discount_percent,
      season: data.season,
      rate_valid_from: data.rate_valid_from,
      rate_valid_to: data.rate_valid_to,
      category: data.category,
      notes: versionNotes ?? data.notes,
      is_active: data.is_active !== false,
      is_addon: data.is_addon || false,
      is_sellable_extra: data.is_sellable_extra || false,
      addon_note: data.addon_note,
      supplier_id: data.supplier_id,
      // See the list route: this transform predates per-rate-currency and
      // dropped the row's own currency on the way out.
      rate_currency: data.rate_currency ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at
    }

    return NextResponse.json({ success: true, data: transformed })

  } catch (error: any) {
    console.error('[Attraction API] Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT - Update attraction
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const {
      service_code,
      attraction_name,
      city,
      fee_type,
      eur_rate,
      non_eur_rate,
      egyptian_rate,
      student_discount_percentage,
      child_discount_percent,
      season,
      rate_valid_from,
      rate_valid_to,
      category,
      notes,
      is_active,
      is_addon,
      is_sellable_extra,
      addon_note,
      supplier_id,
      language // optional: if non-English, save translatable fields to version table
    } = body

    // If non-English language specified, save translatable fields to version table
    if (language && language !== 'en') {
      // Update non-translatable fields only in base record
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString()
      }

      if (service_code !== undefined) updateData.service_code = service_code
      if (city !== undefined) updateData.city = city
      if (fee_type !== undefined) updateData.fee_type = fee_type
      if (eur_rate !== undefined) updateData.eur_rate = eur_rate
      if (non_eur_rate !== undefined) updateData.non_eur_rate = non_eur_rate
      if (egyptian_rate !== undefined) updateData.egyptian_rate = egyptian_rate
      if (body.rate_currency !== undefined) updateData.rate_currency = body.rate_currency || null
      if (student_discount_percentage !== undefined) updateData.student_discount_percentage = student_discount_percentage
      if (child_discount_percent !== undefined) updateData.child_discount_percent = child_discount_percent
      if (season !== undefined) updateData.season = season
      if (rate_valid_from !== undefined) updateData.rate_valid_from = rate_valid_from
      if (rate_valid_to !== undefined) updateData.rate_valid_to = rate_valid_to
      if (category !== undefined) updateData.category = category
      // Do NOT update attraction_name or notes in base record for non-English
      if (is_active !== undefined) updateData.is_active = is_active
      if (is_addon !== undefined) updateData.is_addon = is_addon
    if (is_sellable_extra !== undefined) updateData.is_sellable_extra = is_sellable_extra
      if (is_sellable_extra !== undefined) updateData.is_sellable_extra = is_sellable_extra
      if (addon_note !== undefined) updateData.addon_note = addon_note
      if (supplier_id !== undefined) updateData.supplier_id = supplier_id || null

      const { data, error } = await supabase
        .from('entrance_fees')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[Attraction API] Error updating base:', error)
        return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
      }

      // Upsert language version for translatable fields
      const { data: existingVersion } = await supabase
        .from('entrance_fee_versions')
        .select('id')
        .eq('entrance_fee_id', id)
        .eq('language', language)
        .single()

      if (existingVersion) {
        const versionUpdate: Record<string, any> = { updated_at: new Date().toISOString() }
        if (attraction_name !== undefined) versionUpdate.attraction_name = attraction_name
        if (notes !== undefined) versionUpdate.notes = notes
        await supabase
          .from('entrance_fee_versions')
          .update(versionUpdate)
          .eq('id', existingVersion.id)
      } else {
        await supabase
          .from('entrance_fee_versions')
          .insert({
            entrance_fee_id: id,
            language,
            attraction_name: attraction_name || null,
            notes: notes || null
          })
      }

      return NextResponse.json({
        success: true,
        data,
        message: `Attraction updated with ${language} version`
      })
    }

    // English or no language: update base record directly (original behavior)
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (service_code !== undefined) updateData.service_code = service_code
    if (attraction_name !== undefined) updateData.attraction_name = attraction_name
    if (city !== undefined) updateData.city = city
    if (fee_type !== undefined) updateData.fee_type = fee_type
    if (eur_rate !== undefined) updateData.eur_rate = eur_rate
    if (non_eur_rate !== undefined) updateData.non_eur_rate = non_eur_rate
    if (egyptian_rate !== undefined) updateData.egyptian_rate = egyptian_rate
      if (body.rate_currency !== undefined) updateData.rate_currency = body.rate_currency || null
    if (student_discount_percentage !== undefined) updateData.student_discount_percentage = student_discount_percentage
    if (child_discount_percent !== undefined) updateData.child_discount_percent = child_discount_percent
    if (season !== undefined) updateData.season = season
    if (rate_valid_from !== undefined) updateData.rate_valid_from = rate_valid_from
    if (rate_valid_to !== undefined) updateData.rate_valid_to = rate_valid_to
    if (category !== undefined) updateData.category = category
    if (notes !== undefined) updateData.notes = notes
    if (is_active !== undefined) updateData.is_active = is_active
    if (is_addon !== undefined) updateData.is_addon = is_addon
    if (is_sellable_extra !== undefined) updateData.is_sellable_extra = is_sellable_extra
    if (addon_note !== undefined) updateData.addon_note = addon_note
    if (supplier_id !== undefined) updateData.supplier_id = supplier_id || null

    const { data, error } = await supabase
      .from('entrance_fees')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Attraction API] Error updating:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Attraction updated successfully'
    })

  } catch (error: any) {
    console.error('[Attraction API] Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE - Delete attraction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // First check if attraction exists
    const { data: existing } = await supabase
      .from('entrance_fees')
      .select('id, attraction_name')
      .eq('id', id)
      .single()
    
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Attraction not found' }, { status: 404 })
    }
    
    // Check if attraction is used in any itinerary services
    const { data: usedIn } = await supabase
      .from('itinerary_services')
      .select('id')
      .ilike('service_name', `%${existing.attraction_name}%`)
      .limit(1)
    
    if (usedIn && usedIn.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Cannot delete: This attraction is used in existing itineraries. Consider deactivating it instead.' 
      }, { status: 400 })
    }
    
    const { error } = await supabase
      .from('entrance_fees')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('[Attraction API] Error deleting:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Attraction deleted successfully'
    })
    
  } catch (error: any) {
    console.error('[Attraction API] Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}