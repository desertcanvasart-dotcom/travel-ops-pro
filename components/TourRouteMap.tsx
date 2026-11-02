'use client'

// The tour's route on a map of Egypt — the same drawing the 日程表 prints
// (lib/maps/egypt-route-map), so the page and the paper show one route.
// Static SVG, no tiles: renders the same offline as in the PDF.

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Map as MapIcon } from 'lucide-react'
import { renderEgyptRouteMap, routeStopsFromDays, type RouteDay } from '@/lib/maps/egypt-route-map'

export default function TourRouteMap({ days }: { days: RouteDay[] }) {
  const t = useTranslations('tours.detail')
  const locale = useLocale()
  const map = useMemo(
    () => renderEgyptRouteMap(routeStopsFromDays(days), { language: locale === 'ja' ? 'ja' : 'en', width: 320 }),
    [days, locale]
  )
  if (!map) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <MapIcon className="h-5 w-5 text-[#647C47]" />
        {t('routeMap')}
      </h2>
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
    </div>
  )
}
