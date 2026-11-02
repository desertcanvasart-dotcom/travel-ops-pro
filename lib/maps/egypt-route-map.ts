// ============================================
// A tour's route on a map of Egypt — as inline SVG
// ============================================
// The interactive ItineraryMap (components/ItineraryMap.tsx) draws on live
// OpenStreetMap tiles. A printed document cannot: the PDF renderer makes no
// network requests (lib/documents/inline-image.ts), and a map that prints
// blank when the tile server is slow is worse than none. So this draws its
// own Egypt — coastline, borders, the Nile — and plots the stops on it. Same
// city coordinates as the interactive map, so the two never disagree about
// where Luxor is.
//
// Only Egypt is coloured; everything around it — sea and neighbours alike —
// is one neutral grey, so the map never claims a coastline it does not draw.
//
// Pure: stops in, SVG string out. Used by the 日程表, the tour programme page
// and anything else that wants the picture.

import { resolveCityCoordinates } from '@/lib/constants/egypt-city-coordinates'

// Egypt's outline, [lat, lng], clockwise from the Libyan border on the coast.
// Simplified to what reads at document size — a picture of the route, not a
// survey. The Halaib triangle is drawn as Egypt draws it.
const OUTLINE: Array<[number, number]> = [
  [31.57, 25.15], [31.35, 27.23], [30.95, 28.6], [30.83, 28.95], [31.2, 29.9], [31.46, 30.37],
  [31.52, 31.84], [31.27, 32.3], [31.13, 33.8], [31.3, 34.24], [29.49, 34.9], [29.03, 34.67],
  [28.5, 34.51], [27.73, 34.25], [28.24, 33.62], [28.9, 33.18], [29.58, 32.7], [29.97, 32.55],
  [29.6, 32.33], [29.1, 32.65], [28.35, 33.1], [27.25, 33.84], [26.74, 33.94], [26.1, 34.28],
  [25.07, 34.9], [23.95, 35.48], [23.9, 35.78], [23.13, 35.6], [22.22, 36.64], [22.0, 36.9],
  [22.0, 31.4], [22.0, 25.0], [29.5, 25.0], [31.0, 24.9],
]

// The Nile from the Sudan border to the Delta, then its two branches.
const NILE: Array<[number, number]> = [
  [22.0, 31.35], [22.34, 31.62], [23.0, 32.4], [23.6, 32.85], [24.09, 32.9], [24.47, 32.95],
  [24.98, 32.87], [25.29, 32.55], [25.69, 32.64], [26.16, 32.72], [26.05, 32.24], [26.56, 31.69],
  [27.18, 31.18], [28.1, 30.75], [29.07, 31.1], [30.04, 31.24], [30.2, 31.15],
]
const NILE_ROSETTA: Array<[number, number]> = [[30.2, 31.15], [30.8, 30.75], [31.46, 30.37]]
const NILE_DAMIETTA: Array<[number, number]> = [[30.2, 31.15], [30.9, 31.45], [31.42, 31.81]]
/** Lake Nasser, drawn as a wider stretch of the river. */
const LAKE_NASSER: Array<[number, number]> = [[22.0, 31.35], [22.34, 31.62], [23.0, 32.4], [23.6, 32.85], [23.95, 32.88]]

/** Egypt's extent: stops outside it are not drawn. */
const BOUNDS = { minLat: 21.6, maxLat: 31.9, minLng: 24.6, maxLng: 37.2 }
const KX = Math.cos((27 * Math.PI) / 180)

type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number }

/** The window drawn: the stops plus a margin, never tighter than a few degrees
 *  (two Nile stops would otherwise fill the frame and lose the country around
 *  them), and never taller than 1.25× its width. A Cairo–Luxor–Aswan tour is
 *  then drawn large instead of as a thin line down a map of all Egypt. */
function viewBox(points: Array<{ lat: number; lng: number }>): Box {
  const lats = points.map(p => p.lat)
  const lngs = points.map(p => p.lng)
  let minLat = Math.min(...lats) - 0.9
  let maxLat = Math.max(...lats) + 0.9
  let minLng = Math.min(...lngs) - 1.4
  let maxLng = Math.max(...lngs) + 1.4
  const grow = (lo: number, hi: number, span: number): [number, number] => {
    const extra = Math.max(0, span - (hi - lo)) / 2
    return [lo - extra, hi + extra]
  }
  ;[minLat, maxLat] = grow(minLat, maxLat, 4)
  ;[minLng, maxLng] = grow(minLng, maxLng, 4.5)
  // Aspect: keep height ≤ 1.25 × width (in projected units).
  ;[minLng, maxLng] = grow(minLng, maxLng, (maxLat - minLat) / 1.25 / KX)
  return { minLat, maxLat, minLng, maxLng }
}

