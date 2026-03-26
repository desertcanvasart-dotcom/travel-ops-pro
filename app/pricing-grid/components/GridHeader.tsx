'use client'

import type { GridConfig, GridTotals, Tier, ClientType, PassportType } from '../types'

interface GridHeaderProps {
  config: GridConfig
  onChange: (config: GridConfig) => void
  totals?: GridTotals
}

const TIERS: { value: Tier; label: string }[] = [
  { value: 'budget', label: 'Budget' },
  { value: 'standard', label: 'Standard' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'luxury', label: 'Luxury' },
]

const CURRENCIES = ['EUR', 'USD', 'GBP', 'AED', 'SAR', 'CHF', 'JPY']

const DEFAULT_MARGINS: Record<ClientType, number> = {
  b2b: 10,
  b2c: 25,
}

export default function GridHeader({ config, onChange, totals }: GridHeaderProps) {
  const update = (partial: Partial<GridConfig>) => onChange({ ...config, ...partial })
  const sym = config.currency === 'EUR' ? '\u20AC' : config.currency === 'USD' ? '$' : config.currency === 'GBP' ? '\u00A3' : config.currency

  const toggleClientType = () => {
    const newType: ClientType = config.clientType === 'b2b' ? 'b2c' : 'b2b'
    update({ clientType: newType, marginPercent: DEFAULT_MARGINS[newType] })
  }

  const togglePassport = () => {
    const newPassport: PassportType = config.passport === 'eu' ? 'non_eu' : 'eu'
    update({ passport: newPassport })
  }

  const toggleGuide = () => {
    update({ withGuide: !config.withGuide })
  }

  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
      {/* Row 1: Controls */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Pax */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pax</label>
          <input
            type="number"
            min={1}
            max={50}
            value={config.pax}
            onChange={(e) => update({ pax: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-14 px-2 py-1 text-sm border border-gray-200 rounded-lg text-center font-bold bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
          />
        </div>

        {/* Start Date */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Start</label>
          <input
            type="date"
            value={config.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
            className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all"
          />
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* Passport Toggle */}
        <button
          type="button"
          onClick={togglePassport}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
            config.passport === 'eu'
              ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
              : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          }`}
        >
          {config.passport === 'eu' ? 'EU' : 'Non-EU'}
        </button>

        {/* Tier */}
        <select
          value={config.tier}
          onChange={(e) => update({ tier: e.target.value as Tier })}
          className="px-2 py-1 text-sm border border-gray-200 rounded-lg font-medium bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all"
        >
          {TIERS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {/* B2B / B2C Toggle */}
        <button
          type="button"
          onClick={toggleClientType}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
            config.clientType === 'b2b'
              ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
              : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
          }`}
        >
          {config.clientType.toUpperCase()}
        </button>

        {/* Guide Toggle */}
        <button
          type="button"
          onClick={toggleGuide}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
            config.withGuide
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-150'
          }`}
        >
          {config.withGuide ? 'Guide' : 'No Guide'}
        </button>

        <div className="w-px h-6 bg-gray-200" />

        {/* Currency */}
        <select
          value={config.currency}
          onChange={(e) => update({ currency: e.target.value })}
          className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white transition-all"
        >
          {CURRENCIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Margin */}
        <div className="flex items-center">
          <input
            type="number"
            min={0}
            max={100}
            value={config.marginPercent}
            onChange={(e) => update({ marginPercent: parseFloat(e.target.value) || 0 })}
            className="w-14 px-2 py-1 text-sm border border-gray-200 rounded-l-lg text-center bg-gray-50 focus:bg-white transition-all"
          />
          <span className="px-1.5 py-1 text-xs bg-gray-100 border border-l-0 border-gray-200 rounded-r-lg text-gray-500 font-medium">%</span>
        </div>
      </div>

      {/* Row 2: Live Summary Bar (only show when there are totals) */}
      {totals && totals.totalCost > 0 && (
        <div className="border-t border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="grid grid-cols-5 divide-x divide-gray-100">
            <div className="px-3 py-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Cost/PP</div>
              <div className="text-sm font-bold text-gray-700">{sym}{fmt(totals.costPerPerson)}</div>
            </div>
            <div className="px-3 py-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Total Cost</div>
              <div className="text-sm font-bold text-gray-700">{sym}{fmt(totals.totalCost)}</div>
            </div>
            <div className="px-3 py-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Margin ({config.marginPercent}%)</div>
              <div className={`text-sm font-bold ${totals.marginAmount > 0 ? 'text-amber-600' : 'text-red-500'}`}>{sym}{fmt(totals.marginAmount)}</div>
            </div>
            <div className="px-3 py-2 bg-green-50/50">
              <div className="text-[10px] text-green-600 uppercase tracking-wider font-medium">Sell/PP</div>
              <div className="text-sm font-extrabold text-green-700">{sym}{fmt(totals.sellingPricePerPerson)}</div>
            </div>
            <div className="px-3 py-2 bg-green-50/50">
              <div className="text-[10px] text-green-600 uppercase tracking-wider font-medium">Sell Total</div>
              <div className="text-sm font-extrabold text-green-700">{sym}{fmt(totals.sellingPriceTotal)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
