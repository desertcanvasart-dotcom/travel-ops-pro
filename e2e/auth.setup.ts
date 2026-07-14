import { test as setup, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { STORAGE_STATE } from './helpers'

// Logs in once through the REAL login UI (not an API shortcut) and saves the
// cookie session to e2e/.auth/user.json for the authed smoke suite. Going
// through the UI is deliberate: it exercises the @supabase/ssr cookie client —
// the exact integration whose absence broke the app when RLS went live.

setup('authenticate as the E2E user', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  setup.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD not set — authed smoke suite will be skipped')

  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email!)
  await page.locator('input[type="password"]').fill(password!)
  await page.getByRole('button', { name: /sign in/i }).click()

  // AuthContext pushes /dashboard on success.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true })
  await page.context().storageState({ path: STORAGE_STATE })
})
