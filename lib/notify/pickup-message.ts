// ============================================
// The pickup details message to the client
// ============================================
// What the traveller needs the evening before a day out: when and where they
// are picked up, and who will be there — the guide, the driver (and the car),
// the airport representative — with numbers they can call. Built from the
// trip's own assignments for that day, so it names the people actually
// booked, in the client's language. The operator reviews (and can edit) the
// text before it goes. Pure, so tested.
//
// Ported from autoura-saas (lib/notify/pickup-message.ts), with Japanese.

export interface PickupPerson {
  name: string
  phone?: string | null
}

export type PickupLanguage = 'en' | 'ja'

export interface PickupMessageInput {
  language?: PickupLanguage
  agency?: string | null
  clientName?: string | null
  tripName?: string | null
  /** YYYY-MM-DD */
  date: string
  dayNumber?: number | null
  time?: string | null
  place?: string | null
  guide?: PickupPerson | null
  driver?: PickupPerson | null
  /** "Toyota HiAce (8 pax)" */
  vehicle?: string | null
  airport?: PickupPerson | null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const utcDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)

/** "Friday, 2 October" / "10月2日（金）" — spelled out here, since locale data differs between runtimes. */
function longDate(iso: string, language: PickupLanguage): string {
  const d = utcDay(iso)
  if (Number.isNaN(d.getTime())) return iso
  return language === 'ja'
    ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAYS_JA[d.getUTCDay()]}）`
    : `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

const person = (p: PickupPerson) => (p.phone?.trim() ? `${p.name.trim()} (${p.phone.trim()})` : p.name.trim())
const has = (p: PickupPerson | null | undefined): p is PickupPerson => !!p?.name?.trim()

function english(m: PickupMessageInput): string {
  const first = m.clientName?.trim().split(/\s+/)[0] || 'there'
  const trip = m.tripName?.trim()
  const lines: string[] = [`Hello ${first},`, '']
  lines.push(`Here are your pickup details for ${longDate(m.date, 'en')}${m.dayNumber ? ` (day ${m.dayNumber}` + (trip ? ` of ${trip})` : ')') : trip ? ` — ${trip}` : ''}:`)
  lines.push('')
  lines.push(`🕐 Pickup time: ${m.time?.trim() || 'to be confirmed'}`)
  lines.push(`📍 Pickup point: ${m.place?.trim() || 'to be confirmed'}`)
  if (has(m.airport)) lines.push(`🛬 Meeting you at the airport: ${person(m.airport)}`)
  if (has(m.guide)) lines.push(`🧭 Your guide: ${person(m.guide)}`)
  if (has(m.driver)) lines.push(`🚐 Your driver: ${person(m.driver)}${m.vehicle?.trim() ? ` — ${m.vehicle.trim()}` : ''}`)
  else if (m.vehicle?.trim()) lines.push(`🚐 Your vehicle: ${m.vehicle.trim()}`)
  lines.push('')
  lines.push('Please be ready a few minutes early. If anything changes, reply to this message.')
  lines.push('')
  lines.push(m.agency?.trim() ? `${m.agency.trim()} team` : 'Your travel team')
  return lines.join('\n')
}

function japanese(m: PickupMessageInput): string {
  // The whole name with 様: a romaji name's order says nothing about which part is the family name.
  const name = m.clientName?.trim()
  const trip = m.tripName?.trim()
  const lines: string[] = [name ? `${name}様` : 'お客様', '']
  const where = [m.dayNumber ? `${m.dayNumber}日目` : null, trip].filter(Boolean).join('・')
  lines.push(`${longDate(m.date, 'ja')}${where ? `（${where}）` : ''}のお迎えについてご案内いたします。`)
  lines.push('')
  lines.push(`🕐 お迎え時間：${m.time?.trim() || '確定次第ご連絡します'}`)
  lines.push(`📍 お迎え場所：${m.place?.trim() || '確定次第ご連絡します'}`)
  if (has(m.airport)) lines.push(`🛬 空港でのお出迎え：${person(m.airport)}`)
  if (has(m.guide)) lines.push(`🧭 ガイド：${person(m.guide)}`)
  if (has(m.driver)) lines.push(`🚐 ドライバー：${person(m.driver)}${m.vehicle?.trim() ? `（${m.vehicle.trim()}）` : ''}`)
  else if (m.vehicle?.trim()) lines.push(`🚐 車両：${m.vehicle.trim()}`)
  lines.push('')
  lines.push('お時間の数分前にはご準備をお願いいたします。変更がございましたら、このメッセージにご返信ください。')
  lines.push('')
  lines.push(m.agency?.trim() || '旅行チーム')
  return lines.join('\n')
}

export function buildPickupMessage(m: PickupMessageInput): string {
  return m.language === 'ja' ? japanese(m) : english(m)
}
