// T5: releases exist so "which version is this customer running?" has an
// answer. Before this, package.json said 0.1.1 and had said so for every
// deploy of the year — it identified nothing.
//
// The version format is the contract between the release script, /api/version
// and the support bundle, so it is defined once and tested once.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isReleaseVersion } from '@/lib/support/bundle-core.mjs'
import { nextVersion } from '@/scripts/release.mjs'

describe('isReleaseVersion', () => {
  it('accepts a dated release, and a second cut on the same day', () => {
    expect(isReleaseVersion('2026.08.29')).toBe(true)
    expect(isReleaseVersion('2026.08.29-2')).toBe(true)
  })

  it('rejects the scaffolding semver this project shipped for a year', () => {
    expect(isReleaseVersion('0.1.1')).toBe(false)
    expect(isReleaseVersion('1.0.0')).toBe(false)
  })

  it('rejects near-misses rather than guessing', () => {
    expect(isReleaseVersion('2026.8.29')).toBe(false) // unpadded
    expect(isReleaseVersion('v2026.08.29')).toBe(false) // that is the TAG
    expect(isReleaseVersion('')).toBe(false)
    expect(isReleaseVersion(null)).toBe(false)
    expect(isReleaseVersion(undefined)).toBe(false)
  })
})

describe('nextVersion', () => {
  it('is the date when the day has no release yet', () => {
    expect(nextVersion('2026.08.29', [])).toBe('2026.08.29')
  })

  it('suffixes a second cut on the same day rather than reusing the tag', () => {
    // A released tag's meaning never changes — the same rule as a released
    // migration.
    expect(nextVersion('2026.08.29', ['v2026.08.29'])).toBe('2026.08.29-2')
    expect(nextVersion('2026.08.29', ['v2026.08.29', 'v2026.08.29-2'])).toBe('2026.08.29-3')
  })

  it('ignores unrelated tags', () => {
    expect(nextVersion('2026.08.29', ['archive/pre-delivery-audit-fixes', 'v2026.01.01'])).toBe(
      '2026.08.29',
    )
  })

  it('everything it produces is a valid release version', () => {
    const tags: string[] = []
    for (let i = 0; i < 5; i++) {
      const v = nextVersion('2026.08.29', tags)
      expect(isReleaseVersion(v)).toBe(true)
      tags.push(`v${v}`)
    }
  })
})

describe('the release procedure is enforced, not just documented', () => {
  const src = readFileSync(join(process.cwd(), 'scripts/release.mjs'), 'utf8')

  it('refuses to tag a commit CI has not passed', () => {
    // A tag on a red commit is a promise we did not keep.
    expect(src).toContain('CI green on this commit')
    expect(src).toMatch(/gh run list --commit/)
  })

  it('refuses a dirty tree, a non-main branch, and being out of sync', () => {
    expect(src).toContain('working tree clean')
    expect(src).toContain('on main')
    expect(src).toContain('in sync with origin/main')
  })

  it('refuses to move an existing tag', () => {
    expect(src).toContain('tag is free')
  })

  it('does nothing without --yes', () => {
    expect(src).toMatch(/const APPLY = process\.argv\.includes\('--yes'\)/)
    expect(src).toMatch(/if \(!APPLY\)/)
  })
})

describe('a deployment can be checked against a tag', () => {
  it('verify-deploy accepts --tag and resolves it to a commit', () => {
    // A tag nobody can check a deployment against is just a label.
    const src = readFileSync(join(process.cwd(), 'scripts/verify-deploy.mjs'), 'utf8')
    expect(src).toContain("arg('tag')")
    expect(src).toMatch(/git rev-list -n 1/)
  })

  it('/api/version says whether this build was cut as a release', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/version/route.ts'), 'utf8')
    expect(src).toContain('isRelease')
    expect(src).toContain('isReleaseVersion')
  })
})
