// The itinerary page finds its trip's booking by itinerary id.
//
// It used to call /api/bookings?search=<itinerary id>, but `search` matches
// client name, trip name and booking code — never the id — so no booking was
// ever found: the booking chip never showed beside the invoice, "Create
// booking" stayed offered on booked trips, and Needs attention said "invoiced
// but no booking yet". Source-level pin, in the style of inbox-read-role-gate.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe("the itinerary page's booking lookup", () => {
  it('GET /api/bookings filters by itinerary_id, scoped to the org', () => {
    const src = read('app/api/bookings/route.ts')
    const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    expect(get).toContain("searchParams.get('itinerary_id')")
    expect(get).toMatch(/\.eq\('itinerary_id', itineraryId\)/)
    expect(get).toMatch(/\.eq\('org_id', orgId\)/)
  })

  it('the page asks by itinerary id, not through the name search', () => {
    const page = read('app/itineraries/[id]/page.tsx')
    const fn = page.slice(page.indexOf('const checkExistingBooking'), page.indexOf('const handleCreateBooking'))
    expect(fn).toContain('/api/bookings?itinerary_id=')
    expect(fn).not.toContain('?search=')
  })

  it("the edit page's \"Go to booking\" opens the trip's booking, not a search the list ignores", () => {
    const edit = read('app/itineraries/[id]/edit/page.tsx')
    expect(edit).toContain('/api/bookings?itinerary_id=')
    expect(edit).toContain('`/bookings/${bookingId}`')
    expect(edit).not.toContain('/bookings?search=')
  })
})
