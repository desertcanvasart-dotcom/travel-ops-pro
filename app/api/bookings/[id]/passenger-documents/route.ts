// ============================================
// GET /api/bookings/[id]/passenger-documents
// ============================================
// What each traveller on this booking has attached, for the operator's panel.
//
// Metadata only — never a URL, signed or otherwise. A list is rendered on a
// page and lands in logs and browser history; a passport scan should take a
// deliberate click, which is what the per-document route is for. Same
// manager-and-above gate as opening one, because knowing which travellers have
// sent a passport is already more than an agent needs.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Ownership first: an id from the URL is not authority to read a booking.
    const { data: booking } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const { data: passengers } = await supabase
      .from('booking_passengers')
      .select('id, first_name, last_name, family_name_kanji, given_name_kanji, is_lead_passenger')
      .eq('booking_id', id)
      .order('is_lead_passenger', { ascending: false })

    const { data: docs } = await supabase
      .from('booking_passenger_documents')
      .select('id, passenger_id, kind, label, original_filename, size_bytes, uploaded_at, uploaded_via, purge_after, purged_at')
      .eq('booking_id', id)
      .order('uploaded_at', { ascending: true })

    const byPassenger = new Map<string, any[]>()  // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const d of docs ?? []) {
      const list = byPassenger.get(d.passenger_id) ?? []
      list.push({
        id: d.id,
        kind: d.kind,
        label: d.label,
        filename: d.original_filename,
        sizeBytes: d.size_bytes,
        uploadedAt: d.uploaded_at,
        uploadedVia: d.uploaded_via,
        // When it will be destroyed, so the operator can see the clock before
        // it runs rather than discovering the scan is gone.
        purgeAfter: d.purge_after,
        purgedAt: d.purged_at,
      })
      byPassenger.set(d.passenger_id, list)
    }

    return NextResponse.json({
      success: true,
      travellers: (passengers ?? []).map(p => ({
        id: p.id,
        name: [p.family_name_kanji, p.given_name_kanji].filter(Boolean).join(' ')
          || [p.last_name, p.first_name].filter(Boolean).join(' ')
          || null,
        isLead: p.is_lead_passenger,
        documents: byPassenger.get(p.id) ?? [],
      })),
    })
  } catch (error) {
    console.error('Error in passenger-documents list:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
