// ============================================
// A tour's route as one horizontal strip
// ============================================
// The order of the cities the customer visits, how they travel between each
// pair (plane, private car, train, cruise), and the nights in each — read
// left to right above the day-by-day table (operator, 2026-11-02). The drawn
// map (egypt-route-map) answers "where"; this answers "in what order, and by
// what".
//
// Read from what the tour already says, never guessed:
//   - stops: the same reading as the map — places the day text names, in
//     reading order, then where the night is spent
//   - transport: the words on the line where the next stop is named (空路 /
//     国内線 → plane, 列車 / 寝台 → train, 車 / 専用車 → car, クルーズ /
//     乗船 → cruise), else that day's own services on a trip; a cruise day's
//     legs are by ship. Nothing found = a plain arrow.
//   - the home airport at each end (関西 / 成田 / 羽田) when the text names it
//
// Pure: days in, data and HTML out. The HTML is self-contained (inline SVG
// icons, inline styles) so the PDF renderer and the pages draw the same thing.

import { PLACE_JA, TEXT_PLACES, canonical, isPlace } from './egypt-route-map'

export type TransportMode = 'plane' | 'train' | 'car' | 'ship'

export interface StripDay {
  day: number
  description?: string | null
  attractions?: string[] | null
  overnight_city?: string | null
  overnight_kind?: string | null
  is_cruise_day?: boolean
  /** A trip's own transport services that day (from service_type). */
  transport?: TransportMode[]
}

export interface StripStop {
  /** Coordinate key (Cairo, Aswan …), or null for the home airport. */
  city: string | null
  label: string
  /** The day the customer arrives. */
  day: number
  /** Nights spent here on this visit; 0 for a stop passed through. */
  nights: number
  /** 発 / 着 — the home airport at either end. */
  end?: 'from' | 'to'
}

export interface StripLeg {
  mode: TransportMode | null
  /** Carrier code (EK, MS) when the line names a flight. */
  carrier: string | null
  /** 約3時間 as the text says it. */
  duration: string | null
}

export interface RouteStrip {
  stops: StripStop[]
  /** legs[i] joins stops[i] and stops[i + 1]. */
  legs: StripLeg[]
}

const HOME: Array<[RegExp, string]> = [
  [/関西空港|関西国際空港|関空|\bKIX\b/i, '関西'],
  [/成田/, '成田'],
  [/羽田/, '羽田'],
  [/中部国際空港|セントレア/, '中部'],
  [/福岡空港/, '福岡'],
]

// Checked in this order: 列車 contains 車, so the train has to win first.
const MODES: Array<[RegExp, TransportMode]> = [
  [/列車|寝台|鉄道|\btrain\b|sleeper/i, 'train'],
  [/空路|国内線|フライト|[A-Z]{2}\s?\d{2,4}便|\bfl(y|ight)\b/i, 'plane'],
  [/クルーズ|乗船|\bcruise\b|\bembark\b/i, 'ship'],
  [/専用車|車で|車にて|送迎車|バス|陸路|\bdrive\b|\bby (car|road|bus)\b/i, 'car'],
]

function modeOf(text: string): TransportMode | null {
  for (const [re, mode] of MODES) if (re.test(text)) return mode
  return null
}

function carrierOf(text: string): string | null {
  const m = text.match(/\b([A-Z]{2})\s?\d{2,4}(?=便|\b)/)
  return m ? m[1] : null
}

function durationOf(text: string): string | null {
  const m = text.match(/約\s?(\d+(?:[～~〜-]\d+)?)\s?時間/)
  return m ? `約${m[1]}時間` : null
}

function homeOf(text: string): string | null {
  for (const [re, label] of HOME) if (re.test(text)) return label
  return null
}

function isCruise(day: StripDay): boolean {
  return Boolean(day.is_cruise_day || day.overnight_kind === 'cruise' || /cruise/i.test(day.overnight_city ?? ''))
}

/** Where a place is first named in the text, and on which line. */
function findPlaces(text: string): Array<{ city: string; at: number }> {
  return TEXT_PLACES.map(([re, city]) => ({ city, at: text.search(re) }))
    .filter(f => f.at >= 0)
    .sort((a, b) => a.at - b.at)
}

