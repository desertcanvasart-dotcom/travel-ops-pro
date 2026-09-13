// ============================================
// The licence — RUNTIME CORE
// ============================================
// T6 (P1) of docs/plans/self-hosting.md. A self-hosted install carries ONE
// string, LICENSE_KEY, that names the company it is licensed to:
//
//   AUT1.<base64url JSON payload>.<base64url Ed25519 signature>
//
// The payload is readable by anyone — nothing in it is secret; its authority
// is the signature, made with a private key only Autoura holds. The matching
// public keys ship in source (public-keys.mjs, by `kid`), so the app verifies
// a licence with NO network: on day one, and during every outage.
//
// Plain JavaScript on purpose, mirroring lib/support/bundle-core.mjs: the
// same verifier runs inside the Next app (TypeScript), in scripts/doctor.mjs
// and in scripts/mint-licence.mjs, which are bare node scripts.
//
// EVERYTHING HERE IS PURE AND NEVER THROWS. A bad, expired or missing
// licence is a STATUS the app shows, not a crash — the one rule of the whole
// design is "degrade, never brick": an operations team locked out on a
// Monday morning is a lost customer and a legal problem.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { PUBLIC_KEYS } from './public-keys.mjs'

export const LICENCE_FORMAT = 'AUT1'

/** What a licence can be, and what the app does about each:
 *    valid   — signature good, in date.               Nothing to show.
 *    grace   — past valid_until by < grace_days.      Owner/admin banner (P2).
 *    expired — beyond grace.                          All-staff banner (P2); updates refused (P4).
 *    invalid — malformed, unknown key, bad signature. As missing, and doctor says which.
 *    missing — no LICENSE_KEY at all.                 "Unlicensed evaluation".
 *  Operations keep working in every one of them. */
export const LICENCE_STATUSES = ['valid', 'grace', 'expired', 'invalid', 'missing']

/** The payload's fields, all required. No customer data, no secrets:
 *  everything here may appear in Settings, the support bundle and a PDF footer. */
export const PAYLOAD_FIELDS = ['lid', 'licensee', 'org_key', 'domains', 'seats', 'features', 'issued', 'valid_until', 'grace_days', 'kid']

const DAY_MS = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const b64url = {
  encode: (data) => Buffer.from(data).toString('base64url'),
  decode: (text) => Buffer.from(text, 'base64url'),
}

/** The instant a licence stops being valid: the END of its valid_until day,
 *  UTC — a licence "until 14 Sep" is good all of 14 Sep everywhere. */
function expiryOf(validUntil) {
  const [y, m, d] = validUntil.split('-').map(Number)
  return Date.UTC(y, m - 1, d + 1)
}

/** Why a payload is not a licence payload, or null when it is one. */
export function payloadProblem(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'payload is not an object'
  const missing = PAYLOAD_FIELDS.filter(k => payload[k] === undefined || payload[k] === null || payload[k] === '')
  if (missing.length) return `payload lacks ${missing.join(', ')}`
  if (typeof payload.lid !== 'string' || typeof payload.licensee !== 'string' || typeof payload.org_key !== 'string' || typeof payload.kid !== 'string') {
    return 'lid, licensee, org_key and kid must be strings'
  }
  if (!Array.isArray(payload.domains) || !payload.domains.every(d => typeof d === 'string' && d)) return 'domains must be a list of hostnames'
  if (!Array.isArray(payload.features) || !payload.features.every(f => typeof f === 'string' && f)) return 'features must be a list'
  if (!Number.isInteger(payload.seats) || payload.seats < 0) return 'seats must be a whole number'
  if (!Number.isInteger(payload.grace_days) || payload.grace_days < 0) return 'grace_days must be a whole number'
  if (!ISO_DATE.test(payload.issued) || !ISO_DATE.test(payload.valid_until)) return 'issued and valid_until must be YYYY-MM-DD'
  if (Number.isNaN(expiryOf(payload.valid_until))) return 'valid_until is not a date'
  return null
}

/** Split a token into its parts, or say why it cannot be. Does NOT check
 *  the signature — that is verifyLicence's job. */
