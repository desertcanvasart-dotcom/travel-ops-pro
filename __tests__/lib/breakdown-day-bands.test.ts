import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { groupLinesByDay } from '@/lib/pricing/group-by-day'

// Operator, 2026-09-17: the price breakdown had "nothing like a line between
// each day". Every price view groups its lines by day and opens each day with
// a band (components/pricing/DayBand).

describe('groupLinesByDay', () => {
  const line = (id: string, day: number | null, category = 'guide') => ({ id, day, category })
  const toLine = (l: ReturnType<typeof line>) => ({ id: l.id, category: l.category, dayNumber: l.day })

  it('groups in day order, keeps each day\'s flow order, and puts dayless lines under -1', () => {
    const groups = groupLinesByDay([
      line('day2-hotel', 2, 'accommodation'),
      line('day1-guide', 1),
      line('rooming', null, 'accommodation'),
      line('day2-guide', 2),
    ], toLine)
    expect(groups.map(g => g.day)).toEqual([1, 2, -1])
    // Sightseeing before the bed, as the day runs.
    expect(groups[1].lines.map(l => l.id)).toEqual(['day2-guide', 'day2-hotel'])
  })

  it('treats day 0 like no day', () => {
    expect(groupLinesByDay([line('x', 0)], toLine)[0].day).toBe(-1)
  })
})

describe('every price view draws day bands', () => {
  it('calculator, saved quote and tour detail use the shared band', () => {
    expect(readFileSync('app/b2b/calculator/[id]/page.tsx', 'utf8')).toContain('<DayBandRow')
    expect(readFileSync('app/b2b/quotes/[id]/page.tsx', 'utf8')).toContain('<DayBandRow')
    expect(readFileSync('app/tours/[code]/page.tsx', 'utf8')).toContain('<DayBandBlock')
  })

  it('the tour detail page no longer carries a Request This Tour button that did nothing', () => {
    expect(readFileSync('app/tours/[code]/page.tsx', 'utf8')).not.toContain('requestThisTour')
    const en = JSON.parse(readFileSync('messages/en.json', 'utf8'))
    expect(en.tours.detail.requestThisTour).toBeUndefined()
  })
})
