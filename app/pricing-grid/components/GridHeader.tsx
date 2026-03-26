'use client'

import { useState, useEffect } from 'react'
import type { GridConfig, GridTotals, Tier, ClientType, PassportType } from '../types'

interface GridHeaderProps {
  config: GridConfig
  onChange: (config: GridConfig) => void
  totals?: GridTotals
}

interface B2BPartner {
  id: string
  company_name: string
  partner_code: string
  default_margin_percent: number
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
  const [partners, setPartners] = useState<B2BPartner[]>([])
  const update = (partial: Partial<GridConfig>) => onChange({ ...config, ...partial })
  const sym = config.currency === 'EUR' ? '\u20AC' : config.currency === 'USD' ? '$' : config.currency === 'GBP' ? '\u00A3' : config.currency
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Fetch B2B partners when switching to B2B
  useEffect(() => {
    if (config.clientType === 'b2b' && partners.length === 0) {
      fetch('/api/b2b/partners')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) setPartners(data.data)
          else if (Array.isArray(data)) setPartners(data)
        })
        .catch(err => console.error('Failed to fetch partners:', err))
    }
  }, [config.clientType, partners.length])

  const toggleClientType = () => {
    const newType: ClientType = config.clientType === 'b2b' ? 'b2c' : 'b2b'
    update({
      clientType: newType,
      marginPercent: DEFAULT_MARGINS[newType],
      partnerId: null,
      partnerName: '',
    })
  }

  const togglePassport = () => {
    update({ passport: config.passport === 'eu' ? 'non_eu' : 'eu' })
  }

  const toggleGuide = () => {
    update({ withGuide: !config.withGuide })
  }

  const selectPartner = (partnerId: string) => {
    const partner = partners.find(p => p.id === partnerId)
    if (partner) {
      update({
        partnerId: partner.id,
        partnerName: partner.company_name,
        marginPercent: partner.default_margin_percent || DEFAULT_MARGINS.b2b,
      })
    } else {
      update({ partnerId: null, partnerName: '' })
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
      {/* Row 1: Trip Parameters + Pricing Mode */}
      <div className="px-4 py-3 flex flex-wrap items-start gap-x-5 gap-y-3">

        {/* ===== TRIP PARAMETERS GROUP ===== */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">Trip</span>

          {/* Pax */}
          <div className="flex items-center gap-1">
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
          <div className="flex items-center gap-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Start</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>

          {/* Passport Toggle */}
          <button
            type="button"
            onClick={togglePassport}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap ${
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
        </div>

        {/* Vertical Divider */}
        <div className="w-px h-8 bg-gray-200 self-center" />

        {/* ===== PRICING MODE GROUP ===== */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">Pricing</span>

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

          {/* B2B Partner Selector */}
          {config.clientType === 'b2b' && (
            <select
              value={config.partnerId || ''}
              onChange={(e) => selectPartner(e.target.value)}
              className="px-2 py-1 text-sm border border-purple-200 rounded-lg font-medium bg-purple-50 text-purple-700 focus:bg-white focus:ring-2 focus:ring-purple-200 transition-all max-w-[180px]"
            >
              <option value="">Select Partner...</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.company_name}</option>
              ))}
            </select>
          )}

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

          {/* Currency + Markup (combined row) */}
          <div className="flex items-center gap-1">
            <select
              value={config.currency}
              onChange={(e) => update({ currency: e.target.value })}
              className="px-2 py-1 text-sm border border-gray-200 rounded-l-lg bg-gray-50 focus:bg-white transition-all"
            >
              {CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="flex items-center">
              <input
                type="number"
                min={0}
                max={100}
                value={config.marginPercent}
                onChange={(e) => update({ marginPercent: parseFloat(e.target.value) || 0 })}
                className="w-14 px-2 py-1 text-sm border border-l-0 border-gray-200 text-center bg-gray-50 focus:bg-white transition-all"
              />
              <span className="px-1.5 py-1 text-[10px] bg-gray-100 border border-l-0 border-gray-200 rounded-r-lg text-gray-500 font-bold uppercase tracking-wider">
                Markup %
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Live Summary Bar */}
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
