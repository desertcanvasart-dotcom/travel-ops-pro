import { test, expect, type Page } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

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

test('clients page shows the seeded client', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/clients')
  await expect(page.getByText('Smoke Tester').first()).toBeVisible({ timeout: 20_000 })
  expect(errorsOf()).toEqual([])
})

test('contacts directory includes clients (regression: zero-clients bug)', async ({ page }) => {
  await page.goto('/contacts')
  await expect(page.getByText('Smoke Tester').first()).toBeVisible({ timeout: 20_000 })
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

test('dashboard loads its stat cards', async ({ page }) => {
  const errorsOf = watchConsole(page)
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  expect(errorsOf()).toEqual([])
})
