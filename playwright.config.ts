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

// ============================================
// The suite must never run against production
// ============================================
// CI was given a dedicated throwaway Supabase project precisely so a pull
// request could not create and delete rows in the live customer database
// (docs/ci-e2e-project.md). That protection stopped at the laptop: .env.local
// holds the PRODUCTION keys, nothing overrode them, and so `npm run test:e2e`
// run locally wrote to real customer data. The specs write — one of them
// creates a hotel rate and a booking — so this was a live hazard, not a
// theoretical one.
//
// Local runs now have to be handed a dedicated project explicitly. Failing
// loudly beats writing to production and finding out later; it is the same
// stance the CI workflow already takes when its secrets are missing.
//
//   E2E_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY  → used for the tests AND
//   for the dev server Playwright boots, so both halves talk to the same
//   throwaway project.
//
// CI is exempt: its workflow maps the dedicated project's secrets straight
// onto NEXT_PUBLIC_SUPABASE_URL and friends, and
// __tests__/ci/workflow-secrets.test.ts already asserts no workflow can read a
// production secret.
const E2E_PROJECT_URL = process.env.E2E_SUPABASE_URL

if (E2E_PROJECT_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = E2E_PROJECT_URL
  if (process.env.E2E_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY
  }
  if (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
  }
} else if (!process.env.CI && process.env.E2E_ALLOW_PRODUCTION !== '1') {
  throw new Error(
    [
      '',
      'Refusing to run the E2E suite: no dedicated Supabase project was given.',
      '',
      'Without E2E_SUPABASE_URL this suite would use the keys in .env.local —',
      'your PRODUCTION database — and these specs write to it (they create a',
      'hotel rate, a booking and a traveller, then delete them).',
      '',
      'Point it at the throwaway project instead (docs/ci-e2e-project.md):',
      '',
      '  E2E_SUPABASE_URL=https://<ci-project>.supabase.co \\',
      '  E2E_SUPABASE_ANON_KEY=... \\',
      '  E2E_SUPABASE_SERVICE_ROLE_KEY=... \\',
      '  E2E_EMAIL=... E2E_PASSWORD=... \\',
      '  npm run test:e2e',
      '',
      'Note E2E_EMAIL / E2E_PASSWORD must be a login that exists in THAT',
      'project, not the production one.',
      '',
      'If you genuinely mean to run against production — proving a deploy, say —',
      'set E2E_ALLOW_PRODUCTION=1 and know that it writes to live data.',
      '',
    ].join('\n')
  )
} else if (!process.env.CI) {
  console.warn(
    '\n  ⚠  E2E_ALLOW_PRODUCTION=1 — this run writes to the PRODUCTION database.\n'
  )
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
        // The dev server needs the same project as the fixtures. Without this
        // the specs would write to the throwaway project while the APP under
        // test still read and wrote production — the worst of both.
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
      }
    : undefined,
})
