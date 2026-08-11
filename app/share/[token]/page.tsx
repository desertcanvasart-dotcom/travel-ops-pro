// ============================================
// THE SHAREABLE ITINERARY PAGE — public, token-gated
// ============================================
// A traveller's view of their trip: branded with the operator's logo and
// colour, readable on a phone, current every time it is opened.
//
// Security shape (see migrations/20260811_share_links_and_fx.sql):
//   * Public via the middleware allowlist, but only for a token that resolves
//     to an UNREVOKED share — everything else is a plain 404, indistinguishable
//     from a URL that never existed.
//   * All reads happen HERE, server-side, with the service role; nothing on
//     this page ships a Supabase client to the browser.
//   * Data crosses the boundary only through toClientItinerary(), an allowlist
//     projection with tests proving the cost base cannot survive it.
//
// Deliberately outside the app shell: no sidebar, no locale switcher, no auth
// chrome. A client should not see the operator's tooling.

import { cache } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import {
  isValidShareToken,
  toClientItinerary,
  type ClientItinerary,
  type ShareDayType,
} from '@/lib/itinerary-share'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

interface Operator {
  name: string
  logoUrl: string | null
  brandHex: string
  email: string | null
  phone: string | null
  website: string | null
}

/** The app green, used when an org has set no brand colour. */
const DEFAULT_BRAND = '#647C47'

/**
 * Wrapped in React's cache() so generateMetadata and the page body share ONE
 * call per request. Without it both would run, and the view counter inside would
 * tick twice for a single visit.
 */
const loadShare = cache(async function loadShare(
  token: string
): Promise<{ itinerary: ClientItinerary; operator: Operator } | null> {
  if (!isValidShareToken(token)) return null
  const supabase = admin()

  const { data: share } = await supabase
    .from('itinerary_shares')
    .select('id, itinerary_id, org_id, revoked_at, view_count')
    .eq('token', token)
    .maybeSingle()
  if (!share || share.revoked_at) return null

  const [{ data: itinerary }, { data: days }, { data: org }] = await Promise.all([
    supabase.from('itineraries').select('*').eq('id', share.itinerary_id).maybeSingle(),
    supabase.from('itinerary_days').select('*').eq('itinerary_id', share.itinerary_id),
    supabase
      .from('organizations')
      .select('name, logo_url, primary_color, contact_email, company_phone, company_website')
      .eq('id', share.org_id)
      .maybeSingle(),
  ])
  if (!itinerary) return null

  // Engagement signal, best-effort — a failed count must never break the page.
  // Read-modify-write is fine at this fidelity: it is a signal, not a ledger.
  void supabase
    .from('itinerary_shares')
    .update({ view_count: (share.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() })
    .eq('id', share.id)
    .then(() => {}, () => {})

  const brandHex = /^#[0-9a-fA-F]{6}$/.test(org?.primary_color || '')
    ? org!.primary_color!
    : DEFAULT_BRAND

  return {
    itinerary: toClientItinerary(itinerary, days ?? []),
    operator: {
      name: org?.name || '',
      logoUrl: org?.logo_url || null,
      brandHex,
      email: org?.contact_email || null,
      phone: org?.company_phone || null,
      website: org?.company_website || null,
    },
  }
})

function fmtDate(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return d
  }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  EGP: 'E£',
  JPY: '¥',
}

