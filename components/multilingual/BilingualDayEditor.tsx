'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Languages, Loader2 } from 'lucide-react'
import { LANGUAGE_NAMES, type Language } from '@/types/multilingual'
import { findPlaceholders, type DayText, type DayTranslationStatus } from '@/lib/itineraries/content-language'
import { DayLanguageChip } from './LanguageStatusRow'

interface BilingualDayEditorProps {
  itineraryId: string
  dayId: string
  sourceLanguage: Language
  targetLanguage: Language
  source: DayText
  target: DayText | null
  status: DayTranslationStatus
  /** Called after a save or a translation, to reload the day text. */
  onChanged: () => void | Promise<void>
}

/** Text with template residue marked, so it is seen where it sits. */
export function HighlightPlaceholders({ text }: { text: string | null | undefined }) {
  if (!text) return null
  const matches = [...new Set(findPlaceholders(text).map(p => p.match))]
  if (matches.length === 0) return <>{text}</>
  const escaped = matches.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'g'))
  return (
    <>
      {parts.map((part, i) =>
        matches.includes(part)
          ? <mark key={i} className="bg-red-100 text-red-800 rounded px-0.5" data-testid="placeholder-mark">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

/**
 * One day, source and one target side by side.
 *
 * The source column is read-only — it is the itinerary, edited on the
 * itinerary editor. The target column is the translation: translate it, or
 * write it, and save. Saving is the review: the row is stamped 'reviewed'
 * against the source as it is now (api/itineraries/[id]/day-translations).
 */
export function BilingualDayEditor({
  itineraryId,
  dayId,
  sourceLanguage,
  targetLanguage,
  source,
  target,
  status,
  onChanged,
}: BilingualDayEditorProps) {
  const t = useTranslations('itineraries.detail.languages')
  const [title, setTitle] = useState(target?.title ?? '')
  const [description, setDescription] = useState(target?.description ?? '')
  const [busy, setBusy] = useState<'translate' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A reload after translating replaces the text under the fields.
  useEffect(() => {
    setTitle(target?.title ?? '')
    setDescription(target?.description ?? '')
  }, [target?.title, target?.description])

  const dirty = title !== (target?.title ?? '') || description !== (target?.description ?? '')

  const translate = async () => {
    setBusy('translate')
    setError(null)
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/day-translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: targetLanguage, day_ids: [dayId] }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) throw new Error(data?.error || t('translateFailed'))
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('translateFailed'))
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setError(null)
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/day-translations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: targetLanguage, day_id: dayId, title, description }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) throw new Error(data?.error || t('saveFailed'))
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  const targetPlaceholders = findPlaceholders(`${title}\n${description}`)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="bilingual-day">
      {/* Source — read only */}
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          {LANGUAGE_NAMES[sourceLanguage]} · {t('source')}
        </p>
        <p className="text-sm font-semibold text-gray-900 mb-1"><HighlightPlaceholders text={source.title} /></p>
        <p className="text-sm text-gray-700 whitespace-pre-line"><HighlightPlaceholders text={source.description} /></p>
      </div>

      {/* Target — editable */}
      <div className="rounded-md border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{LANGUAGE_NAMES[targetLanguage]}</p>
          <DayLanguageChip language={targetLanguage} status={status} />
        </div>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          className="w-full mb-2 px-2 py-1 text-sm font-semibold border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t('descriptionPlaceholder')}
          rows={4}
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {targetPlaceholders.length > 0 && (
          <p className="mt-1 text-xs text-red-700">
            {t('placeholdersInText', { samples: [...new Set(targetPlaceholders.map(p => p.match))].join('  ') })}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={translate}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === 'translate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
            {t('translateThisDay')}
          </button>
          {(dirty || status === 'machine' || status === 'outdated' || status === 'translated') && (title || description) && (
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {dirty ? t('saveReviewed') : t('markReviewed')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BilingualDayEditor
