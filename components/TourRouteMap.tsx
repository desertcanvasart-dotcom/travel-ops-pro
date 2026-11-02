'use client'

// The route: the order of cities, how each leg is travelled and the nights
// (lib/maps/route-strip), with the drawn map of Egypt below it
// (lib/maps/egypt-route-map) — the same two pictures the 日程表 prints, so the
// page, the paper and the customer's portal show one route.
//
// The strip is always shown. The map is open on the tour programme page and
// folded away on a trip's pages, where the day-by-day list follows.

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp, Map as MapIcon, Route } from 'lucide-react'
import { renderEgyptRouteMap, routeStopsFromDays } from '@/lib/maps/egypt-route-map'
import { renderRouteStrip, routeStripFromDays, type StripDay } from '@/lib/maps/route-strip'

export default function TourRouteMap({
  days,
  mapOpen = true,
}: {
  days: StripDay[]
  /** Whether the map starts open (trip pages fold it away). */
  mapOpen?: boolean
}) {
  const t = useTranslations('tours.detail')
  const locale = useLocale()
  const language = locale === 'ja' ? 'ja' : 'en'
  const [showMap, setShowMap] = useState(mapOpen)
  const map = useMemo(() => renderEgyptRouteMap(routeStopsFromDays(days), { language, width: 320 }), [days, language])
  const strip = useMemo(() => {
    const s = routeStripFromDays(days)
    return s ? renderRouteStrip(s, { language }) : null
  }, [days, language])
  if (!map && !strip) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-[#E8EDE0] flex items-center justify-center">
          <Route className="w-4 h-4 text-[#647C47]" />
        </div>
        <span className="text-sm font-semibold text-gray-900">{t('route')}</span>
        {map && <span className="text-xs text-gray-500">{t('routeStops', { count: map.legend.length })}</span>}
      </div>

      {/* Our own HTML and SVG: every label is escaped where they are built. */}
      {strip && <div className="px-4 py-3 overflow-x-auto text-gray-900" dangerouslySetInnerHTML={{ __html: strip }} />}

      {map && (
        <>
          <button
            type="button"
            onClick={() => setShowMap(v => !v)}
            className="w-full px-4 py-2 flex items-center gap-2 border-t border-gray-100 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <MapIcon className="w-3.5 h-3.5 text-[#647C47]" />
            {t('routeMap')}
            {showMap ? <ChevronUp className="w-3.5 h-3.5 ml-auto text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto text-gray-400" />}
          </button>
          {showMap && (
            <div className="px-4 pb-4 flex flex-col sm:flex-row gap-6 items-start">
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
          )}
        </>
      )}
    </div>
  )
}
