'use client'

import { useTranslations } from 'next-intl'
import { Columns2, User } from 'lucide-react'
import { LANGUAGE_NAMES, type Language } from '@/types/multilingual'
import type { LanguageSummary } from '@/lib/itineraries/content-language'

export type ContentView = Language | 'side'

interface LanguageStatusRowProps {
  sourceLanguage: Language
  targets: LanguageSummary[]
  clientLanguage: Language | null
  view: ContentView
  onSelect: (view: ContentView) => void
}

const STATUS_STYLE: Record<LanguageSummary['status'], string> = {
  source: 'bg-gray-50 text-gray-700 border-gray-300',
  reviewed: 'bg-green-50 text-green-700 border-green-200',
  machine: 'bg-blue-50 text-blue-700 border-blue-200',
  partial: 'bg-amber-50 text-amber-800 border-amber-200',
  outdated: 'bg-amber-50 text-amber-800 border-amber-300',
  missing: 'bg-red-50 text-red-700 border-red-200',
}

/**
 * The trip's content languages, in the header: which one is the source and
 * what state every other one is in. Each chip opens that language in the
 * Daily Itinerary; "Side by side" opens source and target together.
 *
 * Content language only — the staff UI language is the sidebar's switch and
 * never follows the itinerary.
 */
export function LanguageStatusRow({ sourceLanguage, targets, clientLanguage, view, onSelect }: LanguageStatusRowProps) {
  const t = useTranslations('itineraries.detail.languages')

  const chip = (lang: Language, status: LanguageSummary['status'], detail: string) => {
    const isClient = clientLanguage === lang
    const active = view === lang
    return (
      <button
        key={lang}
        type="button"
        onClick={() => onSelect(lang)}
        data-testid={`language-chip-${lang}`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium transition-shadow ${STATUS_STYLE[status]} ${active ? 'ring-2 ring-primary-500 ring-offset-1' : 'hover:shadow-sm'}`}
        title={isClient ? t('clientReadsThis') : undefined}
      >
        <span className="font-semibold">{LANGUAGE_NAMES[lang]}</span>
        <span className="opacity-60">·</span>
        <span>{detail}</span>
        {isClient && (
          <>
            <span className="opacity-60">·</span>
            <User className="w-3 h-3" aria-hidden />
            <span>{t('clientLanguage')}</span>
          </>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="language-status-row">
      {chip(sourceLanguage, 'source', t('source'))}
      {targets.map(summary => {
        const done = summary.total - summary.counts.missing
        const detail =
          summary.status === 'missing' ? t('missing')
          : summary.status === 'partial' ? t('partial', { done, total: summary.total })
          : summary.status === 'outdated' ? t('outdated', { count: summary.counts.outdated })
          : summary.status === 'machine' ? t('machine', { count: summary.counts.machine })
          : t('reviewed')
        return chip(summary.language, summary.status, detail)
      })}
      {targets.length > 0 && (
        <button
          type="button"
          onClick={() => onSelect('side')}
          data-testid="language-chip-side"
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 ${view === 'side' ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`}
        >
          <Columns2 className="w-3 h-3" aria-hidden />
          {t('sideBySide')}
        </button>
      )}
    </div>
  )
}

/** The status of one day in one target language, for the day cards. */
export function DayLanguageChip({ language, status }: { language: Language; status: string }) {
  const t = useTranslations('itineraries.detail.languages')
  const style: Record<string, string> = {
    missing: 'bg-red-50 text-red-700 border-red-200',
    machine: 'bg-blue-50 text-blue-700 border-blue-200',
    reviewed: 'bg-green-50 text-green-700 border-green-200',
    outdated: 'bg-amber-50 text-amber-800 border-amber-300',
    translated: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  const label: Record<string, string> = {
    missing: t('dayMissing'),
    machine: t('dayMachine'),
    reviewed: t('dayReviewed'),
    outdated: t('dayOutdated'),
    translated: t('dayTranslated'),
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${style[status] ?? style.translated}`}
      data-testid={`day-language-${language}`}
    >
      {LANGUAGE_NAMES[language]} · {label[status] ?? status}
    </span>
  )
}

export default LanguageStatusRow
