'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/currency-totals'
import type { VatReport } from '@/lib/vat-report'

// The Tax tab of Profit & Loss: the VAT the issued invoices RECORDED, per
// currency and rate. Nothing here is worked out from the company rate or from
// revenue — see lib/vat-report.ts and /api/profit-loss/tax.

export default function TaxTab() {
  const t = useTranslations('profitLoss.tax')
  const [report, setReport] = useState<VatReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      const res = await fetch(`/api/profit-loss/tax?${params}`)
      const result = await res.json().catch(() => ({}))
      if (res.ok && result.success) {
        setReport(result.data)
        setError(null)
      } else {
        setReport(null)
        setError(result.error || t('loadError'))
      }
    } catch (e) {
      console.error('Error fetching the tax report:', e)
      setReport(null)
      setError(t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, t])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{t('title')}</h2>
        <p className="text-sm text-gray-500">{t('intro')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('fromDate')}</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('toDate')}</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
          />
        </div>
      </div>

      {loading && <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#647C47]" />}

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && report && report.invoice_count === 0 && (
        <p className="text-sm text-gray-500">{t('empty')}</p>
      )}

      {!loading && report && report.currencies.map(c => (
        <div key={c.currency} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{c.currency}</h3>
            <p className="text-xs text-gray-500">{t('invoicesCount', { count: c.invoices })}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-gray-500">{t('net')}</p>
              <p className="text-lg font-semibold text-gray-900">{formatMoney(c.net, c.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('vatCollected')}</p>
              <p className="text-lg font-semibold text-blue-600">{formatMoney(c.vat, c.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('total')}</p>
              <p className="text-lg font-semibold text-gray-900">{formatMoney(c.total, c.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('notApplied')}</p>
              <p className="text-lg font-semibold text-gray-900">{c.not_applied}</p>
              {c.not_applied > 0 && (
                <p className="text-[11px] text-gray-500">{t('notAppliedNet', { amount: formatMoney(c.not_applied_net, c.currency) })}</p>
              )}
            </div>
          </div>

          {c.by_rate.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-medium">{t('rate')}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t('invoices')}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t('net')}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t('vatRecorded')}</th>
                  <th className="py-2 font-medium text-right">{t('total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {c.by_rate.map(l => (
                  <tr key={l.rate}>
                    <td className="py-2 pr-3 text-gray-900">{l.rate}%</td>
                    <td className="py-2 pr-3 text-right">{l.invoices}</td>
                    <td className="py-2 pr-3 text-right">{formatMoney(l.net, c.currency)}</td>
                    <td className="py-2 pr-3 text-right">{formatMoney(l.vat, c.currency)}</td>
                    <td className="py-2 text-right">{formatMoney(l.total, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {c.excluded_extras > 0 && (
            <p className="text-xs text-gray-500">{t('excludedExtras', { count: c.excluded_extras })}</p>
          )}
        </div>
      ))}

      <ul className="text-xs text-gray-500 list-disc pl-5 space-y-1">
        <li>{t('noteExtras')}</li>
        <li>{t('noteScope')}</li>
        <li>{t('noteInput')}</li>
      </ul>
    </div>
  )
}
