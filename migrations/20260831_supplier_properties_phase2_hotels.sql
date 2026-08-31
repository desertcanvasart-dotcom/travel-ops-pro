-- ============================================
-- Supplier properties, Phase 2: hotels
-- ============================================
-- Same shape as Phase 1 (20260831_supplier_properties.sql, cruises): the
-- accommodation rate row keeps its denormalized property_name — the pricing
-- engine matches by city+tier and reads the name for display — and gains a
-- property_id link to the hotel as a sub-entity of its supplier.
--
-- Backfill creates a hotel property for every distinct (supplier_id,
-- property_name) already priced. Rows with no supplier stay unlinked (all 7
-- production rows today) — a property needs a company to belong to, and they
-- link up the next time they are saved with a supplier chosen.

BEGIN;

ALTER TABLE public.accommodation_rates
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.supplier_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accommodation_rates_property
  ON public.accommodation_rates (property_id);

INSERT INTO public.supplier_properties (supplier_id, property_type, name, city)
SELECT DISTINCT ar.supplier_id, 'hotel', ar.property_name, ar.city
FROM public.accommodation_rates ar
WHERE ar.supplier_id IS NOT NULL
  AND ar.property_name IS NOT NULL AND btrim(ar.property_name) <> ''
ON CONFLICT ON CONSTRAINT supplier_properties_unique_name DO NOTHING;

UPDATE public.accommodation_rates ar
SET property_id = sp.id
FROM public.supplier_properties sp
WHERE ar.property_id IS NULL
  AND sp.supplier_id = ar.supplier_id
  AND sp.property_type = 'hotel'
  AND sp.name = ar.property_name;

COMMIT;
