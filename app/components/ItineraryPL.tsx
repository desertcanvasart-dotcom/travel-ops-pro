'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  DollarSign,
  Percent,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/currency-totals'
import { marginOnPrice, recordedTripSupplierCost } from '@/lib/itinerary-pl'

interface Service {
  id: string
  service_type: string
  service_name: string
  quantity: number
  total_cost: number
  client_price?: number
}

interface DayWithServices {
  id: string
  day_number: number
  services: Service[]
}

interface ExtraExpense {
  amount: number
  currency: string
  category: string
  booking_supplier_status_id?: string | null
}

interface ItineraryPLProps {
  itineraryId: string
  /** The trip's own client price — what the itinerary row says it sells for. */
  totalCost: number
  /** The trip's own supplier cost, when the pricing engine has stored one. */
  supplierCost?: number | null
  currency: string
  days: DayWithServices[]
  extraExpenses?: ExtraExpense[]
}

/** The trip's extra expenses in the trip's currency, from /api/itineraries/[id]/extras-fx. */
interface ExtrasFx {
  total: number
  count: number
  /** Expenses with no exchange rate: not in total. */
  missing: { reference: string; amount: number; fromCurrency: string }[]
}

interface PLBreakdown {
  service_type: string
  supplier_cost: number
  client_price: number
  margin: number
  /** Profit over client price, as on the Profit & Loss page. */
  margin_percent: number
  count: number
}

const SERVICE_ICONS: Record<string, string> = {
  transportation: '🚗',
  guide: '👨‍🏫',
  entrance: '🎫',
  meal: '🍽️',
  accommodation: '🏨',
  tips: '💵',
  supplies: '💧',
  activity: '🎭',
  extra_expenses: '💰',
  other: '📦'
}

