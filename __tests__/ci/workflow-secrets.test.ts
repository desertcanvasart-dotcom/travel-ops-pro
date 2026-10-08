// ============================================
// CI never holds production credentials
// ============================================
// The E2E job used to run on the PRODUCTION Supabase project, with a
// service-role key that bypasses RLS. Two consequences, both real: every pull
// request created and deleted rows in the live customer database, and anyone
// with write access could read the key out of a workflow they had modified.
// The repository is public.
//
// It now runs against a dedicated project (docs/ci-e2e-project.md). This test
// is what stops that decision quietly eroding — a secret renamed back, or a new
// job added that reaches for the production key out of habit.
//
// One deliberate exception, fenced and pinned below: the manual production
// migration workflow may read the production DATABASE URL (never the app keys).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const WORKFLOW_DIR = join(process.cwd(), '.github', 'workflows')
const workflows = readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))

/** Secret names that hold PRODUCTION credentials. CI must never reference these. */
const PRODUCTION_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  // A plain DATABASE_URL would be read as "the" database — production. The
  // E2E migration workflow reads E2E_DATABASE_URL, never this.
  'DATABASE_URL',
]

describe('GitHub workflows', () => {
  it('has workflows to check', () => {
    expect(workflows.length).toBeGreaterThan(0)
  })

  it.each(workflows)('%s never reads a production Supabase secret', file => {
    const src = readFileSync(join(WORKFLOW_DIR, file), 'utf8')
    // Strip comments — they legitimately name the old secrets to explain the
    // history, and the point of this test is what the workflow READS.
    const yaml = src.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')

    for (const name of PRODUCTION_SECRETS) {
      // `secrets.E2E_SUPABASE_URL` must not trip the `NEXT_PUBLIC_SUPABASE_URL`
      // check, so match the secret reference exactly.
      const ref = new RegExp(`secrets\\.${name}\\b`)
      expect(
        yaml,
        `${file} reads secrets.${name} — CI must use the dedicated E2E project (docs/ci-e2e-project.md), not production`
      ).not.toMatch(ref)
    }
  })

  it('the E2E job reads the dedicated project secrets', () => {
    const ci = readFileSync(join(WORKFLOW_DIR, 'ci.yml'), 'utf8')
    for (const name of ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY']) {
      expect(ci, `ci.yml should read secrets.${name}`).toMatch(new RegExp(`secrets\\.${name}\\b`))
    }
  })

  it('the E2E migration workflow migrates only the dedicated project', () => {
    const wf = readFileSync(join(WORKFLOW_DIR, 'e2e-migrate.yml'), 'utf8')
    const yaml = wf.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
    // Its one database is the E2E project's, and it stops when that is unset
    // rather than migrating whatever DATABASE_URL happens to point at.
    expect(yaml).toMatch(/DATABASE_URL: \$\{\{ secrets\.E2E_DATABASE_URL \}\}/)
    expect(yaml).toContain('E2E_DATABASE_URL is not set')
    // Never from a pull request: a PR's code would run with the database secret.
    expect(yaml).not.toMatch(/^\s*pull_request(_target)?:/m)
  })

  // ------------------------------------------------------------------------
  // The one exception: migrating production
  // ------------------------------------------------------------------------
  // Production has to be migrated by something, and pasting SQL into the
  // Supabase editor is how three migrations once sat unapplied. So ONE
  // workflow may hold ONE production credential — the database URL, never the
  // app's keys above — and only behind every fence pinned here.
  const PROD_WORKFLOW = 'production-migrate.yml'

  it.each(workflows.filter(f => f !== PROD_WORKFLOW))('%s never reads the production database URL', file => {
    const src = readFileSync(join(WORKFLOW_DIR, file), 'utf8')
    const yaml = src.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
    expect(yaml, `${file}: only ${PROD_WORKFLOW} may read the production database`).not.toMatch(/secrets\.PRODUCTION_DATABASE_URL\b/)
  })

  describe(`${PROD_WORKFLOW} — the production migration workflow`, () => {
    const src = readFileSync(join(WORKFLOW_DIR, PROD_WORKFLOW), 'utf8')
    const yaml = src.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
    const triggers = yaml.slice(yaml.indexOf('\non:'), yaml.indexOf('\nconcurrency:'))

    it('runs only when a person starts it — never on push, a PR, a schedule or another workflow', () => {
      expect(triggers).toMatch(/^\s*workflow_dispatch:/m)
      for (const t of ['push', 'pull_request', 'pull_request_target', 'schedule', 'workflow_run', 'workflow_call', 'repository_dispatch']) {
        expect(triggers, `${PROD_WORKFLOW} must not trigger on ${t}`).not.toMatch(new RegExp(`^\\s*${t}:`, 'm'))
      }
    })

    it('gets the URL from its own "production-database" environment, so GitHub can hold it to main and an approval', () => {
      // Not "Production": that is Vercel's deployment record, and its rules are Vercel's.
      expect(yaml).toMatch(/^\s*environment: production-database\s*$/m)
      expect(yaml).toMatch(/DATABASE_URL: \$\{\{ secrets\.PRODUCTION_DATABASE_URL \}\}/)
    })

    it('runs only from main', () => {
      expect(yaml).toContain("if: github.ref == 'refs/heads/main'")
    })

    it('writes only when "production" is typed, and stops when the URL is missing', () => {
      expect(yaml).toMatch(/\[ "\$CONFIRM" != "production" \]/)
      expect(yaml).toContain('PRODUCTION_DATABASE_URL is not set')
      // Reading is the default; writing is chosen.
      expect(yaml).toMatch(/default: status/)
    })

    it('is never cancelled halfway through a migration', () => {
      expect(yaml).toMatch(/cancel-in-progress: false/)
    })
  })

  it('fails loudly when the E2E secrets are missing outside a fork', () => {
    // The gate previously could not tell "fork PR, secrets withheld by design"
    // from "somebody renamed a secret". Renaming would then have turned E2E off
    // on every PR while CI still reported green — which is worse than a break.
    const ci = readFileSync(join(WORKFLOW_DIR, 'ci.yml'), 'utf8')
    expect(ci, 'the gate must distinguish a fork PR from a misconfiguration').toContain(
      'head.repo.full_name != github.repository'
    )
    expect(ci, 'a missing secret outside a fork must fail the job').toMatch(/::error::[\s\S]*?exit 1/)
  })
})

