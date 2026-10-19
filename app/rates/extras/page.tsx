'use client'

// ============================================
// Extras — the sellable things that are not attractions
// ============================================
// Airport fast-track, extra luggage, a late check-out. Before this page the
// only way to offer one was to invent an attraction in the rates table, which
// polluted the entrance-fee catalogue and mispriced the day (operator, 1 Sep).
//
// ONE list since 20270107 (it absorbed Tours → Options): each extra is offered
// with every booking, or only with the programmes picked here — each at its
// own price when one is set. An extra that is an activity takes its cost from
// Rates → Activities, so the rate is entered once (operator, 2026-10-19).

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Pencil, Plus, Trash2, X, Sparkles, Copy } from 'lucide-react'
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
  offered_with?: 'all' | 'programmes' | null
  activity_rate_id?: string | null
  activity_name?: string | null
  activity_city?: string | null
  programmes?: { template_id: string; template_code: string | null; template_name: string | null; selling_price: number | null }[]
}

type ProgrammeDraft = { template_id: string; selling_price: string }
type ProgrammeOption = { id: string; template_code: string | null; template_name: string | null }
type ActivityOption = { id: string; activity_name: string; city: string | null; is_active: boolean | null }

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
  offered_with: 'all' | 'programmes'
  /** Cost from an Activities rate (activity_rate_id) instead of typed. */
  cost_from_activity: boolean
  activity_rate_id: string
  programmes: ProgrammeDraft[]
}

const EMPTY: Draft = {
  name: '', description: '', category: '',
  supplier_cost: '', selling_price: '', rate_currency: '', unit: 'per_person', is_active: true,
  offered_with: 'all', cost_from_activity: false, activity_rate_id: '', programmes: [],
}

/** The form's copy of a saved extra; `copy` drops the id (Duplicate). */
function draftOf(x: Extra, copy = false): Draft {
  return {
    ...(copy ? {} : { id: x.id }),
    name: copy ? `${x.name} (copy)` : x.name,
    description: x.description || '',
    category: x.category || '',
    supplier_cost: x.supplier_cost?.toString() ?? '',
    selling_price: x.selling_price?.toString() ?? '',
    rate_currency: x.rate_currency || '',
    unit: x.unit, is_active: x.is_active,
    offered_with: x.offered_with === 'programmes' ? 'programmes' : 'all',
    cost_from_activity: !!x.activity_rate_id,
    activity_rate_id: x.activity_rate_id || '',
    programmes: (x.programmes ?? []).map(p => ({ template_id: p.template_id, selling_price: p.selling_price?.toString() ?? '' })),
  }
}

