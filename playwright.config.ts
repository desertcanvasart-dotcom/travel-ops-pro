import { defineConfig, devices } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Load .env.local so E2E_* vars (and the dev server it boots) see the same
// environment `next dev` would. Never overrides already-set process env.
try {
  const envPath = path.resolve(__dirname, '.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
} catch {
  /* .env.local optional (CI provides env directly) */
}

// Where the app under test runs:
// - Default: Playwright boots its own `next dev` on port 3100.
// - If you already have a dev server running (next holds a single
//   .next/dev/lock per checkout, so two `next dev` can't coexist), point the
//   suite at it instead:  E2E_BASE_URL=http://localhost:3001 npm run test:e2e
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100'
const BOOT_OWN_SERVER = !process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false, // smoke journeys share one seeded org; keep ordering simple
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Logs in once via the real UI and saves the cookie session for the
    // authed suite. Skips itself when E2E_EMAIL/E2E_PASSWORD are absent.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: BOOT_OWN_SERVER
    ? {
        command: 'npm run dev -- -p 3100',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
})
