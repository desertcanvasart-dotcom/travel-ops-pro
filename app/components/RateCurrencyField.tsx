'use client'

// ============================================
// The currency a rate row is entered in
// ============================================
// One field, used by every rate form. Blank = "the organisation default"
// (organizations.rate_currency), which is what every rate meant before the
// per-rate-currency work — so the common case stays one field the operator
// never touches. Choosing a currency records the CONTRACT's currency on the
// row permanently; the pricing engine converts a copy at read time
// (lib/rates/rate-currency.ts) and the stored number is never rewritten.
// Plan: docs/plans/per-rate-currency.md.

import { useTranslations } from 'next-intl'
import { RATE_CURRENCIES } from '@/lib/org-rate-currency'

interface RateCurrencyFieldProps {
  value: string            // '' = org default
  onChange: (value: string) => void
  className?: string       // the page's own select styling, so the field
                           // matches its form instead of imposing one look
}

export default function RateCurrencyField({ value, onChange, className }: RateCurrencyFieldProps) {
  const t = useTranslations('rates.common')
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {t('rateCurrency')}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={className || 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] focus:border-transparent'}
      >
        <option value="">{t('rateCurrencyDefault')}</option>
        {RATE_CURRENCIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">{t('rateCurrencyHint')}</p>
    </div>
  )
}

/**
 * The write-payload fragment for rate_currency.
 *
 * The key is INCLUDED only when there is something to say: a currency was
 * chosen, or the row being edited had one and it must be cleared back to the
 * default. When neither holds, the key is OMITTED entirely — which is what
 * lets these forms deploy before the 20260827_rate_currency migration is
 * applied: an untouched form writes exactly the payload it wrote yesterday,
 * and only an operator actively selecting a currency on an unmigrated
 * database sees an error (a loud "column does not exist", not a wrong price).
 */
export function rateCurrencyPatch(
  selected: string,
  loaded?: string | null
): { rate_currency?: string | null } {
  const value = selected || null
  if (value === null && !loaded) return {}
  return { rate_currency: value }
}

/** Badge text for list rows: the row's own currency, or nothing. */
export function rateCurrencyBadge(row: { rate_currency?: string | null }): string | null {
  return row?.rate_currency || null
}
