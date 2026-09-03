// ============================================
// IATA codes of carriers we already know
// ============================================
// Airlines are SUPPLIERS (role: air carrier) — picked on the flight form,
// never listed in code. This is only a code map, so the two-letter code on a
// rate is prefilled when the carrier's name is one we know; any other
// carrier gets its code typed once on the rate. Not a supplier vocabulary.

export const AIRLINE_CODES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'MS', name: 'EgyptAir' },
  { code: 'NP', name: 'Nile Air' },
  { code: 'SM', name: 'Air Cairo' },
  { code: 'FZ', name: 'FlyDubai' },
  { code: 'EK', name: 'Emirates' },
  { code: 'QR', name: 'Qatar Airways' },
  { code: 'TK', name: 'Turkish Airlines' },
  { code: 'LH', name: 'Lufthansa' },
  { code: 'BA', name: 'British Airways' },
  { code: 'AF', name: 'Air France' },
  { code: 'KL', name: 'KLM' },
  { code: 'EY', name: 'Etihad' },
  { code: 'SV', name: 'Saudia' },
  { code: 'RJ', name: 'Royal Jordanian' },
  { code: 'ME', name: 'Middle East Airlines' },
  { code: 'G9', name: 'Air Arabia' },
  { code: 'Other', name: 'Other' }
]

/** The IATA code we know for a carrier's name, else its first two letters. */
export function knownAirlineCode(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return ''
  return AIRLINE_CODES.find(a => a.name.toLowerCase() === n.toLowerCase())?.code
    || n.replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase()
}
