#!/usr/bin/env node
// ============================================
// E2E smoke-harness seed (idempotent) / cleanup
// ============================================
// Creates the isolated fixtures the authed smoke suite (e2e/smoke.authed.spec.ts)
// asserts against:
//   - auth user  E2E_EMAIL (password E2E_PASSWORD, email pre-confirmed)
//   - organization "E2E Smoke Org" + owner membership  → org-scoped writes from
//     the suite can never touch the real operator org
//   - client  "Smoke Tester" (E2E-CLIENT-001) — NOTE: the clients table has no
//     org_id, so this row IS visible in the real clients list; it is named to
//     be unmistakably synthetic
//   - itinerary E2E-SMOKE-001 ("E2E Smoke Trip") + Day 1, in the E2E org
//
// Usage:
//   node scripts/seed-e2e.mjs             # create/ensure everything
//   node scripts/seed-e2e.mjs --cleanup   # remove everything it created
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ optional
// E2E_EMAIL/E2E_PASSWORD) from the environment or .env.local. If it has to
// invent credentials it APPENDS them to .env.local and prints them.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const ENV_PATH = path.join(ROOT, '.env.local')

const env = { ...process.env }
try {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!env[k]) env[k] = v
  }
} catch { /* env file optional when everything is in process.env */ }

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const ORG_NAME = 'E2E Smoke Org'
const ITIN_CODE = 'E2E-SMOKE-001'
const DEFAULT_EMAIL = 'e2e-smoke@travelops.test'

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

async function rest(method, pathname, body, extraHeaders = {}) {
  const res = await fetch(`${URL_}${pathname}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }
  if (!res.ok) {
    throw new Error(`${method} ${pathname} → ${res.status}: ${text.slice(0, 500)}`)
  }
  return json
}

const select = (table, query) => rest('GET', `/rest/v1/${table}?${query}`)
const insert = (table, row) =>
  rest('POST', `/rest/v1/${table}`, row, { Prefer: 'return=representation' })
const del = (table, query) => rest('DELETE', `/rest/v1/${table}?${query}`)

async function findAuthUser(email) {
  // GoTrue admin listUsers is paginated; the instance is tiny, one page is fine.
  const data = await rest('GET', '/auth/v1/admin/users?per_page=100')
  const users = data?.users ?? data ?? []
  return users.find((u) => u.email === email) ?? null
}

async function seed() {
  const email = env.E2E_EMAIL || DEFAULT_EMAIL
  let password = env.E2E_PASSWORD
  let generatedPassword = false
  if (!password) {
    password = crypto.randomBytes(18).toString('base64url')
    generatedPassword = true
  }

  // 1. Auth user
  let user = await findAuthUser(email)
  if (!user) {
    user = await rest('POST', '/auth/v1/admin/users', {
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: 'e2e-smoke-harness' },
    })
    console.log(`✓ auth user created: ${email}`)
  } else {
    console.log(`= auth user exists: ${email}`)
    if (generatedPassword) {
      // Existing user but no known password — reset it so the suite can log in.
      await rest('PUT', `/auth/v1/admin/users/${user.id}`, { password })
      console.log('  ↳ password reset (no E2E_PASSWORD was configured)')
    }
  }

  // 2. Organization
  let [org] = await select('organizations', `name=eq.${encodeURIComponent(ORG_NAME)}&select=id,name`)
  if (!org) {
    ;[org] = await insert('organizations', { name: ORG_NAME })
    console.log(`✓ organization created: ${ORG_NAME}`)
  } else {
    console.log(`= organization exists: ${ORG_NAME}`)
  }

  // 3. Membership (owner)
  const members = await select(
    'organization_members',
    `org_id=eq.${org.id}&user_id=eq.${user.id}&select=user_id`
  )
  if (!members.length) {
    await insert('organization_members', { org_id: org.id, user_id: user.id, role: 'owner' })
    console.log('✓ owner membership created')
  } else {
    console.log('= membership exists')
  }

  // 4. Client (global table — no org_id column; named to be obviously
  // synthetic). A DB trigger assigns client_code and a CHECK constrains
  // status (live rows use 'prospect'), so we key on email instead.
  let [client] = await select('clients', `email=eq.${encodeURIComponent(email)}&select=id`)
  if (!client) {
    ;[client] = await insert('clients', {
      first_name: 'Smoke',
      last_name: 'Tester',
      email,
      status: 'prospect',
    })
    console.log('✓ client created: Smoke Tester')
  } else {
    console.log('= client exists')
  }

  // 5. Itinerary in the E2E org (+ Day 1)
  let [itin] = await select('itineraries', `itinerary_code=eq.${ITIN_CODE}&select=id,org_id`)
  if (!itin) {
    const start = new Date()
    start.setDate(start.getDate() + 30)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const d = (x) => x.toISOString().split('T')[0]
    ;[itin] = await insert('itineraries', {
      itinerary_code: ITIN_CODE,
      org_id: org.id,
      client_name: 'Smoke Tester',
      client_email: email,
      trip_name: 'E2E Smoke Trip',
      start_date: d(start),
      end_date: d(end),
      total_days: 2,
      num_adults: 2,
      num_children: 0,
      currency: 'EUR',
      total_cost: 0,
      total_revenue: 0,
      margin_percent: 25,
      tier: 'standard',
      status: 'draft',
    })
    await insert('itinerary_days', {
      itinerary_id: itin.id,
      day_number: 1,
      date: d(start),
      title: 'E2E Smoke Trip — Day 1',
      city: 'Cairo',
      description: 'Synthetic seed row for the E2E smoke harness',
      attractions: [],
    })
    console.log(`✓ itinerary + day created: ${ITIN_CODE}`)
  } else {
    console.log('= itinerary exists')
  }

  // 6. Persist generated credentials
  if (generatedPassword) {
    fs.appendFileSync(
      ENV_PATH,
      `\n# E2E smoke harness (scripts/seed-e2e.mjs)\nE2E_EMAIL=${email}\nE2E_PASSWORD=${password}\n`
    )
    console.log(`✓ credentials appended to .env.local (E2E_EMAIL=${email})`)
  }

  console.log('\nSeed complete. Run the suite with: npm run test:e2e')
}

async function cleanup() {
  const email = env.E2E_EMAIL || DEFAULT_EMAIL
  const [itin] = await select('itineraries', `itinerary_code=eq.${ITIN_CODE}&select=id`)
  if (itin) {
    const days = await select('itinerary_days', `itinerary_id=eq.${itin.id}&select=id`)
    if (days.length) {
      await del('itinerary_services', `itinerary_day_id=in.(${days.map((d) => d.id).join(',')})`)
    }
    await del('itinerary_days', `itinerary_id=eq.${itin.id}`)
    await del('itineraries', `id=eq.${itin.id}`)
    console.log('✓ itinerary removed')
  }
  await del('clients', `email=eq.${encodeURIComponent(email)}`)
  console.log('✓ client removed')
  const [org] = await select('organizations', `name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  if (org) {
    await del('organization_members', `org_id=eq.${org.id}`)
    await del('organizations', `id=eq.${org.id}`)
    console.log('✓ organization removed')
  }
  const user = await findAuthUser(email)
  if (user) {
    await rest('DELETE', `/auth/v1/admin/users/${user.id}`)
    console.log(`✓ auth user removed: ${email}`)
  }
  console.log('\nCleanup complete. Remove E2E_EMAIL/E2E_PASSWORD from .env.local manually if present.')
}

const mode = process.argv.includes('--cleanup') ? cleanup : seed
mode().catch((err) => {
  console.error('\n✗ ' + err.message)
  process.exit(1)
})
