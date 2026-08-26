// ============================================
// API: /api/cron/purge-traveller-documents — retention sweep
// ============================================
// Passport scans are the most sensitive thing this system holds, and the
// promise made to the traveller when they upload one is that we do not keep it
// after the trip. This is that promise, executed.
//
// It deletes the OBJECT and keeps the ROW, stamped with purged_at. The row is
// the record that we held a document and destroyed it on schedule — which is
// what you want to be able to show — while the thing that actually matters, the
// image, is gone. The extracted text fields on booking_passengers are
// untouched; the operator still knows the passport number and expiry.
//
// `purge_after` is read, never recomputed. It was stamped at upload from the
// booking's end date precisely so that moving a booking later cannot silently
// extend how long a passport image is retained.
//
// Bearer-auth like the other crons (CRON_SECRET; open when unset, matching
// convention). Registered in lib/cron/scheduler.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'

export const dynamic = 'force-dynamic'

/** Storage removes in batches; a single call with thousands of keys is a
 *  request that can time out halfway and leave you unsure what happened. */
const BATCH = 50

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date().toISOString()

  const { data: due, error } = await supabase
    .from('booking_passenger_documents')
    .select('id, storage_path')
    .is('purged_at', null)
    .not('purge_after', 'is', null)
    .lte('purge_after', now)
    .limit(500)

  if (error) {
    console.error('[cron] purge-traveller-documents query failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = due ?? []
  let purged = 0
  const failures: string[] = []

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: removeError } = await supabase.storage
      .from(TRAVELLER_DOCS_BUCKET)
      .remove(batch.map(r => r.storage_path))

    // Only stamp what was actually destroyed. Marking a row purged while its
    // object survives would hide a passport scan from the next sweep and leave
    // it in the bucket for ever — the exact failure this job exists to prevent.
    if (removeError) {
      console.error('[cron] purge batch failed:', removeError.message)
      failures.push(removeError.message)
      continue
    }

    const { error: stampError } = await supabase
      .from('booking_passenger_documents')
      .update({ purged_at: now })
      .in('id', batch.map(r => r.id))

    if (stampError) {
      console.error('[cron] purge stamp failed:', stampError.message)
      failures.push(stampError.message)
      continue
    }
    purged += batch.length
  }

  const ok = failures.length === 0
  console.log(`[cron] purge-traveller-documents: due=${rows.length} purged=${purged} failures=${failures.length}`)
  return NextResponse.json({ ok, due: rows.length, purged, failures })
}
