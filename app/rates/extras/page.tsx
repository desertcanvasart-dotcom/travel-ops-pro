'use client'

// ============================================
// Extras — the sellable things that are not attractions
// ============================================
// Airport fast-track, extra luggage, a late check-out. Before this page the
// only way to offer one was to invent an attraction in the rates table, which
// polluted the entrance-fee catalogue and mispriced the day (operator, 1 Sep).
//
// Deliberately NOT where programme upgrades live: an upgrade that belongs to
// one package is authored on its variation (Tours → Options), because a
// Standard and a Deluxe trip sell different upgrades at different prices.
// These are the extras that go with any booking.

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Pencil, Plus, Trash2, X, Sparkles } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'

interface Extra {
  id: string
  name: string
  description: string | null
  category: string | null
  supplier_cost: number | null
  selling_price: number | null
  /** The currency cost and price were entered in; null = the org's rate currency. */
  rate_currency?: string | null
  unit: 'per_person' | 'per_booking'
  is_active: boolean
}

type Draft = {
  id?: string
  name: string
  description: string
  category: string
  supplier_cost: string
  selling_price: string
  /** '' = org default (the RateCurrencyField convention). */
  rate_currency: string
  unit: 'per_person' | 'per_booking'
  is_active: boolean
}

const EMPTY: Draft = {
  name: '', description: '', category: '',
  supplier_cost: '', selling_price: '', rate_currency: '', unit: 'per_person', is_active: true,
}

export default function ExtrasPage() {
  const t = useTranslations('rates.extras')
  const { rateCurrency } = useCurrency()
  const dialog = useConfirmDialog()
  const [extras, setExtras] = useState<Extra[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/extras-catalogue')
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) { setExtras(data.data || []); setError(null) }
      else setError(data.error || t('loadFailed'))
    } catch { setError(t('loadFailed')) } finally { setLoading(false) }
  }, [t])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!draft || saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(
        draft.id ? `/api/extras-catalogue/${draft.id}` : '/api/extras-catalogue',
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify((() => {
            const { rate_currency: picked, ...rest } = draft
            const editing = draft.id ? extras.find(x => x.id === draft.id) : undefined
            return { ...rest, ...rateCurrencyPatch(picked, editing?.rate_currency) }
          })()),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data.error || t('saveFailed')); return }
      setDraft(null)
      await load()
    } finally { setSaving(false) }
  }

  const remove = async (x: Extra) => {
    const ok = await dialog.confirmDelete(x.name)
    if (!ok) return
    const res = await fetch(`/api/extras-catalogue/${x.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) { setError(data.error || t('deleteFailed')); return }
    await load()
  }

  /** Blank stays blank: an unpriced extra says so rather than showing 0.
   *  A row names its own currency; the org's is only the default. */
  const money = (n: number | null, row: { rate_currency?: string | null }) =>
    n == null ? <span className="text-gray-400">{t('unpriced')}</span> : `${row.rate_currency || rateCurrency} ${n}`

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary-600" /> {t('title')}
        </h1>
        {!draft && (
          <button
            type="button"
            onClick={() => setDraft(EMPTY)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> {t('add')}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">{t('subtitle')}</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : (
        <>
          {extras.length === 0 && !draft && (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
              <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('empty')}</p>
            </div>
          )}

          {extras.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">{t('name')}</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">{t('category')}</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">{t('cost')}</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">{t('price')}</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">{t('unit')}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {extras.map(x => (
                    <tr key={x.id} className={`border-t border-gray-100 ${x.is_active ? '' : 'opacity-50'}`}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {x.name}
                        {x.description && <p className="text-xs text-gray-500">{x.description}</p>}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{x.category || '—'}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums">{money(x.supplier_cost, x)}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums font-medium">{money(x.selling_price, x)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {x.unit === 'per_booking' ? t('perBooking') : t('perPerson')}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={t('editNamed', { name: x.name })}
                          onClick={() => setDraft({
                            id: x.id, name: x.name, description: x.description || '',
                            category: x.category || '',
                            supplier_cost: x.supplier_cost?.toString() ?? '',
                            selling_price: x.selling_price?.toString() ?? '',
                            rate_currency: x.rate_currency || '',
                            unit: x.unit, is_active: x.is_active,
                          })}
                          className="p-1.5 text-gray-400 hover:text-primary-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('deleteNamed', { name: x.name })}
                          onClick={() => void remove(x)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {draft && (
        <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">{draft.id ? t('editTitle') : t('addTitle')}</h2>
            <button type="button" onClick={() => setDraft(null)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('name')} *</label>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder={t('namePlaceholder')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('description')}</label>
              <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('category')}</label>
              <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}
                placeholder={t('categoryPlaceholder')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('unit')}</label>
              <select value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value as Draft['unit'] })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="per_person">{t('perPerson')}</option>
                <option value="per_booking">{t('perBooking')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('costLabel')}</label>
              <input type="number" min="0" step="0.01" value={draft.supplier_cost}
                onChange={e => setDraft({ ...draft, supplier_cost: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
              <p className="text-xs text-gray-500 mt-1">{t('costHelp')}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('priceLabel')}</label>
              <input type="number" min="0" step="0.01" value={draft.selling_price}
                onChange={e => setDraft({ ...draft, selling_price: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
              <p className="text-xs text-gray-500 mt-1">{t('priceHelp')}</p>
            </div>
            <RateCurrencyField
              value={draft.rate_currency}
              onChange={v => setDraft({ ...draft, rate_currency: v })}
              className="md:col-span-2"
            />
            <label className="flex items-center gap-2 md:col-span-2">
              <input type="checkbox" checked={draft.is_active}
                onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300" />
              <span className="text-sm text-gray-700">{t('active')}</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setDraft(null)}
              className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              {t('cancel')}
            </button>
            <button type="button" onClick={() => void save()} disabled={saving || !draft.name.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
