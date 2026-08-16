// ============================================
// PROGRAMME CODES — decode anything, emit one canon
// ============================================
// A.T.S codes carry real meaning: where the tour departs from, which carrier,
// which cabin, how long it runs, which programme in that length, and whether it
// includes a Nile cruise. The scheme is sound; it has just been applied
// inconsistently for years.
//
// The operator's decision is a LINE IN THE MIDDLE: historic documents are not
// being re-cut, so old codes keep their spelling forever, and the canon governs
// what gets created from here. That rules out a rename, and it rules out
// treating the string as the data.
//
// So the string stops being the source of truth. Every code — old spelling or
// new — is decoded into fields, and the fields are what the system reasons
// about. An old code and its canonical form describe the same programme; only
// the label differs. Nothing has to be rewritten for the inconsistency to stop
// costing anything.
//
// THE CANON:  [airport][carrier][class?][days][seq]-[type]
//
//   airport  N  Narita (Tokyo) · K  Kansai (Osaka)   — always first
//   carrier  EK Emirates       · MS EgyptAir         — always second
//   class    BZ business       · omitted = economy
//   days     the programme's real length
//   seq      two digits, unique within one (airport, carrier, class, days)
//   type     CR Nile cruise    · LND land
//
// Known deviations in the existing catalogue, all tolerated on read:
//   * carrier-first ordering (MSN… instead of NMS…)
//   * a hyphen after the prefix (MSN-601)
//   * no airport letter at all (MSBZ805-CR)
//   * no type suffix, on both cruise and land programmes
//   * composite suffixes that encode places (ABCR, ALXCR, EGJR, DSCR, ACRS)
//
// Those composites are NOT decomposed here. Guessing whether the S in ACRS is
// a sea or a city would be string archaeology, and the places a programme
// visits are already recorded properly in cities_covered. The canonical type is
// therefore derived from the itinerary itself — whether it has cruise nights —
// which is evidence rather than inference.

export const AIRPORTS = { N: 'Narita', K: 'Kansai' }
export const CARRIERS = { EK: 'Emirates', MS: 'EgyptAir' }
export const SERVICE_CLASSES = { BZ: 'business' }
export const PROGRAM_TYPES = { CR: 'Nile cruise', LND: 'Land' }

/** Full-width and typographic dashes all mean the ASCII hyphen here. */
function normalizeDashes(text) {
  return String(text).replace(/[－ー–—]/g, '-')
}

/**
 * Decode a programme code, however it happens to be spelled.
 *
 * Returns the fields plus `deviations` — the ways this spelling differs from
 * the canon. A deviation is NOT an error: old codes are expected to have them
 * and keep them. It becomes an error only for a code being created now.
 */
export function parseProgramCode(raw) {
  const code = normalizeDashes(String(raw ?? '').trim().toUpperCase())
  const deviations = []

  if (!code) return { valid: false, deviations: [{ kind: 'empty', message: 'No code' }] }

  // The numeric core is days+seq; everything before it is the prefix and
  // everything after is the type suffix. The separator before the digits is
  // captured rather than skipped — some codes put a hyphen there and some do
  // not, and that difference is one of the things being reported.
  const match = code.match(/^([A-Z]+)(-?)(\d{3,4})(?:-?([A-Z]+))?$/)
  if (!match) {
    return {
      valid: false,
      code,
      deviations: [{ kind: 'unparseable', message: `Cannot read "${raw}" as a programme code` }],
    }
  }

  const [, rawPrefix, separator, digits, rawSuffix] = match

  if (separator === '-') {
    deviations.push({
      kind: 'prefix_hyphen',
      message: 'Hyphen between the prefix and the number',
    })
  }

  // --- prefix: airport, carrier, cabin ---
  let prefix = rawPrefix
  let serviceClass = 'economy'
  if (prefix.includes('BZ')) {
    serviceClass = 'business'
    prefix = prefix.replace('BZ', '')
  }

  let airport = null
  let carrier = null
  let order = null

  let m = prefix.match(/^([NK])(EK|MS)$/)
  if (m) {
    airport = m[1]
    carrier = m[2]
    order = 'airport-first'
  } else if ((m = prefix.match(/^(EK|MS)([NK])$/))) {
    carrier = m[1]
    airport = m[2]
    order = 'carrier-first'
    deviations.push({
      kind: 'order',
      message: `Carrier before airport (${prefix}) — the canon is airport first`,
    })
  } else if ((m = prefix.match(/^(EK|MS)$/))) {
    carrier = m[1]
    order = 'carrier-only'
    deviations.push({
      kind: 'missing_airport',
      message: `No departure airport in "${prefix}" — cannot tell Narita from Kansai`,
    })
  } else {
    deviations.push({ kind: 'unknown_prefix', message: `Unrecognised prefix "${prefix}"` })
  }

  // --- days and sequence ---
  // Four digits is a two-digit day count (1005 = 10 days, #05); three is a
  // single-digit one (805 = 8 days, #05).
  const days = Number(digits.length === 4 ? digits.slice(0, 2) : digits.slice(0, 1))
  const sequence = digits.slice(-2)

  // --- type ---
  const suffix = rawSuffix ?? null
  let type = null
  if (suffix === 'CR') type = 'CR'
  else if (suffix === 'LND') type = 'LND'
  else if (suffix === null) {
    deviations.push({ kind: 'missing_type', message: 'No CR/LND type suffix' })
  } else {
    // ABCR, ALXCR, EGJR, DSCR, ACRS… — the places are recorded in
    // cities_covered; only the base type matters, and the itinerary decides it.
    deviations.push({
      kind: 'legacy_suffix',
      message: `Composite suffix "${suffix}" — places belong in the itinerary, not the code`,
    })
  }

  return {
    valid: true,
    code,
    airport,
    airport_name: airport ? AIRPORTS[airport] : null,
    carrier,
    carrier_name: carrier ? CARRIERS[carrier] : null,
    service_class: serviceClass,
    days,
    sequence,
    suffix,
    type,
    order,
    deviations,
  }
}

