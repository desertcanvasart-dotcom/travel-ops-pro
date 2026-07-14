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
    for (const endpoint of ['/api/itineraries', '/api/invoices', '/api/payments', '/api/clients']) {
      const res = await request.get(endpoint)
      expect(res.status(), `${endpoint} must not serve data anonymously`).toBe(401)
    }
  })
})
