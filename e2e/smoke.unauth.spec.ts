import { test, expect } from '@playwright/test'

// Tier 1 — no credentials, no seed data. Runs anywhere the app boots.
// Proves: the app serves pages, the auth gate holds, and the login surface
// (the front door to everything else) renders.

test.describe('unauthenticated smoke', () => {
  test('login page renders the sign-in form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('protected pages redirect to login', async ({ page }) => {
    for (const route of ['/itineraries', '/clients', '/payments', '/dashboard']) {
      await page.goto(route)
      await expect(page, `${route} should bounce an anonymous visitor`).toHaveURL(/\/login/, {
        timeout: 15_000,
      })
    }
  })

  test('API auth gate returns 401 for anonymous requests', async ({ request }) => {
    // /api/health/system is included deliberately: it describes security
    // posture and must never be readable without a session.
    for (const endpoint of [
      '/api/itineraries',
      '/api/invoices',
      '/api/payments',
      '/api/clients',
      '/api/health/system',
    ]) {
      const res = await request.get(endpoint)
      expect(res.status(), `${endpoint} must not serve data anonymously`).toBe(401)
    }
  })

  test('version endpoint is public and reports a commit', async ({ request }) => {
    const res = await request.get('/api/version')
    expect(res.status()).toBe(200)
    const v = await res.json()
    expect(typeof v.sha).toBe('string')
    expect(v.sha.length).toBeGreaterThan(0)
  })

  test('partner availability API rejects an anonymous or bogus key', async ({ request }) => {
    // Reaches the ROUTE, not the middleware gate — /api/public/v1/ is on the
    // self-authenticating allowlist. The WWW-Authenticate header is how we can
    // tell the two apart: middleware's blanket 401 does not send one.
    const anon = await request.get('/api/public/v1/availability')
    expect(anon.status()).toBe(401)
    expect(anon.headers()['www-authenticate']).toContain('Bearer')

    const bogus = await request.get('/api/public/v1/availability', {
      headers: { Authorization: 'Bearer tops_live_not-a-real-key' },
    })
    expect(bogus.status()).toBe(401)
  })

  test('inbound integration webhook refuses an unsigned delivery', async ({ request }) => {
    // No signature, no org: must never reach the mirror logic.
    const res = await request.post('/api/webhooks/integrations/generic', {
      data: { departures: [] },
    })
    expect([400, 401, 404]).toContain(res.status())
  })
})