/** The leg into a stop named at `at`: read its own line, then the line above. */
function legFromText(text: string, at: number): StripLeg {
  const lines = text.split('\n')
  let offset = 0
  let index = 0
  for (; index < lines.length; index++) {
    if (at < offset + lines[index].length + 1) break
    offset += lines[index].length + 1
  }
  const own = lines[index] ?? ''
  const above = index > 0 ? lines[index - 1] : ''
  const mode = modeOf(own) ?? (above && !/^[\s]*[◎■]/.test(above) ? modeOf(above) : null)
  const source = modeOf(own) ? own : above
  return {
    mode,
    carrier: mode === 'plane' ? carrierOf(source) : null,
    duration: durationOf(own) ?? (mode && source === above ? durationOf(above) : null),
  }
}

const label = (city: string) => PLACE_JA[city] ?? city

export function routeStripFromDays(input: StripDay[]): RouteStrip | null {
  const days = [...input].sort((a, b) => a.day - b.day)
  const stops: StripStop[] = []
  const legs: StripLeg[] = []

  const firstText = [days[0]?.description ?? ''].join('\n')
  const home = homeOf(firstText)
  if (home) stops.push({ city: null, label: home, day: days[0].day, nights: 0, end: 'from' })

  for (const day of days) {
    const text = [day.description ?? '', ...(day.attractions ?? [])].join('\n')
    const services = day.transport ?? []
    const fallback: TransportMode | null = isCruise(day) ? 'ship' : services.length === 1 ? services[0] : null
    const arrive = (city: string, leg: StripLeg) => {
      const c = canonical(city)
      const last = stops[stops.length - 1]
      if (last && last.city === c) return
      if (stops.length) legs.push({ ...leg, mode: leg.mode ?? fallback })
      stops.push({ city: c, label: label(c), day: day.day, nights: 0 })
    }
    for (const f of findPlaces(text)) arrive(f.city, legFromText(text, f.at))
    if (isPlace(day.overnight_city)) arrive(day.overnight_city, { mode: null, carrier: null, duration: null })

    // The night: counted on the stop the customer sleeps in.
    const last = stops[stops.length - 1]
    if (last && isPlace(day.overnight_city) && last.city === canonical(day.overnight_city)) last.nights++
  }

  const lastDay = days[days.length - 1]
  const lastText = lastDay?.description ?? ''
  const homeBack = homeOf(lastText) ?? (home && days.length > 1 ? homeOf(days.map(d => d.description ?? '').slice(-2).join('\n')) : null)
  if (homeBack && stops.length) {
    const flightLine = lastText.split('\n').find(l => modeOf(l) === 'plane') ?? ''
    legs.push({ mode: 'plane', carrier: carrierOf(flightLine), duration: null })
    stops.push({ city: null, label: homeBack, day: lastDay.day, nights: 0, end: 'to' })
  }
  // The flight out of Japan, when the first stop is the home airport.
  if (stops[0]?.end === 'from' && legs[0]) {
    legs[0] = { ...legs[0], mode: legs[0].mode ?? 'plane' }
    if (!legs[0].carrier) legs[0].carrier = carrierOf(firstText)
  }

  const places = stops.filter(s => s.city)
  return places.length >= 2 ? { stops, legs } : null
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Outline icons drawn here — no icon font or emoji face in the PDF. Paths
 *  from Tabler Icons (MIT): plane, car, train, ship. */
const ICON: Record<TransportMode | 'arrow', string> = {
  plane: '<path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z"/>',
  car: '<circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5"/>',
  train:
    '<path d="M21 13c0 -3.87 -3.37 -7 -10 -7h-8"/><path d="M3 15h16a2 2 0 0 0 2 -2"/><path d="M3 6v5h17.5"/><path d="M3 10l0 4"/><path d="M8 11l0 -5"/><path d="M13 11l0 -4.5"/><path d="M3 19l18 0"/>',
  ship:
    '<path d="M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1"/><path d="M4 18l-1 -5h18l-2 4"/><path d="M5 13v-6h8l4 6"/><path d="M7 7v-4h-1"/>',
  arrow: '<path d="M5 12l14 0"/><path d="M15 16l4 -4"/><path d="M15 8l4 4"/>',
}

const MODE_JA: Record<TransportMode, string> = { plane: '飛行機', car: '専用車', train: '列車', ship: 'クルーズ' }
const MODE_EN: Record<TransportMode, string> = { plane: 'Flight', car: 'Car', train: 'Train', ship: 'Cruise' }

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function icon(mode: TransportMode | 'arrow', size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[mode]}</svg>`
}

/** Sizes for a strip of `stops` stops — smaller as the tour gets longer,
 *  so the strip stays on one line. */
function stripSize(stops: number) {
  if (stops <= 8) return { badge: 24, badgeFont: 10, name: 9, sub: 7, icon: 18, legMax: 56, gap: 2, legNote: true }
  if (stops <= 11) return { badge: 20, badgeFont: 9, name: 8, sub: 6.5, icon: 14, legMax: 44, gap: 1, legNote: true }
  // A long tour: the legs keep only their icon (the key says what each
  // means), so the stops get the width.
  return { badge: 16, badgeFont: 8, name: 6.5, sub: 5.5, icon: 11, legMax: 14, gap: 0, legNote: false }
}

/**
 * The strip as self-contained HTML: numbered stops (the same numbers as the
 * map legend — a city visited twice keeps its number), the transport icon
 * between them, the day and nights under each, and a key to the icons used.
 */
export function renderRouteStrip(strip: RouteStrip, opts: { language?: 'ja' | 'en'; accent?: string } = {}): string {
  const en = opts.language === 'en'
  const accent = opts.accent ?? '#647C47'
  const numbers = new Map<string, number>()
  for (const s of strip.stops) if (s.city && !numbers.has(s.city)) numbers.set(s.city, numbers.size + 1)

  // ONE line, always (operator, 2026-11-05): the strip never wraps. A tour
  // with more stops draws them smaller, and each stop shares the width that
  // is left after the legs, so even a long tour fits across the page.
  const z = stripSize(strip.stops.length)

  const stop = (s: StripStop) => {
    const n = s.city ? numbers.get(s.city) : null
    const name = s.city ? (en ? s.city : s.label) : s.label
    const circle = `width:${z.badge}px;height:${z.badge}px;border-radius:50%;margin:0 auto;text-align:center`
    const badge = s.end
      ? `<div style="${circle};border:1.2px dashed #888;color:#555;font-size:${z.badgeFont - 1}px;line-height:${z.badge - 3}px">${s.end === 'from' ? (en ? 'Dep' : '発') : en ? 'Arr' : '着'}</div>`
      : `<div style="${circle};background:${accent};color:#fff;font-size:${z.badgeFont}px;font-weight:700;line-height:${z.badge}px">${n}</div>`
    const when = en
      ? `Day ${s.day}${s.nights ? ` · ${s.nights} night${s.nights > 1 ? 's' : ''}` : ''}`
      : `${s.day}日目${s.nights ? `・${s.nights}泊` : ''}`
    return `<div style="flex:1 1 0;min-width:0;max-width:84px;text-align:center;word-break:keep-all;overflow-wrap:anywhere">${badge}<div style="font-size:${z.name}pt;font-weight:700;margin-top:3px;line-height:1.25">${esc(name)}</div><div style="font-size:${z.sub}pt;color:#666;line-height:1.3">${esc(when)}</div></div>`
  }
  const leg = (l: StripLeg) => {
    const note = z.legNote ? (l.carrier ?? l.duration ?? '') : ''
    return `<div style="flex:0 1 auto;min-width:${z.icon + (z.legNote ? 4 : 0)}px;max-width:${z.legMax}px;text-align:center;color:#555;padding-top:2px">${icon(l.mode ?? 'arrow', z.icon)}<div style="font-size:${z.sub}pt;line-height:1.2;color:#666">${esc(note)}</div></div>`
  }

  const cells: string[] = []
  strip.stops.forEach((s, i) => {
    cells.push(stop(s))
    if (strip.legs[i]) cells.push(leg(strip.legs[i]))
  })
  const used = [...new Set(strip.legs.map(l => l.mode).filter((m): m is TransportMode => Boolean(m)))]
  const key = used
    .map(m => `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:12px">${icon(m, 12)}${(en ? MODE_EN : MODE_JA)[m]}</span>`)
    .join('')

  return `<div class="route-strip" style="break-inside:avoid">
  <div style="display:flex;flex-wrap:nowrap;align-items:flex-start;justify-content:space-between;gap:${z.gap}px">${cells.join('')}</div>
  ${key ? `<div style="margin-top:5px;font-size:7pt;color:#555">${key}</div>` : ''}
</div>`
}
