// ============================================
// DELETE /api/portal/[token]/travellers/[id]/documents/[docId]
// ============================================
// The traveller removing something they attached — a wrong page, the wrong
// person's passport, a duplicate. Same gate as the upload, plus the document
// must belong to THIS traveller: a valid token must not be able to delete a
// row by id alone.
//
// Deletes the object as well as the row. This is the one place a hard delete is
// right: the traveller is asking us to stop holding their passport, and the
// retention story is meaningless if "delete" only hides it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { portalVerifyCookieName } from '@/lib/booking-portal'
import { travellerWriteContext } from '@/lib/portal/traveller-gate'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string; docId: string }> }
) {
  const { token, id, docId } = await params

  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  const db = admin()
  const gate = await travellerWriteContext(db, {
    token,
    passengerId: id,
    cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
  })
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  // Scoped by passenger_id as well as id — the id alone is not authority.
  const { data: doc } = await db
    .from('booking_passenger_documents')
    .select('id, storage_path')
    .eq('id', docId)
    .eq('passenger_id', id)
    .is('purged_at', null)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error: removeError } = await db.storage
    .from(TRAVELLER_DOCS_BUCKET)
    .remove([doc.storage_path])

  // If the object could not be removed, keep the row: an orphaned file that
  // nothing points at would never be purged, and the traveller would have been
  // told it was gone.
  if (removeError) {
    console.error('[portal] document object delete failed:', removeError.message)
    return NextResponse.json({ error: '削除に失敗しました。' }, { status: 500 })
  }

  await db.from('booking_passenger_documents').delete().eq('id', doc.id)

  return NextResponse.json({ success: true })
}
