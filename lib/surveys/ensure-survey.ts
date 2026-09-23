// ============================================
// Guest survey — get-or-create for an itinerary
// ============================================
// One survey (one token) per itinerary. Both paths use this: the PDF route
// (which may create the survey BEFORE the trip ends, so the printed QR works)
// and the daily cron (which creates it if nobody has, then sends). Creating the
// row and SENDING the invite are separate — a sheet printed early must not stop
// the auto-send — so callers check the returned status.

import { randomBytes } from 'node:crypto'

export interface SurveyItinerary {
  id: string
  org_id: string
  itinerary_code?: string | null
  client_name?: string | null
  trip_name?: string | null
  start_date?: string | null
  end_date?: string | null
}

export interface EnsuredSurvey {
  id: string
  token: string
  status: 'pending' | 'sent' | 'submitted'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function ensureSurvey(db: any, itinerary: SurveyItinerary): Promise<EnsuredSurvey> {
  const existing = await db
    .from('guest_surveys')
    .select('id, token, status')
    .eq('itinerary_id', itinerary.id)
    .maybeSingle()
  if (existing.data) return existing.data as EnsuredSurvey

  const token = randomBytes(24).toString('base64url')
  const trip_snapshot = {
    trip_name: itinerary.trip_name ?? null,
    tour_code: itinerary.itinerary_code ?? null,
    start_date: itinerary.start_date ?? null,
    end_date: itinerary.end_date ?? null,
    client_name: itinerary.client_name ?? null,
  }
  const inserted = await db
    .from('guest_surveys')
    .insert({ org_id: itinerary.org_id, itinerary_id: itinerary.id, token, language: 'ja', status: 'pending', trip_snapshot })
    .select('id, token, status')
    .maybeSingle()
  if (inserted.data) return inserted.data as EnsuredSurvey

  // Lost a race on the unique index — the row now exists; read it back.
  const retry = await db.from('guest_surveys').select('id, token, status').eq('itinerary_id', itinerary.id).maybeSingle()
  if (retry.data) return retry.data as EnsuredSurvey
  throw new Error(inserted.error?.message || 'Could not create survey')
}
