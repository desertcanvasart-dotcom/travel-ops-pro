import { NextRequest, NextResponse } from 'next/server'
import { validateRatePayload } from '@/lib/rate-validation'
import { createClient } from '@supabase/supabase-js'

// ============================================
// ENTRANCE FEES API  
// File: app/api/rates/entrance-fees/route.ts
// 
// This endpoint powers the attractions dropdown
// in TourManagerContent.tsx
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const isAddon = searchParams.get('is_addon')
    const activeOnly = searchParams.get('active_only')
    const limit = searchParams.get('limit')
    const search = searchParams.get('search')
    const language = searchParams.get('language') || 'en'

    let query = supabaseAdmin
      .from('entrance_fees')
      .select('*')
      .order('city', { ascending: true })
      .order('attraction_name', { ascending: true })

    // Apply filters
    if (city) query = query.eq('city', city)
    if (category) query = query.eq('category', category)
    if (isAddon === 'true') query = query.eq('is_addon', true)
    if (isAddon === 'false') query = query.eq('is_addon', false)
    if (activeOnly === 'true') query = query.neq('is_active', false) // Include NULL (default = active)
    if (search) query = query.ilike('attraction_name', `%${search}%`)
    if (limit) query = query.limit(parseInt(limit))

    const { data, error } = await query

    if (error) {
      console.error('GET entrance_fees error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Merge language versions for non-English
    let mergedData = data || []
    if (language !== 'en' && data && data.length > 0) {
      const ids = data.map((item: any) => item.id)
      const { data: versions } = await supabaseAdmin
        .from('entrance_fee_versions')
        .select('entrance_fee_id, attraction_name, notes')
        .in('entrance_fee_id', ids)
        .eq('language', language)

      if (versions && versions.length > 0) {
        const versionsMap: Record<string, { attraction_name?: string; notes?: string }> = {}
        for (const v of versions) {
          versionsMap[v.entrance_fee_id] = {
            attraction_name: v.attraction_name,
            notes: v.notes
          }
        }
        mergedData = data.map((item: any) => {
          const version = versionsMap[item.id]
          return version ? {
            ...item,
            attraction_name: version.attraction_name || item.attraction_name,
            notes: version.notes ?? item.notes
          } : item
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: mergedData,
      count: mergedData.length
    })
  } catch (error: any) {
    console.error('GET entrance_fees catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    const newFee = {
      service_code: body.service_code || `ENT-${Date.now().toString(36).toUpperCase()}`,
      attraction_name: body.attraction_name,
      city: body.city || null,
      fee_type: body.fee_type || 'standard',
      eur_rate: parseFloat(body.eur_rate) || 0,
      non_eur_rate: parseFloat(body.non_eur_rate) || 0,
      egyptian_rate: body.egyptian_rate ? parseFloat(body.egyptian_rate) : null,
      student_discount_percentage: body.student_discount_percentage || 50,
      child_discount_percent: body.child_discount_percent || 50,
      season: body.season || 'all_year',
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      category: body.category || null,
      notes: body.notes || null,
      is_active: body.is_active !== false,
      is_addon: body.is_addon === true,
      addon_note: body.addon_note || null,
      supplier_id: body.supplier_id || null
    }

    // Check for existing rate with same natural key
    // Use service_code first (stable across languages), then fall back to name+city
    let existing: any[] | null = null

    if (body.service_code) {
      const { data } = await supabaseAdmin
        .from('entrance_fees')
        .select('id')
        .eq('service_code', body.service_code)
        .limit(1)
      existing = data
    }

    if (!existing?.length) {
      let existingQuery = supabaseAdmin
        .from('entrance_fees')
        .select('id')
        .ilike('attraction_name', newFee.attraction_name)
      if (newFee.city) {
        existingQuery = existingQuery.eq('city', newFee.city)
      } else {
        existingQuery = existingQuery.is('city', null)
      }
      const { data } = await existingQuery.limit(1)
      existing = data
    }

    let data, error
    if (existing?.length) {
      // Update existing record — only update non-translatable fields to protect versions
      const { attraction_name: _name, notes: _notes, ...nonTranslatableFields } = newFee
      const result = await supabaseAdmin
        .from('entrance_fees')
        .update({ ...nonTranslatableFields, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select('*')
        .single()
      data = result.data
      error = result.error
    } else {
      // Insert new record
      const result = await supabaseAdmin
        .from('entrance_fees')
        .insert(newFee)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST entrance_fees error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: !!existing?.length })
  } catch (error: any) {
    console.error('POST entrance_fees catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}