'use client'

// ============================================
// The city vocabulary, as data
// ============================================
// Every city dropdown used to read a hardcoded 44-city Egypt list (one shared
// constant plus several drifted local copies) with Japanese labels in i18n.
// This hook reads the same vocabulary from the destinations tables
// (docs/plans/multi-destination.md Phase 1), so adding a country in settings
// reaches every form without a deploy.
//
// FALLBACK: until migration 20260827_destinations is applied — or if the
// fetch fails — the hook serves the hardcoded Egypt list with its i18n
// labels, which is byte-identical to the pre-Phase-1 behaviour. The seed was
// generated FROM those same code lists, so the switchover changes nothing
// visible for Egypt.

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { EGYPT_CITIES } from '@/lib/constants/egypt-cities'

export interface DestinationCity {
  id?: string
  name: string
  name_ja?: string | null
}

export interface Destination {
  id: string
  country_code: string
  name: string
  name_ja?: string | null
  is_default: boolean
  cities: DestinationCity[]
}

// One fetch per session, shared by every dropdown on every page.
let cache: Destination[] | null = null
let inflight: Promise<Destination[]> | null = null

async function loadDestinations(): Promise<Destination[]> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch('/api/destinations')
      .then(r => r.json())
      .then(j => {
        cache = (j?.success && Array.isArray(j.data)) ? j.data : []
        return cache!
      })
      .catch(() => {
        inflight = null // a network blip should not poison the whole session
        return []
      })
  }
  return inflight
}

/** Test/logout seam: forget the cached vocabulary. */
export function clearDestinationCache() {
  cache = null
  inflight = null
}

export interface UseDestinationCitiesResult {
  /** City names, in the destination's own order — the values stored on rates. */
  cities: string[]
  /** Display label for a city name in the current locale. */
  cityLabel: (name: string) => string
  /** All active destinations, for pages that need the country level. */
  destinations: Destination[]
  loading: boolean
}

export function useDestinationCities(opts?: {
  /** Restrict to one destination by country_code; default = ALL destinations'
   *  cities (today that is Egypt alone, so the lists are identical). */
  countryCode?: string
}): UseDestinationCitiesResult {
  const locale = useLocale()
  // Pre-migration fallback labels — the same i18n the dropdowns always used.
  const tCities = useTranslations('tourBuilder.cities')
  const [destinations, setDestinations] = useState<Destination[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    let alive = true
    loadDestinations().then(d => {
      if (!alive) return
      setDestinations(d)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const scoped = opts?.countryCode
    ? destinations.filter(d => d.country_code === opts.countryCode)
    : destinations

  const rows: DestinationCity[] = scoped.flatMap(d => d.cities)
  const usingFallback = rows.length === 0

  const cities = usingFallback ? [...EGYPT_CITIES] : rows.map(c => c.name)

  const jaByName = new Map(rows.filter(c => c.name_ja).map(c => [c.name, c.name_ja as string]))

  const cityLabel = (name: string): string => {
    if (locale !== 'ja') return name
    const fromData = jaByName.get(name)
    if (fromData) return fromData
    try {
      // Dynamic key against the legacy vocabulary; next-intl hands back the
      // raw key for unknown cities, which is the English name — fine.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = tCities(name as any)
      return legacy && !legacy.includes('tourBuilder') ? legacy : name
    } catch {
      return name
    }
  }

  return { cities, cityLabel, destinations: scoped, loading }
}
