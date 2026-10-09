import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { visibleToOrg, withOrgCopies } from '@/lib/templates/template-scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // The signed-in user, never a ?userId= from the request.
    const userId = await getCurrentUserId()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') // 'customer', 'partner', 'internal', or 'all'

    // Fetch from message_templates (new templates)
    let query = supabase
      .from('message_templates')
      .select('*')
      .eq('is_active', true)
      .or(visibleToOrg(orgId))
      .order('category')
      .order('subcategory')
      .order('name')

    // Filter by category if specified
    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data: messageTemplates, error: msgError } = await query

    if (msgError) {
      console.error('Error fetching message_templates:', msgError)
    }

    // Also fetch from email_templates (legacy templates) if table exists
    let legacyTemplates: any[] = []
    try {
      // Legacy templates are per user (email_templates.user_id): only the
      // signed-in user's own — this listed every user's, across orgs.
      const { data: legacy, error: legacyError } = userId
        ? await supabase
            .from('email_templates')
            .select('*')
            .eq('user_id', userId)
            .order('name')
        : { data: [], error: null }

      if (!legacyError && legacy) {
        legacyTemplates = legacy
      }
    } catch (e) {
      // email_templates table might not exist, that's okay
      console.log('Legacy email_templates table not found, using message_templates only')
    }

    // Transform message_templates to match the expected format
    const transformedMessageTemplates = withOrgCopies((messageTemplates || []) as any[], orgId).map(template => ({
      id: template.id,
      name: template.name,
      subject: template.subject || '',
      content: template.body, // body → content
      category: template.category,
      subcategory: template.subcategory,
      description: template.description,
      channel: template.channel,
      // The inbox shows one language at a time; without this every Japanese
      // twin was read as English and listed beside its original.
      language: template.language,
      placeholders: template.placeholders,
      // Add a flag to identify source
      source: 'message_templates'
    }))

    // Transform legacy templates
    const transformedLegacyTemplates = legacyTemplates.map(template => ({
      ...template,
      source: 'email_templates'
    }))

    // Merge both sources (new templates first)
    const allTemplates = [...transformedMessageTemplates, ...transformedLegacyTemplates]

    return NextResponse.json({ 
      success: true, 
      templates: allTemplates 
    })

  } catch (error) {
    console.error('Email templates GET error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      templates: [] 
    }, { status: 500 })
  }
}

// POST - Create new template (saves to message_templates)
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const userId = await getCurrentUserId()
    const body = await request.json()
    const { name, subject, content, category } = body

    if (!name || !content) {
      return NextResponse.json({ 
        success: false, 
        error: 'Name and content are required' 
      }, { status: 400 })
    }

    // Extract placeholders from content
    const placeholderMatches = content.match(/\{\{[^}]+\}\}/g) || []
    const placeholders = [...new Set(placeholderMatches)]

    const { data, error } = await supabase
      .from('message_templates')
      .insert({
        name,
        subject,
        body: content,
        category: category || 'customer',
        channel: 'email',
        placeholders,
        is_active: true,
        created_by: userId,
        org_id: orgId,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create template' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      template: {
        id: data.id,
        name: data.name,
        subject: data.subject,
        content: data.body,
        category: data.category,
      }
    })

  } catch (error) {
    console.error('Email templates POST error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}