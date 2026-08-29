// ============================================
// Nobody else's company name in customer-facing output
// ============================================
// The operator's own identity — name, email, website, phone, and in one place a
// named employee — was a literal in 30 files: invoice reminders, booking
// confirmations, WhatsApp templates, contract PDFs, transport vouchers, the
// public tour page. 35 more sites read an environment variable but fell back to
// the literal, so an install that had not configured itself sent mail signed
// with another agency's name and pointed customers at their website.
//
// That was the blocker for a second install. This test is what stops it coming
// back: any new occurrence fails here, and the fix is to read the operator's
// own identity (lib/org-identity.ts, or useCompanyInfo() in the browser).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

// `t2e` is here because a monogram is identity as surely as a name is: two
// customer-facing PDF templates and the signup page drew a circle reading
// "T2E", which this pattern did not match while it only looked for the name
// spelled out. \b on both sides so it cannot fire on a random token.
const OPERATOR_PATTERNS = /travel2egypt|travel to egypt|ats-hj|\bt2e\b/i

/**
 * Occurrences that are correct and must not be "fixed".
 *
 * Deliberately specific — a whole-file exemption would let a real regression in
 * beside a legitimate mention. Each entry needs a reason.
 */
const ALLOWED: Array<{ file: string; reason: string }> = [
  {
    file: 'app/page.tsx',
    reason:
      'a marketing testimonial attributed to a real named person at that company. ' +
      'It is a quotation, not this application branding itself.',
  },
]

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (['.ts', '.tsx', '.mjs', '.js'].includes(extname(entry)) && !full.includes('__tests__')) {
        out.push(full)
      }
    }
  }
  for (const d of ['app', 'lib', 'components']) walk(join(process.cwd(), d))
  return out.map(f => f.replace(`${process.cwd()}/`, ''))
}

interface Hit {
  file: string
  line: number
  text: string
}

/** Occurrences in real output — comments explaining history are fine. */
function operatorLiterals(): Hit[] {
  const hits: Hit[] = []
  for (const file of sourceFiles()) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!OPERATOR_PATTERNS.test(line)) return
        const t = line.trim()
        // A comment naming the incident it documents is not output. `{/*` is
        // the JSX form of the same thing, and the templates that carried these
        // literals are exactly where the explanation belongs.
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) return
        hits.push({ file, line: i + 1, text: t.slice(0, 100) })
      })
  }
  return hits
}

describe('the operator’s identity is configuration, not source', () => {
  it('no customer-facing literal names a specific agency', () => {
    const allowedFiles = new Set(ALLOWED.map(a => a.file))
    const offenders = operatorLiterals().filter(h => !allowedFiles.has(h.file))
    expect(
      offenders.map(h => `${h.file}:${h.line}  ${h.text}`),
      'a second agency would ship these to their own customers — read the ' +
        'operator identity instead (lib/org-identity.ts, or useCompanyInfo() client-side)',
    ).toEqual([])
  })

  it('never falls back to a literal when an env var is unset', () => {
    // `process.env.BUSINESS_NAME || 'SomeAgency'` is the shape that made this
    // configurable in theory and wrong in practice.
    const bad: string[] = []
    for (const file of sourceFiles()) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/process\.env\.[A-Z_]+\s*\|\|\s*['"`]/.test(line)) return
          if (!OPERATOR_PATTERNS.test(line)) return
          bad.push(`${file}:${i + 1}`)
        })
    }
    expect(bad, 'blank beats fake — drop the fallback').toEqual([])
  })

  it('every allowance still applies, so the list cannot rot', () => {
    // An exemption for a file that no longer contains anything is an exemption
    // somebody will later reuse for something that does.
    for (const { file } of ALLOWED) {
      const stillThere = operatorLiterals().some(h => h.file === file)
      expect(stillThere, `${file} is on the allow-list but no longer matches`).toBe(true)
    }
  })

  it('the message catalogues carry no company name in any language', () => {
    // The 2026-08-29 clean-room install found the identity sweep had only ever
    // read .ts/.tsx. Twenty-three strings sat in messages/en.json and
    // messages/ja.json — including a PDF footer with the first operator's real
    // telephone number, printed on every agency's B2B quote in both languages,
    // for a customer to ring.
    //
    // A catalogue holds LANGUAGE. A company's name, phone number and tagline
    // are not translations of anything: they belong to the organization row,
    // and a template that needs one takes a {company} placeholder.
    const offenders: string[] = []
    for (const file of ['messages/en.json', 'messages/ja.json']) {
      const walk = (node: unknown, path: string[]) => {
        if (node && typeof node === 'object') {
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, [...path, k])
        } else if (typeof node === 'string' && OPERATOR_PATTERNS.test(node)) {
          offenders.push(`${file} ${path.join('.')} = ${JSON.stringify(node).slice(0, 80)}`)
        }
      }
      walk(JSON.parse(readFileSync(join(process.cwd(), file), 'utf8')), [])
    }
    expect(
      offenders,
      'pass the operator’s own name in as {company}, or take it from the ' +
        'organization row — a catalogue is for language, not for whose company this is',
    ).toEqual([])
  })

  it('the identity accessor exists and refuses to invent a name', () => {
    const src = readFileSync(join(process.cwd(), 'lib/org-identity.ts'), 'utf8')
    expect(src).toContain('export function businessIdentity')
    expect(src).toContain('export async function orgIdentity')
    // Blank beats fake — the same rule lib/org-name.ts already applies.
    expect(src).toContain('customerFacingOrgName')
  })
})
