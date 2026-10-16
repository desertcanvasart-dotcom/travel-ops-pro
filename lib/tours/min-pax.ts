// ============================================
// A variation's minimum group size
// ============================================
// tour_variations.min_pax was shown on the tour page (Group Size) and ignored
// everywhere else: the traveller picker started at 1 and the engine priced a
// 4-pax-minimum programme for 1 without a word. The page now starts its picker
// at the minimum and /api/b2b/calculate-price refuses fewer.

/** The smallest traveller count a variation is offered for (1 when unset). */
export function minPaxOf(minPax: unknown): number {
  const n = Number(minPax)
  return Number.isInteger(n) && n > 1 ? n : 1
}

/** The traveller counts the tour page offers: min_pax … max_pax. */
export function paxChoices(minPax: unknown, maxPax: unknown): number[] {
  const min = minPaxOf(minPax)
  const maxN = Number(maxPax)
  const max = Number.isInteger(maxN) && maxN >= min ? maxN : min
  return Array.from({ length: max - min + 1 }, (_, i) => min + i)
}

/** Why `pax` travellers cannot be priced on this variation, or null when they can. */
export function belowMinPaxMessage(minPax: unknown, pax: number): string | null {
  const min = minPaxOf(minPax)
  return pax < min
    ? `This tour is offered from ${min} travellers — ${pax} is below its minimum group size.`
    : null
}
