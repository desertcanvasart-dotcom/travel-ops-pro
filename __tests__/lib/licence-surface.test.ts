// Where the licence is allowed to show, and where it must not.
//
// /api/version is PUBLIC (middleware-allowlisted, hit unauthenticated by
// verify-deploy). The licensee and, later, the installation id are for
// Settings and the support bundle — never for an endpoint the whole internet
// can read. The boot hook must verify regardless of the scheduler flag; the
// template and doctor must know the key.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('licence surface', () => {
  it('/api/version never touches the licence', () => {
    const src = read('app/api/version/route.ts')
    for (const word of ['licence', 'license', 'licensee', 'installation_id', 'LICENSE_KEY']) {
      expect(src.toLowerCase().includes(word.toLowerCase()), word).toBe(false)
    }
  })
  it('/api/licence is not on the public allowlist', () => {
    expect(read('middleware.ts').includes("'/api/licence'")).toBe(false)
  })
  it('the boot hook verifies before, and independently of, the scheduler guard', () => {
    const src = read('instrumentation.ts')
    expect(src.indexOf('logLicenceAtBoot()')).toBeGreaterThan(-1)
    expect(src.indexOf('logLicenceAtBoot()')).toBeLessThan(src.indexOf('process.env.CRON_IN_PROCESS'))
  })
  it('.env.example, the support bundle and doctor all know LICENSE_KEY', () => {
    expect(read('.env.example')).toMatch(/^LICENSE_KEY=$/m)
    expect(read('lib/support/bundle-core.mjs')).toContain("'LICENSE_KEY'")
    expect(read('scripts/doctor.mjs')).toContain("verifyLicence(process.env.LICENSE_KEY)")
  })
  it('the Settings organization tab shows the licence card', () => {
    expect(read('app/settings/page.tsx')).toContain("{activeTab === 'organization' && <LicenceCard />}")
  })
  it('doctor and the mint script share the app\'s verifier — one implementation', () => {
    expect(read('scripts/doctor.mjs')).toContain("from '../lib/licence/verify-core.mjs'")
    expect(read('scripts/mint-licence.mjs')).toContain("from '../lib/licence/verify-core.mjs'")
    expect(read('lib/licence/index.ts')).toContain("from './verify-core.mjs'")
  })
})
