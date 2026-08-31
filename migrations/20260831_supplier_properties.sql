-- ============================================
-- supplier_properties — the assets a supplier operates
-- ============================================
-- Phase 1 (cruises) of the supplier→properties revision (operator,
-- 2026-08-31): "a train company has several trains, cruises and hotels are
-- the same — in the supplier section we need to add those properties."
--
-- Until now a property existed only as a STRING on each rate row
-- (nile_cruises.ship_name, accommodation_rates.property_name,
-- train_rates.operator_name) with the property's contact living in the rate
-- table too. There was no way to say "this cruise line operates these three
-- ships" — the ship was born inside a rate and orphaned from its company.
--
-- This is NOT the 2026-08-22 model coming back. That one made a supplier BE a
-- property (suppliers.is_property + parent_supplier_id, self-referencing) and
-- died unused — 0 of 96 suppliers ever linked. This is supplier HAS
-- properties: a real sub-entity owned by the supplier, picked by rate forms.
-- The dead columns of the old attempt are dropped at the bottom, so the two
-- models can never be confused.
--
-- Phase 1 links nile_cruises only. Hotels and trains follow the same pattern
-- in later phases; property_type already admits them so the table needs no
-- change when they arrive.

BEGIN;

CREATE TABLE IF NOT EXISTS public.supplier_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,

  -- What kind of asset this is. The vocabulary is deliberately the phased
  -- scope, not everything imaginable: add values when a phase needs them.
  property_type TEXT NOT NULL CHECK (property_type IN ('ship', 'hotel', 'train')),

  name TEXT NOT NULL,
  city TEXT,
  -- Free-form class: '5-star deluxe', 'standard', a train class. The rate
  -- keeps its own tier column — this is the asset's own designation.
  category TEXT,

  -- The property's OWN contact (the ship's operations desk, the hotel's
  -- reservations office) — distinct from the supplier's company contact.
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One ship name per supplier: the picker's dedup guarantee.
  CONSTRAINT supplier_properties_unique_name UNIQUE (supplier_id, property_type, name)
);

CREATE INDEX IF NOT EXISTS idx_supplier_properties_supplier
  ON public.supplier_properties (supplier_id, property_type);

-- Single-org install: same posture as suppliers itself (authenticated full
-- access, anon denied — the 2026-08-21 lockdown).
ALTER TABLE public.supplier_properties ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'supplier_properties' AND policyname = 'supplier_properties_authenticated_all'
  ) THEN
    CREATE POLICY supplier_properties_authenticated_all ON public.supplier_properties
      TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- The cruise rate now references its ship. ship_name STAYS on nile_cruises as
-- a denormalized write-through (the pricing engine, PDFs and the CSV read it);
-- the property is the source of truth and the API keeps them in step.
ALTER TABLE public.nile_cruises
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.supplier_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nile_cruises_property
  ON public.nile_cruises (property_id);

-- Backfill: every distinct (supplier_id, ship_name) already priced becomes a
-- ship under its supplier, and its rows link up. Production has 0 cruise rows
-- today; this exists for installs that do not.
INSERT INTO public.supplier_properties (supplier_id, property_type, name, city)
SELECT DISTINCT nc.supplier_id, 'ship', nc.ship_name, nc.embark_city
FROM public.nile_cruises nc
WHERE nc.supplier_id IS NOT NULL
  AND nc.ship_name IS NOT NULL AND btrim(nc.ship_name) <> ''
ON CONFLICT ON CONSTRAINT supplier_properties_unique_name DO NOTHING;

UPDATE public.nile_cruises nc
SET property_id = sp.id
FROM public.supplier_properties sp
WHERE nc.property_id IS NULL
  AND sp.supplier_id = nc.supplier_id
  AND sp.property_type = 'ship'
  AND sp.name = nc.ship_name;

-- ============================================
-- Retire the 2026-08-22 supplier-IS-a-property model for good
-- ============================================
-- All four columns are 0-populated in production (verified 2026-08-31) and
-- the form retired them a week ago; only dead query-param filters in
-- app/api/suppliers/route.ts still mentioned them, removed in the same PR.
DROP INDEX IF EXISTS public.idx_suppliers_is_property;
DROP INDEX IF EXISTS public.idx_suppliers_parent;
ALTER TABLE public.suppliers
  DROP COLUMN IF EXISTS is_property,
  DROP COLUMN IF EXISTS parent_supplier_id,
  DROP COLUMN IF EXISTS ship_name,
  DROP COLUMN IF EXISTS property_type;

COMMIT;
