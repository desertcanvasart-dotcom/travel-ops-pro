'use client'

import { Save, ExternalLink, Loader2 } from 'lucide-react'
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'
import type { GridTotals, GridConfig } from '../types'
import { convertAmount } from '../lib/calculator'
import { currencySymbol } from '@/lib/currency-totals'

interface GridSummaryProps {
  totals: GridTotals
  config: GridConfig
  dayCount: number
  onSave?: () => void
  isSaving?: boolean
  savedItineraryId?: string | null
  savedItineraryCode?: string | null
  savedQuoteId?: string | null
  savedQuoteNumber?: string | null
  saveMessage?: string | null
}

export default function GridSummary({ totals, config, dayCount, onSave, isSaving, savedItineraryId, savedItineraryCode, savedQuoteId, savedQuoteNumber, saveMessage }: GridSummaryProps) {
  const { pax, marginPercent, currency } = config
  const sym = currencySymbol(currency)
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const cv = (n: number) => convertAmount(n, config.exchangeRate)

  const isB2B = config.clientType === 'b2b'

  // Determine the primary view link based on B2B/B2C
  const viewLink = isB2B && savedQuoteId
    ? `/b2b/quotes/${savedQuoteId}`
    : savedItineraryId
      ? `/itineraries/${savedItineraryId}`
      : null

  const viewLabel = isB2B && savedQuoteId
    ? `View B2B Quote${savedQuoteNumber ? ` (${savedQuoteNumber})` : ''}`
    : 'View Itinerary'

  const saveLabel = isSaving
    ? 'Saving...'
    : savedItineraryId
      ? (isB2B ? 'Update B2B Quote' : 'Update Itinerary')
      : (isB2B ? 'Save as B2B Quote' : 'Save as Itinerary')

  return (
    // Sticky: the price and the save button stay in view while the days
    // scroll above them.
    <div className="sticky bottom-0 z-20 mt-4 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      {/* The operator's own high dates. Shown whenever a premium is inside the
          selling figures below, so the number is never unexplainable from the
          screen that produced it. */}
      {totals.seasonName && totals.seasonPercent > 0 && (
        <div className="px-4 py-1.5 bg-[#647C47]/10 border-b border-[#647C47]/25 flex items-baseline justify-between gap-4 flex-wrap">
          <span className="text-xs font-semibold text-[#4a5c35]">
            {totals.seasonName} +{totals.seasonPercent}%
          </span>
          <span className="text-xs text-[#4a5c35]">
            +{sym}{fmt(cv(totals.seasonUplift))}
            {' \u00B7 '}on an ordinary date {sym}{fmt(cv(totals.baseSellingPriceTotal))}
          </span>
        </div>
      )}

      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Numbers */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <SummaryCell label="Cost / person" value={cv(totals.costPerPerson)} symbol={sym} />
          <SummaryCell label="Total cost" value={cv(totals.totalCost)} symbol={sym} />
          <SummaryCell
            label={`Margin (${marginPercent}%)`}
            value={cv(totals.marginAmount)}
            symbol={sym}
            color={totals.marginAmount > 0 ? 'text-amber-600' : 'text-red-500'}
          />
          <SummaryCell label="Selling / person" value={cv(totals.sellingPricePerPerson)} symbol={sym} color="text-green-600" />
          <SummaryCell label="Selling total" value={cv(totals.sellingPriceTotal)} symbol={sym} color="text-green-700" strong />
        </div>

        {/* Save + links */}
        {onSave && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {viewLink && (
              <a
                href={viewLink}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  isB2B ? 'text-purple-600 hover:bg-purple-50' : 'text-blue-600 hover:bg-blue-50'
                }`}
              >
                {viewLabel}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={onSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors ${
                isB2B ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saveLabel}
            </button>
          </div>
        )}
      </div>

      {/* Context + what the last save did */}
      <div className="px-4 py-1 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-x-3 text-[11px] text-gray-500">
        <span>
          {dayCount} days {'\u00B7'} {pax} pax {'\u00B7'} {config.passport === 'eu' ? 'EU' : 'Non-EU'} {'\u00B7'} {config.tier} {'\u00B7'} {PACKAGE_TYPE_CONFIGS.find(p => p.slug === (config.packageType ?? 'full-package'))?.name ?? 'Full Package'} {'\u00B7'} {config.clientType.toUpperCase()}
          {savedItineraryCode && <span className="ml-1 font-medium text-green-700">{'\u00B7'} {savedItineraryCode}</span>}
        </span>
        {saveMessage && <span className="font-medium text-green-700">{saveMessage}</span>}
      </div>
    </div>
  )
}

function SummaryCell({ label, value, symbol, color, strong }: {
  label: string; value: number; symbol: string; color?: string; strong?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</div>
      <div className={`${strong ? 'text-lg' : 'text-sm'} font-bold tabular-nums ${color || 'text-gray-900'}`}>
        {symbol}{value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}
