#!/usr/bin/env node
// ============================================
// Demo data for walking the extras / options chain end to end
// ============================================
// Everything the options and extras work needs in order to be TRIED rather
// than merely tested: a programme with options on it, an add-on in the rate
// catalogue, a trip built from that programme, a confirmed booking, travellers,
// and a portal link. See docs/plans/extras-and-upgrades.md.
//
// It exists because every table in that chain is empty in this database, so the
// screens render their empty states and nothing can be verified by looking.
//
// THIS SCRIPT WRITES TO WHATEVER PROJECT .env.local POINTS AT — which is
// production. That is deliberate (there is no other database), so it is DRY BY
// DEFAULT: a bare run prints what it would create and touches nothing.
//
//   node scripts/seed-extras-demo.mjs             # print the plan, write nothing
//   node scripts/seed-extras-demo.mjs --yes       # create it
//   node scripts/seed-extras-demo.mjs --cleanup   # remove everything it created
//
// Every row is prefixed DEMO-EXT so it is obvious in a list and removable in
// one command. Keep it out of any revenue reading of this database, and delete
// it before it can be mistaken for a real file.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const env = { ...process.env }
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!env[k]) env[k] = v
  }
} catch { /* env file optional */ }

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const CLEANUP = process.argv.includes('--cleanup')
const WRITE = process.argv.includes('--yes') || CLEANUP
const ORG_NAME = env.DEMO_ORG_NAME || 'Default Organization'

