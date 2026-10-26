#!/usr/bin/env node
// ============================================
// Reset a login's two-factor from the server
// ============================================
// For the case the app cannot handle itself: the only owner has lost their
// phone (an owner or administrator resets anyone else from Settings →
// Organization → Members). Removes every authenticator on the login with the
// given email; the next sign-in is password-only, or goes straight to setting
// up a new authenticator if the company requires two-factor.
//
//   node --env-file=.env.local scripts/reset-two-factor.mjs owner@example.com
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Asks before it
// deletes anything; --yes skips the question.

import { createClient } from '@supabase/supabase-js'
import readline from 'node:readline/promises'

const email = process.argv.slice(2).find(a => !a.startsWith('--'))
const yes = process.argv.includes('--yes')
if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/reset-two-factor.mjs <email> [--yes]')
  process.exit(2)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(2)
}
const admin = createClient(url, key, { auth: { persistSession: false } })

// Find the login by email (paged: listUsers returns a page at a time).
let user = null
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error(error.message); process.exit(1) }
  user = data.users.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null
  if (data.users.length < 200) break
}
if (!user) { console.error(`No login with email ${email}.`); process.exit(1) }

const { data: listed, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
if (listErr) { console.error(listErr.message); process.exit(1) }
const factors = listed?.factors ?? []
if (factors.length === 0) { console.log(`${email} has no two-factor devices. Nothing to do.`); process.exit(0) }

console.log(`${email} has ${factors.length} device(s): ${factors.map(f => f.friendly_name || f.id).join(', ')}`)
if (!yes) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Remove them all? [y/N] ')
  rl.close()
  if (!/^y(es)?$/i.test(answer.trim())) { console.log('Nothing changed.'); process.exit(0) }
}
for (const f of factors) {
  const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id })
  if (error) { console.error(`Failed on ${f.id}: ${error.message}`); process.exit(1) }
}
console.log(`Removed ${factors.length} device(s). ${email} signs in with the password next time.`)
