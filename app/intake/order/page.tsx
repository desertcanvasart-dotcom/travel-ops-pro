'use client'

import { readHandoffText } from '@/lib/text-handoff'
// ============================================
// Order intake — the tour-up.jp form, read as a document
// ============================================
// Website order emails are taken in by themselves after each mailbox sync
// (lib/intake/web-order-intake.ts) and, at the website's price, become the
// itinerary directly; the list says what each became. The page is that list
// first: one the intake could not finish opens here (?intake=<id>, or from
// the inbox) to be finished by hand, and an order that came some other way
// can still be pasted (folded away until asked for). The reading shows the
// programme, dates, party, traveller and price; nothing is written on preview.
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ClipboardPaste, Loader2, CheckCircle2, AlertTriangle, Globe, Inbox } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { websiteOrderPriceJpy } from '@/lib/pricing/website-price'

interface Preview {
  success: boolean
  error?: string
  order?: {
    tourCode: string; tourTitle: string; departureDate1: string; departureDate2?: string; departureAirport?: string
    adults: number; children: number; email: string; phone?: string
    productKind?: 'tour' | 'optional'; websiteUrl?: string; infants?: number; websiteSubtotalJpy?: number; priceNotes?: string
    websiteBaseFare1?: { adultJpy?: number; childJpy?: number }
    lead: { lastNameRomaji: string; firstNameRomaji: string; lastNameKanji?: string; firstNameKanji?: string; birthDate?: string; gender?: string }
    companions: { lastNameRomaji: string; firstNameRomaji: string; birthDate?: string }[]
    requests?: string
  }
  template?: { id: string; template_code: string; template_name: string; duration_days: number } | null
  matchedBy?: 'website' | 'code' | null
  departure?: { id: string; start_date: string; status: string; max_pax: number; booked_pax: number; seats_free?: number } | null
  departureBooking?: { id: string; departure_id: string } | null
  departureFull?: { free: number; requested: number } | null
  client?: { id: string; name: string } | null
  pricing?: { total_cost: number; selling_price: number; price_per_person: number; currency: string; margin_percent: number; holes: { kind: string; message: string }[]; warnings: string[]; complete: boolean } | null
  quote?: { id: string; quote_number: string } | null
  itinerary?: { id: string; code: string } | null
  clientCreated?: boolean
}

interface WebOrder {
  id: string
  received_at: string | null
  subject: string | null
  outcome: 'quote_created' | 'needs_attention' | 'duplicate'
  reason: string | null
  tour_code: string | null
  travel_date: string | null
  customer_email: string | null
  customer_name: string | null
  resolved_at: string | null
  quote?: { id: string; quote_number: string; status: string; converted_to_itinerary_id: string | null } | null
  quote_id?: string | null
  client?: { id: string; first_name: string | null; last_name: string | null } | null
}

function decodeParam(v: string | null): string {
  if (!v) return ''
  try { return decodeURIComponent(escape(atob(v))) } catch { return v }
}

// useSearchParams() bails out of prerendering; Next requires a Suspense
// boundary around it for the production build.
export default function OrderIntakePage() {
  return (
    <Suspense fallback={null}>
      <OrderIntakeInner />
    </Suspense>
  )
}

