-- ============================================
-- A dedicated extras catalogue — and un-overloading is_addon
-- ============================================
-- Operator, 1 Sep 2026. Two decisions, one migration.
--
-- 1. is_addon MEANT ONE THING AND WAS MADE TO MEAN TWO.
--
-- It was created so the PRICING ENGINE would leave a site out of the automatic
-- price: standing on the Giza plateau is not the same as paying to go inside a
-- pyramid, so "Step Pyramid of Zoser" carries the note "Only include if
-- customer requests pyramid interior" and lib/ai/service-creation.ts skips it
-- (`if (fee.is_addon) continue`). That still works and is not touched here.
--
-- The booking extras catalogue then read the SAME flag as "offer this for sale
-- on any booking". Those are different statements: a site can be excluded from
-- auto-pricing for logistics and never be something a customer buys. The
-- operator's words: "not always". So selling gets its own column and the two
-- decisions stop implying each other.
--
--   is_addon           → not auto-priced. Include only when asked.  (unchanged)
--   is_sellable_extra  → offer as a paid extra at booking.          (new)
--
-- Backfill is deliberately is_sellable_extra := is_addon, so TODAY'S behaviour
-- is preserved exactly: the one flagged row stays offerable and nothing appears
-- or disappears from the booking page on deploy. Divergence is then the
-- operator's choice, made per row.
--
-- 2. NOT EVERY EXTRA IS AN ATTRACTION.
--
-- Airport fast-track, extra luggage, a late check-out: real things to sell that
-- are not entrance fees and never will be. They had nowhere to live, so the
-- only way to offer one was to invent an attraction. extras_catalogue is that
-- home — org-scoped (unlike the shared entrance_fees rate table), priced like
-- any other catalogue item, and merged into the same booking picker.

BEGIN;

ALTER TABLE public.entrance_fees
  ADD COLUMN IF NOT EXISTS is_sellable_extra BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.entrance_fees
SET is_sellable_extra = TRUE
WHERE is_addon IS TRUE AND is_sellable_extra IS FALSE;

CREATE INDEX IF NOT EXISTS idx_entrance_fees_sellable
  ON public.entrance_fees (is_sellable_extra) WHERE is_sellable_extra;

CREATE TABLE IF NOT EXISTS public.extras_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  -- Free-text grouping the office chooses ('Airport', 'Comfort', 'Documents').
  category TEXT,

  -- What we pay, in the ORG'S RATE CURRENCY — the same basis every other rate
  -- table uses, so the catalogue converts through one code path. NULL is an
  -- honest hole (a supplier who has not quoted yet), never zero: usableRate()
  -- treats a blank rate as unpriced and the picker says so.
  supplier_cost NUMERIC(12,2),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,

  -- A selling price the operator has already decided. Set = that IS the price
  -- (off-margin, like a package option's optional_price_override). Blank =
  -- price it from cost plus the org's margin.
  selling_price NUMERIC(12,2),

  -- 'per_person' multiplies by travellers; 'per_booking' is a flat charge.
  unit TEXT NOT NULL DEFAULT 'per_person'
    CHECK (unit IN ('per_person', 'per_booking')),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,

  CONSTRAINT extras_catalogue_unique_name UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_extras_catalogue_org
  ON public.extras_catalogue (org_id, is_active);

ALTER TABLE public.extras_catalogue ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extras_catalogue' AND policyname = 'extras_catalogue_authenticated_all'
  ) THEN
    CREATE POLICY extras_catalogue_authenticated_all ON public.extras_catalogue
      TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
