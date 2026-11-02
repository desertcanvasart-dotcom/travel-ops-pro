'use client'

// The route on a map of Egypt — the same drawing the 日程表 prints
// (lib/maps/egypt-route-map), so the page, the paper and the customer's
// portal show one route. Static SVG, no tiles: it draws the same offline as
// in the PDF.
//
// Two shapes: an open card on the tour programme page, and a collapsible bar
// on a trip's pages (where the old tile map used to sit — it read only each
// day's overnight city, so a stop like Aswan on the way to Abu Simbel never
// showed).

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react'
import { renderEgyptRouteMap, routeStopsFromDays, type RouteDay } from '@/lib/maps/egypt-route-map'

export default function TourRouteMap({
  days,
  collapsible = false,
  defaultExpanded = true,
}: {
  days: RouteDay[]
  /** A bar that opens on click (trip pages). */
  collapsible?: boolean
  defaultExpanded?: boolean
}) {
  const t = useTranslations('tours.detail')
  const locale = useLocale()
  const [expanded, setExpanded] = useState(!collapsible || defaultExpanded)
  const map = useMemo(
    () => renderEgyptRouteMap(routeStopsFromDays(days), { language: locale === 'ja' ? 'ja' : 'en', width: 320 }),
    [days, locale]
  )
  if (!map) return null

  const body = (
    <div className="flex flex-col sm:flex-row gap-6 items-start">
      {/* Our own SVG: every label is escaped inside renderEgyptRouteMap. */}
      <div className="rounded border border-gray-200 overflow-hidden max-w-full" dangerouslySetInnerHTML={{ __html: map.svg }} />
      <ol className="space-y-2 text-sm text-gray-800">
        {map.legend.map(stop => (
          <li key={stop.n} className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#647C47] text-white text-xs font-bold flex items-center justify-center">
              {stop.n}
            </span>
            {stop.label}
          </li>
        ))}
      </ol>
    </div>
  )

  if (!collapsible) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapIcon className="h-5 w-5 text-[#647C47]" />
          {t('routeMap')}
        </h2>
        {body}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#E8EDE0] flex items-center justify-center">
            <MapIcon className="w-4 h-4 text-[#647C47]" />
          </div>
          <span className="text-sm font-semibold text-gray-900">{t('routeMap')}</span>
          <span className="text-xs text-gray-500">{t('routeStops', { count: map.legend.length })}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && <div className="px-4 pb-4">{body}</div>}
    </div>
  )
}
