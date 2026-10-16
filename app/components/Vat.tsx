'use client'

// ============================================
// The VAT token and the "Apply VAT" toggle
// ============================================
// Every screen that shows a client price says whether VAT is on it: a token
// reading "VAT 14% included: €1,400.00" or "VAT not applied" (lib/vat.ts has
// the rule; this is its face). The toggle is how a person chooses, on the
// forms that price or issue a document. The rate shown on the toggle is the
// company's (Settings › Company Profile); the amount is always the server's.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { DEFAULT_VAT_RATE, formatVatRate, normaliseVatRate, vatExcludesExtras, type VatRecord } from '@/lib/vat'
import { formatMoney } from '@/lib/currency-totals'

/**
 * The token: green when VAT is included, grey when it is not. A document that
 * left extras or insurance out of its VAT (it recorded a vat_base) says so.
 */
export function VatToken({ vat, currency, className = '' }: { vat: VatRecord; currency: string | null | undefined; className?: string }) {
  const t = useTranslations('vat')
  const text = vat.vat_applied
    ? t(vatExcludesExtras(vat) ? 'appliedExcludes' : 'applied', {
        rate: formatVatRate(vat.vat_rate ?? DEFAULT_VAT_RATE),
        amount: formatMoney(Number(vat.vat_amount) || 0, currency || 'EUR'),
      })
    : t('notApplied')
  return (
    <span
      data-vat={vat.vat_applied ? 'applied' : 'not-applied'}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        vat.vat_applied ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
      } ${className}`}
    >
      {text}
    </span>
  )
}

/** The company's VAT rate, for the toggle's label. 14 until it loads. */
export function useOrgVatRate(): number {
  const [rate, setRate] = useState(DEFAULT_VAT_RATE)
  useEffect(() => {
    let alive = true
    fetch('/api/organization/branding')
      .then(r => r.json())
      .then(j => {
        const r = normaliseVatRate(j?.data?.vat_rate)
        if (alive && r !== null) setRate(r)
      })
      .catch(() => { /* the default stands; the server records the real rate */ })
    return () => { alive = false }
  }, [])
  return rate
}

/** "Apply VAT (14%)" — default off unless the source document had it on. */
export function VatToggle({
  checked,
  onChange,
  rate,
  disabled = false,
  className = '',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** The rate to show: the document's recorded one, else the company's. */
  rate?: number | null
  disabled?: boolean
  className?: string
}) {
  const t = useTranslations('vat')
  const orgRate = useOrgVatRate()
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer'} ${className}`}>
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium text-gray-800">{t('apply', { rate: formatVatRate(rate ?? orgRate) })}</span>
        <span className="block text-xs text-gray-500">{disabled ? t('lockedHint') : t('applyHint')}</span>
      </span>
    </label>
  )
}
