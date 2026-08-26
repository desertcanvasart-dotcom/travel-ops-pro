// ============================================
// GET / POST /api/portal/[token]/travellers/[id]/documents
// ============================================
// The traveller attaching their passport page, and whatever else they were
// asked for, to their own 海外旅行参加申込書.
//
// This is the only route in the app that accepts a FILE from someone with no
// session, and what it accepts is a passport. Two independent things guard it:
// the portal gate (lib/portal/traveller-gate.ts — token, confirmation cookie,
// link state, passenger scoping, lock) decides WHO may write, and
// lib/portal/traveller-documents.ts decides WHAT may be stored.
//
// The bucket is PRIVATE. Nothing here builds a public URL, and the response
// never contains one — the operator exchanges a row id for a short-lived
// signed URL through an authenticated route. The two buckets this app already
// had are both public, which is exactly why this one is not.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { portalVerifyCookieName } from '@/lib/booking-portal'
import { travellerWriteContext } from '@/lib/portal/traveller-gate'
import {
  TRAVELLER_DOCS_BUCKET,
  MAX_DOCUMENT_BYTES,
  checkUpload,
  documentStorageKey,
  purgeAfterFor,
  REJECTION_MESSAGE_JA,
  type DocumentKind,
} from '@/lib/portal/traveller-documents'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'
import { safeKeySegment } from '@/lib/storage-key'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** What the traveller is allowed to know about their own uploads. Never the
 *  storage path — a key is not for them, and printing it invites someone to
 *  try it against the bucket. */
const publicShape = (row: Record<string, any>) => ({  // eslint-disable-line @typescript-eslint/no-explicit-any
  id: row.id,
  kind: row.kind,
  label: row.label,
  filename: row.original_filename,
  sizeBytes: row.size_bytes,
  uploadedAt: row.uploaded_at,
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params

  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  const db = admin()
  // Listing stays available after the manifest is locked: the traveller should
  // still be able to see what they sent, they just cannot change it.
  const gate = await travellerWriteContext(db, {
    token,
    passengerId: id,
    cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
    requireUnlocked: false,
  })
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const { data } = await db
    .from('booking_passenger_documents')
    .select('id, kind, label, original_filename, size_bytes, uploaded_at')
    .eq('passenger_id', id)
    .is('purged_at', null)
    .order('uploaded_at', { ascending: true })

  return NextResponse.json({
    success: true,
    documents: (data ?? []).map(publicShape),
    locked: Boolean(gate.link.details_locked_at),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params

  // Uploads are heavier than a form save, so they get their own tighter budget
  // rather than sharing the portal allowance.
  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  const db = admin()
  const gate = await travellerWriteContext(db, {
    token,
    passengerId: id,
    cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
  })
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: 'ファイルが選択されていません。' }, { status: 400 })
  }

  const kind: DocumentKind = form.get('kind') === 'passport' ? 'passport' : 'other'
  const rawLabel = String(form.get('label') ?? '').trim().slice(0, 120)

  // Read the size before the bytes: a 2 GB body should be refused on the
  // declared length, not after buffering it.
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: REJECTION_MESSAGE_JA.too_large }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // How many supporting documents this traveller already has, for the cap.
  const { count: otherCount } = await db
    .from('booking_passenger_documents')
    .select('id', { count: 'exact', head: true })
    .eq('passenger_id', id)
    .eq('kind', 'other')
    .is('purged_at', null)

  const verdict = checkUpload(bytes, file.type, {
    kind,
    existingOtherCount: otherCount ?? 0,
  })
  if (!verdict.ok) {
    const status = verdict.reason === 'too_large' ? 413 : verdict.reason === 'too_many' ? 409 : 415
    return NextResponse.json({ error: REJECTION_MESSAGE_JA[verdict.reason] }, { status })
  }

  const storagePath = documentStorageKey({
    bookingId: gate.link.booking_id,
    passengerId: id,
    kind,
    ext: verdict.ext,
    unique: randomUUID(),
  })

  const { error: uploadError } = await db.storage
    .from(TRAVELLER_DOCS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: verdict.type,
      // Never overwrite: the key carries a fresh UUID, so a collision would
      // mean something is wrong, and silently replacing a file is not the
      // behaviour to pick when the file is somebody's passport.
      upsert: false,
    })

  if (uploadError) {
    console.error('[portal] traveller document upload failed:', uploadError.message)
    return NextResponse.json({ error: 'アップロードに失敗しました。時間をおいてお試しください。' }, { status: 500 })
  }

  // The passport is one replaceable slot. Retire the previous row and its
  // object AFTER the new one is safely stored, so a failed upload never leaves
  // the traveller with nothing.
  let replaced: string | null = null
  if (kind === 'passport') {
    const { data: prior } = await db
      .from('booking_passenger_documents')
      .select('id, storage_path')
      .eq('passenger_id', id)
      .eq('kind', 'passport')
      .is('purged_at', null)
      .maybeSingle()
    if (prior) {
      await db.storage.from(TRAVELLER_DOCS_BUCKET).remove([prior.storage_path])
      await db.from('booking_passenger_documents').delete().eq('id', prior.id)
      replaced = prior.id
    }
  }

  const uploadedAt = new Date()
  const { data: row, error: insertError } = await db
    .from('booking_passenger_documents')
    .insert({
      org_id: gate.booking.org_id,
      booking_id: gate.link.booking_id,
      passenger_id: id,
      kind,
      label: kind === 'other' ? (rawLabel || null) : null,
      storage_path: storagePath,
      mime_type: verdict.type,
      size_bytes: bytes.length,
      // Display only — the storage key was built from ids, never from this.
      original_filename: safeKeySegment(file.name, 'document').slice(0, 255),
      uploaded_at: uploadedAt.toISOString(),
      uploaded_via: 'portal',
      purge_after: purgeAfterFor(gate.booking.end_date, uploadedAt),
    })
    .select('id, kind, label, original_filename, size_bytes, uploaded_at')
    .single()

  if (insertError || !row) {
    // The object is stored but unreferenced — remove it rather than leave an
    // orphaned passport scan that no retention job knows about.
    await db.storage.from(TRAVELLER_DOCS_BUCKET).remove([storagePath])
    console.error('[portal] traveller document row insert failed:', insertError?.message)
    return NextResponse.json({ error: 'アップロードに失敗しました。時間をおいてお試しください。' }, { status: 500 })
  }

  return NextResponse.json({ success: true, document: publicShape(row), replaced })
}
