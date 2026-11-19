#!/usr/bin/env node
// ============================================
// Copy WhatsApp files already received into our own storage
// ============================================
// Before migration 20270121 an incoming WhatsApp file was only a link to
// Twilio. New files are copied by the webhook (lib/whatsapp/keep-inbound-media);
// this copies the ones received before, so they keep opening if the Twilio
// account or its media go.
//
//   node scripts/keep-whatsapp-media.mjs                  # dry run: what would be copied
//   node scripts/keep-whatsapp-media.mjs --apply          # copy them
//   node scripts/keep-whatsapp-media.mjs --org <uuid>     # one company only (with or without --apply)
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID
// and TWILIO_AUTH_TOKEN from the environment, else from .env.local.
//
// Safety: a dry run unless --apply. Only our own Twilio account's media links
// are fetched. A file goes to inbound/<org>/<sid>.<ext> in the PRIVATE
// whatsapp-media bucket (created private if missing), and a row is only
// pointed at it while it still has no copy. The Twilio link stays on the row.
// Re-running copies only what is still missing. Needs migration 20270121.
// The path rule is lib/whatsapp/media-storage.ts's (pinned by a test).
// ============================================
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MEDIA_BUCKET = 'whatsapp-media'
const SAFE = /[^a-zA-Z0-9_-]/g

/** Same as lib/whatsapp/media-storage.ts inboundFilePath. */
export function inboundFilePath(orgId, messageSid, ext) {
  return `inbound/${orgId.replace(SAFE, '_')}/${messageSid.replace(SAFE, '_')}.${String(ext).replace(/[^a-z0-9]/g, '') || 'bin'}`
}

/** Same as lib/whatsapp/media-storage.ts isOwnTwilioMediaUrl. */
export function isOwnTwilioMediaUrl(url, accountSid) {
  if (!url || !accountSid || !/^AC[a-f0-9]{32}$/i.test(accountSid)) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'api.twilio.com' &&
      new RegExp(`^/2010-04-01/Accounts/${accountSid}/Messages/MM[a-f0-9]{32}/Media/ME[a-f0-9]{32}$`, 'i').test(u.pathname)
  } catch {
    return false
  }
}

/** The extensions of lib/whatsapp/attachments.ts FILE_TYPES. */
const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/mp4': 'm4a',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt', 'text/csv': 'csv',
}
export const bareMime = (m) => String(m ?? '').split(';')[0].trim().toLowerCase()
export const extFor = (m) => EXT[bareMime(m)] ?? 'bin'

function loadEnv() {
  let file = {}
  try {
    file = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
  } catch { /* no .env.local: the environment only */ }
  const get = k => process.env[k] || file[k]
  return {
    url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY'),
    sid: get('TWILIO_ACCOUNT_SID'), token: get('TWILIO_AUTH_TOKEN'),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const orgAt = args.indexOf('--org')
  const onlyOrg = orgAt >= 0 ? args[orgAt + 1] : null
  const env = loadEnv()
  for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: env.url, SUPABASE_SERVICE_ROLE_KEY: env.key, TWILIO_ACCOUNT_SID: env.sid, TWILIO_AUTH_TOKEN: env.token })) {
    if (!v) { console.error(`Missing ${k}.`); process.exit(1) }
  }
  const H = { apikey: env.key, Authorization: `Bearer ${env.key}` }

  // Files still only at Twilio, with their conversation's company.
  const q = new URLSearchParams({
    select: 'id,message_sid,media_url,media_type,whatsapp_conversations!inner(org_id)',
    media_storage_path: 'is.null',
    media_url: 'like.https://api.twilio.com/*',
    order: 'sent_at.asc',
    limit: '5000',
  })
  if (onlyOrg) q.set('whatsapp_conversations.org_id', `eq.${onlyOrg}`)
  const res = await fetch(`${env.url}/rest/v1/whatsapp_messages?${q}`, { headers: H })
  if (!res.ok) {
    console.error(`Could not read the messages (${res.status}): ${await res.text()}`)
    console.error('Has migration 20270121 been applied?')
    process.exit(1)
  }
  const rows = (await res.json()).filter(r => r.message_sid && isOwnTwilioMediaUrl(r.media_url, env.sid))
  const byOrg = {}
  for (const r of rows) byOrg[r.whatsapp_conversations.org_id] = (byOrg[r.whatsapp_conversations.org_id] ?? 0) + 1
  console.log(`${rows.length} file(s) are only at Twilio:`, byOrg)
  if (!apply) { console.log('Dry run. Add --apply to copy them.'); return }

  let copied = 0, failed = 0
  let bucketChecked = false
  for (const r of rows) {
    const org = r.whatsapp_conversations.org_id
    try {
      const file = await fetch(r.media_url, {
        headers: { Authorization: `Basic ${Buffer.from(`${env.sid}:${env.token}`).toString('base64')}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(60_000),
      })
      if (!file.ok) throw new Error(`Twilio answered ${file.status}`)
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength === 0) throw new Error('empty file')
      const mime = bareMime(file.headers.get('content-type')) || bareMime(r.media_type) || 'application/octet-stream'
      const path = inboundFilePath(org, r.message_sid, extFor(mime))
      const upload = () => fetch(`${env.url}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
        method: 'POST', headers: { ...H, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes,
      })
      let up = await upload()
      if (!up.ok && !bucketChecked && /not.*found/i.test(await up.clone().text())) {
        // The bucket, PRIVATE, the first time (lib/whatsapp/media-storage).
        await fetch(`${env.url}/storage/v1/bucket`, {
          method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: MEDIA_BUCKET, name: MEDIA_BUCKET, public: false }),
        })
        bucketChecked = true
        up = await upload()
      }
      if (!up.ok) throw new Error(`storage ${up.status}: ${await up.text()}`)
      const patch = await fetch(`${env.url}/rest/v1/whatsapp_messages?id=eq.${r.id}&media_storage_path=is.null`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ media_storage_path: path }),
      })
      if (!patch.ok) throw new Error(`saving the path ${patch.status}`)
      copied++
    } catch (e) {
      failed++
      console.error(`  ${r.message_sid}: ${e.message}`)
    }
  }
  console.log(`Copied ${copied}, failed ${failed}. Re-run to retry the failures.`)
  if (failed) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
