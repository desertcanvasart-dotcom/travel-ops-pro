-- ============================================
-- Supplier properties, Phase 3: trains
-- ============================================
-- The last vertical of the campaign. Trains are leaner than ships and hotels:
-- train_rates and sleeping_train_rates carry only operator_name (the COMPANY)
-- — there is no per-train name column on the rate rows — so the link is an
-- explicit, optional picker: the rate may name which of the supplier's trains
-- it prices. No backfill is possible (nothing to resolve a name from) and no
-- denormalized name write-through is needed (nothing displays one).

BEGIN;

ALTER TABLE public.train_rates
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.supplier_properties(id) ON DELETE SET NULL;

ALTER TABLE public.sleeping_train_rates
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.supplier_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_train_rates_property
  ON public.train_rates (property_id);
CREATE INDEX IF NOT EXISTS idx_sleeping_train_rates_property
  ON public.sleeping_train_rates (property_id);

COMMIT;
