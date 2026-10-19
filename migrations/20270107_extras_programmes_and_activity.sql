-- ============================================
-- 20270107: one Extras list — offered with every booking or with chosen
-- programmes, and its cost taken from an Activities rate
-- ============================================
-- Tours → Options (tour_variation_services.is_optional) and Sell → Extras
-- (extras_catalogue) were two lists of the same thing: an optional paid
-- add-on with a cost and a price. The operator (2026-10-19): one list; an
-- extra is offered with every booking OR with chosen programmes (programme
-- level, not per tier), a programme may carry its own price, and an extra
-- that IS an activity (the Luxor horse carriage) takes its cost from
-- Rates → Activities so the price is entered once.
--
--   extras_catalogue.offered_with      'all' (every booking, as before) |
--                                      'programmes' (only the linked ones)
--   extras_catalogue.activity_rate_id  the Activities rate its cost comes
--                                      from; NULL = the typed supplier_cost
--   extras_catalogue_programmes        extra × programme, with that
--                                      programme's own selling_price (NULL =
--                                      the extra's)
--
-- DATA MOVE: every optional programme service becomes an extra offered with
-- its programme. Same name in one company = one extra (reused when it already
-- exists by name), named and costed from its Standard tier (else the first
-- tier by name); a programme sold at several tiers keeps ONE price — a tier's
-- set price, Standard's first. The old rows stay where they are
-- (nothing reads optional variation services after this release), so the
-- move loses nothing. Production had none on 2026-10-19.
--
-- Safe to run twice.

BEGIN;

ALTER TABLE public.extras_catalogue
  ADD COLUMN IF NOT EXISTS offered_with TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'extras_catalogue_offered_with_check'
  ) THEN
    ALTER TABLE public.extras_catalogue
      ADD CONSTRAINT extras_catalogue_offered_with_check
      CHECK (offered_with IN ('all', 'programmes'));
  END IF;
END $$;

ALTER TABLE public.extras_catalogue
  ADD COLUMN IF NOT EXISTS activity_rate_id UUID
    REFERENCES public.activity_rates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_extras_catalogue_activity
  ON public.extras_catalogue (activity_rate_id) WHERE activity_rate_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.extras_catalogue_programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  extra_id UUID NOT NULL REFERENCES public.extras_catalogue(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.tour_templates(id) ON DELETE CASCADE,
  -- This programme's price, in the extra's currency. NULL = the extra's own
  -- selling_price (or cost + margin when that is blank too).
  selling_price NUMERIC(12,2) CHECK (selling_price IS NULL OR selling_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT extras_catalogue_programmes_unique UNIQUE (extra_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_extras_catalogue_programmes_template
  ON public.extras_catalogue_programmes (org_id, template_id);

ALTER TABLE public.extras_catalogue_programmes ENABLE ROW LEVEL SECURITY;
-- The rate tables' rule (20261206): your company's rows; writes manager and
-- above. Every caller is an API route on the service role; this is the
-- second wall.
DROP POLICY IF EXISTS extras_catalogue_programmes_org_select ON public.extras_catalogue_programmes;
DROP POLICY IF EXISTS extras_catalogue_programmes_org_insert ON public.extras_catalogue_programmes;
DROP POLICY IF EXISTS extras_catalogue_programmes_org_update ON public.extras_catalogue_programmes;
DROP POLICY IF EXISTS extras_catalogue_programmes_org_delete ON public.extras_catalogue_programmes;
CREATE POLICY extras_catalogue_programmes_org_select ON public.extras_catalogue_programmes
  FOR SELECT TO authenticated USING (public.user_is_in_org(org_id));
CREATE POLICY extras_catalogue_programmes_org_insert ON public.extras_catalogue_programmes
  FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
CREATE POLICY extras_catalogue_programmes_org_update ON public.extras_catalogue_programmes
  FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
  WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
CREATE POLICY extras_catalogue_programmes_org_delete ON public.extras_catalogue_programmes
  FOR DELETE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());

-- ---------- the data move ----------
-- One row per (company, option name): the first tier's values.
WITH options AS (
  SELECT DISTINCT ON (v.org_id, lower(btrim(s.service_name)))
         v.org_id,
         btrim(s.service_name) AS name,
         s.service_category,
         s.cost_per_unit,
         s.quantity_mode
  FROM public.tour_variation_services s
  JOIN public.tour_variations v ON v.id = s.variation_id
  WHERE s.is_optional IS TRUE
    AND v.org_id IS NOT NULL
    AND btrim(coalesce(s.service_name, '')) <> ''
  ORDER BY v.org_id, lower(btrim(s.service_name)), (v.tier = 'standard') DESC NULLS LAST, v.tier NULLS LAST, v.variation_name, s.id
)
INSERT INTO public.extras_catalogue (org_id, name, category, supplier_cost, unit, offered_with)
SELECT o.org_id, o.name, o.service_category,
       CASE WHEN o.cost_per_unit > 0 THEN o.cost_per_unit END,
       CASE WHEN o.quantity_mode IN ('per_pax', 'per_person') THEN 'per_person' ELSE 'per_booking' END,
       'programmes'
FROM options o
WHERE NOT EXISTS (
  SELECT 1 FROM public.extras_catalogue x
  WHERE x.org_id = o.org_id AND lower(btrim(x.name)) = lower(o.name)
);

-- One link per (extra, programme), carrying the first tier's set price.
INSERT INTO public.extras_catalogue_programmes (org_id, extra_id, template_id, selling_price)
SELECT DISTINCT ON (x.id, v.template_id)
       v.org_id, x.id, v.template_id,
       CASE WHEN s.optional_price_override > 0 THEN s.optional_price_override END
FROM public.tour_variation_services s
JOIN public.tour_variations v ON v.id = s.variation_id
JOIN public.extras_catalogue x
  ON x.org_id = v.org_id AND lower(btrim(x.name)) = lower(btrim(s.service_name))
WHERE s.is_optional IS TRUE
  AND v.org_id IS NOT NULL
  AND v.template_id IS NOT NULL
ORDER BY x.id, v.template_id,
         (s.optional_price_override > 0) DESC NULLS LAST, (v.tier = 'standard') DESC NULLS LAST, v.tier NULLS LAST, v.variation_name, s.id
ON CONFLICT (extra_id, template_id) DO NOTHING;

COMMIT;
