-- ============================================
-- Phase 3 durability: rate-table supplier_id FK enforcement
-- ============================================
-- Adds FK constraints from each rate table's supplier_id column to suppliers(id).
-- These columns existed unconstrained before — Phase 3's 111-row transportation
-- backfill loaded clean ids, but until now the columns could drift to bad ids
-- on any future write. This locks them in.
--
-- Pre-flight done:
--   orphan check across all 6 rate tables = 0 orphans
--   144 rate rows currently carry supplier_id (will be FK-validated by Postgres
--   at constraint creation time — all 144 resolve cleanly)
--
-- All FKs nullable + ON DELETE SET NULL. Rationale unchanged from step 2:
--   - Nullable: legitimately supplier-less rows exist (9 nameless transportation
--     rows, "Direct" sentinels, freelancers awaiting canonical supplier creation).
--   - SET NULL on delete: removing a supplier preserves historical rate rows
--     with NULL FK + the denormalized supplier_name snapshot (where present).
--
-- IDEMPOTENT — DO blocks catch duplicate_object, matching the step-2 style.
-- Safe to re-run.
-- ============================================

DO $$ BEGIN
  ALTER TABLE transportation_rates
    ADD CONSTRAINT transportation_rates_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'transportation_rates_supplier_id_fkey already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE accommodation_rates
    ADD CONSTRAINT accommodation_rates_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'accommodation_rates_supplier_id_fkey already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE nile_cruises
    ADD CONSTRAINT nile_cruises_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'nile_cruises_supplier_id_fkey already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE guide_rates
    ADD CONSTRAINT guide_rates_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'guide_rates_supplier_id_fkey already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE activity_rates
    ADD CONSTRAINT activity_rates_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'activity_rates_supplier_id_fkey already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE meal_rates
    ADD CONSTRAINT meal_rates_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'meal_rates_supplier_id_fkey already exists, skipping';
END $$;

-- Indexes on FK columns (Postgres does not auto-index referencing cols).
-- Without these, a supplier delete triggers a full table scan of every
-- referencing rate table to set FK to NULL.
CREATE INDEX IF NOT EXISTS idx_transportation_rates_supplier_id
  ON transportation_rates(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accommodation_rates_supplier_id
  ON accommodation_rates(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nile_cruises_supplier_id
  ON nile_cruises(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guide_rates_supplier_id
  ON guide_rates(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_rates_supplier_id
  ON activity_rates(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_rates_supplier_id
  ON meal_rates(supplier_id) WHERE supplier_id IS NOT NULL;
