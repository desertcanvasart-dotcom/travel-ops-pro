'use client'

// How a rate's price applies to the group — per group, per person or per unit
// (lib/pricing/pricing-basis.ts). Shared by the airport and hotel assistance
// rate forms.

import { useTranslations } from 'next-intl'
import { PRICING_BASES, type PricingBasis } from '@/lib/pricing/pricing-basis'

const LABEL_KEY: Record<PricingBasis, string> = {
  flat: 'pricingFlat',
  per_person: 'pricingPerPerson',
  per_unit: 'pricingPerUnit',
}

/** "Per group" / "Per person" / "Per unit of 2", in the page's language. */
export function usePricingBasisLabel() {
  const t = useTranslations('rates.common')
  return (basis: PricingBasis | null | undefined, capacity?: number | null) => {
    if (basis === 'per_unit' && capacity && capacity > 0) return t('pricingPerUnitOf', { count: capacity })
    return t(LABEL_KEY[basis ?? 'flat'])
  }
}

export default function PricingBasisField({
  basis,
  capacity,
  onChange,
  focusRing = 'focus:ring-sky-600',
}: {
  basis: PricingBasis
  capacity: number | ''
  onChange: (next: { pricing_type: PricingBasis; max_capacity: number | '' }) => void
  focusRing?: string
}) {
  const t = useTranslations('rates.common')
  return (
    <div>
      <label htmlFor="pricing_type" className="block text-xs font-medium text-gray-600 mb-1">{t('pricing')} *</label>
      <div className="flex items-center gap-2">
        <select
          id="pricing_type"
          name="pricing_type"
          value={basis}
          onChange={e => onChange({ pricing_type: e.target.value as PricingBasis, max_capacity: capacity })}
          className={`flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 ${focusRing}`}
        >
          {PRICING_BASES.map(b => (
            <option key={b.value} value={b.value}>{t(LABEL_KEY[b.value])}</option>
          ))}
        </select>
        {basis === 'per_unit' && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
            <input
              type="number"
              name="max_capacity"
              min={1}
              step={1}
              value={capacity}
              onChange={e => onChange({ pricing_type: basis, max_capacity: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="2"
              className={`w-16 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 ${focusRing}`}
              aria-label={t('peoplePerUnit')}
            />
            {t('peoplePerUnit')}
          </label>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">{t(`${LABEL_KEY[basis]}Hint`)}</p>
    </div>
  )
}
