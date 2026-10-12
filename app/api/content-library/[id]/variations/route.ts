// =====================================================
// CONTENT VARIATIONS API
// =====================================================
// 📁 COPY TO: app/api/content-library/[id]/variations/route.ts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { tierLadderForCurrentOrg } from '@/lib/vocabulary-server'
import { contentInOrg, contentSession, withoutOwnedColumns } from '@/lib/content-library/session'

// A valid tier is one on the agency's ladder (Settings → Vocabulary) — read
// per request by tierLadderForCurrentOrg(); this used to be a frozen copy of
// the four presets, which refused every tier the agency added.
//
// A variation belongs to its content item: every handler first checks the
// item is the caller's ACTIVE company's (404 otherwise), and every variation
// query is pinned to that item — a variation_id alone reaches no other
// item's variations.

const notFound = () => NextResponse.json({ error: 'Content item not found' }, { status: 404 })

// GET - List variations for a content item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session
    const { id } = await params
    if (!(await contentInOrg(supabase, orgId, id))) return notFound()
    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier')

    let query = supabase
      .from('content_variations')
      .select('*')
      .eq('content_id', id)
      .order('tier', { ascending: true })

    if (tier && (await tierLadderForCurrentOrg()).includes(tier)) {
      query = query.eq('tier', tier)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching variations:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Sort by tier order
    const tierOrder = { budget: 0, standard: 1, deluxe: 2, luxury: 3 }
    const sortedData = data?.sort((a, b) => 
      (tierOrder[a.tier as keyof typeof tierOrder] || 0) - 
      (tierOrder[b.tier as keyof typeof tierOrder] || 0)
    )

    return NextResponse.json(sortedData)
  } catch (error) {
    console.error('Variations GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new variation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId, userId } = session
    const { id: contentId } = await params
    if (!(await contentInOrg(supabase, orgId, contentId))) return notFound()

    const body = await request.json()
    const { tier, title, description, highlights, inclusions, internal_notes } = body

    // Validation
    const validTiers = await tierLadderForCurrentOrg()
    if (!tier || !validTiers.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      )
    }

    if (!description) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      )
    }

    // Create variation
    const { data, error } = await supabase
      .from('content_variations')
      .insert({
        content_id: contentId,
        tier,
        title: title || null,
        description,
        highlights: highlights || [],
        inclusions: inclusions || [],
        internal_notes: internal_notes || null,
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A ${tier} variation already exists for this content` },
          { status: 409 }
        )
      }
      console.error('Error creating variation:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Variations POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Bulk update/replace all variations
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId, userId } = session
    const { id: contentId } = await params
    if (!(await contentInOrg(supabase, orgId, contentId))) return notFound()

    const body = await request.json()
    const { variations } = body

    if (!Array.isArray(variations)) {
      return NextResponse.json(
        { error: 'variations must be an array' },
        { status: 400 }
      )
    }

    // Validate all variations
    const validTiers = await tierLadderForCurrentOrg()
    for (const v of variations) {
      if (!v.tier || !validTiers.includes(v.tier)) {
        return NextResponse.json(
          { error: `Invalid tier: ${v.tier}` },
          { status: 400 }
        )
      }
      if (!v.description) {
        return NextResponse.json(
          { error: `Description required for ${v.tier} tier` },
          { status: 400 }
        )
      }
    }

    // Check for duplicate tiers in request
    const tiers = variations.map(v => v.tier)
    if (new Set(tiers).size !== tiers.length) {
      return NextResponse.json(
        { error: 'Duplicate tiers in request' },
        { status: 400 }
      )
    }

    // Get existing variations
    const { data: existing } = await supabase
      .from('content_variations')
      .select('id, tier')
      .eq('content_id', contentId)

    const existingMap = new Map(existing?.map(e => [e.tier, e.id]) || [])
    const results = []

    for (const v of variations) {
      const existingId = existingMap.get(v.tier)
      
      if (existingId) {
        // Update existing
        const { data, error } = await supabase
          .from('content_variations')
          .update({
            title: v.title || null,
            description: v.description,
            highlights: v.highlights || [],
            inclusions: v.inclusions || [],
            internal_notes: v.internal_notes || null,
            is_active: v.is_active ?? true,
            updated_by: userId
          })
          .eq('id', existingId)
          .eq('content_id', contentId)
          .select()
          .single()

        if (!error && data) {
          results.push(data)
        }
      } else {
        // Create new
        const { data, error } = await supabase
          .from('content_variations')
          .insert({
            content_id: contentId,
            tier: v.tier,
            title: v.title || null,
            description: v.description,
            highlights: v.highlights || [],
            inclusions: v.inclusions || [],
            internal_notes: v.internal_notes || null,
            created_by: userId,
            updated_by: userId
          })
          .select()
          .single()

        if (!error && data) {
          results.push(data)
        }
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Variations PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update single variation by tier
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId, userId } = session
    const { id: contentId } = await params
    if (!(await contentInOrg(supabase, orgId, contentId))) return notFound()

    const body = await request.json()
    const { tier, variation_id } = body
    const updates = withoutOwnedColumns(body)
    delete updates.tier
    delete updates.variation_id

    if (!tier && !variation_id) {
      return NextResponse.json(
        { error: 'Either tier or variation_id is required' },
        { status: 400 }
      )
    }

    // Remove fields that shouldn't be updated
    delete updates.content_id

    // Add updated_by
    updates.updated_by = userId

    let query = supabase
      .from('content_variations')
      .update(updates)

    query = query.eq('content_id', contentId)
    query = variation_id ? query.eq('id', variation_id) : query.eq('tier', tier)

    const { data, error } = await query.select().maybeSingle()

    if (!error && !data) {
      return NextResponse.json(
        { error: 'Variation not found' },
        { status: 404 }
      )
    }
    if (error) {
      console.error('Error updating variation:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Variations PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete variation(s)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session
    const { id: contentId } = await params
    if (!(await contentInOrg(supabase, orgId, contentId))) return notFound()

    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier')
    const variationId = searchParams.get('variation_id')

    let query = supabase
      .from('content_variations')
      .delete()

    if (variationId) {
      query = query.eq('content_id', contentId).eq('id', variationId)
    } else if (tier) {
      query = query.eq('content_id', contentId).eq('tier', tier)
    } else {
      return NextResponse.json(
        { error: 'Either tier or variation_id query parameter is required' },
        { status: 400 }
      )
    }

    const { error } = await query

    if (error) {
      console.error('Error deleting variation:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Variations DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}