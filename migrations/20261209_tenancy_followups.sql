-- ============================================
-- Tenancy follow-ups: Concierge briefs are per company, the WhatsApp activity
-- log names team members (sales_agents retired), preferences are per
-- (person, company)
-- ============================================
-- A second company (ATS) runs on this install beside Travel2Egypt. Batches
-- 1–3 gave nearly every company table an org_id; these were left over.
--
-- 1. CONCIERGE BRIEFS. Each company now has its own Concierge webhook secret
--    (CONCIERGE_WEBHOOK_SECRETS, app/api/webhooks/concierge): the secret that
--    signed a brief names its company, and the brief, its revisions (through
--    the brief) and its Copilot thread are that company's. The same
--    Concierge conversation id can now reach two companies (one Concierge
--    deployment configured with both companies' secrets, or a visitor's
--    conversation forwarded to both), and each must keep its own lead —
--    the second company's brief must not be read as an "update" of the
--    first's. So:
--      concierge_briefs           uq_concierge_briefs_conversation
--                                 UNIQUE (conversation_id) →
--                                 concierge_briefs_org_conversation_key
--                                 UNIQUE (org_id, conversation_id)
--      concierge_brief_revisions  uq_concierge_revision UNIQUE
--                                 (conversation_id, brief_revision) →
--                                 concierge_brief_revisions_brief_revision_key
--                                 UNIQUE (brief_id, brief_revision) (a brief
--                                 is one company's, so this is per company;
--                                 every existing row satisfies it — a brief
--                                 was one per conversation until now)
--    And RLS, quoted from the baseline (20260829) — no later migration
--    touched it:
--      concierge_brief_revisions  "Authenticated users can view concierge
--                                 brief revisions" SELECT USING (auth.uid()
--                                 IS NOT NULL) — every company's leads'
--                                 full payloads (names, emails, phones) to
--                                 anyone signed in.
--    Dropped; in its place concierge_brief_revisions_org_select: its brief's
--    company (EXISTS on concierge_briefs, user_is_in_org). Writes are the
--    webhook's (service role); there was no write policy and there is none.
--    concierge_briefs' own SELECT is org-scoped since 20261204.
--
-- 2. WHATSAPP ACTIVITY LOG. conversation_activity.agent_id referenced
--    sales_agents, but every writer — /api/whatsapp/activity,
--    /api/whatsapp/conversations (new conversation, PATCH),
--    /api/whatsapp/conversations/assign — writes a TEAM MEMBER id into it, so
--    every one of those inserts failed the foreign key, silently (the result
--    was never checked): the assignment and status history stayed empty.
--    conversation_notes.agent_id (no reader or writer in the app) has the
--    same foreign key.
--    BACKFILL, for both tables, each rule only on rows still unresolved:
--      1. agent_id is a team member of the conversation's company → kept
--      2. agent_id is a team member of ANOTHER company → the same person's
--         team member row in the conversation's company (by user_id), else
--         left and listed: '<table>.agent_id points at another company''s
--         team member'
--      3. agent_id is a sales agent whose login (sales_agents.user_id) has a
--         team member row in the conversation's company → that row
--      4. anything else (a sales agent with no such team member, or an id
--         that is neither) → NULL, the old value saved in
--         org_backfill_dropped_rows ('<table>.agent_id', row id,
--         {"agent_id": …}) and listed: 'agent_id was not a team member —
--         cleared'
--    Then agent_id REFERENCES team_members(id) ON DELETE SET NULL (same
--    constraint names as before).
--    RLS, quoted from the baseline:
--      conversation_activity  conversation_activity_authenticated ALL TO
--                             authenticated USING (true) WITH CHECK (true)
--      conversation_notes     conversation_notes_authenticated (same)
--    — every company's assignment history and notes to anyone signed in.
--    Dropped; in their place <table>_org_all: the conversation's company
--    (EXISTS on whatsapp_conversations, user_is_in_org). Every caller is an
--    API route on the service role; this is the second wall.
--    sales_agents is now read by nothing (grep of app/ lib/ components/
--    hooks/ scripts/: only types/database.types.ts named it), and
--    assign_conversation() / get_next_available_agent() only read and
--    wrote it (no .rpc() caller anywhere). All three DROPPED; sales_agents'
--    rows are saved whole in org_backfill_dropped_rows ('sales_agents', id,
--    row) first. Its policy sales_agents_authenticated (ALL USING (true))
--    goes with it.
--
-- 3. USER PREFERENCES. default_tier (a key of the company's vocabulary),
--    default_margin_percent and default_currency are business settings, but
--    user_preferences was one row per person (UNIQUE (user_id)): someone in
--    both companies quoted ATS trips at Travel2Egypt's margin and currency.
--    org_id uuid REFERENCES organizations ON DELETE CASCADE (as
--    itineraries.org_id; no DEFAULT — the code stamps it), NOT NULL.
--    BACKFILL, each rule only on rows still NULL:
--      1. the person's one company: org_backfill_user_org(user_id)
--      2. a person in both companies → org_backfill_default() (when they
--         belong to it, else their oldest company), and a COPY for each
--         other company they belong to (new id, same settings) — the
--         original and every copy listed: 'person in both companies — one
--         row per company'
--      3. no membership → org_backfill_default() — listed: 'no company
--         membership — default'
--    UNIQUE (user_id) → user_preferences_user_id_org_id_key UNIQUE (user_id,
--    org_id).
--    RLS, quoted from the baseline (user_preferences_authenticated_all was
--    dropped by 20261130): "Users can view own preferences" (SELECT),
--    "Users can insert own preferences" (INSERT), "Users can update own
--    preferences" (UPDATE), "Users can delete own preferences" (DELETE),
--    "Users can upsert own preferences" (ALL) — each auth.uid() = user_id and
--    no company. All five dropped; in their place
--    user_preferences_own_org_{select,insert,update,delete}: auth.uid() =
--    user_id AND user_is_in_org(org_id), TO authenticated.
--
-- Read the lists afterwards:
--   SELECT * FROM org_backfill_review WHERE table_name IN
--     ('conversation_activity', 'conversation_notes', 'user_preferences')
--     ORDER BY id;
--   SELECT * FROM org_backfill_dropped_rows ORDER BY table_name, row_id;
--
-- DEPLOY ORDER: apply this migration FIRST, then deploy the code. The code
-- reads and writes user_preferences by (user_id, org_id) and upserts on that
-- pair (fails without the unique), embeds conversation_activity's agent
-- through the team_members foreign key, and looks Concierge briefs up by
-- (org_id, conversation_id). The OLD code keeps working on the new schema
-- until then, except: its preferences upsert (onConflict user_id) fails —
-- deploy promptly; and its activity read (agent:sales_agents) errors once
-- sales_agents is gone — the inbox's history panel is empty until the code
-- is deployed (it was empty already: no write ever succeeded).
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every rule fills only
-- what is unresolved, copies only for rows placed in this run, review rows ON
-- CONFLICT DO NOTHING, constraints and policies dropped before created,
-- tables guarded (to_regclass). On a bare replay (no organisations) nothing
-- is written.
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_backfill_dropped_rows (
  table_name text NOT NULL,
  row_id text NOT NULL,
  row_data jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);
ALTER TABLE public.org_backfill_dropped_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_dropped_rows FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Concierge briefs: one per conversation PER COMPANY.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.concierge_briefs') IS NOT NULL THEN
    ALTER TABLE public.concierge_briefs DROP CONSTRAINT IF EXISTS uq_concierge_briefs_conversation;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concierge_briefs_org_conversation_key') THEN
      ALTER TABLE public.concierge_briefs
        ADD CONSTRAINT concierge_briefs_org_conversation_key UNIQUE (org_id, conversation_id);
    END IF;
  END IF;

  IF to_regclass('public.concierge_brief_revisions') IS NOT NULL THEN
    ALTER TABLE public.concierge_brief_revisions DROP CONSTRAINT IF EXISTS uq_concierge_revision;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concierge_brief_revisions_brief_revision_key') THEN
      ALTER TABLE public.concierge_brief_revisions
        ADD CONSTRAINT concierge_brief_revisions_brief_revision_key UNIQUE (brief_id, brief_revision);
    END IF;

    DROP POLICY IF EXISTS "Authenticated users can view concierge brief revisions" ON public.concierge_brief_revisions;
    DROP POLICY IF EXISTS concierge_brief_revisions_org_select ON public.concierge_brief_revisions;
    IF to_regclass('public.concierge_briefs') IS NOT NULL THEN
      CREATE POLICY concierge_brief_revisions_org_select ON public.concierge_brief_revisions FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM public.concierge_briefs b
                        WHERE b.id = brief_id AND public.user_is_in_org(b.org_id)));
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The WhatsApp activity log and notes name team members.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  has_sales boolean := to_regclass('public.sales_agents') IS NOT NULL;
BEGIN
  IF to_regclass('public.team_members') IS NULL OR to_regclass('public.whatsapp_conversations') IS NULL THEN RETURN; END IF;

  FOREACH t IN ARRAY ARRAY['conversation_activity', 'conversation_notes'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    -- Off the old foreign key first: rule 2 and 3 write team member ids.
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_agent_id_fkey');

    -- 2. Another company's team member → the same person's row in the
    --    conversation's company.
    EXECUTE format($q$
      UPDATE public.%I a SET agent_id = c.id
        FROM public.whatsapp_conversations w, public.team_members o, public.team_members c
       WHERE w.id = a.conversation_id AND o.id = a.agent_id AND o.org_id <> w.org_id
         AND o.user_id IS NOT NULL AND c.user_id = o.user_id AND c.org_id = w.org_id
    $q$, t);
    EXECUTE format($q$
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT %1$L, a.id::text, w.org_id, %2$L
        FROM public.%1$I a
        JOIN public.whatsapp_conversations w ON w.id = a.conversation_id
        JOIN public.team_members o ON o.id = a.agent_id
       WHERE o.org_id <> w.org_id
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    $q$, t, t || '.agent_id points at another company''s team member');

    -- 3. A sales agent whose login is a team member of the conversation's
    --    company → that team member.
    IF has_sales THEN
      EXECUTE format($q$
        UPDATE public.%I a SET agent_id = c.id
          FROM public.whatsapp_conversations w, public.sales_agents s, public.team_members c
         WHERE w.id = a.conversation_id AND s.id = a.agent_id
           AND NOT EXISTS (SELECT 1 FROM public.team_members x WHERE x.id = a.agent_id)
           AND s.user_id IS NOT NULL AND c.user_id = s.user_id AND c.org_id = w.org_id
      $q$, t);
    END IF;

    -- 4. Anything else is not a team member: saved, cleared, listed.
    EXECUTE format($q$
      WITH stale AS (
        SELECT a.id, a.agent_id, w.org_id
          FROM public.%1$I a LEFT JOIN public.whatsapp_conversations w ON w.id = a.conversation_id
         WHERE a.agent_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.team_members x WHERE x.id = a.agent_id)
      ), saved AS (
        INSERT INTO public.org_backfill_dropped_rows (table_name, row_id, row_data)
        SELECT %2$L, s.id::text, jsonb_build_object('agent_id', s.agent_id) FROM stale s
        ON CONFLICT (table_name, row_id) DO NOTHING
      ), listed AS (
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT %1$L, s.id::text, s.org_id, 'agent_id was not a team member — cleared' FROM stale s
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      )
      UPDATE public.%1$I a SET agent_id = NULL FROM stale s WHERE s.id = a.id
    $q$, t, t || '.agent_id');

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (agent_id) REFERENCES public.team_members(id) ON DELETE SET NULL',
      t, t || '_agent_id_fkey');

    -- RLS: the conversation's company.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_all', t);
    EXECUTE format($q$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations w
                        WHERE w.id = conversation_id AND public.user_is_in_org(w.org_id)))
        WITH CHECK (EXISTS (SELECT 1 FROM public.whatsapp_conversations w
                             WHERE w.id = conversation_id AND public.user_is_in_org(w.org_id)))
    $q$, t || '_org_all', t);
  END LOOP;
