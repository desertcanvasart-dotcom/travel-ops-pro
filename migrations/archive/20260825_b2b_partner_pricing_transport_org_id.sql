-- ============================================
-- org_id for b2b_partners, b2b_pricing_rules, b2b_transport_packages
-- ============================================
-- The security audit found these three shared across organisations: the b2b
-- routes run on the service-role client (RLS bypassed) and had no tenant column
-- to filter by, so one operator could read and mutate another's partner list,
-- pricing rules and transport packages — commercial terms, net rates, margins.
-- Same hole tour_quotes and clients had before their own migrations.
--
-- All three are per-operator business configuration, not a shared catalogue, so
-- all three become org-scoped.
--
-- ORDERING: app/api/b2b/partners/**, /pricing-rules and /transport-packages
-- filter and stamp org_id as of the same change. Apply this BEFORE (or with)
-- that deploy, or those routes 42703 on read and 23502 on insert.
--
-- Data risk is low: b2b_pricing_rules is empty, the other two hold one row each
-- on production today. Each table has exactly ONE insert path, all stamped in
-- the same change:
--   app/api/b2b/partners/route.ts
--   app/api/b2b/pricing-rules/route.ts
--   app/api/b2b/transport-packages/route.ts
--
-- Idempotent: safe to run twice.

DO $$
DECLARE
  t text;
  oldest_org uuid;
  oldest_org_null_count bigint;
BEGIN
  SELECT id INTO oldest_org FROM public.organizations ORDER BY created_at ASC LIMIT 1;

  FOREACH t IN ARRAY ARRAY['b2b_partners', 'b2b_pricing_rules', 'b2b_transport_packages']
  LOOP
    -- 1. Column (nullable to start).
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE',
      t);

    -- 2. Backfill. There is no per-row owner signal (these tables link to no
    --    org-scoped parent), so everything existing goes to the oldest org —
    --    the one running this deployment. Correct on a single-operator install;
    --    reviewable, not silently mis-split, if a second tenant ever exists.
    IF oldest_org IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET org_id = %L WHERE org_id IS NULL', t, oldest_org);
    END IF;

    -- 3. From here a row without an owner is a bug, not a state. Only set the
    --    constraint once no NULL rows remain (they only remain if organizations
    --    is empty, in which case leave it nullable rather than fail the migration).
    EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id IS NULL', t) INTO oldest_org_null_count;
    IF oldest_org_null_count = 0 THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    ELSE
      RAISE NOTICE 'Left %.org_id nullable — % rows still NULL (organizations empty?)', t, oldest_org_null_count;
    END IF;

    -- 4. Index every "this org's rows" read.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', t || '_org_id_idx', t);
  END LOOP;
END $$;

COMMENT ON COLUMN public.b2b_partners.org_id IS
  'Owning organisation. Added 2026-08-25 (security audit P1b): b2b partner records were shared across tenants.';
COMMENT ON COLUMN public.b2b_pricing_rules.org_id IS
  'Owning organisation. Added 2026-08-25 (security audit P1b): pricing rules were shared across tenants.';
COMMENT ON COLUMN public.b2b_transport_packages.org_id IS
  'Owning organisation. Added 2026-08-25 (security audit P1b): transport packages were shared across tenants.';
