'use client'
// ============================================
// Order intake — the tour-up.jp form, read as a document
// ============================================
// Until the office mailbox is connected, the order email is pasted here;
// once it is, the inbox sends a recognised order straight to this page.
// The page shows what was read (programme, dates, party, traveller, price
// and any holes) and writes ONE draft quote plus the client on confirm.
// Nothing is written on preview.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ClipboardPaste, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Preview {
  success: boolean
  error?: string
  order?: {
    tourCode: string; tourTitle: string; departureDate1: string; departureDate2?: string; departureAirport?: string
    adults: number; children: number; email: string; phone?: string
    lead: { lastNameRomaji: string; firstNameRomaji: string; lastNameKanji?: string; firstNameKanji?: string; birthDate?: string; gender?: string }
    companions: { lastNameRomaji: string; firstNameRomaji: string; birthDate?: string }[]
    requests?: string
  }
  template?: { id: string; template_code: string; template_name: string; duration_days: number } | null
  client?: { id: string; name: string } | null
  pricing?: { total_cost: number; selling_price: number; price_per_person: number; currency: string; margin_percent: number; holes: { kind: string; message: string }[]; warnings: string[]; complete: boolean } | null
  quote?: { id: string; quote_number: string } | null
  clientCreated?: boolean
}

function decodeParam(v: string | null): string {
  if (!v) return ''
  try { return decodeURIComponent(escape(atob(v))) } catch { return v }
}

export default function OrderIntakePage() {
  const t = useTranslations('orderIntake')
  const params = useSearchParams()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Preview | null>(null)

  useEffect(() => { const v = decodeParam(params.get('text')); if (v) setText(v) }, [params])

  const call = async (dryRun: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/intake/order-form', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, dryRun }) })
      const j: Preview = await res.json()
      if (dryRun) setPreview(j); else { setDone(j); setPreview(null) }
    } catch (e) {
      setPreview({ success: false, error: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const fmt = (n: number, cur: string) => `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const o = preview?.order

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ClipboardPaste className="w-6 h-6 text-[#647C47]" />{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {!done && (
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
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('tourCode')}</dt><dd className="font-mono">{o.tourCode}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('matched')}</dt><dd>{preview.template ? <span className="text-green-700">{preview.template.template_code} · {preview.template.template_name}</span> : <span className="text-red-700 font-medium">{t('noMatch')}</span>}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('departure')}</dt><dd>{o.departureDate1}{o.departureDate2 ? ` (${t('or')} ${o.departureDate2})` : ''}{o.departureAirport ? ` · ${o.departureAirport}` : ''}</dd></div>
                <div className="flex gap-2"><dt className="text-gray-500 w-32">{t('party')}</dt><dd>{t('partyValue', { adults: o.adults, children: o.children })}</dd></div>
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

          {preview.pricing && (
            <section className="border-t border-gray-200 pt-4">
              <h2 className="font-semibold text-gray-900 mb-2">{t('price')}</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{t('cost')}</p><p className="font-semibold">{fmt(preview.pricing.total_cost, preview.pricing.currency)}</p></div>
                <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{t('selling', { margin: preview.pricing.margin_percent })}</p><p className="font-semibold">{fmt(preview.pricing.selling_price, preview.pricing.currency)}</p></div>
                <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{t('perPerson')}</p><p className="font-semibold">{fmt(preview.pricing.price_per_person, preview.pricing.currency)}</p></div>
              </div>
              {preview.pricing.holes.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                  <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{t('holes', { count: preview.pricing.holes.length })}</p>
                  <ul className="list-disc ml-5 mt-1 text-xs">{preview.pricing.holes.map((h, i) => <li key={i}>{h.message}</li>)}</ul>
                </div>
              )}
            </section>
          )}

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
              <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />{t('created', { quote: done.quote.quote_number })}</p>
              <p className="mt-1">{done.clientCreated ? t('clientCreated') : t('clientLinked')}</p>
              <div className="mt-3 flex gap-2">
                <Link href={`/b2b/quotes/${done.quote.id}`} className="px-4 py-2 bg-[#647C47] text-white rounded-lg font-medium">{t('openQuote')}</Link>
                <button type="button" onClick={() => { setDone(null); setText(''); }} className="px-4 py-2 border border-gray-300 rounded-lg">{t('another')}</button>
              </div>
            </>
          ) : <p>{done.error ?? t('failed')}</p>}
        </div>
      )}
    </div>
  )
}
