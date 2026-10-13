// The airport picker on Rates → Airport Assistants (app/rates/airport-services).
// Pure, so it can be tested without the page.

import type { Airport } from './airports'

/** The picker's airports: the vocabulary's (by IATA code) plus any code a
 *  stored rate names that the vocabulary does not, so it still shows. */
export function airportChoices(airports: readonly Airport[], storedCodes: readonly string[] = []): { code: string; name: string }[] {
  const out: { code: string; name: string }[] = []
  const seen = new Set<string>()
  for (const a of airports) {
    const code = a.code.trim().toUpperCase()
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push({ code, name: a.label })
  }
  for (const raw of storedCodes) {
    const code = String(raw ?? '').trim().toUpperCase()
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push({ code, name: code })
  }
  return out
}
