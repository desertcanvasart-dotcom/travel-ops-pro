// Three production 500s from the same family of defect: a query whose shape is
// only checked by Postgres or Google at runtime, so nothing in tsc, the build
// or the tests could see it. Railway's logs on 2026-09-19 carried all three.
//
//   1. /api/gmail/actions read gmail_tokens itself and handed Google the
//      ENCRYPTED refresh token — "Email action error: Error: invalid_grant".
//      Deleting an email answered "Internal server error" while the listing,
//      which goes through getAuthenticatedGmail, worked.
//   2. /api/email/links selected `clients.name`, a column that does not exist
//      — 42703, which fails the WHOLE query, so linking an email to a client
//      and auto-matching by sender address never worked at all.
//   3. /api/resources/hotel-staff embedded hotel_contacts with no foreign key
//      to travel — PGRST200, which also fails the whole query.
//
// Each is pinned here at the source level, because that is the only place the
// shape is visible before it reaches a server.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** Source with comments removed — a comment DESCRIBING a bug must not trip a scan. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

const SOURCES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]
  .map(f => path.relative(ROOT, f))

describe('Gmail tokens are decrypted before they reach Google', () => {
  // gmail_tokens stores access_token and refresh_token ENCRYPTED. Anything
  // that uses the token material has to decrypt it, and lib/gmail.ts's
  // getAuthenticatedGmail is the one place that does — routes go through it.
  // Reading the row for its `email`, `user_id` or `token_expiry` is fine and
  // is why this checks for token USE rather than for the table.
  const readers = SOURCES.filter(file => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    if (!code.includes("from('gmail_tokens')")) return false
    return /\b(access_token|refresh_token)\b/.test(code)
  })

  it('finds the files that use token material', () => {
    // A guard that matches nothing guards nothing.
    expect(readers.length).toBeGreaterThan(0)
  })

  it.each(readers)('%s decrypts or encrypts what it touches', file => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    expect(
      /\b(decryptToken|encryptToken)\b/.test(code),
      `${file} reads gmail_tokens' token columns without going through the cipher — ` +
        'Google answers invalid_grant on ciphertext. Use getAuthenticatedGmail().'
    ).toBe(true)
  })
})

describe('no query selects a `name` column from clients', () => {
  // clients holds first_name / last_name. `name` is composed for display.
  const BARE_NAME = /(^|[\s(,])name([\s,)]|$)/

  it.each(SOURCES)('%s', file => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))

    // Embedded: `client:clients(id, name, ...)` / `clients (name)`
    for (const match of code.matchAll(/\bclients\s*\(([^)]*)\)/g)) {
      expect(
        BARE_NAME.test(match[1]),
        `${file} embeds clients(${match[1].trim()}) — clients has no \`name\` column ` +
          '(42703 fails the whole query). Select first_name, last_name.'
      ).toBe(false)
    }

    // Direct: .from('clients') followed by a .select('…name…')
    for (const match of code.matchAll(/\.from\('clients'\)([\s\S]{0,400}?)\.select\(\s*'([^']*)'/g)) {
      expect(
        BARE_NAME.test(match[2]),
        `${file} selects '${match[2]}' from clients — there is no \`name\` column.`
      ).toBe(false)
    }
  })
})

describe('hotel_staff carries no hotel relationship to embed', () => {
  // hotel_staff has no hotel_id and no FK to hotel_contacts. An embed with no
  // relationship is PGRST200, and PostgREST fails the whole query for it.
  it.each(SOURCES)('%s', file => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    if (!code.includes("from('hotel_staff')")) return
    expect(
      /hotel_contacts\s*\(/.test(code),
      `${file} embeds hotel_contacts on hotel_staff — there is no foreign key between them.`
    ).toBe(false)
  })
})
