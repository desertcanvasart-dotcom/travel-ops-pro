'use client'

import type { GridTotals, GridConfig } from '../types'

interface GridSummaryProps {
  totals: GridTotals
  config: GridConfig
  dayCount: number
}

export default function GridSummary({ totals, config, dayCount }: GridSummaryProps) {
  const { pax, marginPercent, currency } = config
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency

  return (
    <div className="bg-white border rounded-lg shadow-sm overflow-hidden mt-4">
      <div className="px-4 py-3 bg-gray-800 text-white">
        <h3 className="text-sm font-bold uppercase tracking-wide">Grand Summary</h3>
        <p className="text-xs text-gray-400">{dayCount} days | {pax} pax | {config.passport === 'eu' ? 'EU' : 'Non-EU'} | {config.tier} | {config.clientType.toUpperCase()}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-100">
        <SummaryCell label="Cost / Person" value={totals.costPerPerson} symbol={sym} />
        <SummaryCell label="Total Cost" value={totals.totalCost} symbol={sym} />
        <SummaryCell label={`Margin (${marginPercent}%)`} value={totals.marginAmount} symbol={sym} color="text-amber-600" />
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
    <div className={`px-4 py-3 ${highlight ? 'bg-green-50' : ''}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${color || 'text-gray-900'}`}>
        {symbol}{value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}