END
$$;

-- sales_agents: nothing reads or writes it now. Saved whole, then dropped
-- with the two functions that only served it.
DROP FUNCTION IF EXISTS public.assign_conversation(uuid, uuid, uuid, character varying);
DROP FUNCTION IF EXISTS public.get_next_available_agent();
DO $$
BEGIN
  IF to_regclass('public.sales_agents') IS NULL THEN RETURN; END IF;
  INSERT INTO public.org_backfill_dropped_rows (table_name, row_id, row_data)
  SELECT 'sales_agents', s.id::text, to_jsonb(s) FROM public.sales_agents s
  ON CONFLICT (table_name, row_id) DO NOTHING;
  DROP TABLE public.sales_agents;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. User preferences: one row per (person, company).
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.user_preferences
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
-- Before any copy: a person in both companies gets a second row.
ALTER TABLE IF EXISTS public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;

DO $$
DECLARE
  def uuid;
  rec record;
  new_id uuid;
  trg_on boolean;
BEGIN
  IF to_regclass('public.user_preferences') IS NULL THEN RETURN; END IF;
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO def;
  IF def IS NULL THEN
    RAISE NOTICE 'user_preferences: no organisations — nothing to backfill';
    RETURN;
  END IF;

  -- An assignment is not an edit.
  trg_on := EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_preferences'::regclass
                     AND tgname = 'set_updated_at' AND tgenabled = 'O');
  IF trg_on THEN ALTER TABLE public.user_preferences DISABLE TRIGGER set_updated_at; END IF;

  -- 1. The person's one company.
  UPDATE public.user_preferences p SET org_id = public.org_backfill_user_org(p.user_id)
   WHERE p.org_id IS NULL AND public.org_backfill_user_org(p.user_id) IS NOT NULL;

  -- 2. A person in both: the default company (else their oldest), and a copy
  --    for each other company they belong to.
  CREATE TEMP TABLE IF NOT EXISTS _prefs_both (id uuid) ON COMMIT DROP;
  DELETE FROM _prefs_both;
  WITH filled AS (
    UPDATE public.user_preferences p SET org_id = coalesce(
        (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = p.user_id AND m.org_id = def LIMIT 1),
        (SELECT m.org_id FROM public.organization_members m JOIN public.organizations o ON o.id = m.org_id
          WHERE m.user_id = p.user_id ORDER BY o.created_at, o.id LIMIT 1))
     WHERE p.org_id IS NULL
       AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = p.user_id)
    RETURNING p.id
  )
  INSERT INTO _prefs_both SELECT id FROM filled;

  FOR rec IN
    SELECT DISTINCT p.id, p.user_id, p.org_id AS home, m.org_id AS other
      FROM _prefs_both b
      JOIN public.user_preferences p ON p.id = b.id
      JOIN public.organization_members m ON m.user_id = p.user_id AND m.org_id <> p.org_id
     WHERE NOT EXISTS (SELECT 1 FROM public.user_preferences q WHERE q.user_id = p.user_id AND q.org_id = m.org_id)
     ORDER BY p.id, m.org_id
  LOOP
    new_id := gen_random_uuid();
    INSERT INTO public.user_preferences
    SELECT (jsonb_populate_record(NULL::public.user_preferences,
             to_jsonb(r) || jsonb_build_object('id', new_id, 'org_id', rec.other))).*
      FROM public.user_preferences r WHERE r.id = rec.id;
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES ('user_preferences', new_id::text, rec.other, 'person in both companies — one row per company')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'user_preferences', p.id::text, p.org_id, 'person in both companies — one row per company'
    FROM _prefs_both b JOIN public.user_preferences p ON p.id = b.id
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- 3. No company at all.
  WITH filled AS (
    UPDATE public.user_preferences SET org_id = def WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'user_preferences', id::text, def, 'no company membership — default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  IF trg_on THEN ALTER TABLE public.user_preferences ENABLE TRIGGER set_updated_at; END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.user_preferences') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.user_preferences WHERE org_id IS NULL) THEN
    RAISE NOTICE 'user_preferences: rows without an organisation remain — org_id left nullable';
  ELSE
    ALTER TABLE public.user_preferences ALTER COLUMN org_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_user_id_org_id_key') THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_user_id_org_id_key UNIQUE (user_id, org_id);
  END IF;

  DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
  DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
  DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
  DROP POLICY IF EXISTS "Users can delete own preferences" ON public.user_preferences;
  DROP POLICY IF EXISTS "Users can upsert own preferences" ON public.user_preferences;
  DROP POLICY IF EXISTS user_preferences_own_org_select ON public.user_preferences;
  DROP POLICY IF EXISTS user_preferences_own_org_insert ON public.user_preferences;
  DROP POLICY IF EXISTS user_preferences_own_org_update ON public.user_preferences;
  DROP POLICY IF EXISTS user_preferences_own_org_delete ON public.user_preferences;
  CREATE POLICY user_preferences_own_org_select ON public.user_preferences FOR SELECT TO authenticated
    USING (auth.uid() = user_id AND public.user_is_in_org(org_id));
  CREATE POLICY user_preferences_own_org_insert ON public.user_preferences FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id AND public.user_is_in_org(org_id));
  CREATE POLICY user_preferences_own_org_update ON public.user_preferences FOR UPDATE TO authenticated
    USING (auth.uid() = user_id AND public.user_is_in_org(org_id))
    WITH CHECK (auth.uid() = user_id AND public.user_is_in_org(org_id));
  CREATE POLICY user_preferences_own_org_delete ON public.user_preferences FOR DELETE TO authenticated
    USING (auth.uid() = user_id AND public.user_is_in_org(org_id));
END
$$;

COMMIT;
