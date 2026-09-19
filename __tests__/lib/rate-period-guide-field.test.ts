// Operator, 2026-09-19, looking at a flight rate: "I understand that you
// copied this from the hotel section. However, something needs to be amended.
// Like the guide bed / night, it doesn't suit flight rates at all."
//
// He was right about the words, and the words were hiding something worse: the
// box stored 0 when you cleared it, and on a flight a zero guide fare means the
// airline carries him FREE. Absent means he pays the customer fare. Those are
// different contracts, and an empty box should never have picked one.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const editor = readFileSync(join(process.cwd(), 'components/rates/RateSeasonsEditor.tsx'), 'utf8')
const en = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8'))
const ja = JSON.parse(readFileSync(join(process.cwd(), 'messages/ja.json'), 'utf8'))
const periods = en.rates.ratePeriods

describe('the guide line says what the guide is riding', () => {
  it('a flight calls it a seat, not a bed per night', () => {
    expect(periods.fields.guide_seat).toBe('Guide seat')
    expect(editor).toContain("if (entity === 'flight' && base === 'guide_rate') return t('fields.guide_seat')")
  })

  it('and the label goes through that rule, not straight to the hotel key', () => {
    // The bug: the field was rendered with t('fields.guide_rate') directly, so
    // the flight case above never ran and every flight period said "Guide bed
    // / night".
    expect(editor).toContain("{fieldLabel('guide_rate')}")
    expect(editor).not.toContain("{t('fields.guide_rate')}")
  })

  it('keeps the hotel wording for a hotel', () => {
    expect(periods.fields.guide_rate).toBe('Guide bed / night')
  })
})

describe('blank is not zero', () => {
  it('an empty box removes the number instead of storing a free ride', () => {
    expect(editor).toContain('if (raw === \'\') delete rates.guide_rate')
    expect(editor).toContain('onChange={e => updateGuideRate(index, e.target.value)}')
  })

  it('and shows empty rather than a 0 nobody typed', () => {
    expect(editor).toContain("value={season.rates.guide_rate ?? ''}")
    expect(editor).not.toContain('value={season.rates.guide_rate ?? 0}')
  })

  it('says what each of the two means, per entity', () => {
    // "Blank" and "0" are both valid answers with different prices, so the
    // form has to say which is which rather than leave it to be discovered.
    expect(periods.guideBlankFare).toMatch(/customer fare/)
    expect(periods.guideBlankFare).toMatch(/free/)
    expect(periods.guideBlankBed).toMatch(/unpriced/)
    expect(editor).toContain("t(entity === 'flight' ? 'guideBlankFare' : 'guideBlankBed')")
  })

  it('is translated', () => {
    expect(ja.rates.ratePeriods.guideBlankFare).toBeTruthy()
    expect(ja.rates.ratePeriods.guideBlankBed).toBeTruthy()
    expect(ja.rates.ratePeriods.fields.guide_seat).toBeTruthy()
  })
})
