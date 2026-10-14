-- ============================================
-- RLS: every browser-reachable policy is scoped to the caller's company, and
-- role checks read the caller's role IN THAT company
-- ============================================
-- Travel2Egypt and ATS share one database. Server routes use the service
-- role (RLS does not apply) and filter by org_id; RLS is what stands between
-- a signed-in person and the other company when they call PostgREST
-- directly with their own session, which anyone can do.
--
-- 1. Policies with no company check at all. Permissive policies are OR'd, so
--    one of these beside a correct org policy still opens the table:
--      invoices   "Managers can view/create/update invoices",
--                 "Admins can delete invoices"
--      expenses   "Managers can view/update expenses", "Agents can create
--                 expenses", "Admins can delete expenses"
--                 -> dropped: invoices_org_* / expenses_org_* already give
--                 members of the company the same access (and more).
--      message_templates "Active users can view templates",
--                 "Managers can manage templates"
--      template_send_log "Agents can view/insert send log"
--      whatsapp_conversations "Agents can access whatsapp conversations"
--      b2c_quotes "b2c_quotes_authenticated" (USING true)
--      invoice_payments "invoice_payments_authenticated" (USING true)
--                 -> recreated with user_is_in_org(org_id) / the role in
--                 that company (b2c_quotes_org_all, invoice_payments_org_all
--                 replace the USING true ones).
--      whatsapp_messages, audit_logs, invoice_reminders, quote_revisions,
--      quote_versions, supplier_invoice_expenses, template_placeholders
--                 -> no org_id. Only the service role touches them (no
--                 browser client, createServerClient-with-anon-key route or
--                 realtime channel reads or writes any of them), so their
--                 browser policies go and anon/authenticated lose the table
--                 grants. audit_logs' "System can insert audit logs" let
--                 even anon insert.
--    Kept as they are: service_role policies (that role bypasses RLS
--    anyway), per-person tables keyed on auth.uid() = user_id (email_*,
--    copilot_settings, user_settings, user_profiles), the global
--    exchange_rates / exchange_rate_snapshots read, and rate_audit_log's
--    WITH CHECK (false).
--
-- 2. is_admin(), is_manager_or_above() and is_agent_or_above() read
--    user_profiles.role, the mirror of the person's EARLIEST membership. An
--    admin of one company who is a viewer in the other passed every
--    "user_is_in_org(org_id) AND is_manager_or_above()" check in both.
--    user_has_org_role(org, roles) reads organization_members for that
--    company (an owner always passes; like the old functions it needs an
--    active profile). Every policy that pairs user_is_in_org(X) with one of
--    the three is rewritten in place with ALTER POLICY (command, roles and
--    permissive/restrictive untouched; only the calls change):
--      user_is_in_org(X) AND is_manager_or_above()
--        -> user_has_org_role(X, ARRAY['owner','admin','manager'])
--      is_agent_or_above() elsewhere beside user_is_in_org(X)
--        -> user_has_org_role(X, ARRAY['owner','admin','manager','agent'])
--      is_admin() -> user_has_org_role(X, ARRAY['owner','admin'])
--      is_manager_or_above() AND (EXISTS (... user_is_in_org(p.org_id)))
--        -> EXISTS (... user_has_org_role(p.org_id, ...))  (child tables)
--    A policy whose text does not fit those shapes is left as it was with a
--    WARNING naming it.
--
-- Idempotent: the second run finds nothing to rewrite, and every DROP is IF
-- EXISTS. Guarded on each table (and its org_id) existing. No data changes.
BEGIN;

-- pg_policies prints expressions relative to the search path; the rewrite
-- below matches unqualified names.
SET LOCAL search_path TO public, pg_temp;

CREATE OR REPLACE FUNCTION public.user_has_org_role(p_org uuid, p_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.organization_members m
           WHERE m.org_id = p_org
             AND m.user_id = auth.uid()
             AND (m.role = 'owner' OR m.role = ANY (p_roles))
         )
     AND EXISTS (
           SELECT 1 FROM public.user_profiles u
           WHERE u.id = auth.uid() AND u.is_active = true
         )
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_org_role(uuid, text[]) FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.user_has_org_role(uuid, text[]) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.user_has_org_role(uuid, text[]) TO authenticated;

-- --------------------------------------------
-- 1. Policies with no company check
-- --------------------------------------------
DO $$
DECLARE
  t text;
  has_org boolean;
