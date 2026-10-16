-- ============================================
-- Guest surveys: only your organisation's, one answer per guest.
-- Supplier document numbers: per company.
-- ============================================
-- guest_surveys (20261031) was created with no RLS and no policy, and the
-- baseline grants ALL on new tables to authenticated. So through PostgREST,
-- with the public anon key and ANY signed-in session — a self-signed-up
-- stranger with no membership included — GET /rest/v1/guest_surveys read
-- every company's survey tokens, client names, trip snapshots and answers,
-- and PATCH/DELETE changed or removed them. RLS is now on, every policy on it
-- is dropped by name (whatever it was called — one left behind would re-open
-- the table, policies are OR'd) and replaced by guest_surveys_org_select/
-- insert/update/delete, TO authenticated, = user_is_in_org(org_id). anon has
-- no grant and matches no policy.
--
-- One survey link per trip is handed to the whole party (the printed sheet's
-- QR, the emailed link), and the public POST replaced guest_surveys.responses
-- on every submit: the second guest's answers erased the first's, silently,
-- and the public GET echoed the earlier guest's answers to whoever opened the
-- link. Each submission is now its own row:
--
--   guest_survey_responses  org_id, survey_id, respondent_name, answers,
--                           submitted_at. org_id is always the survey's
--                           (a trigger sets it), so a response can never sit
--                           in another company. Same RLS as guest_surveys.
--
-- DATA: every submitted survey's answers (guest_surveys.responses) become its
-- first response row, submitted at its submitted_at. guest_surveys.responses
-- is left as it was and is no longer written or read; nothing is deleted.
--
-- BROWSER CALLERS: none. The staff results page (/surveys → /api/surveys),
-- the public survey (/api/public/survey/<token>), the daily invite job and
-- the printed sheet all use the service role, which bypasses RLS.
--
-- Supplier document numbers (HV-/SO-/TV-/AV-/GA-/CV-YYYY-NNNN) were read as
-- the highest number across EVERY company (lib/documents/numberer.ts, no org
-- filter) under one install-wide UNIQUE (document_number): ATS and
-- Travel2Egypt drew interleaved numbers from one sequence — each could read
-- the other's voucher volume off the gaps — and a number typed on one
-- company's voucher that the other already held failed as a duplicate,
-- saying that it existed. Now, as quotes (20261211) and bookings (20261212):
--
--   supplier_document_number_counters  one row per (company, prefix, year):
--                           the last number handed out, locked by the
--                           INSERT … ON CONFLICT DO UPDATE that increments it.
--   next_supplier_document_number(org, prefix, year)  the next free number
--                           for that company. The first call for a company,
--                           prefix and year starts after the company's own
--                           highest well-formed number; a number the company
--                           already holds is skipped. Service role only.
--   UNIQUE (org_id, document_number)  replaces UNIQUE (document_number): both
--                           companies may hold HV-2026-0007.
--
-- EXISTING DOCUMENT NUMBERS ARE NOT CHANGED. The install-wide constraint
-- held, so the per-company one holds.
--
-- Idempotent (policies dropped before they are created, CREATE … IF NOT
-- EXISTS, CREATE OR REPLACE, the backfill skips surveys that already have a
-- response) and guarded on each table existing (to_regclass). Applying it
-- twice changes nothing the second time.
BEGIN;

-- ── 1. Each guest's answers kept separately ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.guest_surveys') IS NULL THEN RETURN; END IF;

  CREATE TABLE IF NOT EXISTS public.guest_survey_responses (
    id              uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id          uuid NOT NULL,
    survey_id       uuid NOT NULL,
    -- The name the guest typed (optional — the questionnaire welcomes
    -- unnamed answers). Also inside answers.guest_name, as submitted.
    respondent_name character varying(200),
    -- Ratings / comments / extras / free text, as lib/surveys/guest-survey.ts
    -- sanitizeResponses keeps them.
    answers         jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_at    timestamp with time zone DEFAULT now() NOT NULL,
    created_at      timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guest_survey_responses_pkey PRIMARY KEY (id),
    CONSTRAINT guest_survey_responses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    CONSTRAINT guest_survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.guest_surveys(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS guest_survey_responses_survey_idx
    ON public.guest_survey_responses (survey_id, submitted_at);
  CREATE INDEX IF NOT EXISTS guest_survey_responses_org_idx
    ON public.guest_survey_responses (org_id, submitted_at DESC);

  -- A response belongs to its survey's company, whatever the writer sent.
  CREATE OR REPLACE FUNCTION public.guest_survey_responses_org_from_survey() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  BEGIN
    SELECT s.org_id INTO NEW.org_id FROM public.guest_surveys s WHERE s.id = NEW.survey_id;
    RETURN NEW;
  END $fn$;
  DROP TRIGGER IF EXISTS guest_survey_responses_org_from_survey ON public.guest_survey_responses;
  CREATE TRIGGER guest_survey_responses_org_from_survey
    BEFORE INSERT OR UPDATE OF survey_id, org_id ON public.guest_survey_responses
    FOR EACH ROW EXECUTE FUNCTION public.guest_survey_responses_org_from_survey();

  -- The answers each submitted survey holds today become its first response.
  INSERT INTO public.guest_survey_responses (org_id, survey_id, respondent_name, answers, submitted_at, created_at)
  SELECT s.org_id, s.id,
         NULLIF(btrim(left(s.responses->>'guest_name', 200)), ''),
         s.responses,
         COALESCE(s.submitted_at, s.updated_at, s.created_at),
         now()
    FROM public.guest_surveys s
   WHERE s.status = 'submitted'
     AND s.responses IS NOT NULL AND s.responses <> '{}'::jsonb
     AND NOT EXISTS (SELECT 1 FROM public.guest_survey_responses r WHERE r.survey_id = s.id);

  COMMENT ON COLUMN public.guest_surveys.responses IS
    'Before 20261216: the LAST submission only. Copied to guest_survey_responses; no longer written or read.';
END
$$;

-- ── 2. Both survey tables: only your organisation's, through RLS ──────────
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['guest_surveys', 'guest_survey_responses'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id))', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id))', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_delete', t);
    -- The routes' client (as 20261113 does for supplier_documents).
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$$;

-- ── 3. Supplier document numbers: per company, no race ────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_document_number_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix text NOT NULL CHECK (prefix ~ '^[A-Z]{2,3}$'),
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, prefix, year)
);
ALTER TABLE public.supplier_document_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_document_number_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.supplier_document_number_counters TO service_role;

