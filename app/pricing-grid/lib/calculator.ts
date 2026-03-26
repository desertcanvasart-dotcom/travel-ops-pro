// ============================================
// PRICING GRID — Pure Calculation Engine
// No conditionals about day type. Just math.
// ============================================

import type { GridDay, GridConfig, SlotValue, DayCalc, GridTotals, SLOT_DEFINITIONS } from '../types'

// --- Helpers ---

function getRate(item: { rateEur: number; rateNonEur: number }, passport: 'eu' | 'non_eu'): number {
  return passport === 'eu' ? item.rateEur : item.rateNonEur
}

function slotTotal(slot: SlotValue, passport: 'eu' | 'non_eu'): number {
  if (slot.customAmount > 0) return slot.customAmount
  return slot.selectedItems.reduce((sum, item) => sum + getRate(item, passport), 0)
}

// --- Per-Day Calculation ---

const GROUP_SLOT_IDS = new Set([
  'route', 'guide', 'airport_services', 'hotel_services',
  'tipping', 'boat_rides', 'other_group'
])

const PP_SLOT_IDS = new Set([
  'accommodation', 'entrance_fees', 'flights', 'experiences',
  'meals', 'water', 'cruise', 'other_pp'
])

export function calculateDay(day: GridDay, config: GridConfig): DayCalc {
  const { pax, passport } = config
  let groupTotal = 0
  let perPersonTotal = 0

  for (const slot of day.slots) {
    const cost = slotTotal(slot, passport)

    if (GROUP_SLOT_IDS.has(slot.slotId)) {
      // Group: guide slot respects the withGuide toggle
      if (slot.slotId === 'guide' && !config.withGuide) continue
      // Tipping: skip guide_tip if no guide
      if (slot.slotId === 'tipping' && !config.withGuide) {
        // Only include non-guide tips (driver_tip, etc.)
        const nonGuideTips = slot.selectedItems
          .filter(item => !item.rateId.includes('guide'))
          .reduce((sum, item) => sum + getRate(item, passport), 0)
        groupTotal += nonGuideTips
        continue
      }
      groupTotal += cost

    } else if (PP_SLOT_IDS.has(slot.slotId)) {
      if (slot.slotId === 'accommodation') {
        // Accommodation: pp_double_eur is already a per-person rate
        // For single pax, add single supplement on top
        if (slot.selectedItems.length > 0) {
          const ppDouble = getRate(slot.selectedItems[0], passport)
          const singleSupp = pax === 1 && slot.selectedItems.length > 1
            ? getRate(slot.selectedItems[1], passport)
            : 0
          perPersonTotal += ppDouble + (pax === 1 ? singleSupp : 0)
        }
      } else {
        perPersonTotal += cost
      }
    }
  }

  const groupPerPerson = pax > 0 ? groupTotal / pax : 0
  const dailyPerPerson = groupPerPerson + perPersonTotal
  const dailyTotal = dailyPerPerson * pax

  return {
    groupTotal: round2(groupTotal),
    perPersonTotal: round2(perPersonTotal),
    groupPerPerson: round2(groupPerPerson),
    dailyPerPerson: round2(dailyPerPerson),
    dailyTotal: round2(dailyTotal),
  }
}

// --- Grand Totals ---

export function calculateGrandTotals(days: GridDay[], config: GridConfig): GridTotals {
  const { pax, marginPercent } = config

  let costPerPerson = 0
  for (const day of days) {
    const calc = calculateDay(day, config)
    costPerPerson += calc.dailyPerPerson
  }

  const totalCost = costPerPerson * pax
  const marginMultiplier = 1 + marginPercent / 100
  const sellingPricePerPerson = round2(costPerPerson * marginMultiplier)
  const sellingPriceTotal = round2(sellingPricePerPerson * pax)
  const marginAmount = round2(sellingPriceTotal - totalCost)

  return {
    costPerPerson: round2(costPerPerson),
    totalCost: round2(totalCost),
    marginAmount,
    sellingPricePerPerson,
    sellingPriceTotal,
  }
}

// --- Currency Conversion ---

export function convertAmount(eurAmount: number, exchangeRate: number | null): number {
  if (!exchangeRate) return eurAmount
  return round2(eurAmount * exchangeRate)
}

// --- Utility ---

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// --- Create empty slot values for a new day ---

export function createEmptySlots(): SlotValue[] {
  const { SLOT_DEFINITIONS } = require('../types')
  return SLOT_DEFINITIONS.map((def: typeof SLOT_DEFINITIONS[number]) => ({
    slotId: def.slotId,
    selectedItems: [],
    customAmount: 0,
  }))
}
