// ============================================
// Every rate write names who did it
// ============================================
// The rate-change digest tells the team what changed and WHO changed it. The
// attribution chain is: middleware verifies the user → lib/supabase-actor
// sends x-tops-actor → fn_rate_audit_actor() records it. It only works if
// the write goes through the actor-attributed client — and a family of
// routes built their own raw service-role client instead, so 400+ audit rows
// landed as changed_by NULL and the digest told the whole team an "unknown
// user / 不明なユーザー" was editing prices (audit AUT-H04).
//
// This scan pins the rule: a file that WRITES an audited rate table must get
// its client from lib/supabase-server (or lib/supabase-actor directly). A
// read-only file may use whatever it likes — reads are not audited.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RATE_TABLES } from '@/lib/rate-change-digest'

const AUDITED = Object.keys(RATE_TABLES)

/** `.from('<audited>')` … with an .insert/.update/.upsert/.delete anywhere in
 *  the file. Coarse on purpose: a false positive is a one-line import swap,
 *  a false negative is another month of "unknown user". */
function writesAuditedTable(src: string): boolean {
  if (!/\.(insert|update|upsert|delete)\(/.test(src)) return false
  return AUDITED.some(t => src.includes(`from('${t}')`))
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('rate-table writes are actor-attributed', () => {
  it('every app/ file that writes an audited table uses the actor client', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(process.cwd(), 'app'))) {
      const src = readFileSync(file, 'utf8')
      // A client component talks to PostgREST as the signed-in user, so
      // auth.uid() is set and fn_rate_audit_actor() attributes the write
      // without any header. The gap this test exists for is service-role
      // clients, which are server-only.
      if (/^\s*['"]use client['"]/.test(src)) continue
      if (!writesAuditedTable(src)) continue
      if (src.includes('supabase-server') || src.includes('supabase-actor')) continue
      offenders.push(file.replace(`${process.cwd()}/`, ''))
    }
    expect(
      offenders,
      'these write audited rate tables through an unattributed client — the ' +
        'digest will report their edits as "unknown user". Swap the raw ' +
        'createClient for createServerClient() (lib/supabase-server).',
    ).toEqual([])
  })

  it('lib/ writers take the client as a parameter, so attribution follows the caller', () => {
    // lib/ai/service-creation.ts and friends write rate tables but receive
    // `supabase` from the route — correct by construction, provided they
    // never build their own. Pin that they do not.
    for (const file of sourceFiles(join(process.cwd(), 'lib'))) {
      const src = readFileSync(file, 'utf8')
      if (!writesAuditedTable(src)) continue
      if (src.includes('supabase-server') || src.includes('supabase-actor')) continue
      expect(
        src.includes('SUPABASE_SERVICE_ROLE_KEY'),
        `${file.replace(`${process.cwd()}/`, '')} writes an audited rate table AND builds its own service-role client — attribution is lost`,
      ).toBe(false)
    }
  })
})
