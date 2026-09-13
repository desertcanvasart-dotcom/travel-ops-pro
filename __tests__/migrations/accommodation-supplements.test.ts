// 20261009_accommodation_supplements.sql, executed against a real Postgres
// (PGlite) on production-shaped tables: the supplements list lands on both
// rate tables, the vocabulary admits the new cruise_supplement kind (found by
// the CHECK's definition, not its name), every existing organisation gets the
// presets, a new organisation gets them from the trigger, and a second run
// changes nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = path.join(process.cwd(), 'migrations', '20261009_accommodation_supplements.sql')
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')

const ORG = '11111111-1111-4111-8111-111111111111'

// The production shape: the kind CHECK declared INLINE in 20260908, so it
// carries whatever name Postgres gave it; the seeder the on-insert trigger
// already calls, stubbed.
const TABLES = `
  CREATE SCHEMA IF NOT EXISTS public;
  DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF; END $$;
  CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
  CREATE TABLE public.org_vocabularies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('tier', 'supplier_type', 'airline', 'hotel_supplement', 'airport_direction', 'activity_pricing_type')),
    key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9_]{0,59}$'),
    label text NOT NULL CHECK (btrim(label) <> ''),
    label_ja text, description text, behavior text,
    rank integer NOT NULL DEFAULT 0,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    CONSTRAINT org_vocabularies_unique_key UNIQUE (org_id, kind, key)
  );
  CREATE TABLE public.accommodation_rates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_name text, seasons jsonb);
  CREATE TABLE public.nile_cruises (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ship_name text, seasons jsonb);
  CREATE OR REPLACE FUNCTION public.seed_org_vocabulary(p_org uuid, p_kind text DEFAULT NULL) RETURNS integer
    LANGUAGE sql AS $$ SELECT 0 $$;
  INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Existing agency');
  INSERT INTO public.org_vocabularies (org_id, kind, key, label) VALUES ('${ORG}', 'hotel_supplement', 'view_nile', 'Nile View');
  INSERT INTO public.accommodation_rates (property_name) VALUES ('Hotel A');
`

describe('20261009 — supplements on hotel and cruise rates', () => {
  const db = new PGlite()
  beforeAll(async () => { await db.exec(TABLES); await db.exec(sql) }, 60_000) // PGlite boots slowly under a full parallel run; 10s flaked twice on 2026-09-13
  afterAll(async () => { await db.close() })

  const presets = async (org: string) =>
    (await db.query<{ key: string; description: string }>(`SELECT key, description FROM public.org_vocabularies WHERE org_id = '${org}' AND kind = 'cruise_supplement' ORDER BY rank`)).rows

  it('adds the supplements list to both rate tables, empty by default, arrays only', async () => {
    const { rows } = await db.query<{ supplements: unknown[] }>(`SELECT supplements FROM public.accommodation_rates`)
    expect(rows[0].supplements).toEqual([])
    await db.exec(`INSERT INTO public.nile_cruises (ship_name, supplements) VALUES ('Ship', '[{"key":"upper_deck","name":"Upper Deck"}]')`)
    await expect(db.exec(`UPDATE public.nile_cruises SET supplements = '{"key":"x"}'`)).rejects.toThrow()
  })

  it('the vocabulary admits cruise_supplement and still refuses an unknown kind', async () => {
    await db.exec(`INSERT INTO public.org_vocabularies (org_id, kind, key, label) VALUES ('${ORG}', 'cruise_supplement', 'sun_deck', 'Sun Deck')`)
    await expect(db.exec(`INSERT INTO public.org_vocabularies (org_id, kind, key, label) VALUES ('${ORG}', 'made_up', 'x', 'X')`)).rejects.toThrow()
  })

  it('seeds the presets for an existing organisation, grouped by their note', async () => {
    const rows = await presets(ORG)
    expect(rows.map(r => r.key)).toEqual(expect.arrayContaining(['upper_deck', 'panoramic_window', 'private_balcony']))
    expect(rows.find(r => r.key === 'upper_deck')?.description).toBe('Deck')
  })

  it('a new organisation gets the presets from the on-insert trigger', async () => {
    const NEW = '22222222-2222-4222-8222-222222222222'
    await db.exec(`INSERT INTO public.organizations (id, name) VALUES ('${NEW}', 'New agency')`)
    expect((await presets(NEW)).map(r => r.key)).toEqual(['upper_deck', 'panoramic_window', 'private_balcony'])
  })

  it('never overwrites an agency\'s own edit of a preset', async () => {
    await db.exec(`UPDATE public.org_vocabularies SET label = 'Top Deck' WHERE org_id = '${ORG}' AND key = 'upper_deck'`)
    await db.exec(sql)
    const { rows } = await db.query<{ label: string }>(`SELECT label FROM public.org_vocabularies WHERE org_id = '${ORG}' AND key = 'upper_deck'`)
    expect(rows[0].label).toBe('Top Deck')
  })

  it('is idempotent: a second run passes its own verify and adds nothing', async () => {
    const before = (await db.query(`SELECT count(*)::int n FROM public.org_vocabularies`)).rows
    await db.exec(sql)
    const after = (await db.query(`SELECT count(*)::int n FROM public.org_vocabularies`)).rows
    expect(after).toEqual(before)
  })
})
