// ============================================
// The 参加申込書, printed from what travellers gave the portal
// ============================================
// One page per traveller on one booking: the portal's 海外旅行参加申込書
// answers (booking_passengers) in the office's paper layout, with the
// passport photo page they uploaded (booking_passenger_documents, private
// bucket) printed in the box where a paper copy used to be glued.
//
// The passport image is read with the service role and inlined — the PDF
// renderer fetches nothing — and only for a caller the route has already
// held to manager and above, the same bar as opening the scan itself.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTemplate } from './registry'
import { orgHasDocumentTemplate } from './org-templates'
import { documentLetterhead, jaDate, BookingConfirmationError } from './booking-confirmation-doc'
import { getJapaneseFontFace } from '@/lib/pdf-fonts-server'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'
import type { OrgBranding } from './assemble-program-itinerary'
import type { ApplicationFormContext, ApplicationFormTraveller } from './templates/ats-application-form'
import type { DocumentPage } from './types'

const SLUG = 'ats-application-form'

/** Image types Chromium draws. HEIC (iPhone) and PDF scans are not among
 *  them; those print a note pointing at the file instead of a blank box. */
const PRINTABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const GENDER_JA: Record<string, string> = { male: '男', female: '女' }

type Passenger = {
  id: string
  first_name: string | null
  last_name: string | null
  family_name_kana: string | null
  given_name_kana: string | null
  family_name_kanji: string | null
  given_name_kanji: string | null
  gender: string | null
  date_of_birth: string | null
  postal_code: string | null
  address: string | null
  address_kana: string | null
  home_phone: string | null
  phone: string | null
  email: string | null
  employer_name: string | null
  emergency_contact_name: string | null
  emergency_contact_relationship: string | null
  emergency_contact_phone: string | null
  passport_number: string | null
  passport_expiry: string | null
  is_lead_passenger: boolean | null
}

const s = (v: string | null | undefined) => (v ?? '').trim()

export async function buildApplicationFormHtml(input: {
  /** Reads the booking and its travellers, scoped to orgId. */
  supabase: SupabaseClient
  /** Service role, for the private passport bucket only. */
  storage: SupabaseClient
  orgId: string
  bookingId: string
  passengerId?: string | null
  staff?: string | null
}): Promise<{ html: string; page: DocumentPage; fileCode: string }> {
  const { supabase, storage, orgId, bookingId } = input

  const template = getTemplate(SLUG)
  if (!template) throw new BookingConfirmationError('Template not found', 404)
  if (!(await orgHasDocumentTemplate(supabase, orgId, SLUG))) {
    throw new BookingConfirmationError('This document is not enabled for your organization', 403)
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_code, itinerary_id, start_date, trip_name')
    .eq('id', bookingId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!booking) throw new BookingConfirmationError('Booking not found', 404)

  const [trip, org, passengers, docs] = await Promise.all([
    supabase
      .from('itineraries')
      .select('itinerary_code, trip_name, start_date, total_days, template_id')
      .eq('id', booking.itinerary_id)
      .eq('org_id', orgId)
      .maybeSingle()
      .then(r => r.data),
    supabase
      .from('organizations')
      .select('name, logo_url, company_phone, contact_email, company_website, company_address, document_contacts, offices')
      .eq('id', orgId)
      .maybeSingle()
      .then(r => r.data as OrgBranding | null),
    (() => {
      let q = supabase
        .from('booking_passengers')
        .select(
          'id, first_name, last_name, family_name_kana, given_name_kana, family_name_kanji, given_name_kanji, gender, date_of_birth, postal_code, address, address_kana, home_phone, phone, email, employer_name, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, passport_number, passport_expiry, is_lead_passenger, created_at'
        )
        .eq('booking_id', bookingId)
        .eq('org_id', orgId)
      if (input.passengerId) q = q.eq('id', input.passengerId)
      return q.order('created_at', { ascending: true }).then(r => (r.data ?? []) as Passenger[])
    })(),
    supabase
      .from('booking_passenger_documents')
      .select('passenger_id, storage_path, mime_type, purged_at, uploaded_at')
      .eq('booking_id', bookingId)
      .eq('org_id', orgId)
      .eq('kind', 'passport')
      .is('purged_at', null)
      .order('uploaded_at', { ascending: false })
      .then(r => r.data ?? []),
  ])

  const programme = trip?.template_id
    ? (
        await supabase
          .from('tour_templates')
          .select('template_code, template_name, duration_days')
          .eq('id', trip.template_id)
          .eq('org_id', orgId)
          .maybeSingle()
      ).data
    : null

  const travellers: ApplicationFormTraveller[] = []
  const ordered = [...passengers].sort((a, b) => Number(!!b.is_lead_passenger) - Number(!!a.is_lead_passenger))
  for (const p of ordered) {
    // Newest passport upload for this traveller.
    const doc = docs.find(d => d.passenger_id === p.id) ?? null
    let image: string | null = null
    let note = ''
    if (doc && PRINTABLE.has(doc.mime_type)) {
      const { data: blob } = await storage.storage.from(TRAVELLER_DOCS_BUCKET).download(doc.storage_path)
      if (blob) image = `data:${doc.mime_type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
      else note = 'パスポート画像を読み込めませんでした。予約画面からファイルを開いてください。'
    } else if (doc) {
      note = '画像形式（PDF・HEIC）のため印刷できません。予約画面からファイルを開いてください。'
    }
    travellers.push({
      family_kana: s(p.family_name_kana),
      given_kana: s(p.given_name_kana),
      family_kanji: s(p.family_name_kanji),
      given_kanji: s(p.given_name_kanji),
      romaji: `${s(p.last_name)} ${s(p.first_name)}`.trim().toUpperCase(),
      gender: GENDER_JA[s(p.gender)] ?? '',
      birth_date: jaDate(p.date_of_birth),
      postal_code: s(p.postal_code),
      address: s(p.address),
      address_kana: s(p.address_kana),
      home_phone: s(p.home_phone),
      mobile: s(p.phone),
      email: s(p.email),
      // The portal asks for 勤務先名称; for a group booking that is the
      // 所属 the paper form asks for.
      affiliation: s(p.employer_name),
      emergency_name: s(p.emergency_contact_name),
      emergency_relationship: s(p.emergency_contact_relationship),
      emergency_phone: s(p.emergency_contact_phone),
      passport_number: s(p.passport_number),
      passport_expiry: jaDate(p.passport_expiry),
      passport_image: image,
      passport_note: note,
    })
  }

  const days = programme?.duration_days ?? trip?.total_days ?? null
  const context: ApplicationFormContext = {
    font_face_css: await getJapaneseFontFace(),
    letterhead: await documentLetterhead(org),
    staff: s(input.staff),
    departure_date: jaDate(trip?.start_date ?? booking.start_date, true),
    tour_code: programme?.template_code ?? trip?.itinerary_code ?? booking.booking_code ?? '',
    days: days ? String(days) : '',
    tour_name: programme?.template_name ?? trip?.trip_name ?? booking.trip_name ?? '',
    travellers,
  }

  return {
    html: template.render(context),
    page: template.page,
    fileCode: booking.booking_code || context.tour_code || 'booking',
  }
}
