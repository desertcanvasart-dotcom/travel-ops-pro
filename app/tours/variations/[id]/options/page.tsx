'use client'

// ============================================
// The extras a programme offers
// ============================================
// Since 20270107 there is ONE list of extras (Sell → Extras). This page is a
// programme's view of it: the extras offered only with this programme (each
// at this programme's price when one is set), the every-booking extras it
// offers anyway, and the others it could take. It replaced "Options this
// programme sells", whose options were a second list per tier and whose
// "Included" half was always empty (programmes are built day by day).
//
// Programme level, not per tier (operator, 2026-10-19): every tier's button
// opens the same list.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'

interface ExtraRow {
  id: string
  name: string
  description: string | null
  category: string | null
  supplier_cost: number | null
  selling_price: number | null
  rate_currency?: string | null
  unit: 'per_person' | 'per_booking'
  is_active: boolean
  activity_rate_id?: string | null
}
type LinkedExtra = ExtraRow & { link_id: string; programme_price: number | null }

export default function ProgrammeExtrasPage() {
  const params = useParams()
  const variationId = String(params.id)
  const t = useTranslations('variationOptions')
  const confirmDialog = useConfirm()
  const { rateCurrency } = useCurrency()

  const [templateId, setTemplateId] = useState<string | null>(null)
  const [heading, setHeading] = useState('')
  const [linked, setLinked] = useState<LinkedExtra[]>([])
  const [everyBooking, setEveryBooking] = useState<ExtraRow[]>([])
  const [others, setOthers] = useState<ExtraRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Typed prices, by link, until saved on blur.
  const [prices, setPrices] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let tpl = templateId
      if (!tpl) {
        const res = await fetch(`/api/tours/variations/${variationId}`)
        const json = await res.json().catch(() => ({}))
        const v = json?.data
        tpl = v?.template_id ?? null
        setTemplateId(tpl)
        const name = v?.tour_templates?.template_name || v?.variation_name || ''
        const code = v?.tour_templates?.template_code
        setHeading([code, name].filter(Boolean).join(' — '))
      }
      if (!tpl) { setError(t('couldNotLoad')); return }
      const res = await fetch(`/api/extras-catalogue/programmes?template_id=${tpl}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) { setError(json.error || t('couldNotLoad')); return }
      setLinked(json.data.linked || [])
      setEveryBooking(json.data.everyBooking || [])
      setOthers(json.data.others || [])
      setPrices(Object.fromEntries((json.data.linked || []).map((x: LinkedExtra) => [x.link_id, x.programme_price?.toString() ?? ''])))
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [variationId, templateId, t])
  useEffect(() => { void load() }, [load])

  const money = (n: number | null | undefined, row: { rate_currency?: string | null }) =>
    n == null ? null : `${row.rate_currency || rateCurrency} ${n}`

  /** What the customer pays by default, in words. */
  const ownPrice = (x: ExtraRow) =>
    money(x.selling_price, x) ?? t('costPlusMargin')

  const link = async (extraId: string, sellingPrice: string | null = null) => {
    if (!templateId) return
    setBusy(extraId); setError(null)
    try {
      const res = await fetch('/api/extras-catalogue/programmes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_id: extraId, template_id: templateId, selling_price: sellingPrice }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || t('couldNotSave')); return }
      await load()
    } finally { setBusy(null) }
  }

  const savePrice = async (x: LinkedExtra) => {
    const typed = prices[x.link_id] ?? ''
    if (typed === (x.programme_price?.toString() ?? '')) return
    setBusy(x.link_id); setError(null)
    try {
      const res = await fetch(`/api/extras-catalogue/programmes/${x.link_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selling_price: typed }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || t('couldNotSave')); return }
      await load()
    } finally { setBusy(null) }
  }

  const unlink = async (x: LinkedExtra) => {
    const ok = await confirmDialog(t('removeMessage', { name: x.name }), {
      title: t('removeTitle'), confirmText: t('remove'), variant: 'danger',
    })
    if (!ok) return
    setBusy(x.link_id); setError(null)
    try {
      const res = await fetch(`/api/extras-catalogue/programmes/${x.link_id}`, { method: 'DELETE' })
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || t('couldNotDelete')); return }
      await load()
    } finally { setBusy(null) }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/tours/manage" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> {t('backToProgrammes')}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-[#647C47]" />
        {t('title')}
      </h1>
      {heading && <p className="text-sm text-gray-600 mb-1">{heading}</p>}
      <p className="text-sm text-gray-500 mb-6">{t('intro')}</p>

      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
        </p>
      ) : (
        <>
          <section className="bg-white rounded-lg shadow-sm border mb-6">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-medium text-gray-900">{t('linkedHeading')}</h2>
              <div className="flex items-center gap-2">
                <Link href="/rates/extras"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                  {t('manageExtras')}
                </Link>
                {(others.length > 0 || everyBooking.length > 0) && (
                  <button type="button" onClick={() => setAdding(v => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#e8ede3]">
                    <Plus className="w-3.5 h-3.5" /> {t('addExtra')}
                  </button>
                )}
              </div>
            </div>

            {adding && (
              <div className="p-4 border-b bg-gray-50">
                <select defaultValue="" onChange={e => { if (e.target.value) { void link(e.target.value); setAdding(false) } }}
                  className="w-full md:w-96 px-3 py-2 text-sm border border-gray-300 rounded-lg">
                  <option value="">{t('pickExtra')}</option>
                  {others.length > 0 && (
                    <optgroup label={t('otherProgrammesExtras')}>
                      {others.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </optgroup>
                  )}
                  {everyBooking.length > 0 && (
                    <optgroup label={t('everyBookingToPrice')}>
                      {everyBooking.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-gray-500 mt-2">{t('addHelp')}</p>
              </div>
            )}

            {linked.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">{t('noLinked')}</p>
            ) : (
              <ul className="divide-y">
                {linked.map(x => (
                  <li key={x.link_id} className={`p-4 flex items-center gap-4 ${x.is_active ? '' : 'opacity-50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{x.name}</p>
                      <p className="text-xs text-gray-500">
                        {[x.category, x.unit === 'per_booking' ? t('perBooking') : t('perPerson'),
                          x.activity_rate_id ? t('costFromActivity') : null,
                          `${t('ownPrice')}: ${ownPrice(x)}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <label className="text-xs text-gray-600 flex items-center gap-2">
                      {t('priceHere')}
                      <input type="number" min="0" step="0.01" value={prices[x.link_id] ?? ''}
                        placeholder={money(x.selling_price, x) ?? t('costPlusMargin')}
                        onChange={e => setPrices(p => ({ ...p, [x.link_id]: e.target.value }))}
                        onBlur={() => void savePrice(x)}
                        disabled={busy === x.link_id}
                        className="w-32 px-2 py-1 text-sm border border-gray-300 rounded-lg" />
                    </label>
                    <button type="button" aria-label={t('removeNamed', { name: x.name })} onClick={() => void unlink(x)}
                      disabled={busy === x.link_id} className="p-1 text-gray-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-4 py-3 text-xs text-gray-500 border-t">{t('priceNote')}</p>
          </section>

          <section className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-medium text-gray-900">{t('everyBookingHeading')}</h2>
              <p className="text-xs text-gray-500">{t('everyBookingIntro')}</p>
            </div>
            {everyBooking.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">{t('noEveryBooking')}</p>
            ) : (
              <ul className="divide-y">
                {everyBooking.map(x => (
                  <li key={x.id} className="p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{x.name}</p>
                      <p className="text-xs text-gray-500">{ownPrice(x)}</p>
                    </div>
                    <button type="button" onClick={() => void link(x.id)} disabled={busy === x.id}
                      className="text-xs font-medium text-[#647C47] hover:underline">
                      {t('setPriceHere')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
