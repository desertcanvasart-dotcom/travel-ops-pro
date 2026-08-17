// ============================================
// A.T.S PROGRAMME DOCUMENTS → tour_templates
// ============================================
// Their catalogue lives as Japanese Word itineraries, one per coded programme.
// The layout is consistent enough to parse and inconsistent enough that a
// parser which guesses would quietly corrupt the catalogue, so the rule here is
// the same one the document templates use: NEVER invent. Anything not
// recognised is reported as a problem against the file it came from, and the
// day it belongs to still imports with the rest intact.
//
// The source is genuinely messy, and the mess is worth knowing about:
//
//   * "included" is written as ○ (U+25CB) in some files and 〇 (U+3007) in
//     others — two different characters that look identical
//   * "not included" appears as ×, X, x and ✕
//   * an overnight in the air is 機中泊 in most files and 機内泊 in others
//   * Abu Simbel appears as アブ・シンベル, アブシンベル, and once split across
//     a line break inside the cell
//   * the "with Menu" variants put the DISH NAME where the meal mark goes, so
//     the dinner slot may read モロヘイヤ＆チキン rather than ○
//
// Pure: HTML in, programme out. No filesystem, no database.

/** Overnight locations, as they are written, to a place and a bed. */
const OVERNIGHT = {
  カイロ: { city: 'Cairo', kind: 'hotel' },
  ギザ: { city: 'Giza', kind: 'hotel' },
  アスワン: { city: 'Aswan', kind: 'hotel' },
  ルクソール: { city: 'Luxor', kind: 'hotel' },
  'アブ・シンベル': { city: 'Abu Simbel', kind: 'hotel' },
  アブシンベル: { city: 'Abu Simbel', kind: 'hotel' },
  ハルガダ: { city: 'Hurghada', kind: 'hotel' },
  バハレヤーオアシス: { city: 'Bahariya Oasis', kind: 'hotel' },
  バハレヤオアシス: { city: 'Bahariya Oasis', kind: 'hotel' },
  アレキサンドリア: { city: 'Alexandria', kind: 'hotel' },
  死海: { city: 'Dead Sea', kind: 'hotel' },
  ペトラ: { city: 'Petra', kind: 'hotel' },
  アンマン: { city: 'Amman', kind: 'hotel' },
  // Nights that are not in a hotel. These are not cities and must never end up
  // in cities_covered — "In flight" is not a place anyone visits.
  船中泊: { city: 'Nile Cruise', kind: 'cruise' },
  クルーズ船: { city: 'Nile Cruise', kind: 'cruise' },
  機中泊: { city: null, kind: 'flight' },
  機内泊: { city: null, kind: 'flight' },
  列車泊: { city: null, kind: 'train' },
  車中泊: { city: null, kind: 'vehicle' },
}

/** Meal marks. Anything unlisted is treated as a named dish — see mealFromToken. */
const MEAL_INCLUDED = new Set(['○', '〇', 'ホテル', 'クルーズ', 'ビュッフェ', '船内', '機内食'])
const MEAL_EXCLUDED = new Set(['×', 'X', 'x', '✕', '✖', '－', '-', 'なし'])
/** Eaten aboard, so not a meal the operator provides or pays for. */
const MEAL_IN_FLIGHT = new Set(['機内', '機'])

const FULLWIDTH_DIGITS = '１２３４５６７８９０'
const ASCII_DIGITS = '1234567890'

