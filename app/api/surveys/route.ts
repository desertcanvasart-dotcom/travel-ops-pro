// ============================================
// SURVEYS API (staff)
// File: app/api/surveys/route.ts
//
// Lists the org's guest surveys and their responses for the staff results view.
// ============================================

import { NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'

export async function GET() {
  try {
    const auth = await orgAuth()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, org_id } = auth
    if (!supabase || !org_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { data, error } = await supabase
      .from('guest_surveys')
      .select('id, token, status, trip_snapshot, responses, sent_email, sent_whatsapp, sent_at, submitted_at, created_at')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load surveys') }, { status: 500 })
    }
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load surveys') }, { status: 500 })
  }
}
