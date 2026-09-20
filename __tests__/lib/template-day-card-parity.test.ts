// Operator, 2026-09-20, looking at the template editor: the flight on day 3
// showed "Cairo → Abu Simbel" when the flight is Cairo → ASWAN and the rest
// is a 280km drive — "It seems that now the system cannot tell exactly what's
// happening during the day. Or am I mistaken?"
//
// Half mistaken. The MODEL can describe that day: leg_from/leg_to name the
// ticket's own route, and transport_lines name the day's road. The TEMPLATE
// editor could say neither — both had been wired into the calculator only.
// Same gap as the hotel picker, on the same card.
import { vi, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { determineTransportNeeds } from '@/lib/auto-pricing-service'

const editor = readFileSync('app/tours/manage/TourManagerContent.tsx', 'utf8')

describe('why the road leg has to be named by hand', () => {
  const day = (over: Record<string, unknown> = {}) =>
    ({ day: 3, title: 'Abu Simbel', description: '', city: 'Abu Simbel', meals: [], attractions: [], services: {}, ...over }) as never

  it('a flight day emits AIRPORT transfers only — never a drive onward', () => {
    // This is the whole reason transport_lines had to reach the template: no
    // rule turns "landed at Aswan, sleeping in Abu Simbel" into a road leg.
    const lines = determineTransportNeeds(
      day({ transport_type: 'flight', leg_from: 'Cairo', leg_to: 'Aswan' }),
      day({ day: 2, city: 'Cairo' }),
      null,
    )
    expect(lines.every(l => l.serviceType.startsWith('airport'))).toBe(true)
    expect(lines.some(l => l.serviceType === 'intercity' || l.serviceType === 'intercity_with_sightseeing')).toBe(false)
  })

  it('and the leg route is what decides which airports those are', () => {
    const cities = determineTransportNeeds(
      day({ transport_type: 'flight', leg_from: 'Cairo', leg_to: 'Aswan' }),
      day({ day: 2, city: 'Cairo' }),
      null,
    ).map(l => l.city)
    expect(cities).toContain('Cairo')
    expect(cities).toContain('Aswan')
    // Without leg_to it would be the day's city — the Cairo → Abu Simbel
    // flight the operator was shown, for which no fare exists.
    expect(cities).not.toContain('Abu Simbel')
  })
})

describe('the template day card says everything the calculator day says', () => {
  it('names the ticket leg its own route', () => {
    expect(editor).toContain('legFrom={day.leg_from}')
    expect(editor).toContain('legTo={day.leg_to}')
    // The From/To inputs only render when the editor passes this.
    expect(editor).toContain('onLegChange={(patch) => patchDay(index, patch)}')
  })

  it('lists and edits the day transport', () => {
    expect(editor).toContain('<DayTransportEditor')
    expect(editor).toContain("patchDay(index, { transport_lines: lines })")
  })

  it('previews transport from the engine, over the RAW days', () => {
    // parseItinerary derives accommodation_type; handing it a pre-derived one
    // puts a hotel night on the departure day.
    expect(editor).toContain("body: JSON.stringify({ days: itinerary, num_pax: 2 })")
    expect(editor).toContain("fetch('/api/b2b/transport-preview'")
  })

  it('offers only the supplements the attached property carries', () => {
    // Operator: "the supplements should be relative to that particular
    // property attached, which is not happening now."
    expect(editor).toContain('carried={propertyInUse[index] ? propertyInUse[index]!.supplements : undefined}')
    expect(editor).toContain('propertyName={propertyInUse[index]?.name}')
    // Which requires the picker to report what it resolved to.
    expect(editor).toMatch(/onResolved=\{\(option\) => setPropertyInUse/)
  })
})

describe('a day can be corrected instead of deleted and retyped', () => {
  it('edits in place', () => {
    expect(editor).toContain('setEditing(editing === index ? null : index)')
    expect(editor).toContain('patchDay(index, { title: e.target.value })')
    expect(editor).toContain('patchDay(index, { city: e.target.value || undefined })')
    expect(editor).toContain('patchDay(index, { description: e.target.value })')
  })

  it('the destructive button is visible, named, and asks first', () => {
    expect(editor).toMatch(/aria-label=\{`Delete day \$\{day\.day\}`\}/)
    expect(editor).toContain('>\n                  Delete\n                </button>')
    expect(editor).toContain('await confirmDelete(')
    // It used to be a bare X that only appeared on hover.
    expect(editor).not.toContain('opacity-0 group-hover:opacity-100 transition-opacity')
  })
})
