// The parse route's package rules — the section that tells the AI which
// components the product excludes (the deterministic scrub in the route then
// guarantees it). Pinned per package so a wording change that drops a rule
// shows up here.
import { describe, it, expect } from 'vitest'
import { packageRules } from '@/lib/ai/package-prompt-rules'
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'

const rules = (slug: string) =>
  packageRules(PACKAGE_TYPE_CONFIGS.find(c => c.slug === slug)!)

describe('packageRules', () => {
  it('tours-only excludes accommodation, hotel services and airport transfers', () => {
    const r = rules('tours-only')
    expect(r).toContain('NO accommodation')
    expect(r).toContain('NO hotel_services')
    expect(r).toContain('NO airport transfers')
  })

  it('land-package excludes airport transfers but keeps hotels', () => {
    const r = rules('land-package')
    expect(r).toContain('NO airport transfers')
    expect(r).not.toContain('NO accommodation')
  })

  it('full-package changes nothing — the day templates apply as written', () => {
    const r = rules('full-package')
    expect(r).toContain('apply as written')
    expect(r).not.toContain('NO accommodation')
    expect(r).not.toContain('NO airport transfers')
  })
})
