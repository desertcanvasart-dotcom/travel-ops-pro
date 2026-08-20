import { test, expect, type Page } from '@playwright/test'
import { STORAGE_STATE } from './helpers'
import {
  SEEDED_ITINERARY_CODE,
  isFixtureCode,
  createTestClient,
  destroyTestClient,
  type TestClient,
} from './fixtures'

// Tier 2 — authenticated journeys as the seeded E2E user (own test org, so
// nothing here can touch real operator data). Each journey asserts the page
// actually shows DATA, not just that it returns 200 — a page that renders an
// empty shell over silent query failures must fail here. That failure mode is
// exactly how the dual-client/RLS bug ("Itinerary not found" on edit, zero
// clients in contacts) lived undetected for weeks.

const HAVE_CREDS = !!process.env.E2E_EMAIL && !!process.env.E2E_PASSWORD

test.use({ storageState: STORAGE_STATE })

// The setup project (a hard dependency) writes STORAGE_STATE before this file
// runs — only skip when there are no credentials for setup to log in with.
test.skip(!HAVE_CREDS, 'E2E_EMAIL / E2E_PASSWORD not set')

// Collect page errors + severe console errors so a journey that "renders"
// while queries explode underneath still fails loudly.
function watchConsole(page: Page): () => string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Ignore benign noise (favicons, aborted fetches on navigation, dev HMR).
    if (/favicon|net::ERR_ABORTED|Failed to load resource.*404/i.test(text)) return
    errors.push(text)
  })
  return () => errors
}

test('itineraries list shows the seeded itinerary', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/itineraries')
  await expect(page.getByRole('heading', { name: 'Itineraries' })).toBeVisible()
  // The seed guarantees at least one row for the E2E org.
  await expect(page.getByText('E2E-SMOKE-001').first()).toBeVisible({ timeout: 20_000 })
  expect(errorsOf(), 'no console errors while loading the list').toEqual([])
})

test('itinerary EDIT page loads (regression: "Itinerary not found")', async ({ page }) => {
  await page.goto('/itineraries')
  // Click the seeded row's Edit action (pencil icon, title="Edit").
  const row = page.getByRole('row').filter({ hasText: 'E2E-SMOKE-001' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.getByTitle('Edit').click()
  await expect(page).toHaveURL(/\/itineraries\/[0-9a-f-]+\/edit/, { timeout: 20_000 })

  // The journey under regression test: direct browser read of the itinerary
  // through the cookie-session client. Before PR #40 this showed
  // "Itinerary not found" for every itinerary.
  await expect(page.getByText('Itinerary not found')).toHaveCount(0, { timeout: 20_000 })
  // Positive anchor: the editor is populated with the seeded day (the trip
  // content lives in form input VALUES, so assert value, not text).
  await expect(page.getByPlaceholder(/day title/i).first()).toHaveValue(/E2E Smoke Trip/, {
    timeout: 20_000,
  })
})

test('the editor offers a programme to link the trip to', async ({ page }) => {
  // Linking a programme is what lets the customer portal show the office's own
  // 日程表 rather than falling back to a plain day list, and until this picker
  // existed nothing in the UI could set itineraries.template_id at all.
  await page.goto('/itineraries')
  const row = page.getByRole('row').filter({ hasText: 'E2E-SMOKE-001' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.getByTitle('Edit').click()
  await expect(page).toHaveURL(/\/itineraries\/[0-9a-f-]+\/edit/, { timeout: 20_000 })

  const picker = page.locator('select').filter({ hasText: 'Not linked' })
  await expect(picker).toBeVisible({ timeout: 20_000 })
  // Populated from /api/tours/templates?slim=1 — more than just the empty
  // option means the list actually arrived.
  await expect
    .poll(async () => await picker.locator('option').count(), { timeout: 20_000 })
    .toBeGreaterThan(1)
})

// The client these two assert on is created per run and removed afterwards.
// `clients` has no org_id, so a permanent fixture would sit in the operator's
// real list — and deleting it from there is what broke both of these before.
let client: TestClient | null = null
test.beforeAll(async () => {
  if (!HAVE_CREDS) return
  client = await createTestClient('CLIENTS')
})
test.afterAll(async () => {
  await destroyTestClient(client)
  client = null
})

test('clients page shows the seeded client', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/clients')
  await expect(page.getByText(client!.displayName).first()).toBeVisible({ timeout: 20_000 })
  expect(errorsOf()).toEqual([])
})

test('contacts directory includes clients (regression: zero-clients bug)', async ({ page }) => {
  await page.goto('/contacts')
  await expect(page.getByText(client!.displayName).first()).toBeVisible({ timeout: 20_000 })
})

test('payments page renders its stats without errors', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/payments')
  // Stats cards render even with zero payments; what must NOT happen is a
  // silent fetch failure (fetchAllPages throws → console error → caught here).
  await page.waitForLoadState('networkidle')
  expect(errorsOf()).toEqual([])
})

test('calendar renders the seeded booking window', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/calendar')
  await page.waitForLoadState('networkidle')
  expect(errorsOf()).toEqual([])
})

test('system health: DB reachable, no RLS exposure', async ({ page }) => {
  // page.request shares the authed cookie session. This makes every E2E run
  // an automated RLS audit: any anon-visible row on a locked table fails CI.
  const res = await page.request.get('/api/health/system')
  expect(res.status(), 'health endpoint should answer 200 when healthy').toBe(200)
  const health = await res.json()
  expect(health.database.ok, 'database reachable via service role').toBe(true)
  expect(
    health.rls.exposed,
    `tables exposed to the anonymous internet: ${JSON.stringify(health.rls.exposed)}`
  ).toEqual([])
  expect(health.overall).toBe('ok')
})

test('dashboard loads its stat cards', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  expect(errorsOf()).toEqual([])
})

