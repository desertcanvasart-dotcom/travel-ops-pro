'use client'

import type { GridConfig } from '../types'
import { usableRate } from '@/lib/pricing/usable-rate'
import { convertAmount } from '../lib/calculator'
import { shownDecimals, shownSymbol } from '../lib/display-fx'
import { extraLineSell, type GridExtraOption, type GridExtraPick, type GridExtrasPricing } from '../lib/extras'

interface GridExtrasProps {
  /** The extras this trip is offered, their cost for the group. */
  options: GridExtraOption[]
  picks: GridExtraPick[]
  pricing: GridExtrasPricing
  config: GridConfig
  /** The trip is priced for a programme (its own extras are listed too). */
  hasProgramme: boolean
  warnings: string[]
  onChange: (picks: GridExtraPick[]) => void
}

/**
 * Sell → Extras on the grid: tick one and it is a priced line of the quote.
 * A set price is the price; a blank one is cost + the quote's margin; an
 * extra with neither is listed as unpriced and adds nothing.
 */
export default function GridExtras({ options, picks, pricing, config, hasProgramme, warnings, onChange }: GridExtrasProps) {
  const sym = shownSymbol(config)
  const decimals = shownDecimals(config)
  const fmt = (n: number) => `${sym}${convertAmount(n, config.exchangeRate).toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  const picked = new Set(picks.map(p => p.id))
  const lineOf = new Map(pricing.lines.map(l => [l.service_id, l]))
  const m = config.marginPercent

  if (options.length === 0 && picks.length === 0) return null

  const toggle = (x: GridExtraOption) =>
    onChange(picked.has(x.id) ? picks.filter(p => p.id !== x.id) : [...picks, { id: x.id, name: x.name }])

  // What one unit sells for, before any season premium — as the line will.
  const unitPrice = (x: GridExtraOption): string => {
    const set = usableRate(x.selling_price)
    const cost = usableRate(x.supplier_cost)
    const sell = set ?? (cost != null ? Math.round(cost * (1 + m / 100) * 100) / 100 : null)
    if (sell == null) return 'unpriced'
    return `${fmt(sell)} ${x.unit === 'per_person' ? '/ person' : '/ booking'}`
  }

  const notOffered = picks.filter(p => !options.some(o => o.id === p.id))

  return (
    <section className="mt-4 bg-white border border-gray-200 rounded-xl p-4" data-testid="grid-extras">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Extras</h3>
        <span className="text-xs text-gray-500">
          {hasProgramme ? 'Offered with every booking and with this programme' : 'Offered with every booking'}
          {pricing.lines.length > 0 && <> · {pricing.lines.length} added, {fmt(pricing.sell_total)}</>}
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {options.map(x => {
          const line = lineOf.get(x.id)
          const lineSell = line ? extraLineSell(line, m) : null
          const unpriced = unitPrice(x) === 'unpriced'
          return (
            <li key={x.id} className="py-1.5 flex items-start gap-3">
              <input
                id={`grid-extra-${x.id}`}
                type="checkbox"
                className="mt-0.5 accent-[#647C47]"
                checked={picked.has(x.id)}
                onChange={() => toggle(x)}
              />
              <label htmlFor={`grid-extra-${x.id}`} className="flex-1 min-w-0 cursor-pointer">
                <span className="text-sm text-gray-800">{x.name}</span>
                <span className="block text-[11px] text-gray-500">
                  {[
                    x.category,
                    x.activity_name ? `cost from Activities (${x.activity_name})` : null,
                    x.programme_price ? "this programme's price" : null,
                    usableRate(x.selling_price) != null ? 'set price, no margin added' : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </label>
              <span className={`text-xs tabular-nums whitespace-nowrap ${unpriced ? 'text-amber-700' : 'text-gray-600'}`}>
                {line && lineSell != null ? `${fmt(lineSell)} (${unitPrice(x)})` : unitPrice(x)}
              </span>
            </li>
          )
        })}
        {notOffered.map(p => (
          <li key={p.id} className="py-1.5 flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" checked onChange={() => onChange(picks.filter(q => q.id !== p.id))} aria-label={`Remove ${p.name || 'extra'}`} />
            <span className="flex-1 text-sm text-gray-500 line-through">{p.name || 'An extra'}</span>
            <span className="text-xs text-amber-700">no longer offered</span>
          </li>
        ))}
      </ul>
      {(pricing.holes.length > 0 || warnings.length > 0) && (
        <div className="mt-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
          {[...warnings, ...pricing.holes.map(h => h.message)].map(w => <div key={w}>{w}</div>)}
        </div>
      )}
    </section>
  )
}
