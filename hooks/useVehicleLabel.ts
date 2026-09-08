'use client'

import { useLocale } from 'next-intl'
import { useVocabulary } from '@/hooks/useVocabulary'

/**
 * The operator's own label for a VEHICLE type, in the active locale.
 *
 * White-label relabel, not remap: transportation rates store per-vehicle
 * COLUMNS keyed by a fixed set (sedan/minivan/van/minibus/bus), so the stored
 * value never changes — this only swaps the DISPLAYED word for whatever the
 * agency set in Settings → Vocabulary (the `vehicle_type` kind, whose default
 * seed carries those same keys).
 *
 * Per-locale, and non-regressive: the override is used ONLY where the agency
 * has actually set it for the active language. English uses `label`; Japanese
 * uses `label_ja`. Where that is empty — or the vocabulary migration isn't
 * applied — the provided `fallback` (the built-in i18n label) stands, so the
 * Japanese UI keeps its translations until the operator types a Japanese label.
 */
export function useVehicleLabel(): (key: string | null | undefined, fallback: string) => string {
  const locale = useLocale()
  const { all } = useVocabulary('vehicle_type')
  return (key, fallback) => {
    if (!key) return fallback
    const item = all.find(i => i.key === key)
    if (!item) return fallback
    const override = locale === 'ja' ? item.label_ja : item.label
    return override && override.trim() ? override : fallback
  }
}
