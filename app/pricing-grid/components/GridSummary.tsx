'use client'

import type { GridTotals, GridConfig } from '../types'

interface GridSummaryProps {
  totals: GridTotals
  config: GridConfig
  dayCount: number
}

export default function GridSummary({ totals, config, dayCount }: GridSummaryProps) {
  const { pax, marginPercent, currency } = config
  const sym = currency === 'EUR' ? '\u20AC' : currency === 'USD' ? '$' : currency === 'GBP' ? '\u00A3' : currency
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-4">
      {/* Header */}
      <div className="px-5 py-3 bg-gray-800 text-white flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Grand Summary</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {dayCount} days \u00B7 {pax} pax \u00B7 {config.passport === 'eu' ? 'EU' : 'Non-EU'} \u00B7 {config.tier} \u00B7 {config.clientType.toUpperCase()}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400 uppercase">Avg per day</div>
          <div className="text-sm font-bold text-gray-300">
            {sym}{dayCount > 0 ? fmt(totals.costPerPerson / dayCount) : '0.00'}/pp
          </div>
        </div>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-100">
        <SummaryCell label="Cost / Person" value={totals.costPerPerson} symbol={sym} />
        <SummaryCell label="Total Cost" value={totals.totalCost} symbol={sym} />
        <SummaryCell
          label={`Margin (${marginPercent}%)`}
          value={totals.marginAmount}
          symbol={sym}
          color={totals.marginAmount > 0 ? 'text-amber-600' : 'text-red-500'}
        />
        <SummaryCell label="Selling / Person" value={totals.sellingPricePerPerson} symbol={sym} color="text-green-600" highlight />
        <SummaryCell label="Selling Total" value={totals.sellingPriceTotal} symbol={sym} color="text-green-700" highlight />
      </div>
    </div>
  )
}

function SummaryCell({ label, value, symbol, color, highlight }: {
  label: string; value: number; symbol: string; color?: string; highlight?: boolean
}) {
  return (
    <div className={`px-4 py-3 ${highlight ? 'bg-green-50/50' : ''}`}>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color || 'text-gray-900'}`}>
        {symbol}{value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}