function toAsciiDigits(text) {
  return String(text).replace(/[１-９０]/g, c => ASCII_DIGITS[FULLWIDTH_DIGITS.indexOf(c)])
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Collapse the ideographic space and runs of whitespace; the source uses 　 as padding. */
function tidy(text) {
  return decodeEntities(text).replace(/　/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// HTML tables → arrays
// ---------------------------------------------------------------------------

/** One cell as its visible LINES. Paragraph and <br> boundaries are the line
 *  breaks the author typed, and a day's instructions are one per line. */
function cellLines(cellHtml) {
  return cellHtml
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(tidy)
    .filter(Boolean)
}

/** Every table in the document, as rows of cells, each cell a list of lines. */
export function extractTables(html) {
  const tables = []
  for (const [, tableHtml] of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = []
    for (const [, rowHtml] of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = []
      for (const [, cellHtml] of rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(cellLines(cellHtml))
      }
      rows.push(cells)
    }
    tables.push(rows)
  }
  return tables
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

/**
 * One meal slot.
 *
 * A token that is neither an inclusion mark nor an exclusion mark is a DISH —
 * the "with Menu" editions name what is served instead of ticking the box. That
 * still means the meal is included, and the dish is worth keeping: it is the
 * only place the menu for a programme is written down.
 */
export function mealFromToken(token) {
  const value = tidy(token).replace(/^[：:]+/, '')
  if (!value) return { included: false, note: null }
  if (MEAL_EXCLUDED.has(value)) return { included: false, note: null }
  if (MEAL_IN_FLIGHT.has(value)) return { included: false, note: 'in flight' }
  if (MEAL_INCLUDED.has(value)) return { included: true, note: null }
  return { included: true, note: value }
}

// Each slot is matched on its own. A departure day carries only 夜：機内 —
// requiring all three would read the whole line as missing and silently drop
// the one meal it does record. The colon is load-bearing: 朝食後 ("after
// breakfast") is prose, 朝： is a meal mark.
const SLOT_RE = {
  breakfast: /朝\s*[：:]\s*(\S+)/,
  lunch: /昼\s*[：:]\s*(\S+)/,
  dinner: /夜\s*[：:]\s*(\S+)/,
}

/**
 * The meal marks for one day, gathered from whichever line(s) carry them.
 *
 * Returns null only when the day states no meals at all. A slot the day does
 * not mention is not included — an unstated meal is one nobody has arranged.
 */
export function parseMealsLine(lines) {
  const result = {
    lines: [],
    breakfast: { included: false, note: null },
    lunch: { included: false, note: null },
    dinner: { included: false, note: null },
  }
  let found = false

  for (const line of lines) {
    let lineHadSlot = false
    for (const [slot, regex] of Object.entries(SLOT_RE)) {
      const match = line.match(regex)
      if (!match) continue
      result[slot] = mealFromToken(match[1])
      lineHadSlot = true
      found = true
    }
    if (lineHadSlot) result.lines.push(line)
  }

  return found ? result : null
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

const DAY_NUMBER_RE = /^\d{1,2}$/

/** Where the party sleeps, resolved. Unknown values are reported, not guessed. */
export function resolveOvernight(raw) {
  const key = tidy(raw).replace(/\s/g, '')
  if (!key) return { city: null, kind: 'none', raw: '', known: true }
  const hit = OVERNIGHT[key]
  if (hit) return { ...hit, raw: key, known: true }
  return { city: key, kind: 'unknown', raw: key, known: false }
}

function isAttraction(line) {
  return line.startsWith('◎')
}

/** Days from every 4-column table in the document — one programme's days are
 *  occasionally split across two tables where the author broke the page. */
export function parseDays(tables, problems) {
  const days = []

  for (const rows of tables) {
    for (const cells of rows) {
      if (cells.length !== 4) continue
      const dayCell = toAsciiDigits((cells[0][0] ?? '').trim())
      if (!DAY_NUMBER_RE.test(dayCell)) continue

      const number = Number(dayCell)
      const overnight = resolveOvernight(cells[2].join(''))
      if (!overnight.known) {
        problems.push({
          severity: 'warning',
          day: number,
          message: `Unrecognised overnight location "${overnight.raw}" — imported as-is`,
        })
      }

      const lines = cells[3]
      const meals = parseMealsLine(lines)
      if (!meals && lines.length) {
        problems.push({
          severity: 'warning',
          day: number,
          message: 'Day states no meals at all — imported as none included',
        })
      }

      const attractions = lines.filter(isAttraction).map(l => l.replace(/^◎\s*/, ''))
      const mealLines = new Set(meals?.lines ?? [])
      const description = lines
        .filter(l => !mealLines.has(l) && !isAttraction(l))
        .join('\n')

      const included = []
      if (meals?.breakfast.included) included.push('breakfast')
      if (meals?.lunch.included) included.push('lunch')
      if (meals?.dinner.included) included.push('dinner')

      const menu = {}
      if (meals?.breakfast.note && meals.breakfast.note !== 'in flight') menu.breakfast = meals.breakfast.note
      if (meals?.lunch.note && meals.lunch.note !== 'in flight') menu.lunch = meals.lunch.note
      if (meals?.dinner.note && meals.dinner.note !== 'in flight') menu.dinner = meals.dinner.note

      days.push({
        day: number,
        // The source has no per-day titles. Rather than invent marketing copy,
        // the title is the factual destination; a real title is the operator's
        // to write and is flagged in the report.
        title: overnight.city ?? labelForKind(overnight.kind),
        city: overnight.city,
        overnight_city: overnight.city,
        overnight_kind: overnight.kind,
        meals: included,
        menu: Object.keys(menu).length ? menu : null,
        attractions,
        description,
        is_cruise_day: overnight.kind === 'cruise',
        accommodation_type: overnight.kind === 'cruise' ? 'cruise' : 'hotel',
        services: {
          guide_required: true,
          hotel_checkin: false,
          hotel_checkout: false,
          airport_arrival: false,
          airport_departure: false,
        },
      })
    }
  }

  days.sort((a, b) => a.day - b.day)
  return days
}

function labelForKind(kind) {
  switch (kind) {
    case 'flight':
      return 'Overnight flight'
    case 'train':
      return 'Overnight train'
    case 'vehicle':
      return 'Overnight drive'
    case 'cruise':
      return 'Nile Cruise'
    default:
      return 'Departure'
  }
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export function parseHotels(tables) {
  for (const rows of tables) {
    if (!rows.length) continue
    const header = (rows[0][0] ?? []).join('')
    const isHeaded = header.includes('ホテル')
    // One file drops the header row and keeps three columns; a row whose second
    // cell looks like a phone number is a hotel row either way.
    const body = isHeaded ? rows.slice(1) : rows
    const looksLikeHotels =
      isHeaded ||
      (rows[0].length === 3 && /[0-9+][0-9\s-]{6,}/.test((rows[0][1] ?? []).join('')))
    if (!looksLikeHotels) continue

    const hotels = []
    for (const cells of body) {
      const name = (cells[0] ?? []).join(' ').trim()
      if (!name) continue
      hotels.push(
        cells.length >= 5
          ? {
              hotel: name,
              check_in: (cells[1] ?? []).join(' ') || null,
              check_out: (cells[2] ?? []).join(' ') || null,
              phone: (cells[3] ?? []).join(' ') || null,
              address: (cells[4] ?? []).join(' ') || null,
            }
          : {
              hotel: name,
              check_in: null,
              check_out: null,
              phone: (cells[1] ?? []).join(' ') || null,
              address: (cells[2] ?? []).join(' ') || null,
            }
      )
    }
    if (hotels.length) return hotels
  }
  return []
}

// ---------------------------------------------------------------------------
// Programme
// ---------------------------------------------------------------------------

/** The code as the operator writes it, taken from the filename — the most
 *  reliable source, since a document's own code is sometimes a stale copy. */
export function codeFromFilename(filename) {
  const base = filename.replace(/\.docx$/i, '')
  // The suffix separator is sometimes a FULL-WIDTH dash (－ U+FF0D) — one file
  // uses it, and an ASCII-only pattern silently drops the suffix, turning
  // MSN1002-ABCR into a different programme.
  const match = base.match(/((?:NEK|MSN|MSBZ|MS|EK)\s*[-－ー–]?\s*\d{3,4}(?:\s*[-－ー–]\s*[A-Z]+)?)/i)
  if (!match) return null
  return match[1].replace(/\s/g, '').replace(/[－ー–]/g, '-').toUpperCase()
}

/** Any programme code written INSIDE the document, for cross-checking. */
function codeInDocument(tables) {
  for (const rows of tables) {
    for (const cells of rows) {
      for (const cell of cells) {
        for (const line of cell) {
          const match = line.match(/^((?:NEK|MSN|MSBZ)\s*[-－ー–]?\s*\d{3,4}(?:\s*[-－ー–]\s*[A-Z]+)?)$/i)
          if (match) return match[1].replace(/\s/g, '').replace(/[－ー–]/g, '-').toUpperCase()
        }
      }
    }
  }
  return null
}

/**
 * Parse one programme document.
 *
 * `html` is mammoth's conversion of the .docx. `filename` and `folder` carry
 * the two facts the document itself does not state reliably: the programme code
 * and which airline's schedule it is built around.
 */
export function parseProgram({ html, filename, folder }) {
  const problems = []
  const tables = extractTables(html)

  const code = codeFromFilename(filename)
  if (!code) {
    problems.push({ severity: 'error', message: `No programme code in the filename "${filename}"` })
  }

  // A code written inside the document that differs from the filename is
  // REPORTED here but not judged. Whether it is a real conflict depends on what
  // it disagrees about, and that needs the decoded fields — see the importer.
  // Most of these turn out to be a filename that dropped the type suffix, which
  // is not a conflict at all once the type is derived from the itinerary.
  const documentCode = codeInDocument(tables)
  if (code && documentCode && documentCode !== code) {
    problems.push({
      kind: 'document_code_mismatch',
      severity: 'error',
      documentCode,
      message: `The document says ${documentCode} but the file is ${code}`,
    })
  }

  const days = parseDays(tables, problems)
  if (!days.length) {
    problems.push({ severity: 'error', message: 'No day rows found' })
  }

  // Gaps and repeats mean a day is missing or duplicated in the source.
  const numbers = days.map(d => d.day)
  for (let i = 1; i <= (numbers[numbers.length - 1] ?? 0); i++) {
    const count = numbers.filter(n => n === i).length
    if (count === 0) problems.push({ severity: 'error', day: i, message: `Day ${i} is missing` })
    if (count > 1) problems.push({ severity: 'error', day: i, message: `Day ${i} appears ${count} times` })
  }

  const hotels = parseHotels(tables)
  if (!hotels.length) {
    problems.push({ severity: 'warning', message: 'No hotel table found' })
  }

  const cities = []
  for (const day of days) {
    if (day.city && !cities.includes(day.city)) cities.push(day.city)
  }

  const durationDays = numbers.length ? Math.max(...numbers) : 0
  const hasMenu = days.some(d => d.menu)

  return {
    code,
    filename,
    airline: /MS/i.test(folder) ? 'MS' : /EK/i.test(folder) ? 'EK' : null,
    departure_airport: /NRT/i.test(folder) ? 'NRT' : null,
    duration_days: durationDays,
    // Nights on the ground: the last day is a departure, not an overnight.
    duration_nights: Math.max(0, durationDays - 1),
    cities_covered: cities,
    has_menu: hasMenu,
    days,
    hotels,
    problems,
  }
}
