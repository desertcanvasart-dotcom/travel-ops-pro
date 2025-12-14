// =====================================================
// PROMPT TEMPLATES API
// =====================================================
// 📁 COPY TO: app/api/content-library/prompts/route.ts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const VALID_PURPOSES = [
  'itinerary_full',
  'day_description',
  'site_description',
  'transfer',
  'email',
  'summary',
  'whatsapp'
]

// Helper to create Supabase client
async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

// GET - List prompt templates
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    
    // Parse filters
    const purpose = searchParams.get('purpose')
    const activeOnly = searchParams.get('active_only') !== 'false'
    const defaultOnly = searchParams.get('default_only') === 'true'

    let query = supabase
      .from('prompt_templates')
      .select('*')
      .order('purpose', { ascending: true })
      .order('name', { ascending: true })

    // Apply filters
    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (purpose && VALID_PURPOSES.includes(purpose)) {
      query = query.eq('purpose', purpose)
    }

    if (defaultOnly) {
      query = query.eq('is_default', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching prompt templates:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Prompts GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new prompt template
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      purpose,
      description,
      system_prompt,
      user_prompt_template,
      variables,
      model,
      temperature,
      max_tokens,
      is_default
    } = body

    // Validation
    if (!name || !purpose || !user_prompt_template) {
      return NextResponse.json(
        { error: 'name, purpose, and user_prompt_template are required' },
        { status: 400 }
      )
    }

    if (!VALID_PURPOSES.includes(purpose)) {
      return NextResponse.json(
        { error: `Invalid purpose. Must be one of: ${VALID_PURPOSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate temperature
    const finalTemperature = temperature ?? 0.7
    if (finalTemperature < 0 || finalTemperature > 2) {
      return NextResponse.json(
        { error: 'Temperature must be between 0 and 2' },
        { status: 400 }
      )
    }

    // If setting as default, unset other defaults for this purpose
    if (is_default) {
      await supabase
        .from('prompt_templates')
        .update({ is_default: false })
        .eq('purpose', purpose)
        .eq('is_default', true)
    }

    // Extract variables from template if not provided
    let finalVariables = variables
    if (!finalVariables) {
      const matches = user_prompt_template.match(/\{\{(\w+)\}\}/g)
      finalVariables = matches 
        ? [...new Set(matches.map((m: string) => m.replace(/\{\{|\}\}/g, '')))]
        : []
    }

    const { data, error } = await supabase
      .from('prompt_templates')
      .insert({
        name,
        purpose,
        description: description || null,
        system_prompt: system_prompt || null,
        user_prompt_template,
        variables: finalVariables,
        model: model || 'claude-sonnet-4-20250514',
        temperature: finalTemperature,
        max_tokens: max_tokens || 2000,
        is_default: is_default || false,
        created_by: user.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating prompt template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Prompts POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update prompt template
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      )
    }

    // Validate purpose if provided
    if (updates.purpose && !VALID_PURPOSES.includes(updates.purpose)) {
      return NextResponse.json(
        { error: `Invalid purpose. Must be one of: ${VALID_PURPOSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate temperature if provided
    if (updates.temperature !== undefined && (updates.temperature < 0 || updates.temperature > 2)) {
      return NextResponse.json(
        { error: 'Temperature must be between 0 and 2' },
        { status: 400 }
      )
    }

    // Handle default flag
    if (updates.is_default === true) {
      // Get current template to know its purpose
      const { data: current } = await supabase
        .from('prompt_templates')
        .select('purpose')
        .eq('id', id)
        .single()

      if (current) {
        const purpose = updates.purpose || current.purpose
        await supabase
          .from('prompt_templates')
          .update({ is_default: false })
          .eq('purpose', purpose)
          .eq('is_default', true)
          .neq('id', id)
      }
    }

    // Remove fields that shouldn't be updated
    delete updates.created_at
    delete updates.created_by

    // Increment version if content changed
    if (updates.system_prompt || updates.user_prompt_template) {
      const { data: current } = await supabase
        .from('prompt_templates')
        .select('version')
        .eq('id', id)
        .single()
      
      if (current) {
        updates.version = current.version + 1
      }
    }

    const { data, error } = await supabase
      .from('prompt_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating prompt template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Prompts PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete prompt template
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      )
    }

    // Check if it's a default template
    const { data: template } = await supabase
      .from('prompt_templates')
      .select('is_default, purpose')
      .eq('id', id)
      .single()

    if (template?.is_default) {
      return NextResponse.json(
        { error: 'Cannot delete default template. Set another template as default first.' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('prompt_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting prompt template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Prompts DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}