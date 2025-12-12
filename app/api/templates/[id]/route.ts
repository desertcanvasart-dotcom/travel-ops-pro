import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Get single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Template GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, category, subcategory, channel, subject, body: templateBody } = body

    // Extract placeholders from body
    const placeholderMatches = templateBody?.match(/\{\{[^}]+\}\}/g) || []
    const placeholders = [...new Set(placeholderMatches)]

    const updateData: any = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (category !== undefined) updateData.category = category
    if (subcategory !== undefined) updateData.subcategory = subcategory
    if (channel !== undefined) updateData.channel = channel
    if (subject !== undefined) updateData.subject = subject
    if (templateBody !== undefined) {
      updateData.body = templateBody
      updateData.placeholders = placeholders
    }

    const { data, error } = await supabase
      .from('message_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json({ success: false, error: 'Failed to update template' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Template PUT error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete template (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabase
      .from('message_templates')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Template DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}