// Migration 20261112 on a real Postgres: the blog table is server-only, its
// slug is a URL, and a published post has a date.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const TARGET = '20261112_blog_posts.sql'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const rows = async (s: string) => (await db.query(s)).rows
const rejects = async (sql: string) => {
  try { await db.exec(sql) } catch { return true }
  return false
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f <= TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
})

afterAll(async () => { await db?.close() })

describe('blog_posts', () => {
  it('is replay-safe: the migration runs twice', async () => {
    await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
  })

  it('a visitor and a signed-in user can do nothing with it — only the service role has a policy', async () => {
    const [grants] = await rows(`SELECT
      has_table_privilege('anon', 'public.blog_posts', 'SELECT') AS anon_read,
      has_table_privilege('authenticated', 'public.blog_posts', 'SELECT') AS auth_read,
      has_table_privilege('authenticated', 'public.blog_posts', 'INSERT') AS auth_write`)
    expect(grants).toEqual({ anon_read: false, auth_read: false, auth_write: false })
    const policies = await rows(`SELECT policyname, roles::text AS roles FROM pg_policies WHERE tablename = 'blog_posts'`)
    expect(policies).toEqual([{ policyname: 'blog_posts_service_role', roles: '{service_role}' }])
  })

  it('a draft needs no date; a published post does', async () => {
    await db.exec(`INSERT INTO blog_posts (slug, title) VALUES ('a-draft', 'A draft')`)
    expect(await rejects(`INSERT INTO blog_posts (slug, title, status) VALUES ('undated', 'X', 'published')`)).toBe(true)
    await db.exec(`INSERT INTO blog_posts (slug, title, status, published_at) VALUES ('dated', 'X', 'published', now())`)
  })

  it('the slug is a URL: lowercase words and hyphens, unique', async () => {
    for (const bad of ['Upper', 'two  words', 'trailing-', '-leading', 'double--hyphen', 'ünï', '']) {
      expect(await rejects(`INSERT INTO blog_posts (slug, title) VALUES ('${bad}', 'X')`)).toBe(true)
    }
    expect(await rejects(`INSERT INTO blog_posts (slug, title) VALUES ('a-draft', 'Same slug')`)).toBe(true)
  })

  it('a title is required, the language is en or ja', async () => {
    expect(await rejects(`INSERT INTO blog_posts (slug, title) VALUES ('no-title', '  ')`)).toBe(true)
    expect(await rejects(`INSERT INTO blog_posts (slug, title, language) VALUES ('french', 'X', 'fr')`)).toBe(true)
  })
})
