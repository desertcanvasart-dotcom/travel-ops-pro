'use client'

import { useMemo } from 'react'
import { useLocale } from 'next-intl'
import { useVocabulary } from '@/hooks/useVocabulary'
import {
  supplierBehaviourOf, supplierHasBehaviour, supplierTypeOptionsFor, type SupplierTypeOption,
} from '@/lib/supplier-types'

/**
 * The agency's supplier types (Settings → Vocabulary → Supplier types) for a
 * picker, and the behaviour resolution every consumer that used to compare
 * the key needs: `behaviourOf('lodge')` → 'hotel', so the Properties tab,
 * the guide picker and the type filter treat an agency-added type like the
 * built-in it behaves as. Built-ins until the vocabulary loads.
 */
export function useSupplierTypes(): {
  options: SupplierTypeOption[]
  /** The pickable keys, agency order. */
  keys: string[]
  behaviourOf: (key: string | null | undefined) => string
  hasBehaviour: (supplier: { type?: string | null; types?: readonly string[] | null }, behaviour: string) => boolean
  loading: boolean
} {
  const locale = useLocale()
  const { items, all, loading } = useVocabulary('supplier_type')
  return useMemo(() => {
    const options = supplierTypeOptionsFor(items, locale)
    return {
      options,
      keys: options.map(o => o.value),
      behaviourOf: key => supplierBehaviourOf(key, all),
      hasBehaviour: (supplier, behaviour) => supplierHasBehaviour(supplier, behaviour, all),
      loading,
    }
  }, [items, all, locale, loading])
}
