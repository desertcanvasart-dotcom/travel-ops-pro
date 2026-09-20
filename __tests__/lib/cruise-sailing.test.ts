// Two things the operator found in the same breath.
//
// FIRST: the four cruise rows looked identical in every picker. They are not
// duplicates — the same ship sells a 3-night Aswan→Luxor and a 4-night
// Luxor→Aswan at different prices, and the engine selects on embark city AND
// nights. But `route_name` is free text that said "Aswan to Luxor" on all four,
// including the two embarking in Luxor, and no picker showed the nights.
//
// SECOND: "most of my cruises has fixed starting day… if it got chosen for an
// itinerary that doesn't match the day it will alarm the user." A ship leaving
// Aswan on Mondays and Fridays cannot serve a Wednesday itinerary — the price
// is right, the arithmetic is right, and the booking is impossible.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  sanitizeSailingDays, sailsOn, sailingDaysLabel, dayOfDate,
  cruiseRouteLabel, nightsLabel, cruiseSailingLabel, SAILING_DAYS,
} from '@/lib/rates/cruise-sailing'

describe('the label comes from the columns that are true', () => {
  it('reads the direction off embark and disembark', () => {
    expect(cruiseRouteLabel({ embark_city: 'Aswan', disembark_city: 'Luxor' })).toBe('Aswan → Luxor')
    expect(cruiseRouteLabel({ embark_city: 'Luxor', disembark_city: 'Aswan' })).toBe('Luxor → Aswan')
  })

  it('ignores a route_name that contradicts them', () => {
    // The agency's real data: every row said "Aswan to Luxor", half embarked
    // in Luxor. Free text cannot be the source of a direction.
    expect(cruiseRouteLabel({
      embark_city: 'Luxor', disembark_city: 'Aswan', route_name: 'Aswan to Luxor',
    })).toBe('Luxor → Aswan')
  })

  it('falls back to route_name only when there is nothing better', () => {
    expect(cruiseRouteLabel({ route_name: 'Nile Classic' })).toBe('Nile Classic')
    expect(cruiseRouteLabel({})).toBe('')
  })

  it('puts the nights on the line, which is what separated the two rows', () => {
    expect(nightsLabel(3)).toBe('3 nights')
    expect(nightsLabel(1)).toBe('1 night')
    expect(nightsLabel(0)).toBe('')
    expect(cruiseSailingLabel({ embark_city: 'Aswan', disembark_city: 'Luxor', duration_nights: 3 }))
      .toBe('Aswan → Luxor · 3 nights')
  })

  it('and the fixed days when there are any', () => {
    expect(cruiseSailingLabel({
      embark_city: 'Aswan', disembark_city: 'Luxor', duration_nights: 3, sailing_days: ['fri', 'mon'],
    })).toBe('Aswan → Luxor · 3 nights · Mondays and Fridays')
  })
})

describe('sailing days', () => {
  it('keeps known keys, in week order, once each', () => {
    expect(sanitizeSailingDays(['fri', 'mon', 'fri', 'nope', 7])).toEqual(['mon', 'fri'])
    expect(sanitizeSailingDays('mon')).toEqual([])
    expect(sanitizeSailingDays(null)).toEqual([])
  })

  it('names the weekday a date falls on', () => {
    expect(dayOfDate('2026-09-21')).toBe('mon')
    expect(dayOfDate('2026-09-23')).toBe('wed')
    expect(dayOfDate('not a date')).toBeNull()
  })

  it('reads as a sentence', () => {
    expect(sailingDaysLabel(['mon'])).toBe('Mondays')
    expect(sailingDaysLabel(['mon', 'fri'])).toBe('Mondays and Fridays')
    expect(sailingDaysLabel(['mon', 'wed', 'fri'])).toBe('Mondays, Wednesdays and Fridays')
    expect(sailingDaysLabel([])).toBe('')
  })
})

describe('sailsOn is silent until the operator says otherwise', () => {
  it('lets a Monday sailing start on a Monday', () => {
    expect(sailsOn(['mon', 'fri'], '2026-09-21')).toBe(true)
  })

  it('catches the Wednesday it cannot start on', () => {
    expect(sailsOn(['mon', 'fri'], '2026-09-23')).toBe(false)
  })

  it('says yes when the ship has NO fixed day', () => {
    // Most rows will never carry one, and a rate that has never said otherwise
    // must not start failing.
    expect(sailsOn([], '2026-09-23')).toBe(true)
    expect(sailsOn(undefined, '2026-09-23')).toBe(true)
  })

  it('says yes when there is no date to check', () => {
    expect(sailsOn(['mon'], null)).toBe(true)
    expect(sailsOn(['mon'], '')).toBe(true)
  })

  it('covers the whole week', () => {
    expect(SAILING_DAYS).toHaveLength(7)
    for (const d of SAILING_DAYS) expect(sailsOn([d], '2026-09-21')).toBe(d === 'mon')
  })
})

describe('the list shows what decides whether a sailing fits', () => {
  const page = readFileSync(join(process.cwd(), 'app/rates/cruises/page.tsx'), 'utf8')
  const en = JSON.parse(readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8'))

  it('gives the column to the departure days, not the cabin', () => {
    // Every row read "Standard" — the cabin is already in the service code's
    // suffix — while the day a sailing leaves decides whether it fits an
    // itinerary at all.
    expect(page).toContain("{t('table.sailingDays')}")
    expect(page).not.toContain("{t('table.cabin')}")
    expect(page).not.toContain('cruiseCabinLabel(cruise.cabin_type')
  })

  it('says so when a ship has no fixed day', () => {
    expect(en.rates.cruises.table.anyDay).toBe('Any day')
    expect(page).toContain("{t('table.anyDay')}")
  })

  it('does not print the days twice', () => {
    // They were a sub-line under Route while the column was being added.
    const routeCell = page.slice(page.indexOf('{cruiseRouteLabel(cruise)}'), page.indexOf('{cruiseRouteLabel(cruise)}') + 200)
    expect(routeCell).not.toContain('sailingDaysLabel')
  })

  it('writes a route_name that cannot contradict the direction', () => {
    // Free text is how all four rows came to say "Aswan to Luxor".
    expect(page).toMatch(/route_name: `\$\{formData\.embark_city\} to \$\{formData\.disembark_city\}`/)
  })
})
