// The licence verifier — pure, never throws, and the app starts whatever it says.
//
// T6 (P1) of docs/plans/self-hosting.md. Fixtures are signed here with a
// THROWAWAY Ed25519 pair made at test time: the real private key is never in
// the repo, and these tests must not need it.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  LICENCE_STATUSES, PAYLOAD_FIELDS, generateSigningKeyPair, licenceSummary, mintLicence, parseLicence, verifyLicence,
} from '@/lib/licence/verify-core.mjs'
import { getLicence, licenceIsCurrent, resetLicenceCache } from '@/lib/licence'

const { privateKeyPem, publicKeyPem } = generateSigningKeyPair()
const other = generateSigningKeyPair()
const KEYS = { '2026-09': publicKeyPem }

const payload = {
  lid: 'L-2026-0014',
  licensee: 'A.T.S Happy Journey Co., Ltd.',
  org_key: 'ats-hj',
  domains: ['ops.ats-hj.com'],
  seats: 25,
  features: ['updates', 'ai'],
  issued: '2026-09-15',
  valid_until: '2027-09-14',
  grace_days: 30,
  kid: '2026-09',
}
const token = mintLicence(payload, privateKeyPem)
const at = (iso: string) => new Date(iso)

describe('a valid licence', () => {
  it('verifies, carries its payload, and counts the days left', () => {
    const r = verifyLicence(token, at('2026-09-16T10:00:00Z'), KEYS)
    expect(r.status).toBe('valid')
    expect(r.licence).toEqual(payload)
    expect(r.daysLeft).toBe(364) // through the whole of 14 Sep 2027
    expect(r.reason).toBe('Licensed to A.T.S Happy Journey Co., Ltd. until 2027-09-14.')
  })
  it('is good for the whole of its last day, everywhere', () => {
    expect(verifyLicence(token, at('2027-09-14T23:59:59Z'), KEYS)).toMatchObject({ status: 'valid', daysLeft: 1 })
    expect(verifyLicence(token, at('2027-09-15T00:00:00Z'), KEYS)).toMatchObject({ status: 'grace', daysLeft: 0 })
  })
  it('the token is stable and readable: format, base64url JSON, 64-byte signature', () => {
    expect(token.startsWith('AUT1.')).toBe(true)
    const parsed = parseLicence(token)
    if (!('signature' in parsed)) throw new Error(parsed.error)
    expect(parsed.payload).toEqual(payload)
    expect(parsed.signature.length).toBe(64)
  })
})

describe('grace and expiry', () => {
  it('inside grace → grace, with the days remaining in the sentence', () => {
    const r = verifyLicence(token, at('2027-09-20T12:00:00Z'), KEYS)
    expect(r.status).toBe('grace')
    expect(r.daysLeft).toBe(-5)
    expect(r.reason).toMatch(/expired on 2027-09-14; 25 days of grace remain/)
  })
  it('the last day of grace is still grace; the day after is expired', () => {
    expect(verifyLicence(token, at('2027-10-14T12:00:00Z'), KEYS).status).toBe('grace')   // 29 days over
    expect(verifyLicence(token, at('2027-10-15T12:00:00Z'), KEYS).status).toBe('expired') // 30 days over
  })
  it('expired keeps the payload — Settings still names the licensee', () => {
    const r = verifyLicence(token, at('2028-01-01T00:00:00Z'), KEYS)
    expect(r.status).toBe('expired')
    expect(r.licence?.licensee).toBe(payload.licensee)
    expect(r.reason).toMatch(/beyond its 30-day grace/)
  })
})

describe('what cannot pass — and never throws', () => {
  it('missing: empty, blank or undefined', () => {
    for (const t of [undefined, null, '', '   ']) {
      expect(verifyLicence(t, new Date(), KEYS)).toMatchObject({ status: 'missing', licence: null, daysLeft: null })
    }
  })
  it('a tampered payload fails the signature', () => {
    const [f, , s] = token.split('.')
    const edited = { ...payload, seats: 250 }
    const forged = `${f}.${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${s}`
    const r = verifyLicence(forged, new Date(), KEYS)
    expect(r.status).toBe('invalid')
    expect(r.reason).toMatch(/signature does not verify/)
    expect(r.licence).toBeNull()
  })
  it('signed with a key we do not hold', () => {
    const forged = mintLicence(payload, other.privateKeyPem)
    expect(verifyLicence(forged, new Date(), KEYS).reason).toMatch(/signature does not verify/)
  })
  it('an unknown kid is named, so an upgrade can carry the key', () => {
    const r = verifyLicence(mintLicence({ ...payload, kid: '2031-01' }, privateKeyPem), new Date(), KEYS)
    expect(r.status).toBe('invalid')
    expect(r.reason).toMatch(/key "2031-01", which this build does not know/)
  })
  it('malformed tokens are invalid with a specific reason', () => {
    expect(verifyLicence('nonsense', new Date(), KEYS).reason).toMatch(/three dot-separated parts/)
    expect(verifyLicence('AUT9.abc.def', new Date(), KEYS).reason).toMatch(/unknown format "AUT9"/)
    expect(verifyLicence('AUT1.!!!.def', new Date(), KEYS).reason).toMatch(/not base64url JSON/)
    const noLid = `AUT1.${Buffer.from(JSON.stringify({ ...payload, lid: undefined })).toString('base64url')}.${'A'.repeat(86)}`
    expect(verifyLicence(noLid, new Date(), KEYS).reason).toMatch(/payload lacks lid/)
    expect(verifyLicence(token.slice(0, -10), new Date(), KEYS).reason).toMatch(/signature is not 64 bytes/)
    expect(verifyLicence(12345, new Date(), KEYS).reason).toMatch(/not a string/)
  })
  it('an empty public-key map (before the first keygen) makes every token invalid, never a crash', () => {
    expect(verifyLicence(token, new Date(), {}).status).toBe('invalid')
  })
  it('minting refuses a malformed payload loudly — that is an operator action', () => {
    expect(() => mintLicence({ ...payload, valid_until: '14/09/2027' }, privateKeyPem)).toThrow(/YYYY-MM-DD/)
    expect(() => mintLicence({ ...payload, domains: [] as unknown as string[], seats: -1 }, privateKeyPem)).toThrow(/seats/)
  })
  it('every status the design names exists, and the payload fields are the contract', () => {
    expect([...LICENCE_STATUSES].sort()).toEqual(['expired', 'grace', 'invalid', 'missing', 'valid'])
    expect([...PAYLOAD_FIELDS]).toEqual(['lid', 'licensee', 'org_key', 'domains', 'seats', 'features', 'issued', 'valid_until', 'grace_days', 'kid'])
  })
})

describe('the boot singleton', () => {
  beforeEach(() => { resetLicenceCache(); delete process.env.LICENSE_KEY })
  it('reads LICENSE_KEY once and caches; missing is the evaluation state', () => {
    expect(getLicence().status).toBe('missing')
    expect(licenceIsCurrent()).toBe(false)
    process.env.LICENSE_KEY = 'AUT1.x.y'
    expect(getLicence().status).toBe('missing') // cached — a process reads its key once
    resetLicenceCache()
    expect(getLicence().status).toBe('invalid')
    expect(licenceSummary(getLicence())).toMatch(/^invalid — /)
  })
})
