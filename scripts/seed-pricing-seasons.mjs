// ============================================
// A starting suggestion for the season calendar
// ============================================
// The Japanese dates that sell out, as a starting point for the operator to
// edit at Rates > Seasonal Premiums. THE PERCENTAGES BELOW ARE PLACEHOLDERS —
// they were the test values used while building the premium engine, not a
// pricing decision anybody made. Change them before you charge them.
//
// Dates are real and dated (not month-day) because Golden Week and Obon move
// each year; 2028 will need new rows, which is the point of the screen.
//
//   node scripts/seed-pricing-seasons.mjs            # show what it would write
//   node scripts/seed-pricing-seasons.mjs --apply    # write it
//
// Re-running is safe: a season whose name already exists in the org is skipped
// rather than duplicated (the table has UNIQUE (org_id, name)).

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const SEASONS = [
  {
    "name": "ゴールデンウィーク",
    "uplift_percent": 15.0,
    "colour": "#c2410c",
    "display_order": 1,
    "windows": [
      {
        "start_date": "2027-04-29",
        "end_date": "2027-05-06",
        "label": "2027 GW"
      }
    ]
  },
  {
    "name": "お盆",
    "uplift_percent": 12.0,
    "colour": "#6d28d9",
    "display_order": 2,
    "windows": [
      {
        "start_date": "2026-08-08",
        "end_date": "2026-08-17",
        "label": "お盆 2026"
      },
      {
        "start_date": "2027-08-07",
        "end_date": "2027-08-16",
        "label": "お盆 2027"
      }
    ]
  },
  {
    "name": "年末年始",
    "uplift_percent": 20.0,
    "colour": "#7c2d12",
    "display_order": 3,
    "windows": [
      {
        "start_date": "2026-12-27",
        "end_date": "2027-01-04",
        "label": "年末年始 2026-27"
      }
    ]
  },
  {
    "name": "クリスマス",
    "uplift_percent": 10.0,
    "colour": "#166534",
    "display_order": 4,
    "windows": [
      {
        "start_date": "2026-12-20",
        "end_date": "2026-12-26",
        "label": "Christmas 2026"
      }
    ]
  }
]

const apply = process.argv.includes('--apply')
const orgArg = process.argv.find(a => a.startsWith('--org='))?.slice(6)

const { data: orgs } = await sb.from('organizations').select('id, name').order('name')
const org = orgArg
  ? orgs.find(o => o.id === orgArg)
  : orgs.find(o => o.name !== 'E2E Smoke Org')
if (!org) {
  console.error('No organization found. Pass --org=<uuid>. Known:', orgs.map(o => `${o.id} ${o.name}`).join(' | '))
  process.exit(1)
}
console.log(`organization: ${org.name} (${org.id})`)

const { data: existing } = await sb.from('pricing_seasons').select('name').eq('org_id', org.id)
const have = new Set((existing || []).map(s => s.name))

for (const season of SEASONS) {
  const windows = season.windows.map(w => `${w.start_date}..${w.end_date}`).join(', ')
  if (have.has(season.name)) {
    console.log(`  = ${season.name} already exists — skipped`)
    continue
  }
  console.log(`  ${apply ? '+' : '·'} ${season.name}  +${season.uplift_percent}%  ${windows}`)
  if (!apply) continue

  const { data: row, error } = await sb.from('pricing_seasons').insert({
    org_id: org.id,
    name: season.name,
    uplift_percent: season.uplift_percent,
    colour: season.colour,
    display_order: season.display_order,
  }).select('id').single()
  if (error) { console.error(`    failed: ${error.message}`); continue }

  const { error: dateErr } = await sb.from('pricing_season_dates').insert(
    season.windows.map(w => ({ org_id: org.id, season_id: row.id, ...w }))
  )
  if (dateErr) console.error(`    dates failed: ${dateErr.message}`)
}

console.log(apply
  ? '\ndone — review every percentage at Rates > Seasonal Premiums before quoting.'
  : '\nnothing written. Re-run with --apply to write these rows.')