/** Places near Cairo merge into it — at the scale of all Egypt they would be
 *  one smudge of overlapping dots, and the traveller thinks of them as "Cairo". */
const MERGE_INTO: Record<string, string> = {
  Giza: 'Cairo',
  Saqqara: 'Cairo',
  Memphis: 'Cairo',
  Dahshur: 'Cairo',
}

/** Japanese names the office writes, for the map labels. */
const PLACE_JA: Record<string, string> = {
  Cairo: 'カイロ',
  Alexandria: 'アレキサンドリア',
  Aswan: 'アスワン',
  Luxor: 'ルクソール',
  'Abu Simbel': 'アブ・シンベル',
  Hurghada: 'ハルガダ',
  'Bahariya Oasis': 'バハレヤオアシス',
  Bahariya: 'バハレヤオアシス',
  Edfu: 'エドフ',
  'Kom Ombo': 'コム・オンボ',
  Esna: 'エスナ',
  Dendera: 'デンデラ',
  Abydos: 'アビドス',
  Fayoum: 'ファイユーム',
  Siwa: 'シワ',
  'Sharm El Sheikh': 'シャルム・エル・シェイク',
  'Saint Catherine': 'シナイ山',
  'Marsa Alam': 'マルサ・アラム',
  Farafra: '白砂漠',
}

/** Places the day text names — the office's Japanese, or an English trip — to
 *  the coordinate keys. The
 *  importer only records where each NIGHT is spent; a stop visited and left
 *  the same day (Aswan on the way to Abu Simbel) is only in the text. */
const TEXT_PLACES: Array<[RegExp, string]> = [
  [/カイロ|\bcairo\b/i, 'Cairo'],
  [/ギザ|サッカラ|ダハシュール|メンフィス|\b(giza|saqqara|sakkara|dahshur|memphis)\b/i, 'Cairo'],
  [/アレキサンドリア|アレクサンドリア|\balexandria\b/i, 'Alexandria'],
  [/アスワン|\baswan\b/i, 'Aswan'],
  [/ルクソール|王家の谷|カルナック|\b(luxor|karnak|valley of the kings)\b/i, 'Luxor'],
  [/アブ・?シンベル|\babu ?simbel\b/i, 'Abu Simbel'],
  [/ハルガダ|\bhurghada\b/i, 'Hurghada'],
  [/バハレヤ|\bbahariya\b/i, 'Bahariya Oasis'],
  [/白砂漠|ファラフラ|\b(white desert|farafra)\b/i, 'Farafra'],
  [/エドフ|\bedfu\b/i, 'Edfu'],
  [/コム・?オンボ|\bkom ?ombo\b/i, 'Kom Ombo'],
  [/エスナ|\besna\b/i, 'Esna'],
  [/デンデラ|\bdendera\b/i, 'Dendera'],
  [/アビドス|\babydos\b/i, 'Abydos'],
  [/ファイユーム|\bfa[iy]y?oum\b/i, 'Fayoum'],
  [/シワ|\bsiwa\b/i, 'Siwa'],
  [/シャルム|\bsharm\b/i, 'Sharm El Sheikh'],
  [/シナイ山|カトリーナ|\b(mount sinai|st\.? catherine|saint catherine)\b/i, 'Saint Catherine'],
  [/マルサ・?アラム|\bmarsa alam\b/i, 'Marsa Alam'],
]

export interface RouteDay {
  day: number
  description?: string | null
  attractions?: string[] | null
  overnight_city?: string | null
}

/** "Nile Cruise" and the like are not places on a map. */
function isPlace(city: string | null | undefined): city is string {
  return Boolean(city && city.trim() && !/cruise|flight|train/i.test(city))
}

function canonical(city: string): string {
  const c = city.trim()
  return MERGE_INTO[c] ?? c
}

/**
 * The tour's stops in the order they are reached: per day, the places its
 * text names in reading order, then where it sleeps. Consecutive repeats
 * collapse (a three-night Cairo stay is one stop); a later return is a new
 * stop, so the route closes back on Cairo.
 */
