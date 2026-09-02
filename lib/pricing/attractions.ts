// ============================================
// Which entrance tickets a programme day needs
// ============================================
// A programme day names its sights two ways:
//
//   attraction_ids  — entrance_fees ids picked from the fee table. Exact.
//   attractions     — free text for the documents. On the A.T.S programmes
//                     this is a Japanese sentence ("スフィンクスと河岸神殿見学"),
//                     and the engine used to match it by English substring
//                     against entrance_fees.attraction_name — so not one of
//                     the 29 programmes ever priced a single ticket, and the
//                     quote read "No entrance fee found" 15 times instead.
//
// Ids win. Free text goes through attraction_aliases (alias → canonical
// name, exact and case-insensitive) and only then through the old
// substring matcher, so wording the office has taught the table once prices
// forever. A ticket is charged once per trip however many days mention it:
// dedupe is by fee id, not by the wording.

export interface FeeRow {
  id: string
  attraction_name: string
  eur_rate: number | null
  non_eur_rate: number | null
}

export interface DayAttractions {
  day: number
  attractions?: string[] | null
  attraction_ids?: string[] | null
}

export interface ResolvedTicket {
  id: string
  name: string
  rate: number
  /** First day the ticket is needed. */
  day: number
  /** The wording it was resolved from, when it came from free text. */
  from?: string
}

export interface AttractionResolution {
  tickets: ResolvedTicket[]
  /** Free-text wording nothing could price. */
  unresolved: { day: number; text: string }[]
  /** Ids that are not in the fee table any more (deleted or inactive). */
  missingIds: { day: number; id: string }[]
}

/** alias (lowercased) → canonical fee name, or several joined with " + ". */
export type AliasMap = Map<string, string>
export const CANONICAL_JOINER = ' + '

export function buildAliasMap(rows: { alias: string; canonical_name: string }[] | null | undefined): AliasMap {
  const m: AliasMap = new Map()
  for (const r of rows ?? []) {
    const a = (r.alias ?? '').trim().toLowerCase()
    if (a && r.canonical_name) m.set(a, r.canonical_name.trim())
  }
  return m
}

export function rateFor(row: FeeRow, isEurPassport: boolean): number {
  const eur = Number(row.eur_rate) || 0
  const non = Number(row.non_eur_rate) || 0
  return isEurPassport ? eur : (non || eur)
}

/**
 * The legacy substring matcher, unchanged in logic (golden-mastered): a fee
 * whose name CONTAINS the wording, else the longest name with >50% overlap
 * in either direction.
 */
export function matchByName(fees: FeeRow[], wording: string): FeeRow | null {
  const searchName = wording.toLowerCase().trim()
  if (!searchName) return null
  const direct = fees.find(ef => (ef.attraction_name || '').toLowerCase().includes(searchName))
  if (direct) return direct
  const sorted = [...fees].sort((a, b) => (b.attraction_name?.length || 0) - (a.attraction_name?.length || 0))
  return sorted.find(ef => {
    const dbName = (ef.attraction_name || '').toLowerCase()
    const overlapRatio = Math.min(dbName.length, searchName.length) / Math.max(dbName.length, searchName.length)
    return overlapRatio > 0.5 && (dbName.includes(searchName) || searchName.includes(dbName))
  }) || null
}

/** "Valley of the Kings", "Valley Of Kings" and "valley-of-kings" are one
 *  name: lowercase, drop articles and everything that is not a letter or
 *  digit. Trailing spaces in the fee table ("Khufu ") stop mattering too. */
export function nameKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\b(the|of|and|a|an)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** A whole-name match — what a canonical alias name should hit before the
 *  looser substring search is tried. */
function matchExact(fees: FeeRow[], name: string): FeeRow | null {
  const n = nameKey(name)
  if (!n) return null
  return fees.find(ef => nameKey(ef.attraction_name) === n) ?? null
}

export function resolveAttractions(
  days: DayAttractions[],
  fees: FeeRow[],
  aliases: AliasMap,
  isEurPassport: boolean
): AttractionResolution {
  const byId = new Map(fees.map(f => [f.id, f]))
  const seen = new Set<string>()
  const out: AttractionResolution = { tickets: [], unresolved: [], missingIds: [] }

  const take = (row: FeeRow, day: number, from?: string) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    out.tickets.push({ id: row.id, name: row.attraction_name, rate: rateFor(row, isEurPassport), day, from })
  }

  const curated = new Set<number>()
  for (const d of days) {
    for (const id of d.attraction_ids ?? []) {
      const row = byId.get(id)
      if (row) { take(row, d.day); curated.add(d.day) }
      else out.missingIds.push({ day: d.day, id })
    }
  }

  // Free text: a day whose ids priced something has been curated — its
  // wording is for the documents and is not guessed at. Any other day is
  // priced from its wording as before (including one whose only id is gone).
  const seenText = new Set<string>()
  for (const d of days) {
    if (curated.has(d.day)) continue
    for (const raw of d.attractions ?? []) {
      const text = String(raw ?? '').trim()
      if (!text) continue
      const key = text.toLowerCase()
      if (seenText.has(key)) continue
      seenText.add(key)

      // One sentence can name several tickets ("王家の谷、ツタンカーメン王墓入場"
      // is the Valley AND Tutankhamun's tomb): the alias table joins the fee
      // names with " + " and every one of them is charged.
      const canonical = aliases.get(key)
      const names = canonical ? canonical.split(CANONICAL_JOINER).map(n => n.trim()).filter(Boolean) : []
      let hit = false
      for (const name of names) {
        const row = matchExact(fees, name) ?? matchByName(fees, name)
        if (row) { hit = true; take(row, d.day, text) }
        else out.unresolved.push({ day: d.day, text: `${text} → ${name}` })
      }
      if (hit || names.length > 0) continue

      const row = matchExact(fees, text) ?? matchByName(fees, text)
      if (row) take(row, d.day, text)
      else out.unresolved.push({ day: d.day, text })
    }
  }
  return out
}
