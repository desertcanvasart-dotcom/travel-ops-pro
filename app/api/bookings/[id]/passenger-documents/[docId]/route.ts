// ============================================
// GET / DELETE /api/bookings/[id]/passenger-documents/[docId]
// ============================================
// The operator opening a traveller's passport scan, or destroying it early.
//
// The bucket is private, so this route is the only way to the object and it
// checks three things first: the caller's org, that the document belongs to a
// booking in that org, and the caller's role. A passport scan is not ordinary
// booking data — 'viewer' and 'agent' can see a manifest without needing the
// image of the document behind it, so reads are manager and above.
//
// The signed URL is short-lived and single-purpose. It is never stored, never
// logged, and never returned in a list response.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'

const SIGNED_URL_TTL_SECONDS = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** The document, proven to belong to a booking in this org. */
async function ownedDocument(orgId: string, bookingId: string, docId: string) {
  const { data } = await admin()
    .from('booking_passenger_documents')
    .select('id, storage_path, mime_type, original_filename, purged_at')
    .eq('id', docId)
    .eq('booking_id', bookingId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, docId } = await params
    const doc = await ownedDocument(orgId, id, docId)

    // A purged row keeps its metadata as the record that we HELD something and
    // destroyed it on schedule. The object is gone, and saying so plainly beats
    // a generic 404 that reads like a bug.
    if (doc?.purged_at) {
      return NextResponse.json(
        { error: 'This document was deleted under the retention policy.', purgedAt: doc.purged_at },
        { status: 410 }
      )
    }
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const { data, error } = await admin().storage
      .from(TRAVELLER_DOCS_BUCKET)
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS)

    if (error || !data?.signedUrl) {
      console.error('Failed to sign traveller document URL:', error?.message)
      return NextResponse.json({ error: 'Could not access document' }, { status: 500 })
    }

    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    console.error('Error in passenger-documents GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, docId } = await params
    const doc = await ownedDocument(orgId, id, docId)
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    if (!doc.purged_at) {
      const { error } = await admin().storage
        .from(TRAVELLER_DOCS_BUCKET)
        .remove([doc.storage_path])
      // Keep the row if the object survived: a file nothing points at would
      // never be purged and never be found again.
      if (error) {
        console.error('Failed to remove traveller document object:', error.message)
        return NextResponse.json({ error: 'Could not delete document' }, { status: 500 })
      }
    }

    await admin().from('booking_passenger_documents').delete().eq('id', doc.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in passenger-documents DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