const PREFIX = 'DEMO-EXT'
const TEMPLATE_CODE = `${PREFIX}-001`
const VARIATION_CODE = `${PREFIX}-001-STD`
const ITIN_CODE = `${PREFIX}-2026-001`
const BOOKING_CODE = `${PREFIX}-2026-001`
const CLIENT_CODE = `${PREFIX}-CL-001`
const CLIENT_EMAIL = 'demo-extras@example.test'
const ENTRANCE_CODE = `${PREFIX}-ENT-001`

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(method, pathname, body, extra = {}) {
  const res = await fetch(`${URL_}${pathname}`, {
    method,
    headers: { ...headers, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}: ${text.slice(0, 400)}`)
  try { return text ? JSON.parse(text) : null } catch { return null }
}
const select = (table, query) => rest('GET', `/rest/v1/${table}?${query}`)
const del = (table, query) => rest('DELETE', `/rest/v1/${table}?${query}`)

// In a dry run nothing has a real id, so anything that would be looked up BY a
// parent id is simply reported as new rather than queried with a fake uuid.
const DRY_ID = '00000000-0000-0000-0000-000000000000'

const created = []
async function insert(table, row, label) {
  if (!WRITE) { plan.push(`  + ${table.padEnd(26)} ${label}`); return { id: DRY_ID } }
  const [out] = await rest('POST', `/rest/v1/${table}`, row, { Prefer: 'return=representation' })
  created.push(`${table}: ${label}`)
  return out
}

/** Reuse a row if the demo has been seeded before, so re-running is harmless. */
async function findOrInsert(table, query, row, label) {
  if (!WRITE && query.includes(DRY_ID)) return insert(table, row, label)
  const found = await select(table, query)
  if (found?.length) {
    if (!WRITE) plan.push(`  = ${table.padEnd(26)} ${label}  (already there)`)
    return found[0]
  }
  return insert(table, row, label)
}

const plan = []
const iso = d => d.toISOString().slice(0, 10)
const START = '2026-11-03'
const END = '2026-11-07'

function portalToken() {
  return crypto.randomBytes(24).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function main() {
  const [org] = await select('organizations', `select=id,name,rate_currency&name=eq.${encodeURIComponent(ORG_NAME)}`)
  if (!org) throw new Error(`No organization named "${ORG_NAME}"`)
  const orgId = org.id
  const rateCurrency = org.rate_currency || 'EUR'

  console.log(`Project : ${new URL(URL_).hostname.split('.')[0]}`)
  console.log(`Org     : ${org.name}  (rates in ${rateCurrency})`)
  console.log(WRITE ? (CLEANUP ? 'Mode    : CLEANUP\n' : 'Mode    : WRITE\n') : 'Mode    : dry run — nothing will be written\n')

  if (CLEANUP) return cleanup(orgId)

  // ---------- the programme ----------
  const template = await findOrInsert(
    'tour_templates',
    `select=id&template_code=eq.${TEMPLATE_CODE}`,
    {
      template_code: TEMPLATE_CODE,
      template_name: 'Nile Discovery (demo)',
      tour_type: 'cultural',
      duration_days: 5,
      duration_nights: 4,
      short_description: 'Demo programme for trying options and extras. Not a real product.',
      is_active: true,
    },
    `${TEMPLATE_CODE} — Nile Discovery (demo), 5 days`
  )

  const variation = await findOrInsert(
    'tour_variations',
    `select=id&variation_code=eq.${VARIATION_CODE}`,
    {
      template_id: template.id,
      variation_code: VARIATION_CODE,
      variation_name: 'Nile Discovery (demo) — Standard',
      tier: 'standard',
      group_type: 'private',
      min_pax: 1,
      max_pax: 12,
      inclusions: [],
      exclusions: [],
      is_active: true,
    },
    `${VARIATION_CODE} — standard tier`
  )

  // Three services in the price everyone pays, and two the customer chooses.
  // The two options are deliberately different: one carries the operator's own
  // selling price (off-margin), the other has none and is sold at cost + the
  // org's margin. Walking both is the point.
  const services = [
    { service_name: 'Private guide', service_category: 'guide', quantity_mode: 'per_day', quantity_value: 1, cost_per_unit: 60, day_number: null, is_optional: false, optional_price_override: null },
    { service_name: 'Airport transfers', service_category: 'transportation', quantity_mode: 'fixed', quantity_value: 2, cost_per_unit: 40, day_number: null, is_optional: false, optional_price_override: null },
    { service_name: 'Nile cruise, 4 nights', service_category: 'cruise', quantity_mode: 'per_night', quantity_value: 1, cost_per_unit: 110, day_number: null, is_optional: false, optional_price_override: null },
    { service_name: 'Hot-air balloon over Luxor', service_category: 'activity', quantity_mode: 'per_pax', quantity_value: 1, cost_per_unit: 90, day_number: 3, is_optional: true, optional_price_override: 140 },
    { service_name: 'Abu Simbel day trip', service_category: 'activity', quantity_mode: 'per_pax', quantity_value: 1, cost_per_unit: 120, day_number: 4, is_optional: true, optional_price_override: null },
  ]
  for (const [i, s] of services.entries()) {
    await findOrInsert(
      'tour_variation_services',
      `select=id&variation_id=eq.${variation.id}&service_name=eq.${encodeURIComponent(s.service_name)}`,
      { ...s, variation_id: variation.id, sequence_order: i + 1 },
      `${s.is_optional ? 'OPTION  ' : 'included'} ${s.service_name}` +
        (s.optional_price_override ? ` — sells for ${rateCurrency} ${s.optional_price_override}` : '') +
        (s.is_optional && !s.optional_price_override ? ' — cost + margin' : '')
    )
  }

  // ---------- an add-on that goes with any trip ----------
  await findOrInsert(
    'entrance_fees',
    `select=id&service_code=eq.${ENTRANCE_CODE}`,
    {
      service_code: ENTRANCE_CODE,
      attraction_name: 'Sound & Light Show, Karnak (demo)',
      city: 'Luxor',
      fee_type: 'standard',
      eur_rate: 22,
      non_eur_rate: 25,
      rate_valid_from: '2026-01-01',
      rate_valid_to: '2026-12-31',
      is_active: true,
      is_addon: true,
      addon_note: 'Evening show — can be added to any Luxor night.',
    },
    `${ENTRANCE_CODE} — Sound & Light Show (add-on, ${rateCurrency} 25)`
  )

  // ---------- the customer ----------
  // Looked up by EMAIL, not by client_code: a trigger in this database
  // overwrites client_code with its own sequence (the demo row came back as
  // CLI-0003), so a find-by-code never matches and the second run collides on
  // the unique email instead. Same family as the trigger that nulls
  // itineraries.client_id — see lib/itineraries/reassert-client.
  const client = await findOrInsert(
    'clients',
    `select=id&email=eq.${encodeURIComponent(CLIENT_EMAIL)}`,
    {
      client_code: CLIENT_CODE,
      first_name: 'Demo',
      last_name: 'Traveller',
      email: CLIENT_EMAIL,
      phone: '+81 90 0000 0000',
      org_id: orgId,
      revenue_by_currency: {},
      collected_by_currency: {},
    },
    `${CLIENT_CODE} — Demo Traveller`
  )

  // ---------- the trip, linked to the programme ----------
  const itinerary = await findOrInsert(
    'itineraries',
    `select=id&itinerary_code=eq.${ITIN_CODE}`,
    {
      itinerary_code: ITIN_CODE,
      org_id: orgId,
      client_id: client.id,
      client_name: 'Demo Traveller',
      client_email: 'demo-extras@example.test',
      trip_name: 'Nile Discovery (demo)',
      start_date: START,
      end_date: END,
      total_days: 5,
      num_adults: 2,
      num_children: 0,
      currency: rateCurrency,
      total_cost: 3000,
      supplier_cost: 2400,
      profit: 600,
      margin_percent: 25,
      status: 'confirmed',
      tier: 'standard',
      // THE LINK. Without it the extras catalogue cannot know which programme's
      // options belong to this trip.
      template_id: template.id,
    },
    `${ITIN_CODE} — linked to ${TEMPLATE_CODE}, ${rateCurrency} 3000`
  )

  // ---------- the booking ----------
  const booking = await findOrInsert(
    'bookings',
    `select=id&booking_code=eq.${BOOKING_CODE}`,
    {
      booking_code: BOOKING_CODE,
      org_id: orgId,
      itinerary_id: itinerary.id,
      client_name: 'Demo Traveller',
      client_email: 'demo-extras@example.test',
      trip_name: 'Nile Discovery (demo)',
      start_date: START,
      end_date: END,
      num_adults: 2,
      num_children: 0,
      currency: rateCurrency,
      total_cost: 3000,
      // Nothing paid yet, so balance IS the total — the invariant
      // record_booking_payment() enforces on every payment.
      balance_due: 3000,
      deposit_percent: 20,
      deposit_amount: 600,
      deposit_paid: false,
      // 'confirmed' is an ITINERARY status, not a booking one. The booking
      // vocabulary is pending | supplier_confirmed | payment_received | ready |
      // in_progress | completed | cancelled (types/bookings.ts), and nothing in
      // the database enforces it — the wrong value simply broke the list page.
      status: 'supplier_confirmed',
      payment_status: 'pending',
      payment_schedule_overridden: false,
      portal_mode: 'family',
      tier: 'standard',
    },
    `${BOOKING_CODE} — confirmed, ${rateCurrency} 3000, deposit 600`
  )

  // ---------- travellers ----------
  const travellers = [
    { first_name: 'Demo', last_name: 'Traveller', is_lead_passenger: true },
    { first_name: '', last_name: '', is_lead_passenger: false },
  ]
  for (const t of travellers) {
    await findOrInsert(
      'booking_passengers',
      `select=id&booking_id=eq.${booking.id}&is_lead_passenger=eq.${t.is_lead_passenger}`,
      {
        ...t,
        org_id: orgId,
        booking_id: booking.id,
        passenger_type: 'adult',
        // 'held' or 'applying' only (booking_passengers_passport_status).
        passport_status: 'held',
      },
      t.is_lead_passenger ? 'lead traveller (filled)' : 'second traveller (blank on purpose)'
    )
  }

  // ---------- the portal link ----------
  const existingLink = WRITE
    ? await select(
        'booking_portal_links',
        `select=token&booking_id=eq.${booking.id}&passenger_id=is.null&revoked_at=is.null`
      )
    : []
  let token = existingLink?.[0]?.token
  if (!token) {
    token = portalToken()
    await insert(
      'booking_portal_links',
      {
        org_id: orgId,
        booking_id: booking.id,
        token,
        view_count: 0,
        expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
      },
      'family portal link'
    )
  }

  if (!WRITE) {
    console.log('Would create:\n' + plan.join('\n'))
    console.log('\nRe-run with --yes to write it.')
    return
  }

  console.log('Created:')
  for (const c of created) console.log(`  + ${c}`)
  console.log(`
Walk it like this:
  1. Programme options   /tours/manage → ${TEMPLATE_CODE} → the variation's ✨ Options
  2. Quote               /b2b/calculator/${variation.id}  (tick one option, watch the price)
  3. The trip            /itineraries/${itinerary.id}
  4. Extras on the sale  /bookings/${booking.id}
  5. The traveller       ${env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'}/portal/${token}
                         gate answer: ${BOOKING_CODE}  (or "Traveller")

Remove it all with:  node scripts/seed-extras-demo.mjs --cleanup
`)
}

async function cleanup(orgId) {
  // Children first: a booking cascade would take its own rows, but the
  // programme and the rate-catalogue add-on are not owned by anything.
  const [booking] = await select('bookings', `select=id&booking_code=eq.${BOOKING_CODE}`)
  if (booking) {
    await del('booking_extras', `booking_id=eq.${booking.id}`)
    await del('booking_portal_links', `booking_id=eq.${booking.id}`)
    await del('booking_passengers', `booking_id=eq.${booking.id}`)
    await del('bookings', `id=eq.${booking.id}`)
    console.log(`  - booking ${BOOKING_CODE} (+ passengers, portal links, extras)`)
  }
  const [itin] = await select('itineraries', `select=id&itinerary_code=eq.${ITIN_CODE}`)
  if (itin) {
    const days = await select('itinerary_days', `select=id&itinerary_id=eq.${itin.id}`)
    for (const d of days ?? []) await del('itinerary_services', `itinerary_day_id=eq.${d.id}`)
    await del('itinerary_days', `itinerary_id=eq.${itin.id}`)
    await del('itineraries', `id=eq.${itin.id}`)
    console.log(`  - itinerary ${ITIN_CODE}`)
  }
  await del('clients', `email=eq.${encodeURIComponent(CLIENT_EMAIL)}&org_id=eq.${orgId}`)
  const [variation] = await select('tour_variations', `select=id&variation_code=eq.${VARIATION_CODE}`)
  if (variation) {
    await del('tour_variation_services', `variation_id=eq.${variation.id}`)
    await del('tour_variations', `id=eq.${variation.id}`)
    console.log(`  - variation ${VARIATION_CODE} (+ its services)`)
  }
  await del('tour_day_activities', `template_id=in.(${(await select('tour_templates', `select=id&template_code=eq.${TEMPLATE_CODE}`))?.map(t => t.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
    .catch(() => {})
  await del('tour_templates', `template_code=eq.${TEMPLATE_CODE}`)
  await del('entrance_fees', `service_code=eq.${ENTRANCE_CODE}`)
  console.log(`  - programme ${TEMPLATE_CODE}, add-on ${ENTRANCE_CODE}, client ${CLIENT_EMAIL}`)
  console.log('\nDone.')
}

main().catch(err => {
  console.error('\n🛑', err.message)
  process.exit(1)
})