/** JPY has no minor unit — showing ¥1,200.00 marks the page as machine-made. */
function fmtMoney(amount: number, currency: string | null): string {
  const code = (currency || 'EUR').toUpperCase()
  const decimals = code === 'JPY' ? 0 : 2
  const symbol = CURRENCY_SYMBOLS[code] || `${code} `
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

const DAY_TYPE_BADGE: Record<ShareDayType, string> = {
  arrival: '✈️ Arrival',
  tour: '',
  transfer: '🚐 Travel day',
  cruise: '🚢 Nile cruise',
  free: '🌴 Free day',
  departure: '✈️ Departure',
}

/**
 * Browser-tab title and link preview. Kept to the trip name and operator — no
 * price, and `robots: noindex` so a shared link cannot end up in a search
 * index just because a client forwarded it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const data = await loadShare(token)
  if (!data) return { title: 'Itinerary', robots: { index: false, follow: false } }

  const { itinerary: it, operator: op } = data
  return {
    title: op.name ? `${it.tripName} · ${op.name}` : it.tripName,
    description: it.startDate
      ? `Your itinerary${it.totalDays ? ` — ${it.totalDays} days` : ''}, ${fmtDate(it.startDate)}${
          it.endDate ? ` to ${fmtDate(it.endDate)}` : ''
        }.`
      : 'Your itinerary.',
    robots: { index: false, follow: false },
  }
}

export default async function SharedItineraryPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await loadShare(token)
  if (!data) notFound()

  const { itinerary: it, operator: op } = data
  const travellers = it.numAdults + it.numChildren + it.numInfants

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="text-white" style={{ background: op.brandHex }}>
        <div className="max-w-3xl mx-auto px-5 py-10">
          {op.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- remote org logo, dimensions unknown
            <img src={op.logoUrl} alt={op.name} className="h-12 mb-4 rounded bg-white/90 p-1" />
          )}
          {op.name && <p className="text-sm uppercase tracking-widest opacity-80">{op.name}</p>}
          {/* text-white must be on the h1 itself: globals.css sets a color on
              h1–h6, and an element rule beats the inherited white from the
              header. Without it the title renders near-black on the brand colour. */}
          <h1 className="text-3xl sm:text-4xl font-bold mt-1 text-white">{it.tripName}</h1>
          <p className="mt-3 text-sm opacity-90">
            {fmtDate(it.startDate)}
            {it.endDate ? ` – ${fmtDate(it.endDate)}` : ''}
            {it.totalDays ? ` · ${it.totalDays} days` : ''}
            {travellers > 0 ? ` · ${travellers} traveller${travellers === 1 ? '' : 's'}` : ''}
            {it.tier ? ` · ${it.tier}` : ''}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {/* Days */}
        <ol className="space-y-6">
          {it.days.map((day) => {
            const badge = day.dayType ? DAY_TYPE_BADGE[day.dayType] : ''
            return (
              <li
                key={day.dayNumber}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="flex items-baseline gap-3 px-5 pt-4">
                  <span
                    className="shrink-0 w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center"
                    style={{ background: op.brandHex }}
                  >
                    {day.dayNumber}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900">
                      {day.title || `Day ${day.dayNumber}`}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {fmtDate(day.date)}
                      {day.city ? ` · ${day.city}` : ''}
                      {day.overnightCity && day.overnightCity !== day.city
                        ? ` → ${day.overnightCity}`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-4 pt-3 sm:pl-[68px]">
                  {day.description && (
                    <p className="text-sm text-gray-700 whitespace-pre-line">{day.description}</p>
                  )}

                  {day.attractions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {day.attractions.map((a) => (
                        <span
                          key={a}
                          className="text-xs px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                    {badge && <span>{badge}</span>}
                    {day.flightFrom && <span>🛫 {day.flightFrom}</span>}
                    {day.airportArrival && <span>🛬 {day.airportArrival}</span>}
                    {day.airportDeparture && <span>🛫 {day.airportDeparture}</span>}
                    {day.lunchIncluded && <span>🍽 Lunch included</span>}
                    {day.dinnerIncluded && <span>🌙 Dinner included</span>}
                    {day.hotelIncluded && <span>🏨 Hotel included</span>}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        {/* Inclusions / exclusions — operator-authored, already client-facing */}
        {(it.inclusions.length > 0 || it.exclusions.length > 0) && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {it.inclusions.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-900 text-sm">What&apos;s included</h3>
                <ul className="mt-2 space-y-1.5">
                  {it.inclusions.map((line) => (
                    <li key={line} className="text-sm text-gray-700 flex gap-2">
                      <span style={{ color: op.brandHex }}>✓</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {it.exclusions.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-900 text-sm">Not included</h3>
                <ul className="mt-2 space-y-1.5">
                  {it.exclusions.map((line) => (
                    <li key={line} className="text-sm text-gray-500 flex gap-2">
                      <span>✕</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* Price — the client total, the only money on this page */}
        {it.totalPrice !== null && it.totalPrice > 0 && (
          <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">
                Total for {travellers || 'your'} traveller{travellers === 1 ? '' : 's'}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {fmtMoney(it.totalPrice, it.currency)}
              </p>
            </div>
            {it.code && <span className="text-xs text-gray-400 shrink-0">Ref: {it.code}</span>}
          </div>
        )}
      </main>

      {/* Operator footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-5 py-6 text-sm text-gray-600">
          {op.name && <p className="font-semibold text-gray-900">{op.name}</p>}
          <p className="mt-1 space-x-3">
            {op.email && (
              <a className="underline" href={`mailto:${op.email}`}>
                {op.email}
              </a>
            )}
            {op.phone && (
              <a className="underline" href={`tel:${op.phone.replace(/\s+/g, '')}`}>
                {op.phone}
              </a>
            )}
            {op.website && (
              <a
                className="underline"
                href={op.website.startsWith('http') ? op.website : `https://${op.website}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {op.website}
              </a>
            )}
          </p>
          <p className="mt-3 text-xs text-gray-400">
            This page always shows the latest version of your itinerary.
          </p>
        </div>
      </footer>
    </div>
  )
}
