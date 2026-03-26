'use client'

import { Save, ExternalLink, Loader2 } from 'lucide-react'
import type { GridTotals, GridConfig } from '../types'

interface GridSummaryProps {
  totals: GridTotals
  config: GridConfig
  dayCount: number
  onSave?: () => void
  isSaving?: boolean
  savedItineraryId?: string | null
  savedItineraryCode?: string | null
  saveMessage?: string | null
}

export default function GridSummary({ totals, config, dayCount, onSave, isSaving, savedItineraryId, savedItineraryCode, saveMessage }: GridSummaryProps) {
  const { pax, marginPercent, currency } = config
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-4">
      {/* Header */}
      <div className="px-5 py-3 bg-gray-800 text-white flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Grand Summary</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {dayCount} days · {pax} pax · {config.passport === 'eu' ? 'EU' : 'Non-EU'} · {config.tier} · {config.clientType.toUpperCase()}
            {savedItineraryCode && <span className="ml-2 text-green-400">— {savedItineraryCode}</span>}
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

      {/* Save Actions */}
      {onSave && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Save Button */}
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Saving...' : savedItineraryId ? 'Update Itinerary' : 'Save as Itinerary'}
            </button>

            {/* Success message */}
            {saveMessage && (
              <span className="text-sm text-green-600 font-medium">{saveMessage}</span>
            )}
          </div>

          {/* View Itinerary Link */}
          {savedItineraryId && (
            <a
              href={`/itineraries/${savedItineraryId}`}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
            >
              View Itinerary
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
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
