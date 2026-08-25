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
