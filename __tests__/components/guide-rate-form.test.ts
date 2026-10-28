// The redesigned guide rate form (components/rates/GuideRateForm.tsx): the
// validity hint counts whole months, every new label exists in both
// languages, and the save is a real form submit.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { monthsBetween } from '@/components/rates/GuideRateForm'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('monthsBetween', () => {
  it('whole months, a day short counts one less, blanks give null', () => {
    expect(monthsBetween('2026-10-28', '2027-10-28')).toBe(12)
    expect(monthsBetween('2026-10-28', '2027-10-27')).toBe(11)
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(0)
    expect(monthsBetween('', '2027-10-28')).toBeNull()
    expect(monthsBetween('2027-01-01', '2026-01-01')).toBe(-12)
  })
})

describe('the form', () => {
  const form = src('components/rates/GuideRateForm.tsx')
  it('every form label it reads exists in English and Japanese', () => {
    const keys = [...form.matchAll(/\bf\('([A-Za-z]+)'/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(20)
    for (const lang of ['en', 'ja']) {
      const m = JSON.parse(src(`messages/${lang}.json`)).rates.guides.form
      for (const k of keys) expect(m[k], `${lang}: rates.guides.form.${k}`).toBeTruthy()
    }
  })
  it('Save submits the form, so the browser checks required fields', () => {
    expect(src('components/rates/RateFormKit.tsx')).toContain('type="submit" form={formId}')
    expect(form).toContain('onSubmit={onSubmit}')
  })
  it('the rate opens blank rather than 0, and refuses 0', () => {
    expect(src('components/rates/RateFormKit.tsx')).toContain("(!allowZero && n === 0) ? '' : value")
    expect(src('components/rates/RateFormKit.tsx')).toContain("'0.01'")
  })
})
