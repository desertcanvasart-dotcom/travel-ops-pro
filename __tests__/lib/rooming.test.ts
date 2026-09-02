import { describe, it, expect } from 'vitest'
import { roomsForPax, nightAccommodationCost, tripAccommodationCost, roomingAdjustment } from '@/lib/pricing/rooming'
import { priceAcrossPax } from '@/lib/pricing/pax-range'

// Operator decision 2026-09-02: a solo traveller pays the single supplement,
// a party with a triple takes the triple reduction (per person in the
// triple), hotels and cruises alike. Before this the engine priced every
// party as pax × per-person-double and only reported the supplement.

const NIGHT = { ppd: 100, singleSupp: 50, tripleRed: 10 }

describe('roomsForPax', () => {
  it('even parties sleep in doubles', () => {
    expect(roomsForPax(2)).toEqual({ singles: 0, doubles: 1, triples: 0 })
    expect(roomsForPax(6)).toEqual({ singles: 0, doubles: 3, triples: 0 })
  })
  it('an odd party of three or more takes exactly one triple', () => {
    expect(roomsForPax(3)).toEqual({ singles: 0, doubles: 0, triples: 1 })
    expect(roomsForPax(5)).toEqual({ singles: 0, doubles: 1, triples: 1 })
    expect(roomsForPax(7)).toEqual({ singles: 0, doubles: 2, triples: 1 })
  })
  it('one traveller takes a single', () => {
    expect(roomsForPax(1)).toEqual({ singles: 1, doubles: 0, triples: 0 })
    expect(roomsForPax(0)).toEqual({ singles: 0, doubles: 0, triples: 0 })
  })
})

describe('nightAccommodationCost', () => {
  it('two pay the double rate each', () => expect(nightAccommodationCost(2, NIGHT)).toBe(200))
  it('one pays the double rate plus the supplement', () => expect(nightAccommodationCost(1, NIGHT)).toBe(150))
  it('three each pay the double rate minus the reduction', () => expect(nightAccommodationCost(3, NIGHT)).toBe(270))
  it('five: one double and one triple', () => expect(nightAccommodationCost(5, NIGHT)).toBe(200 + 270))
  it('a reduction larger than the rate never goes below zero', () => {
    expect(nightAccommodationCost(3, { ppd: 5, singleSupp: 0, tripleRed: 10 })).toBe(0)
  })
})

describe('roomingAdjustment — the line that keeps the quote summing', () => {
  const nights = [NIGHT, { ppd: 120, singleSupp: 60, tripleRed: 0 }]
  it('is zero for an even party', () => expect(roomingAdjustment(2, nights)).toBe(0))
  it('is the summed supplement for one traveller', () => expect(roomingAdjustment(1, nights)).toBe(110))
  it('is minus the reduction for each of three travellers, on nights that have one', () => {
    // night 1: 3 × (100 − 10) = 270 vs flat 300 → −30; night 2: no reduction → 0
    expect(roomingAdjustment(3, nights)).toBe(-30)
  })
  it('matches tripAccommodationCost minus the flat per-person sum', () => {
    for (const pax of [1, 2, 3, 4, 5, 8, 9]) {
      const flat = nights.reduce((s, n) => s + n.ppd * pax, 0)
      expect(roomingAdjustment(pax, nights)).toBe(Math.round((tripAccommodationCost(pax, nights) - flat) * 100) / 100)
    }
  })
})

describe('priceAcrossPax with accommodationAt', () => {
  const nights = [NIGHT, NIGHT]
  const rows = priceAcrossPax({
    groupFixed: 0, perPerson: 10, marginPercent: 0, transportAt: () => 0, tourLeaderCost: 0,
    accommodationAt: pax => tripAccommodationCost(pax, nights), paxFrom: 1, paxTo: 4,
  })
  it('solo pays the supplement; two pay double; three take the reduction', () => {
    expect(rows[0].withoutLeader.totalCost).toBe(2 * 150 + 10)
    expect(rows[1].withoutLeader.totalCost).toBe(2 * 200 + 20)
    expect(rows[2].withoutLeader.totalCost).toBe(2 * 270 + 30)
    expect(rows[3].withoutLeader.totalCost).toBe(2 * 400 + 40)
  })
  it('omitting accommodationAt keeps the historical pax × per-person arithmetic', () => {
    const flat = priceAcrossPax({ groupFixed: 5, perPerson: 10, marginPercent: 20, transportAt: () => 1, tourLeaderCost: 0, paxFrom: 1, paxTo: 3 })
    expect(flat.map(r => r.withoutLeader.totalCost)).toEqual([16, 26, 36])
  })
})
