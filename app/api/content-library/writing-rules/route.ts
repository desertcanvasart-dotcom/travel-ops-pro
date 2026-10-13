// =====================================================
// WRITING RULES API
// =====================================================
// 📁 COPY TO: app/api/content-library/writing-rules/route.ts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { contentSession, destinationInOrg, withoutOwnedColumns } from '@/lib/content-library/session'

// Writing rules are each company's own (20261208): read and written in the
// caller's ACTIVE company only (lib/content-library/session.ts); the AI
// generator reads the same company's (lib/ai/content-library.ts).

const VALID_CATEGORIES = ['tone', 'vocabulary', 'structure', 'formatting', 'brand']
const VALID_RULE_TYPES = ['enforce', 'prefer', 'avoid']
const VALID_APPLIES_TO = ['itinerary', 'email', 'whatsapp', 'all']

// GET - List writing rules
export async function GET(request: NextRequest) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session
    const { searchParams } = new URL(request.url)

    // Parse filters
    const category = searchParams.get('category')
    const ruleType = searchParams.get('rule_type')
    const appliesTo = searchParams.get('applies_to')
    const activeOnly = searchParams.get('active_only') !== 'false'
    const minPriority = searchParams.get('min_priority')
    const forPrompt = searchParams.get('for_prompt') === 'true'

    let query = supabase
      .from('writing_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('priority', { ascending: false })
      .order('name', { ascending: true })

    // Apply filters
    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (category && VALID_CATEGORIES.includes(category)) {
      query = query.eq('category', category)
    }

    if (ruleType && VALID_RULE_TYPES.includes(ruleType)) {
      query = query.eq('rule_type', ruleType)
    }

    if (appliesTo && VALID_APPLIES_TO.includes(appliesTo)) {
      query = query.or(`applies_to.cs.{${appliesTo}},applies_to.cs.{all}`)
    }

    if (minPriority) {
      query = query.gte('priority', parseInt(minPriority))
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching writing rules:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // If for_prompt, format for AI consumption
    if (forPrompt && data) {
      const grouped = {
        enforce: data.filter(r => r.rule_type === 'enforce').map(r => ({
          name: r.name,
          description: r.description,
          examples: r.examples
        })),
        prefer: data.filter(r => r.rule_type === 'prefer').map(r => ({
          name: r.name,
          description: r.description,
          examples: r.examples
        })),
        avoid: data.filter(r => r.rule_type === 'avoid').map(r => ({
          name: r.name,
          description: r.description,
          examples: r.examples
        }))
      }
      return NextResponse.json(grouped)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Writing rules GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new writing rule
export async function POST(request: NextRequest) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId, userId } = session

    const body = await request.json()
    const {
      name,
      category,
      rule_type,
      description,
      examples,
      priority,
      applies_to,
      destination_id
    } = body

    // Validation
    if (!name || !category || !rule_type || !description) {
      return NextResponse.json(
        { error: 'name, category, rule_type, and description are required' },
        { status: 400 }
      )
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!VALID_RULE_TYPES.includes(rule_type)) {
      return NextResponse.json(
        { error: `Invalid rule_type. Must be one of: ${VALID_RULE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate applies_to
    const finalAppliesTo = applies_to || ['all']
    if (!finalAppliesTo.every((a: string) => VALID_APPLIES_TO.includes(a))) {
      return NextResponse.json(
        { error: `Invalid applies_to values. Must be from: ${VALID_APPLIES_TO.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate priority
    const finalPriority = priority ?? 5
    if (finalPriority < 1 || finalPriority > 10) {
      return NextResponse.json(
        { error: 'Priority must be between 1 and 10' },
        { status: 400 }
      )
    }

    if (destination_id && !(await destinationInOrg(supabase, orgId, destination_id))) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('writing_rules')
      .insert({
        org_id: orgId,
        name,
        category,
        rule_type,
        description,
        examples: examples || {},
        priority: finalPriority,
        applies_to: finalAppliesTo,
        destination_id: destination_id || null,
        created_by: userId
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating writing rule:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Writing rules POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update writing rule
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
        { error: 'Rule ID is required' },
        { status: 400 }
      )
    }

    // Validate category if provided
    if (updates.category && !VALID_CATEGORIES.includes(updates.category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate rule_type if provided
    if (updates.rule_type && !VALID_RULE_TYPES.includes(updates.rule_type)) {
      return NextResponse.json(
        { error: `Invalid rule_type. Must be one of: ${VALID_RULE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate priority if provided
    if (updates.priority !== undefined && (updates.priority < 1 || updates.priority > 10)) {
      return NextResponse.json(
        { error: 'Priority must be between 1 and 10' },
        { status: 400 }
      )
    }

    if (updates.destination_id && !(await destinationInOrg(supabase, orgId, updates.destination_id))) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('writing_rules')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (!error && !data) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }
    if (error) {
      console.error('Error updating writing rule:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Writing rules PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete writing rule
export async function DELETE(request: NextRequest) {
  try {
    const session = await contentSession()
    if (session instanceof NextResponse) return session
    const { supabase, orgId } = session

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Rule ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('writing_rules')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting writing rule:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Writing rules DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}