// ============================================
// A new itinerary code
// ============================================
// itinerary_code is UNIQUE across every organisation. The generators drew
// from 1000 (concierge commit, AI generate) or 9000 (create, duplicate,
// quote convert) random numbers a year, so clashes came at modest volume —
// and the concierge commit read a code clash as a thread race and threw
// (AUDIT L8). Eight hex characters give ~4.3 billion codes a year.

import { randomBytes } from 'crypto'

/** Eight random upper-case hex characters. */
export function itineraryCodeSuffix(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

/** `${prefix}-${year}-XXXXXXXX`, e.g. ITN-2026-3FA9C01B or ITN-S-2026-…. */
export function newItineraryCode(prefix = 'ITN', year = new Date().getUTCFullYear()): string {
  return `${prefix}-${year}-${itineraryCodeSuffix()}`
}
