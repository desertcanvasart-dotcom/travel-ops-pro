#!/usr/bin/env node
// ============================================
// 2025 トラベルセーフティプラン rates
// ============================================
// Transcribed from 4.2025年版海外保険.pdf (共済金額表および掛金表), the sheet
// A.T.S send with the 申込書. Every figure was read from the scan at full
// resolution and checked twice — these numbers go on customer invoices.
//
// The 掛金 already include the NPO 会費 (50円) and the 出資金 (50円), per the
// footnote on the published table.
//
//   node scripts/seed-insurance-rates-2025.mjs [--org <uuid>]
import fs from 'fs'

const ENV_PATH = new URL('../.env.local', import.meta.url).pathname
const env = { ...process.env }
for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue
  const i = line.indexOf('=')
  const k = line.slice(0, i).trim()
  if (!env[k]) env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const RET = { Prefer: 'return=representation' }

const argOrg = process.argv.indexOf('--org')
const ORG = argOrg > -1 ? process.argv[argOrg + 1] : '6390a05a-e0ae-4c4d-9d48-3e098b3d523a'
const RATE_YEAR = 2025

const MAN = 10_000, OKU = 100_000_000

// 共済金額表 — cover per plan, in JPY.
const PLANS = [
  { plan_code: 'HC', order: 1, cover_accidental_death: 5000 * MAN, cover_treatment_rescue: 2000 * MAN },
  { plan_code: 'HD', order: 2, cover_accidental_death: 3000 * MAN, cover_treatment_rescue: 1500 * MAN },
  { plan_code: 'HE', order: 3, cover_accidental_death: 2000 * MAN, cover_treatment_rescue: 1500 * MAN },
  { plan_code: 'HF', order: 4, cover_accidental_death: 1000 * MAN, cover_treatment_rescue: 1000 * MAN },
].map(p => ({
  ...p,
  // Identical across all four plans on the published table.
  cover_illness_death: 500 * MAN,
  cover_liability: 1 * OKU,
  cover_baggage: 30 * MAN,
  cover_baggage_delay: 10 * MAN,
  cover_flight_delay: 2 * MAN,
}))

// 掛金表 — [band label, max_days, HC, HD, HE, HF].
// 満69歳まで applies from 「28日まで」 down the table.
const BANDS = [
  ['3日まで', 3, 5100, 4400, 3700, 2800],
  ['4日まで', 4, 5900, 5000, 4200, 3400],
  ['6日まで', 6, 8100, 6900, 5800, 4700],
  ['8日まで', 8, 9800, 8100, 6900, 5700],
  ['11日まで', 11, 12200, 9400, 8000, 6700],
  ['15日まで', 15, 14100, 11400, 9900, 8200],
  ['18日まで', 18, 15800, 12900, 10900, 9200],
  ['22日まで', 22, 18700, 15600, 13400, 11400],
  ['25日まで', 25, 22100, 18700, 16100, 13400],
  ['28日まで', 28, 23400, 20400, 17700, 15100],
  ['31日まで', 31, 25800, 22500, 19700, 16600],
  ['46日まで', 46, 35500, 31000, 27400, 23100],
  ['2ヵ月まで', 62, 49700, 43700, 38900, 33300],
  ['3ヵ月まで', 92, 70100, 62200, 55600, 48100],
]
const AGE_RESTRICTED_FROM_DAYS = 28
const MAX_AGE = 69

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${U}/rest/v1/${path}`, {
    method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const run = async () => {
  const planIds = {}
  for (const p of PLANS) {
    const { order, ...cover } = p
    const existing = (await rest('GET', `insurance_plans?select=id&org_id=eq.${ORG}&plan_code=eq.${p.plan_code}`))[0]
    if (existing) {
      await rest('PATCH', `insurance_plans?id=eq.${existing.id}`, { ...cover, display_order: order })
      planIds[p.plan_code] = existing.id
    } else {
      const row = (await rest('POST', 'insurance_plans', [{ org_id: ORG, ...cover, display_order: order }], RET))[0]
      planIds[p.plan_code] = row.id
    }
  }
  console.log('plans:', Object.keys(planIds).join(', '))

  const rows = []
  for (const [band_label, max_days, ...prices] of BANDS) {
    ;['HC', 'HD', 'HE', 'HF'].forEach((code, i) => {
      rows.push({
        org_id: ORG,
        plan_id: planIds[code],
        rate_year: RATE_YEAR,
        max_days,
        band_label,
        premium_jpy: prices[i],
        max_age: max_days >= AGE_RESTRICTED_FROM_DAYS ? MAX_AGE : null,
      })
    })
  }

  await rest('DELETE', `insurance_premiums?org_id=eq.${ORG}&rate_year=eq.${RATE_YEAR}`)
  await rest('POST', 'insurance_premiums', rows)
  console.log(`premiums: ${rows.length} rows (${BANDS.length} bands × 4 plans), rate year ${RATE_YEAR}`)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
