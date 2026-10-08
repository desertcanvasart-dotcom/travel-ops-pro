-- ============================================================================
-- 20261114 — a transport voucher keeps its vehicle and driver
-- ============================================================================
--
-- The supplier-document edit page has had a vehicle-type picker and a driver
-- field for a transport voucher, and the voucher PDF prints both, but
-- supplier_documents had neither column: the save route dropped them, so
-- what the office typed never reached the supplier.
--
-- Additive and replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE public.supplier_documents
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255);

COMMENT ON COLUMN public.supplier_documents.vehicle_type IS
  'Transport vouchers: the vehicle class the supplier is to send (sedan, minivan, van, minibus, bus, luxury_sedan, luxury_van).';
COMMENT ON COLUMN public.supplier_documents.driver_name IS
  'Transport vouchers: the driver, once the supplier has named one.';

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'supplier_documents'
         AND column_name IN ('vehicle_type', 'driver_name')) <> 2 THEN
    RAISE EXCEPTION 'supplier_documents.vehicle_type / driver_name missing';
  END IF;
END $$;

COMMIT;
