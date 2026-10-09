import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { templateAccess, visibleToOrg } from '@/lib/templates/template-scope'

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', id)
      .or(visibleToOrg(orgId))
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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json()
    const { name, description, category, subcategory, channel, subject, body: templateBody, language } = body

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
    if (language !== undefined) updateData.language = language === 'ja' ? 'ja' : 'en'
    if (templateBody !== undefined) {
      updateData.body = templateBody
      updateData.placeholders = placeholders
    }

    // An org edits its own templates. A shared default is never changed in
    // place — every org sends it — so the edit is saved as this org's copy,
    // which replaces the default in its list (lib/templates/template-scope).
    const { data: current } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    const access = templateAccess(current, orgId)
    if (access === 'none') {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    // A default this org already copied: edit that copy, never a second one.
    const { data: existingCopy } = access === 'shared'
      ? await supabase
          .from('message_templates')
          .select('id')
          .eq('org_id', orgId)
          .eq('source_template_id', id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
      : { data: null }
    const ownId = access === 'own' ? id : existingCopy?.id ?? null

    const { data, error } = ownId
      ? await supabase
          .from('message_templates')
          .update(updateData)
          .eq('id', ownId)
          .eq('org_id', orgId)
          .select()
          .single()
      : await supabase
          .from('message_templates')
          .insert({
            name: current.name,
            description: current.description,
            category: current.category,
            subcategory: current.subcategory,
            channel: current.channel,
            subject: current.subject,
            body: current.body,
            language: current.language,
            placeholders: current.placeholders,
            ...updateData,
            is_active: true,
            org_id: orgId,
            source_template_id: current.id,
            created_by: await getCurrentUserId(),
          })
          .select()
          .single()

    if (error?.code === '23505') {
      return NextResponse.json({ success: false, error: 'Your organization already has a template with this name, channel and language' }, { status: 409 })
    }
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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    // Only the org's own template. A shared default stays on for every other
    // organization; it cannot be switched off from one.
    const { data: deleted, error } = await supabase
      .from('message_templates')
      .update({ is_active: false })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')
      .maybeSingle()

    if (!error && !deleted) {
      return NextResponse.json({ success: false, error: 'Only your organization\'s own templates can be deleted' }, { status: 403 })
    }

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