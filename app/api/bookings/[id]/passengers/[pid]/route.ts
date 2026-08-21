// ============================================
// PATCH /api/bookings/[id]/passengers/[pid] — operator edits a roster seed
// ============================================
// The coordinator sets each traveller's name, DOB and contact so a private
// link can be gated (name+DOB) and delivered (email/phone). Only these seed
// fields — the passport/medical fields are the traveller's to fill in the
// portal, not the operator's here.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SEED_FIELDS = ['first_name', 'last_name', 'date_of_birth', 'email', 'phone', 'is_lead_passenger'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id, pid } = await params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const f of SEED_FIELDS) {
    if (f in body) updates[f] = f === 'is_lead_passenger' ? Boolean(body[f]) : (body[f] === '' ? null : body[f])
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await admin
    .from('booking_passengers')
    .update(updates)
    .eq('id', pid)
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .select('id, first_name, last_name, date_of_birth, email, phone, is_lead_passenger')
    .maybeSingle()

  if (error) return NextResponse.json({ error: clientMessage(error, 'Could not update traveller') }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Traveller not found on this booking' }, { status: 404 })
  return NextResponse.json({ success: true, traveller: data })
}
