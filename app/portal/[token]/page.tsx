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
import { cookies } from 'next/headers'
import VerifyGate from './VerifyGate'
import type { Metadata } from 'next'
import {
  isValidPortalToken,
  portalLinkState,
  toPortalBooking,
  type PortalBooking,
  type PortalDocument,
  portalVerifyCookieName,
  isPortalVerified,
  isCustomerFacingInvoice,
} from '@/lib/booking-portal'
import { toClientItinerary } from '@/lib/itinerary-share'
import { formatMoney } from '@/lib/currency-totals'
import { tripDays, type PremiumBand } from '@/lib/insurance'
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

interface Office {
  label: string
  postal_code: string
  address: string
  tel: string
  fax: string
}

interface Operator {
  name: string
  brandHex: string
  email: string | null
  phone: string | null
  logoUrl: string | null
  address: string | null
  tagline: string | null
  /** The offices as they appear on the 日程表 letterhead. A customer who needs
   *  to phone somebody should find the same list here as on their paperwork. */
  offices: Office[]
}

async function resolve(token: string): Promise<{
  booking: PortalBooking
  operator: Operator
  insuranceBands: PremiumBand[]
  tripDays: number | null
} | null> {
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

  // The trip is shown as the office's OWN 日程表, not as a second rendering of
  // itinerary_days. Two layouts of one trip, drawn from two tables, is two
  // chances to tell the traveller different things — and the document the
  // office already sends is the one they recognise. It is generated from the
  // PROGRAMME the trip was sold from, so all that is needed here is the link.
  //
  // ONE OR THE OTHER, NEVER BOTH. A trip with no programme link falls back to
  // the day list, because a portal with no itinerary at all is worse than one
  // in the older format — and today most trips have no link, since nothing in
  // the UI sets itineraries.template_id yet. Linking the programme is what
  // upgrades a trip to the real document.
  let programmeTemplateId: string | null = null
  let itinerary = null
  if (booking.itinerary_id) {
    const { data: itin } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', booking.itinerary_id)
      .maybeSingle()
    programmeTemplateId = (itin?.template_id as string | null) ?? null

    if (itin && !programmeTemplateId) {
      const { data: days } = await supabase
        .from('itinerary_days')
        .select('*')
        .eq('itinerary_id', booking.itinerary_id)
        .order('day_number', { ascending: true })
      itinerary = toClientItinerary(itin, days ?? [])
    }
  }

  // The documents a traveller can actually be handed today.
  const documents: PortalDocument[] = []

  // The 日程表 leads: it is what somebody opens this link to read. Generated on
  // demand rather than stored, so a correction to the programme reaches the
  // traveller without anybody reissuing a file.
  if (programmeTemplateId) {
    documents.push({
      key: 'nittei',
      title: '旅行日程表',
      note: booking.start_date ? `${jpDate(booking.start_date)} ご出発` : 'PDF',
    })
  }

  // Then the invoices — deposit before final, oldest first, so the list reads
  // in the order the money is asked for.
  if (booking.itinerary_id) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, issue_date, due_date, total_amount, currency, status')
      .eq('itinerary_id', booking.itinerary_id)
      .order('created_at', { ascending: true })

    for (const inv of invoices ?? []) {
      // A draft is not something to hand a customer — it has not been sent —
      // and neither is a cancelled one. An ALLOW-list rather than a deny-list:
      // a status nobody has thought about yet must not reach the traveller by
      // default. Invoices are created as 'draft', so this is the common case,
      // not an edge one.
      if (!isCustomerFacingInvoice(inv.status)) continue
      documents.push({
        key: `invoice:${inv.id}`,
        title:
          inv.invoice_type === 'deposit'
            ? 'お申込金 請求書'
            : inv.invoice_type === 'final'
              ? '残金 請求書'
              : '請求書',
        note: inv.due_date ? `お支払い期限 ${jpDate(inv.due_date)}` : inv.invoice_number,
      })
    }
  }

  // The 掛金表 for the chooser. Sent to the browser because the premium depends
  // on the traveller's own age, which is being typed on that screen — computing
  // it here would mean a round trip per keystroke. These are published rates,
  // not anybody's private data.
  //
  // The newest rate year the operator has loaded wins. A missing table is not
  // an error: the plan chooser simply shows no prices, which is what the paper
  // form does today.
  let insuranceBands: PremiumBand[] = []
  const { data: premiumRows } = await supabase
    .from('insurance_premiums')
    .select('id, rate_year, max_days, band_label, premium_jpy, max_age, insurance_plans!inner(plan_code)')
    .eq('org_id', link!.org_id)
    .order('rate_year', { ascending: false })

  if (premiumRows?.length) {
    const newest = Math.max(...premiumRows.map(r => Number(r.rate_year) || 0))
    insuranceBands = premiumRows
      .filter(r => Number(r.rate_year) === newest)
      .map(r => ({
        id: String(r.id),
        planCode: String((r.insurance_plans as unknown as { plan_code: string })?.plan_code ?? ''),
        maxDays: Number(r.max_days),
        bandLabel: String(r.band_label),
        premiumJpy: Number(r.premium_jpy),
        maxAge: r.max_age == null ? null : Number(r.max_age),
      }))
      .filter(b => b.planCode)
  }

  // The insurer's own brochure, when the operator has put one there. Storage
  // keys must be ASCII, so the object has a fixed English name and the title
  // the customer reads lives here — 「4.2025年版海外保険.pdf」 is not a filename
  // Supabase will accept.
  //
  // Offered to everyone, not only to those who already said yes: it is what a
  // customer reads in order to DECIDE.
  const { data: guide } = await supabase.storage
    .from('documents')
    .list(`portal-documents/${link!.org_id}`, { search: 'insurance-guide.pdf' })

  if (guide?.some(o => o.name === 'insurance-guide.pdf')) {
    documents.push({
      key: 'insurance-guide',
      title: '海外旅行傷害保障のご案内',
      note: '共済金額表・掛金表（PDF）',
    })
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('name, primary_color, contact_email, company_phone, logo_url, company_address, tagline, offices')
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
    insuranceBands,
    tripDays: tripDays(booking.start_date, booking.end_date),
    booking: toPortalBooking({
      booking,
      passengers: passengers ?? [],
      link: link!,
      itinerary,
      documents,
    }),
    operator: {
      name: org?.name ?? '',
      brandHex: org?.primary_color || '#647C47',
      email: org?.contact_email ?? null,
      phone: org?.company_phone ?? null,
      logoUrl: (org as any)?.logo_url ?? null,
      address: (org as any)?.company_address ?? null,
      tagline: (org as any)?.tagline ?? null,
      // Same source the letterhead reads. The portal used to show only
      // company_address, so an operator who filled in their offices — which is
      // what the company profile actually asks for — saw nothing here.
      offices: Array.isArray((org as any)?.offices)
        ? ((org as any).offices as Array<Record<string, unknown>>)
            .map(o => ({
              label: String(o?.label ?? ''),
              postal_code: String(o?.postal_code ?? ''),
              address: String(o?.address ?? ''),
              tel: String(o?.tel ?? ''),
              fax: String(o?.fax ?? ''),
            }))
            .filter(o => o.address || o.tel)
        : [],
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

  const { booking, operator, insuranceBands, tripDays: days } = resolved

  // CONFIRMATION GATE: the link alone shows nothing. One fact the traveller
  // knows (booking number or the lead family name) sets the cookie; until
  // then the page renders only the operator's masthead and the form.
  const jar = await cookies()
  if (!isPortalVerified(token, jar.get(portalVerifyCookieName(token))?.value)) {
    return (
      <main style={{ ['--brand' as string]: operator.brandHex }} className="portal">
        <header className="hd">
          {operator.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="oplogo" src={operator.logoUrl} alt={operator.name} />
          )}
          <p className="op">{operator.name}</p>
          <h1>ご本人確認</h1>
          <p className="sub">お客様の情報を守るため、ご予約の確認をお願いいたします。</p>
        </header>
        <section className="gate">
          <VerifyGate token={token} />
        </section>
      </main>
    )
  }
  const { payment } = booking
  const money = (n: number | null) => (n == null ? '—' : formatMoney(n, payment.currency))

  return (
    <main style={{ ['--brand' as string]: operator.brandHex }} className="portal">
      <header className="hd">
        {operator.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="oplogo" src={operator.logoUrl} alt={operator.name} />
        )}
        <p className="op">{operator.name}</p>
        {operator.tagline && <p className="optag">{operator.tagline}</p>}
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
            insuranceBands={insuranceBands}
            tripDays={days}
          />
        ))}
      </section>

      {/* ---------------- documents ---------------- */}
      {booking.documents.length > 0 && (
        <section>
          <h2>書類</h2>
          <ul className="docs">
            {booking.documents.map(d => (
              <li key={d.key}>
                <a href={`/api/portal/${token}/documents/${encodeURIComponent(d.key)}`} target="_blank" rel="noopener noreferrer">
                  <span className="dt">{d.title}</span>
                  {d.note && <span className="dn">{d.note}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------- the trip ---------------- */}
      {/* Only when the trip has no programme link — see resolve(). */}
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
        <p className="opname">{operator.name}</p>

        {operator.offices.length > 0 ? (
          <ul className="offices">
            {operator.offices.map((o, i) => (
              // Three lines each, always: name and postcode, then the street,
              // then the numbers. The postcode rides with the name because the
              // street alone is what needs the room — with both on one line the
              // Osaka address wrapped and that office stood a line taller than
              // its neighbours.
              <li key={i}>
                <span className="l1">
                  {o.label && <b>{o.label}</b>}
                  {o.postal_code && <em>{o.postal_code}</em>}
                </span>
                {o.address && <span>{o.address}</span>}
                {(o.tel || o.fax) && (
                  <span className="tel">
                    {o.tel && <em>TEL {o.tel}</em>}
                    {o.fax && <em>FAX {o.fax}</em>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <>
            {operator.address && <p>{operator.address}</p>}
            {operator.phone && <p>{operator.phone}</p>}
          </>
        )}

        {operator.email && <p>{operator.email}</p>}
      </footer>
    </main>
  )
}
