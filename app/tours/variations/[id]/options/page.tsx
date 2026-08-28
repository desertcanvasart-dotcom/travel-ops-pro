'use client'

// ============================================
// The options a programme sells
// ============================================
// This is the screen that was missing. tour_variation_services has carried
// is_optional and optional_price_override for a long time, and nothing in the
// app could write either — so the option list could not be authored, the
// calculator's optional picker had nothing to show, and the extras catalogue
// could only ever offer cross-package add-ons.
// See docs/plans/extras-and-upgrades.md §6a.
//
// What is set here is read in two places, and they now agree: the quote (an
// option the customer picks) and a booking's extras (the same option, sold
// afterwards). A price set here is THE price in both — options are priced
// off-margin, so a margin percentage never restates it.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2, Plus, Trash2, Sparkles, Package } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'

interface VariationService {
  id: string
  service_name: string
  service_category: string | null
  quantity_mode: string | null
  quantity_value: number | null
  cost_per_unit: number | null
  day_number: number | null
  is_optional: boolean
  optional_price_override: number | null
}

const CATEGORIES = [
  'activity', 'entrance', 'transportation', 'guide', 'meal',
  'accommodation', 'cruise', 'tips', 'supplies', 'other',
]

const QUANTITY_MODES = ['per_pax', 'per_group', 'fixed', 'per_day', 'per_night', 'per_room']