export default function ItineraryPL({
  itineraryId,
  totalCost,
  supplierCost,
  currency,
  days,
  extraExpenses = []
}: ItineraryPLProps) {
  const t = useTranslations('itineraryPL')
  const [expanded, setExpanded] = useState(false)
  const [breakdown, setBreakdown] = useState<PLBreakdown[]>([])
  // supplierCost is null when nothing records it: the card shows "not
  // recorded" rather than a cost it made up.
  const [totals, setTotals] = useState<{
    supplierCost: number | null
    clientPrice: number
    margin: number | null
    marginPercent: number | null
  }>({
    supplierCost: 0,
    clientPrice: 0,
    margin: 0,
    marginPercent: 0
  })

  // Extra expenses are converted on the server, with the P&L report's own FX
  // (each at the rate on its date). null until it answers; failed when it could
  // not, which the card says rather than showing a margin without them.
  const [extrasFx, setExtrasFx] = useState<ExtrasFx | null>(null)
  const [extrasFailed, setExtrasFailed] = useState(false)
  const hasExtras = extraExpenses.some(exp => !exp.booking_supplier_status_id)
  // The parent builds a new array every render; its content is what matters.
  const extrasKey = JSON.stringify(extraExpenses)

  useEffect(() => {
    if (!hasExtras) {
      setExtrasFx(null)
      setExtrasFailed(false)
      return
    }
    let live = true
    fetch(`/api/itineraries/${itineraryId}/extras-fx`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(result => {
        if (!live) return
        setExtrasFx({ total: Number(result.total) || 0, count: Number(result.count) || 0, missing: result.missing || [] })
        setExtrasFailed(false)
      })
      .catch(() => {
        if (!live) return
        setExtrasFx(null)
        setExtrasFailed(true)
      })
    return () => { live = false }
  }, [itineraryId, hasExtras, extrasKey])

  useEffect(() => {
    calculatePL()
  }, [days, extrasFx, totalCost, supplierCost])

  // True when the numbers came from the trip rather than from priced services.
  const [fromTripTotals, setFromTripTotals] = useState(false)

  const calculatePL = () => {
    const byType: Record<string, PLBreakdown> = {}
    let totalSupplierCost = 0
    let totalClientPrice = 0
    // Services with a cost but no client price of their own: their price is
    // unknown, so the margin of the whole is unknown too.
    let unpricedServices = 0

    days.forEach(day => {
      (day.services || []).forEach(service => {
        const supplierCost = Number(service.total_cost) || 0
        const clientPrice = Number(service.client_price) || 0
        if (supplierCost > 0 && clientPrice <= 0) unpricedServices += 1

        totalSupplierCost += supplierCost
        totalClientPrice += clientPrice

        if (!byType[service.service_type]) {
          byType[service.service_type] = {
            service_type: service.service_type,
            supplier_cost: 0,
            client_price: 0,
            margin: 0,
            margin_percent: 0,
            count: 0
          }
        }

        byType[service.service_type].supplier_cost += supplierCost
        byType[service.service_type].client_price += clientPrice
        byType[service.service_type].count += 1
      })
    })

    // A trip whose services carry no prices is the normal case here — services
    // are priced through the grid and the engine, and itinerary_services is
    // empty for every trip in this system. The panel used to report ¥0 / ¥0 /
    // 0% for those, ignoring the totalCost it was handed. Fall back to what the
    // trip itself says: its client price, and its supplier cost when the engine
    // has stored one. When it has not, the cost is NOT recorded: it used to be
    // worked back from the price at a hardcoded 25% markup, a cost nobody paid.
    const hasPricedServices = totalSupplierCost > 0 || totalClientPrice > 0
    let costRecorded = true
    if (!hasPricedServices && Number(totalCost) > 0) {
      totalClientPrice = Number(totalCost)
      const recorded = recordedTripSupplierCost(supplierCost)
      if (recorded !== null) totalSupplierCost = recorded
      else costRecorded = false
    }
    if (unpricedServices > 0) costRecorded = false

    // Add extra expenses (operational costs that reduce margin). Not a booking
    // supplier's confirmed cost: confirming a supplier records it as an expense
    // of this trip, but it is the same money already in the supplier cost.
    // Converted by the server as the P&L report does; one with no rate is left
    // out and named in the "rate missing" note, never converted at a static rate.
    if (extrasFx && extrasFx.total > 0) {
      byType['extra_expenses'] = {
        service_type: 'extra_expenses',
        supplier_cost: extrasFx.total,
        client_price: extrasFx.total, // pass-through, no markup
        margin: 0,
        margin_percent: 0,
        count: extrasFx.count
      }
      totalSupplierCost += extrasFx.total
      // Note: extra expenses do NOT increase client price — they reduce margin
    }

    // Margin is profit over what the client pays, the same definition as the
    // Profit & Loss page (it was markup on cost here: 25% markup read 25.0%
    // on the trip and 20.0% on the report).
    Object.values(byType).forEach(item => {
      item.margin = item.client_price - item.supplier_cost
      item.margin_percent = marginOnPrice(item.margin, item.client_price)
    })

    const sortedBreakdown = Object.values(byType).sort((a, b) => b.margin - a.margin)
    const totalMargin = totalClientPrice - totalSupplierCost
    const overallMarginPercent = marginOnPrice(totalMargin, totalClientPrice)

    setFromTripTotals(!hasPricedServices && Number(totalCost) > 0)
    setBreakdown(costRecorded ? sortedBreakdown : [])
    setTotals({
      supplierCost: costRecorded ? totalSupplierCost : null,
      clientPrice: totalClientPrice,
      margin: costRecorded ? totalMargin : null,
      marginPercent: costRecorded ? overallMarginPercent : null
    })
  }

  // One formatter for money everywhere, so ¥1,099,897 does not render with the
  // two decimal places the yen does not have.
  const formatCurrency = (amount: number | null) => (amount === null ? t('notRecorded') : formatMoney(amount, currency))
  const formatPercent = (percent: number | null) => (percent === null ? t('notRecorded') : `${percent.toFixed(1)}%`)

  // Same bands as the Profit & Loss page, which reads the same margin.
  const getMarginColor = (percent: number | null) => {
    if (percent === null) return 'text-gray-500'
    if (percent >= 30) return 'text-green-600'
    if (percent >= 15) return 'text-amber-600'
    if (percent >= 0) return 'text-orange-600'
    return 'text-red-600'
  }

  const getMarginBg = (percent: number | null) => {
    if (percent === null) return 'bg-gray-50 border-gray-200'
    if (percent >= 30) return 'bg-green-50 border-green-200'
    if (percent >= 15) return 'bg-amber-50 border-amber-200'
    if (percent >= 0) return 'bg-orange-50 border-orange-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">{t('profitAndLoss')}</h3>
            <p className="text-xs text-gray-500">
              {fromTripTotals ? t('fromTripTotals') : t('costBreakdownAndMargins')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-500">{t('supplierCost')}</p>
              <p className="text-sm font-medium text-gray-900">{formatCurrency(totals.supplierCost)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{t('clientPrice')}</p>
              <p className="text-sm font-medium text-blue-600">{formatCurrency(totals.clientPrice)}</p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg border ${getMarginBg(totals.marginPercent)}`}>
              <p className="text-xs text-gray-500">{t('margin')}</p>
              <p className={`text-sm font-bold ${getMarginColor(totals.marginPercent)}`}>
                {totals.margin === null ? t('notRecorded') : `${formatCurrency(totals.margin)} (${formatPercent(totals.marginPercent)})`}
              </p>
            </div>
          </div>
          {expanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
        </div>
      </button>

      {(extrasFailed || (extrasFx && extrasFx.missing.length > 0)) && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3" role="status">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            {extrasFailed
              ? t('extrasUnavailable')
              : t('rateMissing', {
                  count: extrasFx!.missing.length,
                  list: extrasFx!.missing.map(m => `${m.reference} (${formatMoney(Number(m.amount), m.fromCurrency)})`).join(', '),
                  currency
                })}
          </p>
        </div>
      )}

      <div className="md:hidden px-5 pb-4 grid grid-cols-3 gap-3">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500">{t('cost')}</p>
          <p className="text-sm font-medium text-gray-900">{formatCurrency(totals.supplierCost)}</p>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <p className="text-xs text-gray-500">{t('price')}</p>
          <p className="text-sm font-medium text-blue-600">{formatCurrency(totals.clientPrice)}</p>
        </div>
        <div className={`text-center p-2 rounded-lg ${getMarginBg(totals.marginPercent)}`}>
          <p className="text-xs text-gray-500">{t('margin')}</p>
          <p className={`text-sm font-bold ${getMarginColor(totals.marginPercent)}`}>{formatPercent(totals.marginPercent)}</p>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-200">
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <span className="text-xs text-gray-500">{t('supplierCost')}</span>
              </div>
              <p className="text-xl font-semibold text-gray-900">{formatCurrency(totals.supplierCost)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('whatYouPay')}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-gray-500">{t('clientPrice')}</span>
              </div>
              <p className="text-xl font-semibold text-blue-600">{formatCurrency(totals.clientPrice)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('whatClientPays')}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-xs text-gray-500">{t('grossProfit')}</span>
              </div>
              <p className={`text-xl font-semibold ${getMarginColor(totals.marginPercent)}`}>{formatCurrency(totals.margin)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('yourEarnings')}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-gray-500">{t('marginPercent')}</span>
              </div>
              <p className={`text-xl font-semibold ${getMarginColor(totals.marginPercent)}`}>{formatPercent(totals.marginPercent)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('marginOnPrice')}</p>
            </div>
          </div>

          <div className="p-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">{t('breakdownByServiceType')}</h4>
            <div className="space-y-3">
              {breakdown.map((item) => {
                const icon = SERVICE_ICONS[item.service_type] || SERVICE_ICONS.other
                const marginWidth = Math.min(Math.max(item.margin_percent, 0), 50) * 2
                return (
                  <div key={item.service_type} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{icon}</span>
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {item.service_type === 'extra_expenses' ? t('extraExpenses') : item.service_type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-400">({item.count} {t('items')})</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500">{formatCurrency(item.supplier_cost)}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-blue-600">{formatCurrency(item.client_price)}</span>
                        <span className={`font-semibold ${getMarginColor(item.margin_percent)}`}>{item.margin >= 0 ? '+' : ''}{formatCurrency(item.margin)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.margin_percent >= 30 ? 'bg-green-500' :
                          item.margin_percent >= 15 ? 'bg-amber-500' :
                          item.margin_percent >= 0 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${marginWidth}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 text-right">{item.margin_percent.toFixed(1)}% {t('marginOnPrice').toLowerCase()}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>{t('note')}</strong> {t('noteText')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
