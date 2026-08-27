'use client'

// ============================================
// The <option> list every city dropdown shares
// ============================================
// With one active destination this renders exactly the flat list the forms
// always had. The moment a second destination is active, the same component
// renders <optgroup> per country — so "Alexandria" under Egypt cannot be
// mistaken for another country's, and nobody scrolls a 90-city soup.
// (Multi-destination seams work; values stay bare city names either way,
// because that is what the rate rows store.)

import { useDestinationCities } from '@/app/components/useDestinationCities'

export default function CityOptions({ exclude, label }: {
  /** A city to leave out — e.g. the already-chosen origin of a transfer. */
  exclude?: string
  /** Display text for a city name; default is the name itself. */
  label?: (name: string) => string
}) {
  const { cities, destinations } = useDestinationCities()
  const text = (n: string) => (label ? label(n) : n)

  if (destinations.length <= 1) {
    return (
      <>
        {cities.filter(c => c !== exclude).map(c => (
          <option key={c} value={c}>{text(c)}</option>
        ))}
      </>
    )
  }

  return (
    <>
      {destinations.map(d => (
        <optgroup key={d.id} label={d.name}>
          {d.cities.filter(c => c.name !== exclude).map(c => (
            <option key={c.name} value={c.name}>{text(c.name)}</option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
