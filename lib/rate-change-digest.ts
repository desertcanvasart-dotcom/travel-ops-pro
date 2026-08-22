// ============================================
// Rate-change digest — what to tell the managers
// ============================================
// Pure functions over rate_audit_log rows: group a window of changes by
// (actor × table) and phrase each group as ONE notification. Bulk edits and
// imports become one line, not one alert per row. The cron route
// (/api/cron/rate-change-digest) does the reading and sending.
// ============================================

export interface AuditRow {
  id: string
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE' | string
  changed_fields: Record<string, { old: unknown; new: unknown }> | null
  full_old_record: Record<string, unknown> | null
  full_new_record: Record<string, unknown> | null
  changed_by: string | null
  changed_at: string
}

/** Audited table → the page that shows it, and how to name it. */
export const RATE_TABLES: Record<string, { page: string; en: string; ja: string }> = {
  accommodation_rates:  { page: '/rates/hotels',           en: 'hotel rates',            ja: 'ホテル料金' },
  transportation_rates: { page: '/rates/transportation',   en: 'transport rates',        ja: '交通料金' },
  guide_rates:          { page: '/rates/guides',           en: 'guide rates',            ja: 'ガイド料金' },
  meal_rates:           { page: '/rates/meals',            en: 'meal rates',             ja: '食事料金' },
  entrance_fees:        { page: '/rates/attractions',      en: 'entrance fees',          ja: '入場料' },
  flight_rates:         { page: '/rates/flights',          en: 'flight rates',           ja: '航空券料金' },
  activity_rates:       { page: '/rates/activities',       en: 'activity rates',         ja: 'アクティビティ料金' },
  tipping_rates:        { page: '/rates/tipping',          en: 'tipping rates',          ja: 'チップ料金' },
  airport_staff_rates:  { page: '/rates/airport-services', en: 'airport service rates',  ja: '空港サービス料金' },
  hotel_staff_rates:    { page: '/rates/hotel-services',   en: 'hotel service rates',    ja: 'ホテルサービス料金' },
  nile_cruises:         { page: '/rates/cruises',          en: 'Nile cruise rates',      ja: 'ナイルクルーズ料金' },
  train_rates:          { page: '/rates/trains',           en: 'train rates',            ja: '列車料金' },
  sleeping_train_rates: { page: '/rates/sleeping-train',   en: 'sleeping train rates',   ja: '寝台列車料金' },
  fixed_daily_costs:    { page: '/rates/fixed-costs',      en: 'fixed daily costs',      ja: '固定日額費用' },
  service_fees:         { page: '/rates',                  en: 'service fees',           ja: 'サービス料' },
}

const NAME_FIELDS = ['name', 'hotel_name', 'site_name', 'attraction_name', 'guide_name', 'route_name', 'route', 'service_name', 'cruise_name', 'ship_name', 'vehicle_type', 'description', 'city', 'code']

/** A human handle for the record: the first name-like field present. */
export function recordLabel(row: AuditRow): string {
  const rec = row.full_new_record ?? row.full_old_record ?? {}
  for (const f of NAME_FIELDS) {
    const v = rec[f]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return row.record_id.slice(0, 8)
}

const fmt = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** "Ahmed: daily_rate 50 → 60" — the first two changed fields, or the action. */
export function describeChange(row: AuditRow): string {
  const label = recordLabel(row)
  if (row.action === 'INSERT') return `${label}: added`
  if (row.action === 'DELETE') return `${label}: deleted`
  const fields = Object.entries(row.changed_fields ?? {}).filter(([k]) => !['updated_at', 'created_at', 'updated_by'].includes(k))
  if (!fields.length) return `${label}: updated`
  const parts = fields.slice(0, 2).map(([k, v]) => `${k} ${fmt(v.old)} → ${fmt(v.new)}`)
  const more = fields.length > 2 ? ` (+${fields.length - 2})` : ''
  return `${label}: ${parts.join(', ')}${more}`
}

export interface DigestGroup {
  actorId: string | null
  table: string
  rows: AuditRow[]
}

/** One group per (actor, table); order = as first seen. */
export function groupChanges(rows: AuditRow[]): DigestGroup[] {
  const map = new Map<string, DigestGroup>()
  for (const r of rows) {
    const key = `${r.changed_by ?? ''}|${r.table_name}`
    let g = map.get(key)
    if (!g) { g = { actorId: r.changed_by, table: r.table_name, rows: [] }; map.set(key, g) }
    g.rows.push(r)
  }
  return [...map.values()]
}

export interface DigestNotice { title: string; message: string; link: string }

/**
 * Phrase a group. Bilingual on purpose: the notification has no locale and
 * the team reads both. `actorName` is the resolved display name, or null
 * when the change was not attributable (SQL editor, pre-attribution rows).
 */
export function describeGroup(g: DigestGroup, actorName: string | null, maxExamples = 3): DigestNotice {
  const meta = RATE_TABLES[g.table] ?? { page: '/rates', en: `${g.table} rows`, ja: g.table }
  const n = g.rows.length
  const who = actorName ?? 'unknown user / 不明なユーザー'
  const title = `料金変更: ${meta.ja} ${n}件 — Rate change: ${n} ${meta.en}`
  const examples = g.rows.slice(0, maxExamples).map(describeChange)
  const rest = n > maxExamples ? `\n…and ${n - maxExamples} more / 他${n - maxExamples}件` : ''
  const message = `${who} changed ${n} ${meta.en} / ${who} が${meta.ja}を${n}件変更しました\n${examples.join('\n')}${rest}`
  return { title, message, link: meta.page }
}
