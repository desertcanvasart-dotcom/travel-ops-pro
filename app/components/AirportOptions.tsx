'use client'

// ============================================
// The <option> list for an airport picker
// ============================================
// A flight rate names an AIRPORT, not a city. The form used to offer the
// cities of the destinations the agency sells — so for the Japanese desk
// selling Egypt, there was no way to enter the Tokyo→Cairo flight its
// customers actually arrive on. An origin is not a destination: nobody runs a
// tour in it, and putting it in destinations would have dropped Tokyo into
// every hotel and transport city list.
//
// One country renders flat, exactly as the old city list did. More than one
// groups by country, so an origin sits under its own heading instead of mixed
// into the places the agency operates — the same rule CityOptions applies.

import { useVocabulary } from '@/hooks/useVocabulary'
import { airportsFrom, airportLabel, groupByCountry, type Airport } from '@/lib/rates/airports'

export function useAirports(): { airports: Airport[]; loading: boolean; labelFor: (key: string | null | undefined) => string } {
  const { items, loading, labelFor } = useVocabulary('airport')
  return { airports: airportsFrom(items), loading, labelFor }
}

export default function AirportOptions({ airports, exclude }: {
  airports: Airport[]
  /** An airport to leave out — the already-chosen end of the route. */
  exclude?: string
}) {
  const usable = airports.filter(a => a.key !== exclude)
  const groups = groupByCountry(usable)

  if (groups.length <= 1) {
    return (
      <>
        {usable.map(a => (
          <option key={a.key} value={a.key}>{airportLabel(a)}</option>
        ))}
      </>
    )
  }

  return (
    <>
      {groups.map(g => (
        <optgroup key={g.countryCode || 'other'} label={g.countryCode || 'Other'}>
          {g.airports.map(a => (
            <option key={a.key} value={a.key}>{airportLabel(a)}</option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
