import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import {
  parsePartnerInput, nextPartnerCode, isUniqueViolation, partnerCodeTaken, partnerStats,
} from '@/lib/b2b/partners'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B PARTNERS API
// File: app/api/b2b/partners/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = sanitizeSearchTerm(searchParams.get('search'))
    const active_only = searchParams.get('active_only') !== 'false'

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    let query = supabaseAdmin
      .from('b2b_partners')
      .select('*')
      .eq('org_id', orgId)
      .order('company_name')

    if (active_only) {
      query = query.eq('is_active', true)
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,partner_code.ilike.%${search}%,contact_name.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching partners:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // The page's tiles count every partner of the company, whatever the list
    // is filtered to (a failed count only leaves the tiles out).
    const { data: all } = await supabaseAdmin
      .from('b2b_partners')
      .select('is_active, country, default_margin_percent')
      .eq('org_id', orgId)

    return NextResponse.json({ success: true, data: data || [], counts: all ? partnerStats(all) : null })
  } catch (error: any) {
    console.error('Error in GET /api/b2b/partners:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const parsed = parsePartnerInput(body, 'create')
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // The company's codes, any case: a typed code that matches one is refused
    // by name, and a generated one is picked from the free numbers.
    const takenCodes = async () => {
      const { data } = await supabaseAdmin.from('b2b_partners').select('partner_code').eq('org_id', orgId)
      return ((data ?? []) as { partner_code: string }[]).map(r => r.partner_code)
    }
    const typed = typeof parsed.data.partner_code === 'string' ? parsed.data.partner_code : null
    if (typed && (await takenCodes()).some(c => c.toUpperCase() === typed.toUpperCase())) {
      return NextResponse.json({ success: false, error: partnerCodeTaken(typed) }, { status: 409 })
    }

    // Only the allowlisted columns, stamped with the owner. A body org_id (or
    // id, created_by, ...) is never read, so a partner cannot be created into
    // another organisation.
    // A generated code is retried: two requests picking the same free number
    // meet at the (org_id, partner_code) unique key, and the loser tries again.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = typed ?? nextPartnerCode(parsed.data.company_name, await takenCodes())
      const { data, error } = await supabaseAdmin
        .from('b2b_partners')
        .insert({ ...parsed.data, partner_code: code, org_id: orgId })
        .select()
        .single()

      if (!error) return NextResponse.json({ success: true, data }, { status: 201 })
      if (isUniqueViolation(error)) {
        if (typed) return NextResponse.json({ success: false, error: partnerCodeTaken(typed) }, { status: 409 })
        continue
      }
      console.error('Error creating partner:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }
    return NextResponse.json({ success: false, error: 'Could not generate a free partner code. Enter one and try again.' }, { status: 409 })
  } catch (error: any) {
    console.error('Error in POST /api/b2b/partners:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
