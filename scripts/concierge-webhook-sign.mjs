#!/usr/bin/env node
// ============================================
// Concierge webhook signing / dry-run CLI
// ============================================
// Signs a brief payload with the same scheme Autoura verifies and either
// prints a ready-to-run curl or POSTs it directly. Use --dry-run to confirm
// signing + mapping against a live endpoint without writing.
//
// Examples:
//   # Print headers + curl for the sample payload (no network):
//   node scripts/concierge-webhook-sign.mjs --secret whsec_xxx
//
//   # Dry-run against staging (verifies signature + previews mapping, no write):
//   node scripts/concierge-webhook-sign.mjs \
//     --secret whsec_xxx \
//     --url https://staging.example.com/api/webhooks/concierge \
//     --payload docs/concierge-integration/sample-brief.json \
//     --dry-run
//
//   # Real POST:
//   node scripts/concierge-webhook-sign.mjs --secret whsec_xxx --url <prod>/api/webhooks/concierge
//
//   # Self-check signing against Autoura's published GET test vector:
//   node scripts/concierge-webhook-sign.mjs --verify-test-vector
// ============================================

import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        args[key] = true
      } else {
        args[key] = next
        i++
      }
    }
  }
  return args
}

function sign(secret, timestamp, rawBody) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

// ---- self-check against the published GET test vector ----
function verifyTestVector() {
  const TEST_SECRET = 'whsec_test_concierge_autoura'
  const TEST_TIMESTAMP = 1735732800
  const TEST_BODY = '{"conversation_id":"test-conversation","brief_revision":1}'
  const expected = sign(TEST_SECRET, TEST_TIMESTAMP, TEST_BODY)
  const header = `t=${TEST_TIMESTAMP},v1=${expected}`
  console.log('Test vector signature header:')
  console.log(`  ${header}`)
  console.log('\nCompare this to the `test_vector.expected_signature_header` returned by')
  console.log('GET /api/webhooks/concierge. They must match byte-for-byte.')
}

const DEFAULT_SAMPLE = resolve(repoRoot, 'docs/concierge-integration/sample-brief.json')

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args['verify-test-vector']) {
    verifyTestVector()
    return
  }

  const secret = args.secret || process.env.CONCIERGE_WEBHOOK_SECRET
  if (!secret) {
    console.error('ERROR: provide --secret <value> or set CONCIERGE_WEBHOOK_SECRET')
    process.exit(1)
  }

  const payloadPath = args.payload ? resolve(process.cwd(), args.payload) : DEFAULT_SAMPLE
  let rawBody
  try {
    // Re-serialize compactly so the bytes are stable and reproducible.
    rawBody = JSON.stringify(JSON.parse(readFileSync(payloadPath, 'utf8')))
  } catch (e) {
    console.error(`ERROR: could not read/parse payload at ${payloadPath}: ${e.message}`)
    process.exit(1)
  }

  const timestamp = args.timestamp ? Number(args.timestamp) : Math.floor(Date.now() / 1000)
  const requestId = args['request-id'] || randomUUID()
  const signature = sign(secret, timestamp, rawBody)
  const sigHeader = `t=${timestamp},v1=${signature}`

  const headers = {
    'Content-Type': 'application/json',
    'X-Autoura-Signature': sigHeader,
    'X-Autoura-Timestamp': String(timestamp),
    'X-Request-Id': requestId,
  }
  if (args['dry-run']) headers['X-Autoura-Dry-Run'] = 'true'

  console.log('--- Signed request ---')
  console.log('payload   :', payloadPath)
  console.log('timestamp :', timestamp)
  console.log('request-id:', requestId)
  console.log('signature :', sigHeader)

  if (!args.url) {
    // Print a copy-paste curl.
    const headerFlags = Object.entries(headers).map(([k, v]) => `  -H '${k}: ${v}'`).join(' \\\n')
    console.log('\n--- curl (set --url to POST automatically) ---')
    console.log(`curl -X POST '<YOUR_ENDPOINT>/api/webhooks/concierge' \\\n${headerFlags} \\\n  -d '${rawBody}'`)
    return
  }

  console.log('\nPOST', args.url, args['dry-run'] ? '(dry-run)' : '')
  const res = await fetch(args.url, { method: 'POST', headers, body: rawBody })
  const text = await res.text()
  console.log('status:', res.status)
  try {
    console.log('body  :', JSON.stringify(JSON.parse(text), null, 2))
  } catch {
    console.log('body  :', text)
  }
  process.exit(res.ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
