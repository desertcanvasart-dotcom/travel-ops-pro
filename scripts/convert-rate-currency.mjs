#!/usr/bin/env node
// ============================================
// Convert every stored supplier rate by a factor — the rate-currency cut-over
// ============================================
// Until 2026-08-22 the rate tables were, by definition, euro. The rate currency
// is now an org setting (organizations.rate_currency) and A.T.S's is USD — but
// the amounts they typed are still the euro figures they typed. This multiplies
// every non-null, non-zero amount in every rate table by one factor, rounded to
// cents, so the numbers mean what their labels now say.
//
//   node scripts/convert-rate-currency.mjs                     # dry run, factor = today's EUR→USD
//   node scripts/convert-rate-currency.mjs --factor 1.17       # dry run at a chosen factor
//   node scripts/convert-rate-currency.mjs --factor 1.17 --apply --note "EUR→USD cut-over"
//
// Safety: dry run by default; --apply refuses without an explicit --factor;
// every UPDATE goes through PostgREST with the service key so the existing
// rate-audit trigger records old and new values (rate_audit_log.full_old_record)
// — the reversal is the same script with --factor 1/x. Trip snapshots
// (itinerary_services, itinerary_resources) are NOT touched: trips priced
// before the cut-over keep the figures they were sold at.
// ============================================
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const APPLY = flag('--apply')
const NOTE = opt('--note') || ''

/** Every rate table and the amount columns it carries (passport-tier pairs included — both are amounts). */
const TABLES = {
  transportation_rates: ['base_rate_eur', 'base_rate_non_eur', 'sedan_rate_eur', 'sedan_rate_non_eur', 'minivan_rate_eur', 'minivan_rate_non_eur', 'van_rate_eur', 'van_rate_non_eur', 'minibus_rate_eur', 'minibus_rate_non_eur', 'bus_rate_eur', 'bus_rate_non_eur'],
  flight_rates: ['base_rate_eur', 'base_rate_non_eur', 'tax_eur', 'tax_non_eur'],
  train_rates: ['rate_eur'],
  sleeping_train_rates: ['rate_oneway_eur', 'rate_roundtrip_eur'],
  accommodation_rates: null, // resolved from the schema: 50 season/cabin columns
  hotel_contacts: ['rate_single_eur', 'rate_double_eur', 'rate_triple_eur', 'rate_single_non_eur', 'rate_double_non_eur', 'rate_triple_non_eur', 'rate_suite_eur', 'rate_suite_non_eur', 'breakfast_rate_eur'],
  nile_cruises: null,
  restaurant_contacts: ['rate_per_person_eur', 'rate_per_person_non_eur', 'rate_breakfast_eur', 'rate_lunch_eur', 'rate_dinner_eur', 'rate_breakfast_non_eur', 'rate_lunch_non_eur', 'rate_dinner_non_eur'],
  meal_rates: ['base_rate_eur', 'base_rate_non_eur'],
  activity_rates: ['base_rate_eur', 'base_rate_non_eur'],
  entrance_fees: ['eur_rate', 'non_eur_rate'],
  guide_rates: ['base_rate_eur', 'base_rate_non_eur'],
  service_fees: ['base_rate_eur', 'base_rate_non_eur'],
  tipping_rates: ['rate_eur'],
  airport_staff_rates: ['rate_eur'],
  hotel_staff_rates: ['rate_eur'],
  b2b_pricing_rules: ['tier1_rate_eur', 'tier2_rate_eur', 'tier3_rate_eur', 'tier4_rate_eur'],
  fixed_daily_costs: ['cost_per_person_per_day'],
}

/** Tables the rate-audit trigger (20260226_rate_audit_trail.sql) is NOT attached to —
 *  the tool writes the same audit row itself so every change stays reversible. */
const UNAUDITED = new Set(['hotel_contacts', 'restaurant_contacts', 'service_fees', 'b2b_pricing_rules', 'fixed_daily_costs'])

const rest = async (m, p, b) => { const r = await fetch(U + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); if (r.status >= 300) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 160)}`); return t ? JSON.parse(t) : null }
const round2 = (v) => Math.round(v * 100) / 100

async function main() {
  const spec = await rest('GET', '/rest/v1/')
  let factor = opt('--factor') ? Number(opt('--factor')) : null
  if (!factor) {
    const fx = await rest('GET', '/rest/v1/exchange_rates?select=rate&base_currency=eq.EUR&target_currency=eq.USD')
    factor = Number(fx?.[0]?.rate)
    if (APPLY) { console.error('Refusing to --apply without an explicit --factor. Today\'s EUR→USD is ' + factor + '; pass it (or the rate you want) explicitly.'); process.exit(2) }
  }
  if (!Number.isFinite(factor) || factor <= 0) { console.error('bad factor'); process.exit(2) }
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — factor ${factor}${NOTE ? ` — ${NOTE}` : ''}\n`)
  const startedAt = new Date().toISOString()

  let totalCells = 0, totalRows = 0, before = 0, after = 0
  for (const [table, declared] of Object.entries(TABLES)) {
    const def = spec.definitions[table]
    if (!def) { console.log(`${table.padEnd(22)} (not in schema — skipped)`); continue }
    const cols = (declared || Object.keys(def.properties).filter(c => /(_eur\b|eur_rate\b)/.test(c))).filter(c => def.properties[c])
    const rows = await rest('GET', UNAUDITED.has(table) ? `/rest/v1/${table}?select=*` : `/rest/v1/${table}?select=${['id', ...cols].join(',')}`)
    let cells = 0, changed = 0, sumB = 0, sumA = 0
    for (const row of rows) {
      const patch = {}
      for (const c of cols) {
        const v = row[c]
        if (v === null || v === undefined || Number(v) === 0) continue
        const nv = round2(Number(v) * factor)
        patch[c] = nv; cells++; sumB += Number(v); sumA += nv
      }
      if (Object.keys(patch).length) {
        changed++
        if (APPLY) {
          await rest('PATCH', `/rest/v1/${table}?id=eq.${row.id}`, patch)
          if (UNAUDITED.has(table)) {
            const changed_fields = Object.fromEntries(Object.entries(patch).map(([c, nv]) => [c, { old: row[c], new: nv }]))
            await rest('POST', '/rest/v1/rate_audit_log', {
              table_name: table, record_id: row.id, action: 'UPDATE', changed_fields,
              full_old_record: row, full_new_record: { ...row, ...patch }, changed_by: null, notes: NOTE || null,
            })
          }
        }
      }
    }
    totalCells += cells; totalRows += changed; before += sumB; after += sumA
    console.log(`${table.padEnd(22)} rows ${String(changed).padStart(3)}/${String(rows.length).padStart(3)}  cells ${String(cells).padStart(4)}  Σ ${sumB.toFixed(2).padStart(11)} → ${sumA.toFixed(2).padStart(11)}`)
  }
  console.log(`\n${APPLY ? 'UPDATED' : 'WOULD UPDATE'}: ${totalRows} rows, ${totalCells} amounts; Σ ${before.toFixed(2)} → ${after.toFixed(2)} (×${factor})`)
  if (APPLY && NOTE) {
    // The trigger cannot know why; stamp this run's rows so the cut-over is one query away.
    await rest('PATCH', `/rest/v1/rate_audit_log?changed_at=gte.${encodeURIComponent(startedAt)}&notes=is.null`, { notes: NOTE })
  }
  if (APPLY) console.log('Every change is in rate_audit_log (full_old_record / full_new_record) via the rate-audit trigger. Reverse with --factor ' + (1 / factor).toFixed(8))
}
main().catch(e => { console.error('ERROR', e.message); process.exit(1) })