DO $$
BEGIN
  IF to_regclass('public.supplier_documents') IS NULL THEN RETURN; END IF;

  -- Unique per company. The global key goes only once this one is in place.
  CREATE UNIQUE INDEX IF NOT EXISTS supplier_documents_org_document_number_key
    ON public.supplier_documents (org_id, document_number);
  ALTER TABLE public.supplier_documents DROP CONSTRAINT IF EXISTS supplier_documents_document_number_key;

  CREATE OR REPLACE FUNCTION public.next_supplier_document_number(p_org uuid, p_prefix text, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
  DECLARE
    pattern text;
    seed integer := 0;
    n integer;
    candidate text;
    attempts integer := 0;
  BEGIN
    IF p_org IS NULL THEN RAISE EXCEPTION 'next_supplier_document_number: a document must belong to a company'; END IF;
    IF p_prefix IS NULL OR p_prefix !~ '^[A-Z]{2,3}$' THEN
      RAISE EXCEPTION 'next_supplier_document_number: bad prefix %', p_prefix;
    END IF;
    pattern := '^' || p_prefix || '-' || p_year || '-([0-9]{1,9})$';

    -- First number of the year for this company and prefix: carry on after
    -- its own highest well-formed number (a malformed one is ignored).
    IF NOT EXISTS (SELECT 1 FROM supplier_document_number_counters
                    WHERE org_id = p_org AND prefix = p_prefix AND year = p_year) THEN
      SELECT COALESCE(MAX((regexp_match(document_number, pattern))[1]::integer), 0) INTO seed
        FROM supplier_documents WHERE org_id = p_org AND document_number ~ pattern;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'next_supplier_document_number: no free % number after % attempts', p_prefix, attempts;
      END IF;
      INSERT INTO supplier_document_number_counters AS c (org_id, prefix, year, last_value)
        VALUES (p_org, p_prefix, p_year, seed + 1)
        ON CONFLICT (org_id, prefix, year) DO UPDATE SET last_value = c.last_value + 1
        RETURNING last_value INTO n;
      -- Four digits as before; a fifth is added, never cut off (lpad truncates).
      candidate := p_prefix || '-' || p_year || '-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM supplier_documents WHERE org_id = p_org AND document_number = candidate);
    END LOOP;
    RETURN candidate;
  END $fn$;

  REVOKE EXECUTE ON FUNCTION public.next_supplier_document_number(uuid, text, integer) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.next_supplier_document_number(uuid, text, integer) TO service_role;
END
$$;

COMMIT;