export function routeStopsFromDays(days: RouteDay[]): string[] {
  const out: string[] = []
  const push = (city: string) => {
    const c = canonical(city)
    if (out[out.length - 1] !== c) out.push(c)
  }
  for (const day of [...days].sort((a, b) => a.day - b.day)) {
    const text = [day.description ?? '', ...(day.attractions ?? [])].join('\n')
    const found = TEXT_PLACES.map(([re, city]) => ({ city, at: text.search(re) }))
      .filter(f => f.at >= 0)
      .sort((a, b) => a.at - b.at)
    for (const f of found) push(f.city)
    if (isPlace(day.overnight_city)) push(day.overnight_city)
  }
  return out
}

/** Stops from plain city names (an itinerary's per-day cities). */
export function routeStopsFromCities(cities: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const city of cities) {
    if (!isPlace(city)) continue
    const c = canonical(city)
    if (out[out.length - 1] !== c) out.push(c)
  }
  return out
}

function project(lat: number, lng: number, box: Box, scale: number): [number, number] {
  return [(lng - box.minLng) * KX * scale, (box.maxLat - lat) * scale]
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface RouteMapResult {
  svg: string
  /** The stops actually drawn, numbered, in route order — for a legend. */
  legend: Array<{ n: number; label: string }>
}

/**
 * The SVG, or null when fewer than two stops are on the map — a single dot on
 * Egypt says nothing a reader did not already know. Stops outside Egypt (a
 * Jordan extension) are left off rather than drawn at the edge.
 */
export function renderEgyptRouteMap(
  stops: string[],
  opts: { language?: 'ja' | 'en'; width?: number; accent?: string } = {}
): RouteMapResult | null {
  const width = opts.width ?? 300
  const accent = opts.accent ?? '#647C47'

  const label = (city: string) => (opts.language === 'en' ? city : PLACE_JA[city] ?? city)
  const resolved = stops
    .map(city => ({ city, at: resolveCityCoordinates(city) }))
    .filter((s): s is { city: string; at: NonNullable<ReturnType<typeof resolveCityCoordinates>> } => {
      if (!s.at) return false
      return s.at.lat >= BOUNDS.minLat && s.at.lat <= BOUNDS.maxLat && s.at.lng >= BOUNDS.minLng && s.at.lng <= BOUNDS.maxLng
    })
  const unique = [...new Set(resolved.map(s => s.city))]
  if (unique.length < 2) return null

  const box = viewBox(resolved.map(s => s.at))
  const scale = width / ((box.maxLng - box.minLng) * KX)
  const height = Math.round((box.maxLat - box.minLat) * scale)

  const number = new Map(unique.map((city, i) => [city, i + 1]))
  const path = (pts: Array<[number, number]>) =>
    pts.map(([lat, lng], i) => `${i ? 'L' : 'M'}${project(lat, lng, box, scale).map(v => v.toFixed(1)).join(' ')}`).join(' ')

  const route = resolved.map(s => project(s.at.lat, s.at.lng, box, scale))
  const routePath = route.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

  const markers = unique
    .map(city => {
      const at = resolved.find(s => s.city === city)!.at
      const [x, y] = project(at.lat, at.lng, box, scale)
      // Labels sit right of the dot, except on the eastern half where they
      // would run off the edge or over the Red Sea coast stops.
      const left = x > width * 0.66
      const tx = left ? x - 9 : x + 9
      return `<g>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="${accent}" stroke="#fff" stroke-width="1.2"/>
        <text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff">${number.get(city)}</text>
        <text x="${tx.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${left ? 'end' : 'start'}" font-size="8.5" font-weight="700" fill="#222" stroke="#fff" stroke-width="2.4" paint-order="stroke">${esc(label(city))}</text>
      </g>`
    })
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Route map">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#e9e8e4"/>
  <path d="${path(OUTLINE)} Z" fill="#faf5e6" stroke="#9c937a" stroke-width="0.9"/>
  <path d="${path(LAKE_NASSER)}" fill="none" stroke="#8fc1e3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${path(NILE)}" fill="none" stroke="#5aa3d6" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="${path(NILE_ROSETTA)}" fill="none" stroke="#5aa3d6" stroke-width="1.1"/>
  <path d="${path(NILE_DAMIETTA)}" fill="none" stroke="#5aa3d6" stroke-width="1.1"/>
  <path d="${routePath}" fill="none" stroke="${accent}" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>
  ${markers}
</svg>`

  return { svg, legend: unique.map(city => ({ n: number.get(city)!, label: label(city) })) }
}
