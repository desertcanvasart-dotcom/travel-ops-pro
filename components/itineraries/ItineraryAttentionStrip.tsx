'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle, Info } from 'lucide-react'
import { LANGUAGE_NAMES } from '@/types/multilingual'
import type { AttentionItem } from '@/lib/itineraries/itinerary-attention'

interface ItineraryAttentionStripProps {
  items: AttentionItem[]
  /** Open the item's language (or the side-by-side view) in Daily Itinerary. */
  onOpen?: (item: AttentionItem) => void
}

const SEVERITY_STYLE: Record<AttentionItem['severity'], string> = {
  high: 'border-red-200 bg-red-50 text-red-900',
  medium: 'border-amber-200 bg-amber-50 text-amber-900',
  low: 'border-blue-200 bg-blue-50 text-blue-900',
}

/**
 * What is wrong with this trip, one line each, worst first
 * (lib/itineraries/itinerary-attention.ts). Nothing here blocks a send;
 * it is the list of things to look at before one.
 */
export default function ItineraryAttentionStrip({ items, onOpen }: ItineraryAttentionStripProps) {
  const t = useTranslations('itineraries.detail.attention')
  if (items.length === 0) return null

  const message = (item: AttentionItem) => {
    const language = item.language ? LANGUAGE_NAMES[item.language] : ''
    const p = { ...item.params, language }
    switch (item.code) {
      case 'clientLanguageMissing': return t('clientLanguageMissing', p)
      case 'clientLanguageUnreviewed': return t('clientLanguageUnreviewed', p)
      case 'languageOutdated': return t('languageOutdated', p)
      case 'placeholders': return t('placeholders', p)
      case 'tipsConflict': return t('tipsConflict', p)
      case 'invoicedWithoutBooking': return t('invoicedWithoutBooking', p)
      case 'overnightWithoutStay': return t('overnightWithoutStay', p)
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm p-3" data-testid="needs-attention">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {t('title', { count: items.length })}
      </h2>
      <ul className="space-y-1.5">
        {items.map(item => {
          const Icon = item.severity === 'low' ? Info : AlertTriangle
          const actionable = onOpen && (item.language || item.days)
          return (
            <li
              key={item.key}
              data-testid={`attention-${item.code}`}
              className={`flex items-start gap-2 rounded border px-2.5 py-1.5 text-sm ${SEVERITY_STYLE[item.severity]}`}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <span className="flex-1">{message(item)}</span>
              {actionable && (
                <button
                  type="button"
                  onClick={() => onOpen!(item)}
                  className="shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  {t('open')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