export default function ExtrasPage() {
  const t = useTranslations('rates.extras')
  const tCommon = useTranslations('common')
  const tRates = useTranslations('rates.common')
  const { rateCurrency } = useCurrency()
  const dialog = useConfirmDialog()
  const [extras, setExtras] = useState<Extra[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A delete refused because saved quotes sell the extra: what to say, and
  // the extra the Deactivate button would switch off.
  const [inUse, setInUse] = useState<{ extra: Extra; count: number; quoteNumbers: string[] } | null>(null)

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

  // The programmes and activities the form picks from — fetched once, when
  // the form first opens.
  const [programmeOptions, setProgrammeOptions] = useState<ProgrammeOption[] | null>(null)
  const [activityOptions, setActivityOptions] = useState<ActivityOption[] | null>(null)
  useEffect(() => {
    if (!draft || programmeOptions) return
    fetch('/api/tours/templates?slim=1').then(r => r.json()).then(d => setProgrammeOptions(d?.data || [])).catch(() => setProgrammeOptions([]))
    fetch('/api/rates/activities').then(r => r.json()).then(d => setActivityOptions(d?.data || [])).catch(() => setActivityOptions([]))
  }, [draft, programmeOptions])
  const programmeLabel = (id: string) => {
    const p = programmeOptions?.find(o => o.id === id)
    return p ? [p.template_code, p.template_name].filter(Boolean).join(' — ') : id
  }

  const save = async () => {
    if (!draft || saving) return
    if (draft.offered_with === 'programmes' && draft.programmes.length === 0) { setError(t('pickProgramme')); return }
    if (draft.cost_from_activity && !draft.activity_rate_id) { setError(t('pickActivity')); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(
        draft.id ? `/api/extras-catalogue/${draft.id}` : '/api/extras-catalogue',
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify((() => {
            const { rate_currency: picked, programmes, cost_from_activity, activity_rate_id, ...rest } = draft
            const editing = draft.id ? extras.find(x => x.id === draft.id) : undefined
            return {
              ...rest,
              ...rateCurrencyPatch(picked, editing?.rate_currency),
              activity_rate_id: cost_from_activity ? activity_rate_id || null : null,
              // An extra linked to an activity takes its cost from there.
              ...(cost_from_activity ? { supplier_cost: '' } : {}),
              programmes: rest.offered_with === 'programmes' ? programmes : [],
            }
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
    setInUse(null)
    const res = await fetch(`/api/extras-catalogue/${x.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.status === 409 && data.in_use) {
      setError(null)
      setInUse({ extra: x, count: data.in_use.count, quoteNumbers: data.in_use.quote_numbers || [] })
      return
    }
    if (!res.ok || !data.success) { setError(data.error || t('deleteFailed')); return }
    await load()
  }

  const deactivate = async (x: Extra) => {
    const res = await fetch(`/api/extras-catalogue/${x.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) { setError(data.error || t('deactivateFailed')); return }
    setInUse(null)
    await load()
  }

  /** Blank stays blank: an unpriced extra says so rather than showing 0.
   *  A row names its own currency; the org's is only the default. */
  const money = (n: number | null, row: { rate_currency?: string | null }) =>
    n == null ? <span className="text-gray-400">{t('unpriced')}</span> : `${row.rate_currency || rateCurrency} ${n}`

  const q = searchTerm.trim().toLowerCase()
  const filtered = q
    ? extras.filter(x =>
        x.name.toLowerCase().includes(q) ||
        (x.description || '').toLowerCase().includes(q) ||
        (x.category || '').toLowerCase().includes(q))
    : extras

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
      {inUse && (
        <div role="alert" className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start justify-between gap-3">
          <p>
            {t('inUse', {
              name: inUse.extra.name,
              count: inUse.count,
              numbers: inUse.quoteNumbers.join(', ') + (inUse.count > inUse.quoteNumbers.length ? ', …' : ''),
            })}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {inUse.extra.is_active && (
              <button
                type="button"
                onClick={() => void deactivate(inUse.extra)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
              >
                {t('deactivate')}
              </button>
            )}
            <button type="button" aria-label={t('cancel')} onClick={() => setInUse(null)} className="p-1 text-amber-700 hover:text-amber-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={tRates('searchPlaceholder')}
                className="w-full md:w-80 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
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
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">{t('offeredWith')}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">{tRates('noRatesFound')}</td></tr>
                  )}
                  {filtered.map(x => (
                    <tr key={x.id} className={`border-t border-gray-100 ${x.is_active ? '' : 'opacity-50'}`}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {x.name}
                        {x.description && <p className="text-xs text-gray-500">{x.description}</p>}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{x.category || '—'}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums">
                        {x.activity_rate_id
                          ? <span className="text-xs text-gray-600">{x.activity_name ? t('fromActivity', { name: x.activity_name }) : <span className="text-amber-700">{t('activityGone')}</span>}</span>
                          : money(x.supplier_cost, x)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums font-medium">{money(x.selling_price, x)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {x.unit === 'per_booking' ? t('perBooking') : t('perPerson')}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {x.offered_with === 'programmes'
                          ? ((x.programmes ?? []).length === 0
                              ? <span className="text-amber-700">{t('noProgrammes')}</span>
                              : (x.programmes ?? []).map(p => (
                                  <span key={p.template_id} className="block">
                                    {p.template_code || p.template_name}
                                    {p.selling_price != null && <span className="text-gray-500"> · {x.rate_currency || rateCurrency} {p.selling_price}</span>}
                                  </span>
                                )))
                          : t('everyBooking')}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={tCommon('duplicate')}
                          title={tCommon('duplicate')}
                          onClick={() => setDraft(draftOf(x, true))}
                          className="p-1.5 text-gray-400 hover:text-primary-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('editNamed', { name: x.name })}
                          onClick={() => setDraft(draftOf(x))}
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
              <select
                aria-label={t('costFrom')}
                value={draft.cost_from_activity ? 'activity' : 'typed'}
                onChange={e => setDraft({ ...draft, cost_from_activity: e.target.value === 'activity' })}
                className="w-full mb-2 px-3 py-2 text-sm border border-gray-300 rounded-lg"
              >
                <option value="typed">{t('costTyped')}</option>
                <option value="activity">{t('costFromActivity')}</option>
              </select>
              {draft.cost_from_activity ? (
                <>
                  <select value={draft.activity_rate_id} onChange={e => setDraft({ ...draft, activity_rate_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                    <option value="">{t('pickActivity')}</option>
                    {(activityOptions ?? []).filter(a => a.is_active !== false || a.id === draft.activity_rate_id).map(a => (
                      <option key={a.id} value={a.id}>{a.activity_name}{a.city ? ` — ${a.city}` : ''}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{t('activityHelp')}</p>
                </>
              ) : (
                <>
                  <input type="number" min="0" step="0.01" value={draft.supplier_cost}
                    onChange={e => setDraft({ ...draft, supplier_cost: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                  <p className="text-xs text-gray-500 mt-1">{t('costHelp')}</p>
                </>
              )}
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
            <fieldset className="md:col-span-2">
              <legend className="block text-xs font-medium text-gray-600 mb-1">{t('offeredWith')}</legend>
              <div className="flex flex-wrap gap-4 mb-2">
                {(['all', 'programmes'] as const).map(v => (
                  <label key={v} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="offered_with" checked={draft.offered_with === v}
                      onChange={() => setDraft({ ...draft, offered_with: v })} />
                    {v === 'all' ? t('everyBooking') : t('onlyProgrammes')}
                  </label>
                ))}
              </div>
              {draft.offered_with === 'programmes' && (
                <div className="space-y-2">
                  {draft.programmes.map((p, i) => (
                    <div key={p.template_id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-800">{programmeLabel(p.template_id)}</span>
                      <input type="number" min="0" step="0.01" value={p.selling_price}
                        aria-label={t('programmePrice')} placeholder={t('programmePrice')}
                        onChange={e => setDraft({ ...draft, programmes: draft.programmes.map((q, j) => j === i ? { ...q, selling_price: e.target.value } : q) })}
                        className="w-40 px-3 py-1.5 text-sm border border-gray-300 rounded-lg" />
                      <button type="button" aria-label={t('removeProgramme', { name: programmeLabel(p.template_id) })}
                        onClick={() => setDraft({ ...draft, programmes: draft.programmes.filter((_, j) => j !== i) })}
                        className="p-1 text-gray-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <select value="" onChange={e => e.target.value && setDraft({ ...draft, programmes: [...draft.programmes, { template_id: e.target.value, selling_price: '' }] })}
                    className="w-full md:w-96 px-3 py-2 text-sm border border-gray-300 rounded-lg">
                    <option value="">{t('addProgramme')}</option>
                    {(programmeOptions ?? []).filter(o => !draft.programmes.some(p => p.template_id === o.id)).map(o => (
                      <option key={o.id} value={o.id}>{[o.template_code, o.template_name].filter(Boolean).join(' — ')}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">{t('programmesHelp')}</p>
                </div>
              )}
            </fieldset>
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