function OrderIntakeInner() {
  const t = useTranslations('orderIntake')
  const tWeb = useTranslations('websitePrice')
  const { canViewFinancials } = useRole()
  const params = useSearchParams()
  // The paste box, folded away unless an order was handed in or asked for.
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Preview | null>(null)
  // The website order being finished by hand (?intake=<id>), if any.
  const [intake, setIntake] = useState<{ id: string; received_at: string | null; reason: string | null } | null>(null)
  const [webOrders, setWebOrders] = useState<WebOrder[] | null>(null)

  const loadWebOrders = () => {
    fetch('/api/intake/web-orders').then(r => r.json()).then(j => setWebOrders(j.success ? j.intakes : [])).catch(() => setWebOrders([]))
  }
  useEffect(loadWebOrders, [])

  // The order form is parked in sessionStorage and only its key travels in
  // the URL — a full form in the query string is an HTTP 431 the app never
  // sees. `text` is the legacy shape, kept for older links. `intake` is a
  // website order the scheduled intake could not finish: its email is loaded.
  useEffect(() => {
    const intakeId = params.get('intake')
    if (intakeId) {
      fetch(`/api/intake/web-orders/${encodeURIComponent(intakeId)}`).then(r => r.json()).then(j => {
        if (j.success && j.intake) {
          setText(j.intake.order_text ?? '')
          setIntake({ id: j.intake.id, received_at: j.intake.received_at, reason: j.intake.reason })
        }
      }).catch(() => {})
      return
    }
    const stashed = readHandoffText(params.get('textKey'))
    if (stashed) { setText(stashed); return }
    const v = decodeParam(params.get('text'))
    if (v) setText(v)
  }, [params])

  const call = async (dryRun: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/intake/order-form', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, dryRun, intakeId: intake?.id }) })
      const j: Preview = await res.json()
      if (dryRun) setPreview(j); else { setDone(j); setPreview(null); if (j.success || res.status === 409) { setIntake(null); loadWebOrders() } }
    } catch (e) {
      setPreview({ success: false, error: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const dismiss = async (id: string) => {
    if (!window.confirm(t('dismissConfirm'))) return
    await fetch(`/api/intake/web-orders/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss' }) })
    if (intake?.id === id) { setIntake(null); setText(''); setPreview(null) }
    loadWebOrders()
  }

  const fmt = (n: number, cur: string) => `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const o = preview?.order

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ClipboardPaste className="w-6 h-6 text-[#647C47]" />{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {intake && !done && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm flex items-start justify-between gap-3">
          <p className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{t('fromWebsiteOrder', { date: intake.received_at ? new Date(intake.received_at).toLocaleString() : '—', reason: intake.reason ?? '' })}</p>
          <button type="button" onClick={() => dismiss(intake.id)} className="text-xs underline shrink-0">{t('dismiss')}</button>
        </div>
      )}

      {!done && !pasting && !text && (
        <button type="button" onClick={() => setPasting(true)} className="text-sm text-[#647C47] underline flex items-center gap-1">
          <ClipboardPaste className="w-4 h-4" />{t('pasteOrder')}
        </button>
      )}

      {!done && (pasting || !!text) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setPreview(null) }}
            rows={12}
            placeholder={t('placeholder')}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-[#647C47] outline-none"
            data-testid="order-text"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => call(true)} disabled={busy || !text.trim()} className="px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('read')}
            </button>
          </div>
        </div>
      )}

      {preview && !preview.success && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm">{preview.error ?? t('notAnOrder')}</div>
      )}

      {preview?.success && o && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section>
              <h2 className="font-semibold text-gray-900 mb-2">{t('programme')}</h2>
              <dl className="space-y-1">
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('tourCode')}</dt><dd className="font-mono">{o.tourCode}{o.productKind === 'optional' && <span className="ml-2 font-sans text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{t('optionalTour')}</span>}</dd></div>
                {o.websiteUrl && <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('websitePage')}</dt><dd className="break-all"><a href={o.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-[#647C47] underline">{o.websiteUrl}</a></dd></div>}
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('matched')}</dt><dd>{preview.template ? <span className="text-green-700">{preview.template.template_code} · {preview.template.template_name}{preview.matchedBy && <span className="text-gray-500"> ({t(preview.matchedBy === 'website' ? 'matchedByWebsite' : 'matchedByCode')})</span>}</span> : <span className="text-red-700 font-medium">{t('noMatch')}</span>}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t(o.productKind === 'optional' ? 'useDate' : 'departure')}</dt><dd>{o.departureDate1}{o.departureDate2 ? ` (${t('or')} ${o.departureDate2})` : ''}{o.departureAirport ? ` · ${o.departureAirport}` : ''}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('party')}</dt><dd>{o.infants ? t('partyInfants', { adults: o.adults, children: o.children, infants: o.infants }) : t('partyValue', { adults: o.adults, children: o.children })}</dd></div>
                {preview.template && (() => {
                  // A departure with too few seats left for the party gets no hold.
                  const dep = preview.departure
                  const party = Math.max(1, o.adults + o.children)
                  const noRoom = !!dep && dep.seats_free != null && dep.seats_free < party
                  return (
                    <div className="flex gap-2"><dt className="text-gray-500 w-32" /><dd className={!dep ? 'text-gray-500' : noRoom ? 'text-amber-700' : 'text-green-700'}>
                      {!dep ? t('departureNone') : noRoom ? t('departureNoRoom', { free: dep.seats_free ?? 0, requested: party }) : <>{t('departureFound')}{dep.seats_free != null && <span className="text-gray-500"> · {t('departureSeatsFree', { free: dep.seats_free })}</span>}</>}
                    </dd></div>
                  )
                })()}
              </dl>
            </section>
            <section>
              <h2 className="font-semibold text-gray-900 mb-2">{t('traveller')}</h2>
              <dl className="space-y-1">
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('name')}</dt><dd>{o.lead.lastNameKanji} {o.lead.firstNameKanji} · {o.lead.lastNameRomaji} {o.lead.firstNameRomaji}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('birth')}</dt><dd>{o.lead.birthDate ?? '—'} {o.lead.gender ? `· ${o.lead.gender}` : ''}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('contact')}</dt><dd>{o.email}{o.phone ? ` · ${o.phone}` : ''}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('client')}</dt><dd>{preview.client ? <Link href={`/clients/${preview.client.id}`} className="text-[#647C47] underline">{preview.client.name}</Link> : <span className="text-amber-700">{t('newClient')}</span>}</dd></div>
                {o.companions.length > 0 && <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('companions')}</dt><dd>{o.companions.map(c => `${c.lastNameRomaji} ${c.firstNameRomaji}${c.birthDate ? ` (${c.birthDate})` : ''}`).join(', ')}</dd></div>}
              </dl>
            </section>
          </div>
          {o.requests && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500 mb-1">{t('requests')}</p><p className="whitespace-pre-wrap">{o.requests}</p></div>}

          {preview.pricing && (() => {
            // The website's price, when it can be read, IS the price: the
            // engine's figures are the cost estimate, for admins and managers.
            const websitePrice = websiteOrderPriceJpy(o)
            const showEngine = !websitePrice || canViewFinancials
            return (
            <section className="border-t border-gray-200 pt-4">
              <h2 className="font-semibold text-gray-900 mb-2">{t('price')}</h2>
              <div className={`grid gap-3 ${o.websiteSubtotalJpy || o.websiteBaseFare1 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
                {o.websiteSubtotalJpy ? <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs text-gray-500 flex items-center gap-1"><Globe className="w-3 h-3" />{t('websiteSubtotal')}</p><p className="font-semibold">JPY {o.websiteSubtotalJpy.toLocaleString()}</p></div> : null}
                {/* A package-tour notification gives the BASE fare per person for
                    the first-choice date instead of a 小計: shown per person and
                    times the party, labelled as the base fare. */}
                {!o.websiteSubtotalJpy && o.websiteBaseFare1 ? (() => {
                  const f = o.websiteBaseFare1!
                  const total = (f.adultJpy ?? 0) * o.adults + (f.childJpy ?? 0) * o.children
                  return (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Globe className="w-3 h-3" />{t('websiteBaseFare')}</p>
                      <p className="font-semibold">JPY {total.toLocaleString()}</p>
                      <p className="text-[11px] text-gray-500">
                        {f.adultJpy ? t('websiteBaseFareAdults', { fare: f.adultJpy.toLocaleString(), count: o.adults }) : null}
                        {f.childJpy && o.children > 0 ? ` · ${t('websiteBaseFareChildren', { fare: f.childJpy.toLocaleString(), count: o.children })}` : null}
                      </p>
                    </div>
                  )
                })() : null}
                {showEngine && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{websitePrice ? t('estimatedCost') : t('cost')}</p><p className="font-semibold">{fmt(preview.pricing.total_cost, preview.pricing.currency)}</p></div>}
                {!websitePrice && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{t('selling', { margin: preview.pricing.margin_percent })}</p><p className="font-semibold">{fmt(preview.pricing.selling_price, preview.pricing.currency)}</p></div>}
                {!websitePrice && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{t('perPerson')}</p><p className="font-semibold">{fmt(preview.pricing.price_per_person, preview.pricing.currency)}</p></div>}
              </div>
              {o.priceNotes && <div className="mt-3 bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500 mb-1">{t('priceNotes')}</p><p className="whitespace-pre-wrap text-xs">{o.priceNotes}</p></div>}
              {preview.pricing.holes.length > 0 && !websitePrice && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                  <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{t('holes', { count: preview.pricing.holes.length })}</p>
                  <ul className="list-disc ml-5 mt-1 text-xs">{preview.pricing.holes.map((h, i) => <li key={i}>{h.message}</li>)}</ul>
                </div>
              )}
              {preview.pricing.holes.length > 0 && websitePrice && canViewFinancials && (
                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-600">
                  <p className="text-xs">{tWeb('costGaps', { count: preview.pricing.holes.length })}</p>
                  <ul className="list-disc ml-5 mt-1 text-xs">{preview.pricing.holes.map((h, i) => <li key={i}>{h.message}</li>)}</ul>
                </div>
              )}
            </section>
            )
          })()}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={() => call(false)} disabled={busy || !preview.template} className="px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{preview.client ? t('createQuote') : t('createClientAndQuote')}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className={`rounded-lg border p-5 text-sm ${done.success ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {done.success && done.quote ? (
            <>
              <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />{done.itinerary ? t('createdItinerary', { code: done.itinerary.code, quote: done.quote.quote_number }) : t('created', { quote: done.quote.quote_number })}</p>
              <p className="mt-1">{done.clientCreated ? t('clientCreated') : t('clientLinked')}</p>
              {done.departureBooking && <p className="mt-1">{t('departureHeld')}</p>}
              {done.departureFull && <p className="mt-1 text-amber-800">{t('departureFull', { free: done.departureFull.free, requested: done.departureFull.requested })}</p>}
              <div className="mt-3 flex gap-2">
                {done.itinerary
                  ? <Link href={`/itineraries/${done.itinerary.id}`} className="px-4 py-2 bg-[#647C47] text-white rounded-lg font-medium">{t('openItinerary')}</Link>
                  : <Link href={`/b2b/quotes/${done.quote.id}`} className="px-4 py-2 bg-[#647C47] text-white rounded-lg font-medium">{t('openQuote')}</Link>}
                <button type="button" onClick={() => { setDone(null); setText(''); setPasting(false) }} className="px-4 py-2 border border-gray-300 rounded-lg">{t('another')}</button>
              </div>
            </>
          ) : <p>{done.error ?? t('failed')}</p>}
        </div>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Inbox className="w-5 h-5 text-[#647C47]" />{t('webOrders')}</h2>
        <p className="text-xs text-gray-500 mt-1 mb-3">{t('webOrdersHint')}</p>
        {webOrders === null ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : webOrders.length === 0 ? (
          <p className="text-sm text-gray-500">{t('webOrdersEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="web-orders">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-medium">{t('received')}</th>
                  <th className="py-2 pr-3 font-medium">{t('tourCode')}</th>
                  <th className="py-2 pr-3 font-medium">{t('departure')}</th>
                  <th className="py-2 pr-3 font-medium">{t('customer')}</th>
                  <th className="py-2 pr-3 font-medium">{t('result')}</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {webOrders.map(w => {
                  // Quoted once, its quote since deleted: open again to be finished.
                  const quoteGone = w.outcome === 'quote_created' && !w.quote
                  const open = (w.outcome === 'needs_attention' && !w.resolved_at) || quoteGone
                  const trip = w.quote?.converted_to_itinerary_id ?? null
                  return (
                    <tr key={w.id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{w.received_at ? new Date(w.received_at).toLocaleString() : '—'}</td>
                      <td className="py-2 pr-3 font-mono">{w.tour_code ?? '—'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{w.travel_date ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {w.client ? <Link href={`/clients/${w.client.id}`} className="text-[#647C47] underline">{w.customer_name ?? `${w.client.last_name ?? ''} ${w.client.first_name ?? ''}`}</Link> : (w.customer_name ?? '—')}
                        {w.customer_email && <div className="text-xs text-gray-500">{w.customer_email}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${open ? 'bg-amber-100 text-amber-800' : w.outcome === 'needs_attention' ? 'bg-gray-100 text-gray-600' : w.outcome === 'duplicate' ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-800'}`}>
                          {w.outcome === 'needs_attention' && w.resolved_at ? t('dismissed') : quoteGone ? t('quoteDeleted') : trip ? t('outcome_itinerary') : t(`outcome_${w.outcome}`)}
                        </span>
                        {open && !quoteGone && w.reason && <div className="text-xs text-gray-500 mt-1 max-w-xs">{w.reason}</div>}
                      </td>
                      <td className="py-2 whitespace-nowrap text-right">
                        {trip ? (
                          <Link href={`/itineraries/${trip}`} className="text-[#647C47] underline">{t('openItinerary')}</Link>
                        ) : w.quote ? (
                          <Link href={`/b2b/quotes/${w.quote.id}`} className="text-[#647C47] underline">{w.quote.quote_number}</Link>
                        ) : open ? (
                          <span className="flex gap-3 justify-end">
                            <Link href={`/intake/order?intake=${w.id}`} className="text-[#647C47] underline">{t('finish')}</Link>
                            {!quoteGone && <button type="button" onClick={() => dismiss(w.id)} className="text-gray-500 underline">{t('dismiss')}</button>}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
