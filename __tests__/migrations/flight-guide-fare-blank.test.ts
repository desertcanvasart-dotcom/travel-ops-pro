// Migration 20261222 on a real Postgres: a flight period's guide fare the
// period sanitizer stored as 0 becomes blank (null) again — in the period and
// in the first-period mirror column — and nothing else moves. Replays cleanly.
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let db: PGlite
const mig = readFileSync(path.join(process.cwd(), 'migrations/20261222_flight_guide_fare_blank.sql'), 'utf8')

const period = (from: string, to: string, rates: Record<string, unknown>) => ({ name: '', from, to, rates })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create table public.flight_rates(id text primary key, guide_rate numeric, seasons jsonb);`)
  const rows: Array<[string, number | null, unknown]> = [
    // Saved through the period editor with the guide box left blank.
    ['blank-saved', 0, [period('2026-01-01', '2026-06-30', { base_rate_eur: 100, guide_rate: 0 }), period('2026-07-01', '2026-12-31', { base_rate_eur: 150, guide_rate: 0 })]],
    // A real guide fare in one period, a blank in the other.
    ['mixed', 60, [period('2026-01-01', '2026-06-30', { base_rate_eur: 100, guide_rate: 60 }), period('2026-07-01', '2026-12-31', { base_rate_eur: 150, guide_rate: 0 })]],
    // Built by 20261025 from a blank column: the key is absent.
    ['migrated', null, [period('1900-01-01', '2099-12-31', { base_rate_eur: 90 })]],
    // No periods at all: its column is whatever was typed.
    ['no-periods', 0, null],
  ]
  for (const [id, guide, seasons] of rows) {
    await db.query('insert into public.flight_rates(id, guide_rate, seasons) values ($1, $2, $3)', [id, guide, seasons === null ? null : JSON.stringify(seasons)])
  }
  await db.exec(mig)
  await db.exec(mig)
}, 60_000)

const row = async (id: string) =>
  (await db.query<{ guide_rate: string | null; seasons: Array<{ rates: Record<string, unknown> }> | null }>(
    'select guide_rate, seasons from public.flight_rates where id = $1', [id])).rows[0]

describe('20261222_flight_guide_fare_blank', () => {
  it('a 0 the sanitizer stored is blank again, in every period and the mirror column', async () => {
    const r = await row('blank-saved')
    expect(r.seasons!.map(p => p.rates.guide_rate)).toEqual([null, null])
    expect(r.seasons!.map(p => p.rates.base_rate_eur)).toEqual([100, 150])
    expect(r.guide_rate).toBeNull()
  })

  it('a guide fare that was entered is kept; order is kept', async () => {
    const r = await row('mixed')
    expect(r.seasons!.map(p => p.rates.guide_rate)).toEqual([60, null])
    expect(Number(r.guide_rate)).toBe(60)
  })

  it('rows without a stored 0 and rows without periods are untouched', async () => {
    expect((await row('migrated')).seasons![0].rates).toEqual({ base_rate_eur: 90 })
    expect(Number((await row('no-periods')).guide_rate)).toBe(0)
  })
})
