// =====================================================
// CONTENT CATEGORIES API
// =====================================================
// 📁 COPY TO: app/api/content-library/categories/route.ts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { contentSession, withoutOwnedColumns } from '@/lib/content-library/session'

// Categories are each company's own taxonomy (20261208 gave every company the
// full set): read, created, changed and deleted in the caller's ACTIVE
// company only (lib/content-library/session.ts).

// GET - List all categories (with content counts)
export async function GET(request: NextRequest) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session
    const { searchParams } = new URL(request.url)
    const includeCount = searchParams.get('include_count') === 'true'
    const activeOnly = searchParams.get('active_only') !== 'false'

    let query = supabase
      .from('content_categories')
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: categories, error } = await query

    if (error) {
      console.error('Error fetching categories:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // If counts requested, fetch them
    if (includeCount && categories) {
      const { data: counts, error: countError } = await supabase
        .from('content_library')
        .select('category_id')
        .eq('org_id', orgId)
        .eq('is_active', true)

      if (!countError && counts) {
        const countMap = counts.reduce((acc: Record<string, number>, item) => {
          acc[item.category_id] = (acc[item.category_id] || 0) + 1
          return acc
        }, {})

        const categoriesWithCounts = categories.map(cat => ({
          ...cat,
          content_count: countMap[cat.id] || 0
        }))

        return NextResponse.json(categoriesWithCounts)
      }
    }

    return NextResponse.json(categories)
  } catch (error) {
    console.error('Categories GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new category
export async function POST(request: NextRequest) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session

    const body = await request.json()
    const { name, slug, description, icon, sort_order } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Generate slug if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    const { data, error } = await supabase
      .from('content_categories')
      .insert({
        org_id: orgId,
        name,
        slug: finalSlug,
        description: description || null,
        icon: icon || null,
        sort_order: sort_order || 0
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') { // Unique violation
        return NextResponse.json(
          { error: 'A category with this slug already exists' },
          { status: 409 }
        )
      }
      console.error('Error creating category:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Categories POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update category
export async function PATCH(request: NextRequest) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session

    const body = await request.json()
    const id = body.id
    const updates = withoutOwnedColumns(body)

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('content_categories')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (!error && !data) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A category with this slug already exists' }, { status: 409 })
      }
      console.error('Error updating category:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Categories PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete category
export async function DELETE(request: NextRequest) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      )
    }

    // Check if category has content. Deleting a category CASCADES to its
    // content items, so a count that could not be read must stop the delete
    // — it used to read as "none" (count null) and delete anyway.
    const { count, error: countError } = await supabase
      .from('content_library')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('category_id', id)

    if (countError || count == null) {
      console.error('Error counting category content:', countError)
      return NextResponse.json(
        { error: 'Could not check whether the category is empty — nothing was deleted.' },
        { status: 500 }
      )
    }
    if (count > 0) {
      return NextResponse.json(
        { error: `Cannot delete category with ${count} content items. Move or delete content first.` },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('content_categories')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting category:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Categories DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}