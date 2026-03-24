'use client'

import type { GridConfig, Tier, ClientType, PassportType } from '../types'

interface GridHeaderProps {
  config: GridConfig
  onChange: (config: GridConfig) => void
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

export default function GridHeader({ config, onChange }: GridHeaderProps) {
  const update = (partial: Partial<GridConfig>) => onChange({ ...config, ...partial })

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

  return (
    <div className="bg-white border rounded-lg shadow-sm p-4 mb-4 sticky top-0 z-10">
      <div className="flex flex-wrap items-center gap-4">
        {/* Pax */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Pax</label>
          <input
            type="number"
            min={1}
            max={50}
            value={config.pax}
            onChange={(e) => update({ pax: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-16 px-2 py-1.5 text-sm border rounded-lg text-center font-bold"
          />
        </div>

        {/* Passport Toggle */}
        <button
          type="button"
          onClick={togglePassport}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${
            config.passport === 'eu'
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-amber-50 border-amber-300 text-amber-700'
          }`}
        >
          {config.passport === 'eu' ? '🇪🇺 EU Passport' : '🌍 Non-EU'}
        </button>

        {/* Tier */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Tier</label>
          <select
            value={config.tier}
            onChange={(e) => update({ tier: e.target.value as Tier })}
            className="px-2 py-1.5 text-sm border rounded-lg font-medium"
          >
            {TIERS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* B2B / B2C Toggle */}
        <button
          type="button"
          onClick={toggleClientType}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${
            config.clientType === 'b2b'
              ? 'bg-purple-50 border-purple-300 text-purple-700'
              : 'bg-green-50 border-green-300 text-green-700'
          }`}
        >
          {config.clientType === 'b2b' ? '🤝 B2B' : '👤 B2C'}
        </button>

        {/* Guide Toggle */}
        <button
          type="button"
          onClick={toggleGuide}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${
            config.withGuide
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-gray-50 border-gray-300 text-gray-400'
          }`}
        >
          {config.withGuide ? '👨‍🏫 With Guide' : '🚫 No Guide'}
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200" />

        {/* Currency */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Currency</label>
          <select
            value={config.currency}
            onChange={(e) => update({ currency: e.target.value })}
            className="px-2 py-1.5 text-sm border rounded-lg"
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Margin */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Margin</label>
          <div className="flex items-center">
            <input
              type="number"
              min={0}
              max={100}
              value={config.marginPercent}
              onChange={(e) => update({ marginPercent: parseFloat(e.target.value) || 0 })}
              className="w-16 px-2 py-1.5 text-sm border rounded-l-lg text-center"
            />
            <span className="px-2 py-1.5 text-sm bg-gray-100 border border-l-0 rounded-r-lg text-gray-500">%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
