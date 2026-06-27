-- ============================================
-- Phase 3 step 2: FK enforcement on supplier-bearing tables
-- ============================================
-- Adds the supplier_id FKs and itinerary_id FK that were bare UUIDs in the
-- original audit. Pre-launch — these tables are empty or tiny (verified by
-- orphan-check) so the constraints are free to add now; expensive after
-- launch when historical data starts accumulating.
--
-- IDEMPOTENT — each constraint is wrapped in a DO block that catches the
-- duplicate_object exception. This was added after the first run failed
-- because itinerary_services.supplier_id already had its FK from an earlier
-- (undocumented) schema state. The probe `_probe-fk-v3.mjs` confirmed the
-- actual state pre-migration:
--   itinerary_services.supplier_id     → EXISTS (no-op below)
--   booking_supplier_status.supplier_id → MISSING
--   supplier_invoices.supplier_id      → MISSING
--   supplier_invoices.itinerary_id     → MISSING
--   expenses.supplier_id               → MISSING
--
-- Pre-flight done:
--   - suppliers table hygiene: 14 trim updates, 1 Oberoi duplicate merged
--     (108 rows total post-cleanup)
--   - orphan check: 0 orphan pointers across all 5 supplier_id columns and
--     the itinerary_id column
--
-- All FKs are nullable + ON DELETE SET NULL. Rationale:
--   - Nullable: legitimately supplier-less rows exist (tips, water,
--     entrance fees, bundled cruise transport).
--   - SET NULL on delete: historical rows stay (with NULL FK + the
--     denormalized `supplier_name` snapshot preserved for human readability).
-- ============================================

-- 1. booking_supplier_status.supplier_id → suppliers(id)
DO $$ BEGIN
  ALTER TABLE booking_supplier_status
    ADD CONSTRAINT booking_supplier_status_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'booking_supplier_status_supplier_id_fkey already exists, skipping';
END $$;

-- 2. supplier_invoices.supplier_id → suppliers(id)
DO $$ BEGIN
  ALTER TABLE supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'supplier_invoices_supplier_id_fkey already exists, skipping';
END $$;

-- 3. supplier_invoices.itinerary_id → itineraries(id)
DO $$ BEGIN
  ALTER TABLE supplier_invoices
    ADD CONSTRAINT supplier_invoices_itinerary_id_fkey
    FOREIGN KEY (itinerary_id) REFERENCES itineraries(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'supplier_invoices_itinerary_id_fkey already exists, skipping';
END $$;

-- 4. itinerary_services.supplier_id → suppliers(id)
--    (Pre-existing on the live DB; the DO block makes this a clean no-op.)
DO $$ BEGIN
  ALTER TABLE itinerary_services
    ADD CONSTRAINT itinerary_services_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'itinerary_services_supplier_id_fkey already exists, skipping';
END $$;

-- 5. expenses.supplier_id → suppliers(id)
DO $$ BEGIN
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'expenses_supplier_id_fkey already exists, skipping';
END $$;

-- Indexes on the FK columns so cascade-style operations and joins stay fast.
-- Postgres does NOT auto-create indexes on FK referencing columns (only on
-- the referenced PK). Without these, deleting a supplier triggers a full
-- table scan of every referencing table to set the FK to NULL.
CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_supplier_id
  ON booking_supplier_status(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_id
  ON supplier_invoices(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_itinerary_id
  ON supplier_invoices(itinerary_id) WHERE itinerary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_itinerary_services_supplier_id
  ON itinerary_services(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id
  ON expenses(supplier_id) WHERE supplier_id IS NOT NULL;