export function parseLicence(token) {
  if (typeof token !== 'string') return { error: 'not a string' }
  const parts = token.trim().split('.')
  if (parts.length !== 3) return { error: 'expected three dot-separated parts' }
  const [format, payloadB64, signatureB64] = parts
  if (format !== LICENCE_FORMAT) return { error: `unknown format "${format}"` }
  let payload
  try {
    payload = JSON.parse(b64url.decode(payloadB64).toString('utf8'))
  } catch {
    return { error: 'payload is not base64url JSON' }
  }
  const problem = payloadProblem(payload)
  if (problem) return { error: problem }
  const signature = b64url.decode(signatureB64)
  if (signature.length !== 64) return { error: 'signature is not 64 bytes' }
  return { payload, signedPart: `${format}.${payloadB64}`, signature }
}

const invalid = (reason) => ({ status: 'invalid', licence: null, reason, daysLeft: null })

/**
 * Verify a licence token. Never throws.
 *
 * `now` is injectable so the grace and expiry edges are testable; `publicKeys`
 * is injectable so tests sign with a throwaway key and never need the real
 * private key.
 */
export function verifyLicence(token, now = new Date(), publicKeys = PUBLIC_KEYS) {
  if (token === undefined || token === null || String(token).trim() === '') {
    return { status: 'missing', licence: null, reason: 'No LICENSE_KEY is set — this install runs as an unlicensed evaluation.', daysLeft: null }
  }
  const parsed = parseLicence(token)
  if (parsed.error) return invalid(`The licence key is malformed: ${parsed.error}.`)
  const { payload, signedPart, signature } = parsed

  const pem = publicKeys[payload.kid]
  if (!pem) return invalid(`The licence was signed with key "${payload.kid}", which this build does not know — an upgrade may carry it.`)
  let ok = false
  try {
    ok = cryptoVerify(null, Buffer.from(signedPart, 'utf8'), createPublicKey(pem), signature)
  } catch {
    ok = false
  }
  if (!ok) return invalid('The licence signature does not verify — the key was altered, or was not issued by Autoura.')

  const expiry = expiryOf(payload.valid_until)
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  // Whole days left, counted so the last valid day reads as 1, the first
  // day past as 0, and beyond that negative — "days since expiry".
  const daysLeft = Math.ceil((expiry - nowMs) / DAY_MS)
  if (nowMs < expiry) {
    return { status: 'valid', licence: payload, reason: `Licensed to ${payload.licensee} until ${payload.valid_until}.`, daysLeft }
  }
  const daysOver = -daysLeft
  if (daysOver < payload.grace_days) {
    const left = payload.grace_days - daysOver
    return { status: 'grace', licence: payload, reason: `The licence for ${payload.licensee} expired on ${payload.valid_until}; ${left} day${left === 1 ? '' : 's'} of grace remain.`, daysLeft }
  }
  return { status: 'expired', licence: payload, reason: `The licence for ${payload.licensee} expired on ${payload.valid_until}, beyond its ${payload.grace_days}-day grace.`, daysLeft }
}

/** One line for a boot log or doctor: "valid — Licensed to … until …". */
export function licenceSummary(result) {
  return `${result.status} — ${result.reason}`
}

// ---- Minting (scripts/mint-licence.mjs, and the tests) ----------------------

/** Sign a payload into a token. Throws on a malformed payload — minting is
 *  an operator action where a loud failure is the right one. */
export function mintLicence(payload, privateKeyPem) {
  const problem = payloadProblem(payload)
  if (problem) throw new Error(`cannot mint: ${problem}`)
  const ordered = Object.fromEntries(PAYLOAD_FIELDS.map(k => [k, payload[k]]))
  const signedPart = `${LICENCE_FORMAT}.${b64url.encode(JSON.stringify(ordered))}`
  const signature = cryptoSign(null, Buffer.from(signedPart, 'utf8'), createPrivateKey(privateKeyPem))
  return `${signedPart}.${b64url.encode(signature)}`
}

/** A fresh Ed25519 signing pair as PEM. The private half is written to a
 *  file by the mint script and never printed; the public half goes into
 *  public-keys.mjs under its kid. */
export function generateSigningKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}
