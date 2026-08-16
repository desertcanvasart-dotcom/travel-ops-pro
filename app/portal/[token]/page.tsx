// ============================================
// THE TRAVELLER'S PAGE — public, token-gated
// ============================================
// What A.T.S post today, as a page: the trip, what is owed and by when, the
// documents, and the 海外旅行参加申込書 as a form.
//
// Japanese only, deliberately. Their customers are Japanese travellers, and an
// English fallback on a passport form invites the wrong kind of confidence.
//
// Security shape (see migrations/20260817_booking_portal_links.sql):
//   * Public via the middleware allowlist, but only for a token that resolves
//     to a live link — anything else is a plain 404, indistinguishable from a
//     URL that never existed.
//   * All reads happen HERE, server-side, with the service role. Nothing on
//     this page ships a Supabase client to the browser.
//   * Data crosses the boundary only through toPortalBooking(), an allowlist
//     projection — the cost base, margins and supplier identities cannot cross.
//
// Outside the app shell: no sidebar, no auth chrome. A customer should not see
// the operator's tooling.

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  isValidPortalToken,
  portalLinkState,
  toPortalBooking,
  type PortalBooking,
} from '@/lib/booking-portal'
import { toClientItinerary } from '@/lib/itinerary-share'
import { formatMoney } from '@/lib/currency-totals'
import TravellerForm from './TravellerForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ご旅行の手続き',
  robots: { index: false, follow: false },
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface Operator {
  name: string
  brandHex: string
  email: string | null
  phone: string | null
}

async function resolve(token: string): Promise<{ booking: PortalBooking; operator: Operator } | null> {
  if (!isValidPortalToken(token)) return null
  const supabase = admin()

  const { data: link } = await supabase
    .from('booking_portal_links')
    .select('id, org_id, booking_id, revoked_at, expires_at, details_locked_at, view_count')
    .eq('token', token)
    .maybeSingle()

  if (!portalLinkState(link).usable) return null

  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, booking_code, trip_name, start_date, end_date, num_adults, num_children, currency, total_cost, balance_due, deposit_amount, deposit_paid, payment_deadline, balance_due_date, itinerary_id'
    )
    .eq('id', link!.booking_id)
    .maybeSingle()

  if (!booking) return null

  const { data: passengers } = await supabase
    .from('booking_passengers')
    .select('*')
    .eq('booking_id', booking.id)
    .order('is_lead_passenger', { ascending: false })
    .order('created_at', { ascending: true })

  // The trip itself, through the itinerary-share allowlist rather than a second
  // projection that could drift from it.
  let itinerary = null
  if (booking.itinerary_id) {
    const { data: itin } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', booking.itinerary_id)
      .maybeSingle()
    const { data: days } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', booking.itinerary_id)
      .order('day_number', { ascending: true })
    if (itin) itinerary = toClientItinerary(itin, days ?? [])
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('name, primary_color, contact_email, company_phone')
    .eq('id', link!.org_id)
    .maybeSingle()

  // "Has the traveller looked?" — an engagement signal, not a ledger, so a
  // failure here must never block the page.
  supabase
    .from('booking_portal_links')
    .update({
      view_count: (Number(link!.view_count) || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', link!.id)
    .then(undefined, () => {})

  return {
    booking: toPortalBooking({ booking, passengers: passengers ?? [], link: link!, itinerary }),
    operator: {
      name: org?.name ?? '',
      brandHex: org?.primary_color || '#647C47',
      email: org?.contact_email ?? null,
      phone: org?.company_phone ?? null,
    },
  }
}

const jpDate = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolve(token)
  if (!resolved) notFound()

  const { booking, operator } = resolved
  const { payment } = booking
  const money = (n: number | null) => (n == null ? '—' : formatMoney(n, payment.currency))

  return (
    <main style={{ ['--brand' as string]: operator.brandHex }} className="portal">
      <header className="hd">
        <p className="op">{operator.name}</p>
        <h1>{booking.tripName}</h1>
        <p className="sub">
          {booking.tourCode ? `${booking.tourCode} ・ ` : ''}
          {jpDate(booking.startDate)} 〜 {jpDate(booking.endDate)}
          {' ・ '}
          {booking.numAdults + booking.numChildren}名様
        </p>
        <p className="ref">予約番号 {booking.bookingCode}</p>
      </header>

      {/* ---------------- money ---------------- */}
      <section>
        <h2>お支払いについて</h2>
        <div className="money">
          <div className="row total">
            <span>ご旅行代金</span>
            <b>{money(payment.total)}</b>
          </div>

          {payment.singlePayment ? (
            <div className="row">
              <span>
                お支払い期限
                <em>{jpDate(payment.depositDueDate)}</em>
              </span>
              <b>{money(payment.total)}</b>
            </div>
          ) : (
            <>
              <div className="row">
                <span>
                  お申込金
                  <em>{jpDate(payment.depositDueDate)}まで</em>
                </span>
                <b className={payment.depositPaid ? 'paid' : ''}>
                  {money(payment.depositAmount)}
                  {payment.depositPaid && <span className="tag">入金済み</span>}
                </b>
              </div>
              <div className="row">
                <span>
                  残金
                  <em>{jpDate(payment.balanceDueDate)}まで</em>
                </span>
                <b>{money(payment.balanceAmount)}</b>
              </div>
            </>
          )}

          <div className="row due">
            <span>お支払い残額</span>
            <b>{money(payment.outstanding)}</b>
          </div>
        </div>

        {payment.paymentUrl && (
          <a className="pay" href={payment.paymentUrl} target="_blank" rel="noopener noreferrer">
            オンラインでお支払い
          </a>
        )}
        <p className="note">
          お振込みの反映には数日かかる場合がございます。ご入金後に表示が変わらない場合も、行き違いですのでご安心ください。
        </p>
      </section>

      {/* ---------------- the form ---------------- */}
      <section>
        <h2>ご参加者情報のご登録</h2>
        {booking.detailsLocked ? (
          <p className="locked">
            ご入力内容は確定済みです。変更が必要な場合は担当者までご連絡ください。
          </p>
        ) : (
          <p className="note">
            パスポートに記載のとおりにご記入ください。
            <strong>ローマ字が一文字でも異なりますとご搭乗いただけません。</strong>
            {booking.outstandingDetails > 0 && (
              <> 残り{booking.outstandingDetails}名様分のご登録が必要です。</>
            )}
          </p>
        )}

        {booking.travellers.map((t, i) => (
          <TravellerForm
            key={t.id}
            token={token}
            traveller={t}
            index={i}
            departureDate={booking.startDate}
            locked={booking.detailsLocked}
          />
        ))}
      </section>

      {/* ---------------- the trip ---------------- */}
      {booking.itinerary && (
        <section>
          <h2>ご旅行日程</h2>
          <ol className="days">
            {booking.itinerary.days.map(d => (
              <li key={d.dayNumber}>
                <div className="dn">{d.dayNumber}日目</div>
                <div>
                  {d.title && <h3>{d.title}</h3>}
                  {d.description && <p>{d.description}</p>}
                  {d.overnightCity && <p className="ov">宿泊：{d.overnightCity}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer>
        <p>{operator.name}</p>
        {operator.phone && <p>{operator.phone}</p>}
        {operator.email && <p>{operator.email}</p>}
      </footer>
    </main>
  )
}
