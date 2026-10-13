import { NextRequest, NextResponse } from 'next/server'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'
import { templatePlaceholders } from '@/lib/templates/template-send'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { orgReplacedDefaults, templateSaveFailure, visibleToOrg, withOrgCopies } from '@/lib/templates/template-scope'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all templates
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const channel = searchParams.get('channel')
    const language = searchParams.get('language')
    const search = sanitizeSearchTerm(searchParams.get('search'))

    let query = supabase
      .from('message_templates')
      .select('*')
      .eq('is_active', true)
      // The org's own templates and the shared defaults (lib/templates/template-scope).
      .or(visibleToOrg(orgId))
      .order('category')
      .order('subcategory')
      .order('name')

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (language && language !== 'all') {
      query = query.eq('language', language)
    }

    if (channel && channel !== 'all') {
      if (channel === 'email' || channel === 'whatsapp') {
        query = query.or(`channel.eq.${channel},channel.eq.both`)
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,body.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch templates' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: withOrgCopies(data ?? [], orgId, await orgReplacedDefaults(supabase, orgId)) })
  } catch (error) {
    console.error('Templates GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new template
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { name, description, category, subcategory, channel, subject, body: templateBody, language } = body

    if (!name || !templateBody) {
      return NextResponse.json({ success: false, error: 'Name and body are required' }, { status: 400 })
    }

    // Placeholders from the body and the subject — a subject-only one is
    // still something the sender must fill.
    const placeholders = templatePlaceholders(templateBody, subject)

    const { data, error } = await supabase
      .from('message_templates')
      .insert({
        name,
        description,
        category: category || 'customer',
        subcategory,
        channel: channel || 'email',
        subject,
        body: templateBody,
        language: language === 'ja' ? 'ja' : 'en',
        placeholders,
        is_active: true,
        org_id: orgId,
        created_by: await getCurrentUserId(),
      })
      .select()
      .single()

    // A second template with the same name, channel and language in this
    // org is a 409 the page can show, not a generic 500.
    const failed = templateSaveFailure(error, 'Failed to create template')
    if (failed) {
      if (failed.status === 500) console.error('Error creating template:', error)
      return NextResponse.json({ success: false, error: failed.error }, { status: failed.status })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Templates POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}