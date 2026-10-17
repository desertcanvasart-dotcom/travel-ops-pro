// =====================================================
// SINGLE CONTENT ITEM API
// =====================================================
// 📁 COPY TO: app/api/content-library/[id]/route.ts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { tierLadderForCurrentOrg } from '@/lib/vocabulary-server'
import { categoryInOrg, contentSession, destinationInOrg, withoutOwnedColumns } from '@/lib/content-library/session'
import { isWrittenVariation, planVariationWrites, type VariationInput } from '@/lib/content-library/variations'

// One content item — the caller's ACTIVE company's, else 404
// (lib/content-library/session.ts).

// GET - Fetch single content item with all details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session
    const { id } = await params

    const { data, error } = await supabase
      .from('content_library')
      .select(`
        *,
        category:content_categories(*),
        variations:content_variations(*),
        created_by_user:user_profiles!content_library_created_by_fkey(id, full_name, email),
        updated_by_user:user_profiles!content_library_updated_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!error && !data) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 })
    }
    if (error) {
      console.error('Error fetching content:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Calculate missing tiers against the agency's own ladder
    const TIERS = await tierLadderForCurrentOrg()
    // Written tiers only (a blank-description row is not a variation).
    const written = (data.variations || []).filter(isWrittenVariation)
    const existingTiers = written.map((v: { tier: string }) => v.tier)
    const enrichedData = {
      ...data,
      variation_count: written.length,
      missing_tiers: TIERS.filter(t => !existingTiers.includes(t))
    }

    return NextResponse.json(enrichedData)
  } catch (error) {
    console.error('Content GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Full update of content item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId, userId } = session
    const { id } = await params

    const body = await request.json()
    const {
      category_id,
      name,
      slug,
      short_description,
      location,
      duration,
      tags,
      metadata,
      is_active,
      variations
    } = body

    if (category_id && !(await categoryInOrg(supabase, orgId, category_id))) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    if (body.destination_id && !(await destinationInOrg(supabase, orgId, body.destination_id))) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    // Update content item
    const { data: content, error: contentError } = await supabase
      .from('content_library')
      .update({
        category_id,
        name,
        slug,
        short_description,
        location,
        duration,
        tags: tags || [],
        metadata: metadata || {},
        // Only when sent: a save that leaves it out must not switch a
        // deactivated item back on.
        ...(typeof is_active === 'boolean' ? { is_active } : {}),
        ...(body.destination_id !== undefined ? { destination_id: body.destination_id || null } : {}),
        updated_by: userId
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (!contentError && !content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 })
    }
    if (contentError) {
      if (contentError.code === '23505') {
        // Slugs are unique per company (20261208), across its categories.
        return NextResponse.json(
          { error: 'Your company already has content with this slug. Change the name or the slug.' },
          { status: 409 }
        )
      }
      console.error('Error updating content:', contentError)
      return NextResponse.json({ error: clientMessage(contentError, 'Internal server error') }, { status: 500 })
    }

    // Update variations if provided — only written tiers are kept, and a
    // tier the editor cleared is removed (lib/content-library/variations.ts).
    // A failed write is an error: it used to be ignored and the save
    // reported success with the variation unchanged.
    if (variations && Array.isArray(variations)) {
      const { data: existingVariations, error: existingError } = await supabase
        .from('content_variations')
        .select('id, tier')
        .eq('content_id', id)
      if (existingError) {
        console.error('Error reading variations:', existingError)
        return NextResponse.json({ error: clientMessage(existingError, 'Could not save the tier variations') }, { status: 500 })
      }

      const plan = planVariationWrites(existingVariations || [], variations as VariationInput[])
      const fields = (v: VariationInput) => ({
        title: v.title || null,
        description: v.description,
        highlights: v.highlights || [],
        inclusions: v.inclusions || [],
        internal_notes: v.internal_notes || null,
        updated_by: userId
      })
      const results = await Promise.all([
        ...plan.update.map(({ id: variationId, variation }) =>
          supabase
            .from('content_variations')
            .update({ ...fields(variation), is_active: variation.is_active ?? true })
            .eq('id', variationId)
            .eq('content_id', id)
        ),
        ...(plan.insert.length > 0
          ? [supabase.from('content_variations').insert(plan.insert.map(v => ({
              content_id: id, tier: v.tier, ...fields(v), created_by: userId
            })))]
          : []),
        ...(plan.remove.length > 0
          ? [supabase.from('content_variations').delete().in('id', plan.remove).eq('content_id', id)]
          : []),
      ])
      const failed = results.find(r => r.error)?.error
      if (failed) {
        console.error('Error saving variations:', failed)
        return NextResponse.json({ error: clientMessage(failed, 'Could not save the tier variations') }, { status: 500 })
      }
    }

    // Fetch updated content with variations
    const { data: updated, error: fetchError } = await supabase
      .from('content_library')
      .select(`
        *,
        category:content_categories(*),
        variations:content_variations(*)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (fetchError) {
      return NextResponse.json(content)
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Content PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Partial update of content item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId, userId } = session
    const { id } = await params

    // Fields that shouldn't be directly updated — the company above all.
    const body = withoutOwnedColumns(await request.json())
    if (body.category_id && !(await categoryInOrg(supabase, orgId, body.category_id))) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    if (body.destination_id && !(await destinationInOrg(supabase, orgId, body.destination_id))) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    // Add updated_by
    body.updated_by = userId

    const { data, error } = await supabase
      .from('content_library')
      .update(body)
      .eq('id', id)
      .eq('org_id', orgId)
      .select(`
        *,
        category:content_categories(*),
        variations:content_variations(*)
      `)
      .maybeSingle()

    if (!error && !data) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 })
    }
    if (error) {
      console.error('Error updating content:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Content PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete content item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session
    const { id } = await params

    // Variations are deleted via CASCADE
    const { error } = await supabase
      .from('content_library')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting content:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Content DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}