// Migration 20261010, executed against a real Postgres.
//
// It adds three vocabulary kinds for the tour template form, and the risky
// part is not the CHECK — it is the trigger. Each kind seeded outside
// seed_org_vocabulary has to be called from seed_org_vocabulary_on_insert,
// because the relabel migrations replace seed_org_vocabulary's whole body; a
// kind that only ever seeded itself would vanish the next time that happened.
// 20261009 hit exactly that and left the pattern behind. So this proves a
// brand-new organisation gets the NEW kinds AND still gets the old ones.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { replayMigrations } from '@/scripts/replay-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const ORG = '11111111-1111-4111-8111-111111111111'

let db: { query(sql: string): Promise<{ rows: any[] }>; exec(sql: string): Promise<unknown>; close(): Promise<void> }
const rows = async (sql: string) => (await db.query(sql)).rows

beforeAll(async () => {
  const replay = await replayMigrations()
  db = replay.db
  expect(replay.failed, 'migrations did not replay cleanly').toEqual([])
  await db.exec(`INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Probe Agency');`)
})

afterAll(async () => {
  await db?.close()
})

describe('a brand-new organisation', () => {
  it('is seeded with all three tour kinds', async () => {
    const r = await rows(`
      SELECT kind, count(*)::int AS c FROM org_vocabularies
      WHERE org_id = '${ORG}' AND kind IN ('tour_type','physical_level','tour_audience')
      GROUP BY kind ORDER BY kind`)
    expect(r).toEqual([
      { kind: 'physical_level', c: 4 },
      { kind: 'tour_audience', c: 13 },
      { kind: 'tour_type', c: 4 },
    ])
  })

  it('still gets the kinds seeded before this migration', async () => {
    // The trigger was REPLACED. If the new body forgot an earlier call, a new
    // agency would silently start life without tiers or cruise supplements.
    for (const kind of ['tier', 'cruise_supplement', 'board_basis']) {
      const [{ c }] = await rows(`SELECT count(*)::int AS c FROM org_vocabularies WHERE org_id='${ORG}' AND kind='${kind}'`)
      expect(c, `${kind} was dropped when the trigger was rewritten`).toBeGreaterThan(0)
    }
  })
})

describe('tour_type carries its day range', () => {
  it('every preset has a usable min/max', async () => {
    const r = await rows(`
      SELECT key, (meta->>'min_days')::int AS mn, (meta->>'max_days')::int AS mx
      FROM org_vocabularies WHERE org_id='${ORG}' AND kind='tour_type' ORDER BY rank`)
    expect(r).toEqual([
      { key: 'half_day', mn: 1, mx: 1 },
      { key: 'day_tour', mn: 1, mx: 1 },
      { key: 'multi_day', mn: 2, mx: 99 },
      { key: 'stopover', mn: 1, mx: 1 },
    ])
    // Every range must admit at least one duration, or the form's suggestion
    // could never land on it.
    for (const t of r) expect(t.mx).toBeGreaterThanOrEqual(t.mn)
  })
})

describe('the seeder is safe to re-run', () => {
  it('inserts nothing the second time, and never overwrites an edit', async () => {
    await db.exec(`UPDATE org_vocabularies SET label = 'Day Trip' WHERE org_id='${ORG}' AND kind='tour_type' AND key='day_tour'`)
    const [{ n }] = await rows(`SELECT public.seed_tour_template_vocabulary('${ORG}') AS n`)
    expect(n, 'a re-run must fill gaps only').toBe(0)
    const [{ label }] = await rows(`SELECT label FROM org_vocabularies WHERE org_id='${ORG}' AND kind='tour_type' AND key='day_tour'`)
    expect(label, "the agency's own word was overwritten").toBe('Day Trip')
  })

  it('fills a gap an agency deleted, without disturbing the rest', async () => {
    await db.exec(`DELETE FROM org_vocabularies WHERE org_id='${ORG}' AND kind='tour_type' AND key='stopover'`)
    const [{ n }] = await rows(`SELECT public.seed_tour_template_vocabulary('${ORG}') AS n`)
    expect(n).toBe(1)
  })
})

describe('the kind CHECK', () => {
  it('admits an agency-defined tour type with its own range', async () => {
    await db.exec(`INSERT INTO org_vocabularies (org_id, kind, key, label, meta, rank)
      VALUES ('${ORG}','tour_type','expedition','Expedition','{"min_days":5,"max_days":21}'::jsonb, 9)`)
    const r = await rows(`SELECT (meta->>'max_days')::int AS mx FROM org_vocabularies WHERE org_id='${ORG}' AND key='expedition'`)
    expect(r[0].mx).toBe(21)
  })

  it('still refuses a kind the app does not know', async () => {
    // Widening the CHECK must not have turned it into a free-text column.
    await expect(
      db.exec(`INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES ('${ORG}','not_a_kind','x','X',1)`)
    ).rejects.toThrow()
  })

  it('keeps admitting every kind that existed before', async () => {
    for (const kind of ['tier', 'vehicle_type', 'cruise_supplement', 'activity_pricing_type']) {
      await expect(
        db.exec(`INSERT INTO org_vocabularies (org_id, kind, key, label, rank) VALUES ('${ORG}','${kind}','probe_${kind}','Probe',99)`)
      ).resolves.toBeDefined()
    }
  })
})
