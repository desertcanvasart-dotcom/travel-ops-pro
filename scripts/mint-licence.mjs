#!/usr/bin/env node
// ============================================
// Autoura licence tooling — keygen, mint, inspect
// ============================================
// T6 (P1) of docs/plans/self-hosting.md. Run by AUTOURA, on a laptop, never on
// a server. The customer only ever receives the minted LICENSE_KEY.
//
//   keygen   — a new Ed25519 signing pair. The PRIVATE key is written to the
//              file you name (mode 0600) and never printed; the PUBLIC key is
//              added to lib/licence/public-keys.mjs under its kid, ready to
//              commit. Keep the private key in the password manager, two
//              copies, one printed in the safe: lose it and no licence can be
//              minted under that kid again (rotate: keygen a new kid).
//   mint     — sign a licence for one company.
//   inspect  — what the app would make of a token (same verifier).
//
// Usage:
//   node scripts/mint-licence.mjs keygen --kid 2026-09 --out ~/autoura-licence-2026-09.pem
//   node scripts/mint-licence.mjs mint --key ~/autoura-licence-2026-09.pem --kid 2026-09 \
//        --lid L-2026-0001 --licensee "A.T.S Happy Journey Co., Ltd." --org-key ats-hj \
//        --domains ops.ats-hj.com --seats 25 --features updates,ai \
//        --valid-until 2027-09-14 [--issued 2026-09-15] [--grace-days 30]
//   node scripts/mint-licence.mjs inspect <token>
//
// The verifier is lib/licence/verify-core.mjs — the same code the app and
// doctor run — so "inspect" here is exactly what the customer's Settings
// card will say.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSigningKeyPair, licenceSummary, mintLicence, verifyLicence } from '../lib/licence/verify-core.mjs'
import { PUBLIC_KEYS } from '../lib/licence/public-keys.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_KEYS_FILE = path.join(ROOT, 'lib', 'licence', 'public-keys.mjs')

const argv = process.argv.slice(2)
const command = argv[0]
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (argv[i + 1] ?? fallback)
}
const need = (name) => {
  const v = opt(name)
  if (v === null || v === '') fail(`--${name} is required`)
  return v
}
function fail(message) {
  console.error(`mint-licence: ${message}`)
  process.exit(1)
}

const KID = /^[a-z0-9][a-z0-9-]{0,31}$/

function keygen() {
  const kid = need('kid')
  const out = need('out')
  if (!KID.test(kid)) fail('--kid must be a short slug, e.g. 2026-09')
  if (PUBLIC_KEYS[kid]) fail(`kid "${kid}" already exists in lib/licence/public-keys.mjs — pick a new one; keys are never replaced`)
  const outPath = path.resolve(out.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
  if (existsSync(outPath)) fail(`${outPath} already exists — refusing to overwrite a signing key`)

  const { privateKeyPem, publicKeyPem } = generateSigningKeyPair()
  writeFileSync(outPath, privateKeyPem, { mode: 0o600 })

  // Add the public key under its kid, as a template literal so the PEM's
  // line breaks survive, just before the closing brace of PUBLIC_KEYS.
  const source = readFileSync(PUBLIC_KEYS_FILE, 'utf8')
  const marker = 'export const PUBLIC_KEYS = {\n'
  if (!source.includes(marker)) fail(`cannot find PUBLIC_KEYS in ${PUBLIC_KEYS_FILE}`)
  const entry = `  '${kid}': \`${publicKeyPem.trim()}\`,\n`
  writeFileSync(PUBLIC_KEYS_FILE, source.replace(marker, marker + entry))

  console.log(`private key written to ${outPath} (mode 0600) — store it in the password manager; it is not printed here`)
  console.log(`public key added to lib/licence/public-keys.mjs as kid "${kid}" — commit that file`)
}

function mint() {
  const keyFile = path.resolve(need('key').replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
  if (!existsSync(keyFile)) fail(`private key not found: ${keyFile}`)
  const privateKeyPem = readFileSync(keyFile, 'utf8')
  const kid = need('kid')
  if (!PUBLIC_KEYS[kid]) fail(`kid "${kid}" is not in lib/licence/public-keys.mjs — the app could not verify what this mints`)

  const today = new Date().toISOString().slice(0, 10)
  const payload = {
    lid: need('lid'),
    licensee: need('licensee'),
    org_key: need('org-key'),
    domains: need('domains').split(',').map(s => s.trim()).filter(Boolean),
    seats: Number(opt('seats', '25')),
    features: opt('features', 'updates').split(',').map(s => s.trim()).filter(Boolean),
    issued: opt('issued', today),
    valid_until: need('valid-until'),
    grace_days: Number(opt('grace-days', '30')),
    kid,
  }

  let token
  try {
    token = mintLicence(payload, privateKeyPem)
  } catch (e) {
    fail(e.message)
  }
  // Prove it with the SAME verifier the app runs, against the committed public key.
  const check = verifyLicence(token, new Date(), PUBLIC_KEYS)
  if (check.status !== 'valid') fail(`minted a token the app would not accept: ${licenceSummary(check)}`)

  console.log(`# ${payload.licensee} · ${payload.lid} · ${payload.domains.join(', ')} · until ${payload.valid_until}`)
  console.log(`LICENSE_KEY=${token}`)
}

function inspect() {
  const token = argv[1] ?? process.env.LICENSE_KEY
  if (!token) fail('inspect needs a token argument (or LICENSE_KEY in the environment)')
  const result = verifyLicence(token, new Date(), PUBLIC_KEYS)
  console.log(licenceSummary(result))
  if (result.licence) console.log(JSON.stringify(result.licence, null, 2))
  process.exit(result.status === 'valid' || result.status === 'grace' ? 0 : 2)
}

switch (command) {
  case 'keygen': keygen(); break
  case 'mint': mint(); break
  case 'inspect': inspect(); break
  default:
    console.error('usage: node scripts/mint-licence.mjs keygen|mint|inspect … (see the header of this file)')
    process.exit(1)
}