/** The canonical spelling for a set of fields. Economy is the default cabin,
 *  so it is the one that needs no marker and no argument. */
export function formatProgramCode({
  airport,
  carrier,
  service_class = 'economy',
  days,
  sequence,
  type = 'LND',
}) {
  const cabin = service_class === 'business' ? 'BZ' : ''
  const seq = String(sequence ?? '').padStart(2, '0')
  return `${airport ?? '?'}${carrier ?? '??'}${cabin}${days}${seq}-${type ?? 'LND'}`
}

/**
 * What this programme's code WOULD be under the canon, using the itinerary as
 * evidence for the two things the code most often gets wrong: how long the
 * programme runs, and whether it includes a cruise.
 */
export function canonicalFieldsFor(parsed, program) {
  const hasCruise = program.days.some(d => d.is_cruise_day)
  return {
    airport: parsed.airport ?? deriveAirport(program),
    carrier: parsed.carrier,
    service_class: parsed.service_class,
    days: program.duration_days,
    sequence: parsed.sequence,
    type: hasCruise ? 'CR' : 'LND',
  }
}

export function canonicalFor(parsed, program) {
  return formatProgramCode(canonicalFieldsFor(parsed, program))
}

/** The folder a document came from names its departure airport. */
function deriveAirport(program) {
  if (/NRT/i.test(program.folder ?? '')) return 'N'
  if (/KIX/i.test(program.folder ?? '')) return 'K'
  return null
}

/**
 * Check a decoded code against the programme it labels.
 *
 * These ARE errors rather than deviations: a code that misstates the length or
 * the type is not an old spelling of the right fact, it is the wrong fact, and
 * it will mislead whoever reads it.
 */
export function auditProgramCode(parsed, program) {
  const problems = []
  if (!parsed.valid) return problems

  if (parsed.days !== program.duration_days) {
    problems.push({
      severity: 'error',
      message: `Code says ${parsed.days} days but the itinerary is ${program.duration_days}`,
    })
  }

  const hasCruise = program.days.some(d => d.is_cruise_day)
  if (parsed.type === 'CR' && !hasCruise) {
    problems.push({ severity: 'error', message: 'Code says cruise but no cruise night is scheduled' })
  }
  if (parsed.type === 'LND' && hasCruise) {
    problems.push({ severity: 'error', message: 'Code says land but the itinerary has cruise nights' })
  }
  if (parsed.suffix && parsed.suffix.includes('CR') && !hasCruise) {
    problems.push({
      severity: 'error',
      message: `Suffix "${parsed.suffix}" implies a cruise but none is scheduled`,
    })
  }

  return problems
}

/**
 * Sequence numbers must be unique within one (airport, carrier, class, days)
 * bucket. The suffix is NOT part of the identity — the operator has confirmed
 * that two programmes sharing a number is an accident, not a variant scheme.
 *
 * Run this over CANONICAL fields, not the spellings as written. Two codes can
 * look distinct and still resolve to the same programme identity — MSN1005-CR
 * is an 8-day programme, so it lands on 8-day #05, where MSN805-CR already is.
 */
export function findSequenceCollisions(entries) {
  const buckets = new Map()
  for (const { code, fields } of entries) {
    if (!fields) continue
    const key = [fields.airport, fields.carrier, fields.service_class, fields.days].join('/')
    const list = buckets.get(key) ?? []
    list.push({ code, sequence: fields.sequence })
    buckets.set(key, list)
  }

  const collisions = []
  for (const [key, list] of buckets) {
    const bySequence = new Map()
    for (const item of list) {
      const same = bySequence.get(item.sequence) ?? []
      same.push(item.code)
      bySequence.set(item.sequence, same)
    }
    for (const [sequence, codes] of bySequence) {
      if (codes.length > 1) collisions.push({ bucket: key, sequence, codes })
    }
  }
  return collisions
}

/** Sequence numbers already taken in a bucket, so a free one can be suggested. */
export function nextFreeSequence(entries, { airport, carrier, service_class, days }) {
  const taken = new Set(
    entries
      .filter(
        e =>
          e.fields &&
          e.fields.airport === airport &&
          e.fields.carrier === carrier &&
          e.fields.service_class === service_class &&
          e.fields.days === days
      )
      .map(e => e.fields.sequence)
  )
  for (let i = 1; i < 100; i++) {
    const candidate = String(i).padStart(2, '0')
    if (!taken.has(candidate)) return candidate
  }
  return null
}
