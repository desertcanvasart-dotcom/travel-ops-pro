'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Plus } from 'lucide-react'
import {
  coverageGrid,
  type CoverageAssignment,
  type CoverageDay,
  type CoverageType,
} from '@/lib/itineraries/coverage'

interface CoverageGridProps {
  itineraryId: string
  days: CoverageDay[]
  /** Bumped by the page after an assignment changes, to reload. */
  refreshKey?: number
  /** Open the assignment panel on a type (a missing cell's "Assign"). */
  onAssign?: (type: CoverageType) => void
  /** The trip's assignments when the page has loaded them already (null while
   *  loading). Left out, the grid loads them itself. */
  assignments?: CoverageAssignment[] | null
}

/**
 * Days across, resource types down: what each day's services ask for and
 * whether it is assigned (lib/itineraries/coverage.ts). Replaces the two
 * "nothing assigned" empty states, which said nothing about what was NEEDED.
 */
export default function CoverageGrid({ itineraryId, days, refreshKey = 0, onAssign, assignments: given }: CoverageGridProps) {
  const t = useTranslations('itineraries.detail.coverage')
  const tRes = useTranslations('resourceAssignment')
  const [loaded, setLoaded] = useState<CoverageAssignment[] | null>(null)
  const [failed, setFailed] = useState(false)
  const fromPage = given !== undefined
  const assignments = fromPage ? given : loaded

  useEffect(() => {
    if (fromPage) return
    let live = true
    fetch(`/api/itinerary-resources?itinerary_id=${itineraryId}`)
      .then(r => r.json())
      .then(data => {
        if (!live) return
        if (data.success) { setLoaded(data.data); setFailed(false) } else setFailed(true)
      })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [itineraryId, refreshKey, fromPage])

  const grid = useMemo(() => coverageGrid(days, assignments ?? []), [days, assignments])

  const label: Record<CoverageType, string> = {
    guide: tRes('guides'),
    vehicle: tRes('vehicles'),
    hotel: tRes('hotels'),
    cruise: tRes('nileCruises'),
    restaurant: tRes('restaurants'),
    airport_staff: tRes('airportStaff'),
    hotel_staff: tRes('hotelStaff'),
  }

  const missing = grid.needed - grid.covered

  return (
    <section className="bg-white rounded-lg border border-gray-200 shadow-sm" data-testid="coverage-grid">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
          <p className="text-xs text-gray-600">{t('subtitle')}</p>
        </div>
        {assignments !== null && grid.needed > 0 && (
          <span
            className={`px-2 py-0.5 rounded border text-xs font-medium ${missing === 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
            data-testid="coverage-summary"
          >
            {t('summary', { covered: grid.covered, needed: grid.needed })}
          </span>
        )}
      </div>

      {failed ? (
        <p className="px-4 pb-4 text-sm text-red-700">{t('loadFailed')}</p>
      ) : assignments === null ? (
        <div className="px-4 pb-4"><div className="h-24 bg-gray-100 rounded animate-pulse" /></div>
      ) : grid.rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-500">{t('nothingNeeded')}</p>
      ) : (
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white text-left font-medium text-gray-500 pr-2 py-1 min-w-[9rem]" />
                {days.map(d => (
                  <th key={d.id} className="font-medium text-gray-500 px-1 py-1 min-w-[5.5rem]">
                    <div>{t('day', { number: d.day_number })}</div>
                    <div className="font-normal text-gray-400">
                      {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map(row => (
                <tr key={row.type} data-testid={`coverage-row-${row.type}`}>
                  <th scope="row" className="sticky left-0 bg-white text-left font-medium text-gray-800 pr-2 py-1 whitespace-nowrap">
                    {label[row.type]}
                    {row.needed > 0 && <span className="ml-1 font-normal text-gray-400">{row.covered}/{row.needed}</span>}
                  </th>
                  {row.cells.map(cell => (
                    <td key={cell.dayId} className="p-0 align-top" data-state={cell.state}>
                      {cell.state === 'covered' || cell.state === 'extra' ? (
                        <div
                          className={`h-full rounded px-1.5 py-1 ${cell.state === 'covered' ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}
                          title={cell.state === 'extra' ? t('extraHint') : cell.assigned.join(', ')}
                        >
                          <span className="flex items-center gap-1">
                            {cell.state === 'covered' && <Check className="w-3 h-3 shrink-0" aria-hidden />}
                            <span className="truncate max-w-[6.5rem]">{cell.assigned[0]}</span>
                          </span>
                          {cell.assigned.length > 1 && <span className="text-[10px] opacity-70">+{cell.assigned.length - 1}</span>}
                        </div>
                      ) : cell.state === 'missing' ? (
                        <button
                          type="button"
                          onClick={() => onAssign?.(row.type)}
                          className="w-full rounded border border-dashed border-red-300 bg-red-50 px-1.5 py-1 text-left text-red-700 hover:bg-red-100"
                        >
                          <span className="flex items-center gap-1"><Plus className="w-3 h-3" aria-hidden />{t('assign')}</span>
                        </button>
                      ) : (
                        <div className="rounded px-1.5 py-1 text-gray-300">—</div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