export default function VariationOptionsPage() {
  const params = useParams()
  const variationId = String(params.id)
  const t = useTranslations('variationOptions')
  const confirmDialog = useConfirm()

  const [services, setServices] = useState<VariationService[]>([])
  const [variationName, setVariationName] = useState<string>('')
  // Costs and prices here are RATE-table amounts, so they are labelled in the
  // org's rate currency — not the display currency a trip is sold in.
  const { rateSymbol } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [svcRes, varRes] = await Promise.all([
        fetch(`/api/tours/variations/${variationId}/services`),
        fetch(`/api/tours/variations/${variationId}`),
      ])
      if (svcRes.ok) {
        const json = await svcRes.json()
        setServices(json.data ?? json ?? [])
      }
      if (varRes.ok) {
        const json = await varRes.json()
        setVariationName(json?.data?.variation_name ?? '')
      }
    } finally {
      setLoading(false)
    }
  }, [variationId])
  useEffect(() => { load() }, [load])

  const patch = async (serviceId: string, fields: Record<string, unknown>) => {
    setBusy(serviceId); setError(null)
    try {
      const res = await fetch(`/api/tours/variations/${variationId}/services`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, ...fields }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || t('couldNotSave')); return }
      await load()
    } finally { setBusy(null) }
  }

  const remove = async (service: VariationService) => {
    const ok = await confirmDialog(t('deleteMessage', { name: service.service_name }), {
      title: t('deleteTitle'), confirmText: t('delete'), variant: 'danger',
    })
    if (!ok) return
    setBusy(service.id); setError(null)
    try {
      const res = await fetch(
        `/api/tours/variations/${variationId}/services?serviceId=${service.id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || t('couldNotDelete')); return }
      await load()
    } finally { setBusy(null) }
  }

  const optional = services.filter(s => s.is_optional)
  const included = services.filter(s => !s.is_optional)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/tours/manage" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> {t('backToProgrammes')}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-[#647C47]" />
        {t('title')}
      </h1>
      {variationName && <p className="text-sm text-gray-600 mb-1">{variationName}</p>}
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
              <h2 className="font-medium text-gray-900">{t('optionsHeading')}</h2>
              <button type="button" onClick={() => { setAdding(v => !v); setError(null) }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#e8ede3]">
                <Plus className="w-3.5 h-3.5" /> {t('addOption')}
              </button>
            </div>

            {adding && (
              <AddOptionForm
                variationId={variationId}
                rateSymbol={rateSymbol}
                onDone={async () => { setAdding(false); await load() }}
                onError={setError}
              />
            )}

            {optional.length === 0 && !adding ? (
              <p className="p-4 text-sm text-gray-500">{t('noOptions')}</p>
            ) : (
              <div className="divide-y">
                {optional.map(s => (
                  <div key={s.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.service_name}</p>
                      <p className="text-xs text-gray-500">
                        {[s.service_category, s.quantity_mode, s.day_number != null ? `${t('day')} ${s.day_number}` : null]
                          .filter(Boolean).join(' · ')}
                        {s.cost_per_unit != null && ` · ${t('costs')} ${rateSymbol}${s.cost_per_unit}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <label className="text-xs text-gray-600">
                        {t('sellsFor')}
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">{rateSymbol}</span>
                          <input
                            type="number" min="0" step="0.01"
                            defaultValue={s.optional_price_override ?? ''}
                            placeholder={t('costPlusMargin')}
                            disabled={busy === s.id}
                            onBlur={e => {
                              const raw = e.target.value
                              const next = raw === '' ? null : Number(raw)
                              if (next === (s.optional_price_override ?? null)) return
                              patch(s.id, { optional_price_override: next })
                            }}
                            className="w-32 px-2 py-1 text-sm border border-gray-300 rounded-lg"
                          />
                        </div>
                      </label>
                      {busy === s.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mt-4" />}
                      {/* Says where it GOES, not that it is being added. The
                          first label was "Include it", which reads as "yes, add
                          this option to the trip" — the operator clicked it on
                          both options and moved them into the base price. */}
                      <button type="button" onClick={() => patch(s.id, { is_optional: false })}
                        disabled={busy === s.id} title={t('makeIncluded')}
                        className="mt-4 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                        {t('makeIncluded')}
                      </button>
                      <button type="button" onClick={() => remove(s)} disabled={busy === s.id}
                        title={t('delete')} className="mt-4 p-1 text-gray-400 hover:text-red-600 disabled:opacity-40">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="px-4 py-3 text-[11px] text-gray-500 border-t">{t('priceNote')}</p>
          </section>

          <section className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-medium text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                {t('includedHeading')}
              </h2>
              <p className="text-xs text-gray-500 mt-1">{t('includedIntro')}</p>
            </div>
            {included.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">{t('noIncluded')}</p>
            ) : (
              <div className="divide-y">
                {included.map(s => (
                  <div key={s.id} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{s.service_name}</p>
                      <p className="text-xs text-gray-500">
                        {[s.service_category, s.day_number != null ? `${t('day')} ${s.day_number}` : null]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button type="button" onClick={() => patch(s.id, { is_optional: true })}
                      disabled={busy === s.id}
                      className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#e8ede3] disabled:opacity-40">
                      {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('makeOptional')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function AddOptionForm({
  variationId, rateSymbol, onDone, onError,
}: { variationId: string; rateSymbol: string; onDone: () => void; onError: (m: string | null) => void }) {
  const t = useTranslations('variationOptions')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('activity')
  const [quantityMode, setQuantityMode] = useState('per_pax')
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true); onError(null)
    try {
      const res = await fetch(`/api/tours/variations/${variationId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_name: name.trim(),
          service_category: category,
          quantity_mode: quantityMode,
          quantity_value: 1,
          cost_per_unit: cost === '' ? null : Number(cost),
          day_number: day === '' ? null : Number(day),
          is_optional: true,
          optional_price_override: price === '' ? null : Number(price),
        }),
      })
      if (!res.ok) { onError((await res.json().catch(() => ({})))?.error || t('couldNotSave')); return }
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="p-4 bg-gray-50 border-b space-y-3">
      <input value={name} onChange={e => setName(e.target.value)} required
        placeholder={t('namePlaceholder')}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <label className="text-xs text-gray-600">
          {t('category')}
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          {t('charged')}
          <select value={quantityMode} onChange={e => setQuantityMode(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg">
            {QUANTITY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          {t('costs')} ({rateSymbol})
          <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
        <label className="text-xs text-gray-600">
          {t('sellsFor')} ({rateSymbol})
          <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
            placeholder={t('costPlusMargin')}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
        <label className="text-xs text-gray-600">
          {t('day')}
          <input type="number" min="1" value={day} onChange={e => setDay(e.target.value)}
            placeholder={t('anyDay')}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
      </div>
      <button type="submit" disabled={busy || !name.trim()}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {t('addOption')}
      </button>
    </form>
  )
}