BEGIN
  -- invoices / expenses: the org policies already cover members.
  IF to_regclass('public.invoices') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can view invoices" ON public.invoices;
    DROP POLICY IF EXISTS "Managers can create invoices" ON public.invoices;
    DROP POLICY IF EXISTS "Managers can update invoices" ON public.invoices;
    DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;
  END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can view expenses" ON public.expenses;
    DROP POLICY IF EXISTS "Managers can update expenses" ON public.expenses;
    DROP POLICY IF EXISTS "Agents can create expenses" ON public.expenses;
    DROP POLICY IF EXISTS "Admins can delete expenses" ON public.expenses;
  END IF;

  FOREACH t IN ARRAY ARRAY['message_templates', 'template_send_log', 'whatsapp_conversations', 'b2c_quotes', 'invoice_payments'] LOOP
    has_org := EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id');
    IF NOT has_org THEN
      IF to_regclass('public.' || t) IS NOT NULL THEN
        RAISE WARNING '% has no org_id; its policies were left as they are', t;
      END IF;
      CONTINUE;
    END IF;

    IF t = 'message_templates' THEN
      DROP POLICY IF EXISTS "Active users can view templates" ON public.message_templates;
      DROP POLICY IF EXISTS "Managers can manage templates" ON public.message_templates;
      CREATE POLICY "Active users can view templates" ON public.message_templates
        FOR SELECT USING (user_is_in_org(org_id) AND is_active_user());
      CREATE POLICY "Managers can manage templates" ON public.message_templates
        FOR ALL USING (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager']))
        WITH CHECK (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager']));
    ELSIF t = 'template_send_log' THEN
      DROP POLICY IF EXISTS "Agents can view send log" ON public.template_send_log;
      DROP POLICY IF EXISTS "Agents can insert send log" ON public.template_send_log;
      CREATE POLICY "Agents can view send log" ON public.template_send_log
        FOR SELECT USING (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']));
      CREATE POLICY "Agents can insert send log" ON public.template_send_log
        FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']));
    ELSIF t = 'whatsapp_conversations' THEN
      DROP POLICY IF EXISTS "Agents can access whatsapp conversations" ON public.whatsapp_conversations;
      CREATE POLICY "Agents can access whatsapp conversations" ON public.whatsapp_conversations
        FOR ALL USING (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']))
        WITH CHECK (user_has_org_role(org_id, ARRAY['owner', 'admin', 'manager', 'agent']));
    ELSIF t = 'b2c_quotes' THEN
      DROP POLICY IF EXISTS b2c_quotes_authenticated ON public.b2c_quotes;
      DROP POLICY IF EXISTS b2c_quotes_org_all ON public.b2c_quotes;
      CREATE POLICY b2c_quotes_org_all ON public.b2c_quotes
        FOR ALL TO authenticated USING (user_is_in_org(org_id)) WITH CHECK (user_is_in_org(org_id));
    ELSIF t = 'invoice_payments' THEN
      DROP POLICY IF EXISTS invoice_payments_authenticated ON public.invoice_payments;
      DROP POLICY IF EXISTS invoice_payments_org_all ON public.invoice_payments;
      CREATE POLICY invoice_payments_org_all ON public.invoice_payments
        FOR ALL TO authenticated USING (user_is_in_org(org_id)) WITH CHECK (user_is_in_org(org_id));
    END IF;
  END LOOP;

  -- No org_id, service role only: no browser policy, no browser grant.
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Agents can access whatsapp messages" ON public.whatsapp_messages;
  END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
  END IF;
  IF to_regclass('public.invoice_reminders') IS NOT NULL THEN
    DROP POLICY IF EXISTS invoice_reminders_authenticated ON public.invoice_reminders;
  END IF;
  IF to_regclass('public.quote_revisions') IS NOT NULL THEN
    DROP POLICY IF EXISTS quote_revisions_authenticated ON public.quote_revisions;
  END IF;
  IF to_regclass('public.quote_versions') IS NOT NULL THEN
    DROP POLICY IF EXISTS quote_versions_authenticated ON public.quote_versions;
  END IF;
  IF to_regclass('public.supplier_invoice_expenses') IS NOT NULL THEN
    DROP POLICY IF EXISTS supplier_invoice_expenses_authenticated ON public.supplier_invoice_expenses;
  END IF;
  IF to_regclass('public.template_placeholders') IS NOT NULL THEN
    DROP POLICY IF EXISTS template_placeholders_authenticated ON public.template_placeholders;
  END IF;

  FOREACH t IN ARRAY ARRAY['whatsapp_messages', 'audit_logs', 'invoice_reminders', 'quote_revisions',
                           'quote_versions', 'supplier_invoice_expenses', 'template_placeholders'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXCEPTION WHEN undefined_object THEN NULL;
      END;
    END IF;
  END LOOP;
END
$$;

-- --------------------------------------------
-- 2. Role checks read the role in the policy's company
-- --------------------------------------------
-- Returns the rewritten expression, the same text when it calls none of the
-- three functions, or NULL when it does but does not fit a known shape.
CREATE OR REPLACE FUNCTION pg_temp.rls_role_rewrite(e text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $f$
DECLARE
  fns  text[] := ARRAY['is_admin', 'is_manager_or_above', 'is_agent_or_above'];
  sets text[] := ARRAY[
    $s$ARRAY['owner'::text, 'admin'::text]$s$,
    $s$ARRAY['owner'::text, 'admin'::text, 'manager'::text]$s$,
    $s$ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text]$s$
  ];
  any_fn constant text := '\m(is_admin|is_manager_or_above|is_agent_or_above)\(\)';
  m text[];
  orgs text[];
  x text;
  i int;
BEGIN
  IF e IS NULL OR e !~ any_fn THEN
    RETURN e;
  END IF;

  -- A child table scoped through its parent:
  --   (fn() AND (EXISTS ( SELECT 1 FROM parent p WHERE (... AND user_is_in_org(p.org_id)))))
  -- The role check moves inside, onto the parent's company.
  m := regexp_match(e, '^\((is_admin|is_manager_or_above|is_agent_or_above)\(\) AND (\(EXISTS .*\))\)$');
  IF m IS NOT NULL THEN
    IF m[2] ~ any_fn THEN
      RETURN NULL;
    END IF;
    orgs := ARRAY(SELECT DISTINCT (regexp_matches(m[2], 'user_is_in_org\(([^()]+)\)', 'g'))[1]);
    IF cardinality(orgs) <> 1 THEN
      RETURN NULL;
    END IF;
    RETURN replace(m[2], format('user_is_in_org(%s)', orgs[1]),
                   format('user_has_org_role(%s, %s)', orgs[1], sets[array_position(fns, m[1])]));
  END IF;

  -- The table's own org column, checked at the top level of the expression.
  orgs := ARRAY(SELECT DISTINCT (regexp_matches(e, 'user_is_in_org\(([^()]+)\)', 'g'))[1]);
  IF cardinality(orgs) <> 1 OR orgs[1] !~ '^[a-z_][a-z0-9_]*$' OR e ~* '\mselect\M' THEN
    RETURN NULL;
  END IF;
  x := orgs[1];
  FOR i IN 1..3 LOOP
    -- "user_is_in_org(x) AND fn()" is one call; any other fn() keeps its
    -- surrounding logic and asks about the same company.
    e := replace(e, format('user_is_in_org(%s) AND %s()', x, fns[i]),
                 format('user_has_org_role(%s, %s)', x, sets[i]));
    e := regexp_replace(e, '\m' || fns[i] || '\(\)', format('user_has_org_role(%s, %s)', x, sets[i]), 'g');
  END LOOP;
  RETURN e;
END
$f$;

DO $$
DECLARE
  r record;
  nq text;
  nc text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '\m(is_admin|is_manager_or_above|is_agent_or_above)\(\)'
    ORDER BY tablename, policyname
  LOOP
    nq := pg_temp.rls_role_rewrite(r.qual);
    nc := pg_temp.rls_role_rewrite(r.with_check);
    IF (r.qual IS NOT NULL AND nq IS NULL) OR (r.with_check IS NOT NULL AND nc IS NULL) THEN
      RAISE WARNING 'policy % on % calls a profile-wide role function and was left unchanged', r.policyname, r.tablename;
      CONTINUE;
    END IF;
    IF nq IS DISTINCT FROM r.qual AND nc IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', r.policyname, r.tablename, nq, nc);
    ELSIF nq IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, nq);
    ELSIF nc IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', r.policyname, r.tablename, nc);
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE '20270105: % policies now read the role in their company', n;
END
$$;

DROP FUNCTION pg_temp.rls_role_rewrite(text);

COMMIT;
