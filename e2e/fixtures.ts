// ============================================
// Per-run fixtures
// ============================================
// The E2E suite runs against a SHARED Supabase project. CI and a developer can
// run it at the same moment, and both used to create, delete and re-create the
// same rows — the same `E2E-Q2B-001` quote, the same booking on the same
// seeded itinerary. Two failure modes came out of that, and both were seen on
// real runs before this file existed:
//
//   "Quote not found"           — the other run deleted the fixture mid-test
//   "This itinerary is already booked"
//                               — a run died before its afterAll, and the app
//                                 allows one booking per itinerary, so the
//                                 leftover blocked every later run
//
// Neither was a defect in the app. Both looked exactly like one.
//
// So anything a spec CREATES is now stamped with a run id. Two runs no longer
// touch the same rows, and an abandoned run leaves orphans that block nothing.
//
// What is NOT per-run: the seeded org, user and itinerary. Those are read-only
// fixtures shared on purpose — they are what the smoke suite asserts against,
// and minting a user per run would be slow and would litter auth.

import { expect } from '@playwright/test'

/**
 * Identifies this run.
 *
 * CI passes the workflow run id; a developer gets a timestamp. Kept short
 * because it ends up inside `itinerary_code`, which is a VARCHAR the UI shows.
 */
export const RUN_ID: string =
  process.env.E2E_RUN_ID?.slice(-8) ??
  process.env.GITHUB_RUN_ID?.slice(-8) ??
  Date.now().toString(36).slice(-8)

/** Everything this run creates carries this prefix, so a sweep can find it. */
export const RUN_PREFIX = `E2ERUN-${RUN_ID}`

/** A code unique to this run — `E2ERUN-abc12345-SPINE`. */
export const runCode = (suffix: string): string => `${RUN_PREFIX}-${suffix}`

/** The permanently seeded, READ-ONLY fixture (scripts/seed-e2e.mjs). */
export const SEEDED_ITINERARY_CODE = 'E2E-SMOKE-001'

/** Anything the harness owns, per-run or seeded. Used to prove no foreign
 *  tenant's data leaked into a response. */
export const isFixtureCode = (code: string | null | undefined): boolean =>
  typeof code === 'string' && (code === SEEDED_ITINERARY_CODE || code.startsWith('E2ERUN-'))

// ---------------------------------------------------------------------------
// A disposable itinerary
// ---------------------------------------------------------------------------
// The two booking specs each need one they can BOOK. They used to share the
// seeded itinerary, which the app refuses to book twice — so they conflicted
// with each other as well as across runs.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function headers() {
  return {
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

/** Direct REST — fixture setup and teardown only, never the assertions. */
export async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: headers() })
  const text = await res.text()
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

export interface TestItinerary {
  id: string
  orgId: string
  code: string
  startDate: string
  endDate: string
}

/**
 * A throwaway itinerary this spec owns outright.
 *
 * Departure is 120 days out so the payment schedule takes the ordinary
 * deposit-plus-balance path; inside sixty days it collapses to a single
 * payment, which silently changes what a booking assertion is testing.
 */
export async function createTestItinerary(suffix: string): Promise<TestItinerary> {
  const [seed] = await rest(
    `itineraries?itinerary_code=eq.${SEEDED_ITINERARY_CODE}&select=org_id`
  )
  expect(seed, `seeded org missing — run npm run seed:e2e`).toBeTruthy()

  const start = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10)
  const end = new Date(Date.now() + 121 * 86_400_000).toISOString().slice(0, 10)
  const code = runCode(suffix)

  const [itin] = await rest('itineraries', {
    method: 'POST',
    body: JSON.stringify({
      itinerary_code: code,
      org_id: seed.org_id,
      client_name: 'Smoke Tester',
      trip_name: `E2E ${suffix} (${RUN_ID})`,
      start_date: start,
      end_date: end,
      total_days: 2,
      num_adults: 2,
      num_children: 0,
      currency: 'EUR',
      total_cost: 0,
      status: 'draft',
    }),
  })

  return { id: itin.id, orgId: seed.org_id, code, startDate: start, endDate: end }
}

/** Remove the itinerary and everything hanging off it, deepest first. */
export async function destroyTestItinerary(itin: TestItinerary | null): Promise<void> {
  if (!itin) return
  const bookings = await rest(`bookings?itinerary_id=eq.${itin.id}&select=id`)
  for (const b of bookings ?? []) {
    await rest(`booking_passengers?booking_id=eq.${b.id}`, { method: 'DELETE' })
    await rest(`booking_portal_links?booking_id=eq.${b.id}`, { method: 'DELETE' })
  }
  await rest(`bookings?itinerary_id=eq.${itin.id}`, { method: 'DELETE' })
  await rest(`b2c_quotes?itinerary_id=eq.${itin.id}`, { method: 'DELETE' })
  await rest(`invoices?itinerary_id=eq.${itin.id}`, { method: 'DELETE' })
  await rest(`itinerary_days?itinerary_id=eq.${itin.id}`, { method: 'DELETE' })
  await rest(`itineraries?id=eq.${itin.id}`, { method: 'DELETE' })
}
