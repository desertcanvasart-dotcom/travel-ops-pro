'use client'

// ============================================
// Cities a guide works in — edited from Guide Rates, saved on the supplier
// ============================================
// Operator, 2026-11-13: a guide charges the same wherever they guide, so the
// cities belong to the guide, not to each rate (supplier_cities, migration
// 20270118; model in lib/guides/guide-cities). Edited here, beside the
// guide's languages, because the supplier form stays contact-only
// (lib/suppliers/fields.ts). No cities = the guide works in every city.
// ============================================

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MapPin, Edit, Save, X, Loader2 } from 'lucide-react'
import CityOptions from '@/app/components/CityOptions'
import { cleanCityList } from '@/lib/guides/guide-cities'

type Props = {
  guide: { id: string; name: string }
  /** Called with the guide's cities when they load and after each save. */
  onChange?: (cities: string[]) => void
}

export default function GuideCitiesEditor({ guide, onChange }: Props) {
  const t = useTranslations('rates.guides')
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    setEditing(false)
    fetch(`/api/suppliers/${guide.id}/cities`)
      .then(r => r.json())
      .then(j => {
        if (!live) return
        const list = j?.success && Array.isArray(j.data) ? cleanCityList(j.data) : []
        setCities(list)
        onChange?.(list)
      })
      .catch(() => { /* shown as every city; a save still works */ })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
    // onChange is the caller's setter; re-running on its identity would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide.id])

  const add = (city: string) => {
    if (!city || draft.some(c => c.toLowerCase() === city.toLowerCase())) return
    setDraft(prev => [...prev, city])
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/suppliers/${guide.id}/cities`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cities: draft }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) throw new Error(json.error || t('citiesFailed'))
      const saved = cleanCityList(json.data)
      setCities(saved)
      setEditing(false)
      setNotice({ tone: 'ok', text: t('citiesSaved', { name: guide.name }) })
      onChange?.(saved)
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : t('citiesFailed') })
    } finally {
      setSaving(false)
      setTimeout(() => setNotice(null), 4000)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center gap-3" data-testid="guide-cities-editor">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <MapPin className="w-4 h-4 text-primary-600" />
        {t('guideCities')} — {guide.name}
      </div>

      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      ) : editing ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.length === 0 && (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">{t('everyCity')}</span>
            )}
            {draft.map(c => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800 ring-1 ring-primary-200">
                {c}
                <button
                  type="button"
                  aria-label={t('removeCity', { city: c })}
                  onClick={() => setDraft(prev => prev.filter(x => x !== c))}
                  className="ml-0.5 rounded-full px-1 leading-none text-primary-700 hover:bg-primary-100"
                >
                  ×
                </button>
              </span>
            ))}
            <select
              value=""
              onChange={e => add(e.target.value)}
              aria-label={t('addCity')}
              className="h-8 w-auto min-w-[10rem] px-2 text-xs border border-gray-200 rounded-lg"
            >
              <option value="">{t('addCity')}</option>
              <CityOptions />
            </select>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t('saveCities')}
            </button>
            <button type="button" onClick={() => { setDraft(cities); setEditing(false) }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {cities.length === 0
              ? <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">{t('everyCity')}</span>
              : cities.map(c => (
                  <span key={c} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">{c}</span>
                ))}
          </div>
          <button type="button" onClick={() => { setDraft(cities); setEditing(true) }} className="ml-auto inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <Edit className="w-3.5 h-3.5" /> {t('editCities')}
          </button>
        </>
      )}

      <p className="w-full text-[11px] text-gray-500">{t('citiesHint')}</p>
      {notice && (
        <p className={`w-full text-xs ${notice.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</p>
      )}
    </div>
  )
}
