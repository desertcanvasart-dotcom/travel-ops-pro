'use client'

// ============================================
// Languages a guide works in — edited from Guide Rates, saved on the supplier
// ============================================
// The supplier form stopped collecting languages on 2026-08-22 (it is contact
// + location only). The engine still matches a guide to a language through
// suppliers.languages when no guide_rates row covers it, so the fact must
// remain editable — and the place to edit it is where the guide is priced.
// ============================================

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Languages, Edit, Save, X, Loader2, Check } from 'lucide-react'

export const GUIDE_LANGUAGE_OPTIONS = [
  'English', 'Japanese', 'French', 'German', 'Spanish', 'Italian',
  'Russian', 'Chinese', 'Portuguese', 'Dutch', 'Polish',
] as const

type Props = {
  guide: { id: string; name: string; languages?: string[] | null }
  /** Called with the saved list so the caller can refresh its roster. */
  onSaved?: (languages: string[]) => void
}

export default function GuideLanguagesEditor({ guide, onSaved }: Props) {
  const t = useTranslations('rates.guides')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(guide.languages || [])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setDraft(guide.languages || [])
    setEditing(false)
  }, [guide.id, guide.languages])

  const toggle = (lang: string) =>
    setDraft(prev => (prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]))

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/suppliers/${guide.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languages: draft }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('languagesFailed'))
      setEditing(false)
      setNotice({ tone: 'ok', text: t('languagesSaved', { name: guide.name }) })
      onSaved?.(draft)
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : t('languagesFailed') })
    } finally {
      setSaving(false)
      setTimeout(() => setNotice(null), 4000)
    }
  }

  const current = guide.languages || []

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <Languages className="w-4 h-4 text-primary-600" />
        {t('guideLanguages')} — {guide.name}
      </div>

      {editing ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {GUIDE_LANGUAGE_OPTIONS.map(lang => {
              const on = draft.includes(lang)
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggle(lang)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${on ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                >
                  {on && <Check className="w-3 h-3 inline mr-1" />}{lang}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t('saveLanguages')}
            </button>
            <button type="button" onClick={() => { setDraft(current); setEditing(false) }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {current.length === 0
              ? <span className="text-xs text-gray-400">{t('noLanguages')}</span>
              : current.map(l => <span key={l} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">{l}</span>)}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="ml-auto inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <Edit className="w-3.5 h-3.5" /> {t('editLanguages')}
          </button>
        </>
      )}

      <p className="w-full text-[11px] text-gray-500">{t('languagesHint')}</p>
      {notice && (
        <p className={`w-full text-xs ${notice.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</p>
      )}
    </div>
  )
}