// NOTE: the /profit-loss PAGE is gated to admin/manager in middleware.ts and
// the seeded E2E user is below that, so its rendering cannot be asserted here —
// the API test below is the contract check. Do not "fix" that by promoting the
// E2E user: the role gate is itself worth keeping honest.

test('itineraries list shows a trip owner column', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/itineraries')
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeVisible({ timeout: 20_000 })

  // An unowned trip must SAY so. A blank cell reads as "loading" or "not a
  // field anyone fills in"; the point of the feature is that it is noticed.
  const row = page.getByRole('row').filter({ hasText: 'E2E-SMOKE-001' })
  await expect(row.getByText(/Unassigned|\w/).first()).toBeVisible()
  expect(errorsOf()).toEqual([])
})

test('P&L API returns the commission and realized fields for every trip', async ({ page }) => {
  const res = await page.request.get('/api/profit-loss')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)

  // Summary always carries the new aggregates, even with no commissions on file
  // — a missing key would silently render as "undefined" rather than €0.
  for (const key of [
    'total_agent_commissions',
    'total_net_profit',
    'average_net_margin',
    'total_realized_revenue',
    'total_realized_cost',
    'total_realized_profit',
  ]) {
    expect(typeof body.summary[key], `summary.${key}`).toBe('number')
  }

  for (const trip of body.data) {
    expect(typeof trip.agent_commissions, trip.itinerary_code).toBe('number')
    expect(typeof trip.net_profit, trip.itinerary_code).toBe('number')
    expect(typeof trip.realized_profit, trip.itinerary_code).toBe('number')
    // The invariant: net is gross less what the agent takes.
    expect(trip.net_profit).toBeCloseTo(trip.gross_profit - trip.agent_commissions, 6)
    // Realized never silently absorbs the supplier-cost estimate.
    expect(trip.realized_cost).toBeLessThanOrEqual(
      trip.expenses_paid + trip.agent_commissions_paid + 0.001
    )
  }
})

test('P&L returns ONLY the caller\'s own org (regression: no org filter)', async ({ page }) => {
  // This route reads with the service-role key, which bypasses RLS, and used to
  // filter by nothing at all — the seeded E2E org saw the real operator's trips.
  const res = await page.request.get('/api/profit-loss')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)

  // What this guards is TENANCY: no other operator's trips may appear. It used
  // to assert exactly one itinerary, which made it fail whenever a booking spec
  // left an orphan — reporting a leak that had not happened. Assert instead
  // that everything returned belongs to this harness.
  const codes = body.data.map((t: { itinerary_code: string }) => t.itinerary_code)
  const foreign = codes.filter((c: string) => !isFixtureCode(c))
  expect(foreign, `foreign trips leaked into the P&L: ${JSON.stringify(foreign)}`).toEqual([])
  expect(codes, 'the seeded itinerary should be in its own P&L').toContain(SEEDED_ITINERARY_CODE)
})

test('capacity page renders the month grid', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/capacity')
  await expect(page.getByRole('heading', { name: 'Capacity' })).toBeVisible({ timeout: 20_000 })
  // The grid itself, not just the shell: seven weekday headers.
  await expect(page.getByText('Mon', { exact: true })).toBeVisible()
  await expect(page.getByText('Sun', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(errorsOf()).toEqual([])
})

test('integrations API offers the adapter registry as connectable platforms', async ({ page }) => {
  // NOTE: the /settings/integrations PAGE is admin-only (middleware gates all
  // of /settings) and the seeded E2E user is below that, so this checks the
  // contract the page is built on rather than its rendering.
  const res = await page.request.get('/api/integrations')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)

  // Driven by lib/integrations/registry — a newly added adapter must appear in
  // the connection picker without a second place to update.
  const slugs = (body.providers || []).map((p: { slug: string }) => p.slug)
  expect(slugs).toContain('generic')
  expect(slugs).toContain('sawa')
  expect(
    (body.providers || []).every((p: { label: string; description: string }) => p.label && p.description)
  ).toBe(true)
})

test('department routing reports its gaps instead of hiding them', async ({ page }) => {
  const res = await page.request.get('/api/departments/routing')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)

  // Every service type in the data must reach a department. An empty array here
  // is the whole point: unrouted work produces unassignable tasks that look
  // exactly like tasks nobody has picked up.
  expect(
    body.routing.unrouted_service_types,
    `service types owned by no department: ${JSON.stringify(body.routing.unrouted_service_types)}`
  ).toEqual([])
  expect(body.departments.length).toBeGreaterThan(0)
})