// ============================================
// Nor does a laptop
// ============================================
// The dedicated-project decision above protected CI and stopped at the laptop.
// .env.local holds the PRODUCTION keys and nothing overrode them, so
// `npm run test:e2e` run locally wrote to real customer data — and these specs
// write: one creates a hotel rate, another a booking and a traveller.
//
// playwright.config.ts now refuses to start without a dedicated project. This
// pins that refusal, because a config guard is exactly the kind of thing that
// gets deleted to make a run go through.

describe('the E2E suite refuses to run against production', () => {
  const config = readFileSync(join(process.cwd(), 'playwright.config.ts'), 'utf8')

  it('requires a dedicated project before it will start', () => {
    expect(config).toContain('E2E_SUPABASE_URL')
    expect(config).toMatch(/Refusing to run the E2E suite/)
  })

  it('points the dev server it boots at that same project', () => {
    // Otherwise the fixtures would write to the throwaway project while the app
    // under test still read and wrote production — the worst of both.
    expect(config).toMatch(/webServer[\s\S]*env:\s*\{[\s\S]*NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('leaves CI alone, which maps its own secrets already', () => {
    expect(config).toContain('process.env.CI')
  })

  it('keeps an explicit, loud opt-in for proving a deploy', () => {
    expect(config).toContain('E2E_ALLOW_PRODUCTION')
    expect(config).toMatch(/writes to the PRODUCTION database/)
  })
})
