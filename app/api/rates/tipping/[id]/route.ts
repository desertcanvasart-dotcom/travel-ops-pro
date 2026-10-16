// app/api/rates/tipping/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { sanitizeRateUpdate } from '@/lib/rates/update-payload'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { uniqueViolationMessage } from '@/lib/db/unique-violation'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const supabase = createServerClient()
    if (!(await rowInOrg(supabase, 'tipping_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // The form posts its whole state; '' on a uuid column is a 500, and the
    // client must not rewrite id/created_at. See lib/rates/update-payload.ts.
    const clean = sanitizeRateUpdate(body)
    if (!clean.ok) {
      return NextResponse.json(
        { success: false, error: clean.error, violations: clean.violations },
        { status: clean.status }
      )
    }

    const { data, error } = await supabase
      .from('tipping_rates')
      .update(clean.payload)
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ success: false, error: uniqueViolationMessage(error, { subject: 'tipping rate', visibleFields: Object.keys(clean.payload) }) }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const supabase = createServerClient()
    if (!(await rowInOrg(supabase, 'tipping_rates', id, orgId))) return notFoundInOrg('Rate')

    const { error } = await supabase
      .from('tipping_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}