// ============================================
// Re-encrypt existing plaintext OAuth tokens
// ============================================
// Optional one-shot. The app reads plaintext and ciphertext transparently
// (lib/crypto/token-cipher decrypts both), and a plaintext row re-encrypts
// itself on its next token refresh — so this script is a convenience, not a
// prerequisite. On production today there is a single gmail_tokens row.
//
// Run with the ENCRYPTION_KEY and Supabase service-role env set:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ENCRYPTION_KEY=... \
//     node scripts/reencrypt-oauth-tokens.mjs
//
// Idempotent: a row already in `v1:` form is skipped.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ENV_PATH = path.join(process.cwd(), '.env.local')
const env = { ...process.env }
try {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i < 0 || line.trim().startsWith('#')) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!env[k]) env[k] = v
  }
} catch { /* .env.local optional */ }

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const EK = env.ENCRYPTION_KEY
if (!URL_ || !KEY || !EK) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ENCRYPTION_KEY')
  process.exit(1)
}

let keyBuf = Buffer.from(EK, 'base64')
if (keyBuf.length !== 32) keyBuf = crypto.createHash('sha256').update(EK).digest()

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext ?? null
  if (String(plaintext).startsWith('v1:')) return plaintext // already encrypted
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', keyBuf, iv)
  const enc = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()])
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`
}

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function reencrypt(table) {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=id,access_token,refresh_token`, { headers: h })
  const rows = await res.json()
  if (!Array.isArray(rows)) { console.log(`${table}: ${JSON.stringify(rows).slice(0, 120)}`); return }
  let changed = 0
  for (const r of rows) {
    const at = encrypt(r.access_token)
    const rt = encrypt(r.refresh_token)
    if (at === r.access_token && rt === r.refresh_token) continue
    const u = await fetch(`${URL_}/rest/v1/${table}?id=eq.${r.id}`, {
      method: 'PATCH', headers: h, body: JSON.stringify({ access_token: at, refresh_token: rt }),
    })
    if (!u.ok) { console.error(`  ${table}/${r.id}: ${u.status} ${await u.text()}`); continue }
    changed++
  }
  console.log(`${table}: ${rows.length} rows, ${changed} re-encrypted`)
}

await reencrypt('gmail_tokens')
await reencrypt('accounting_tokens')
console.log('Done.')
