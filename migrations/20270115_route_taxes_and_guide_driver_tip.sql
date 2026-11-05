-- ============================================
-- The 予約確認書 reads its money from the trip
-- ============================================
-- The operator, 2026-11-05: the confirmation should fill itself from the
-- itinerary, the prices and the deposit rule. Two facts it needs had nowhere
-- to live:
--
-- 1. AIRPORT TAXES BY ROUTE. What the customer pays in 空港使用税 and
--    海外空港諸税等 depends on where they fly from and on which airline. The
--    operator's table:
--
--        KIX-EK   関西空港使用税 ¥3,160   海外空港諸税等 ¥10,800
--        KIX-QR   関西空港使用税 ¥3,160   海外空港諸税等 ¥24,800
--        NRT-EK   成田空港使用税 ¥3,160   海外空港諸税等 ¥10,800
--        NRT-QR   成田空港使用税 ¥3,160   海外空港諸税等 ¥24,800
--        NRT-MS   成田空港使用税 ¥3,160   海外空港諸税等 ¥8,650
--
--    One list per company, edited in Company profile. Seeded here for the
--    companies that print the ATS confirmation; everyone else starts empty.
--
-- 2. ONE TIP FOR GUIDE AND DRIVER. A supplier sets a single tip for both
--    (US$45 a day, collected in Japan). Rates › Tipping only knew a guide
--    and a driver separately; the role 'guide_driver' is added to the
--    vocabulary of every company that has a tipping-role list. The pricing
--    engine charges it once in place of both (lib/tipping-utils).

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS route_taxes JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.organizations'::regclass
       AND conname = 'organizations_route_taxes_is_array'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_route_taxes_is_array CHECK (jsonb_typeof(route_taxes) = 'array');
  END IF;
END
$chk$;

UPDATE public.organizations
   SET route_taxes = '[
     {"route": "KIX-EK", "airport_tax": 3160, "overseas_tax": 10800},
     {"route": "KIX-QR", "airport_tax": 3160, "overseas_tax": 24800},
     {"route": "NRT-EK", "airport_tax": 3160, "overseas_tax": 10800},
     {"route": "NRT-QR", "airport_tax": 3160, "overseas_tax": 24800},
     {"route": "NRT-MS", "airport_tax": 3160, "overseas_tax": 8650}
   ]'::jsonb
 WHERE route_taxes = '[]'::jsonb
   AND 'ats-booking-confirmation' = ANY(document_templates);

INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, rank)
SELECT DISTINCT v.org_id, 'tipping_role', 'guide_driver', 'Guide & Driver', 'ガイド・ドライバー', 3
  FROM public.org_vocabularies v
 WHERE v.kind = 'tipping_role'
ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;

COMMIT;
