-- STEP 1 — the company migrations. Run right before merging the release PR.
-- Generated from migrations/ — 7 files, in order. Each is followed by its record
-- line in schema_migrations. Every file is its own transaction (BEGIN/COMMIT).

-- ==================================================================
-- 20261203_people_work_org_id
-- ==================================================================
-- ============================================
-- People and work belong to one company: team_members, departments, tasks,
-- notifications get an org_id
-- ============================================
-- A second company (ATS) runs on this install beside Travel2Egypt. These four
-- tables had no org_id, so every row was every company's:
--
--   team_members   the staff directory. /api/team-members listed, edited and
--                  deactivated every company's staff; the assignee pickers
--                  (tasks, trips, WhatsApp) offered them; lib/email/own-address
--                  treated every company's staff address as "ours".
--   departments    one set for the whole install. A company renaming or
--                  deleting one did it to the other's; the one-owner-per-
--                  service-type rule spanned both, and task routing used the
--                  other company's departments.
--   tasks          /api/tasks listed, edited and deleted every company's
--                  tasks; the dashboard counted them; the reminder cron
--                  emailed them from whichever company's mailbox came first.
--   notifications  addressed to a person, never to a company: someone in
--                  both companies saw both companies' alerts in one bell.
--
-- And RLS, through PostgREST with nothing but a session (quoted from 20260829;
-- RLS policies are OR'd, so one USING (true) opens the table):
--   team_members   "Allow read/insert/update/delete team_members" (true) —
--                  beside "Users can view team members" (is_active_user()),
--                  "Managers can insert/update/delete team members"
--                  (is_manager_or_above()).
--   departments    "Allow authenticated read access to departments" (true);
--                  "Allow service role full access to departments" (kept).
--   tasks          "Task visibility by role" (is_manager_or_above() OR
--                  (is_agent_or_above() AND assigned_to::text = auth.uid()::text)),
--                  "Task update by role" (is_manager_or_above() OR
--                  assigned_to::text = auth.uid()::text), "Agents can create
--                  tasks" (is_agent_or_above()), "Managers can delete tasks"
--                  (is_manager_or_above()) — roles, never a company.
--   notifications  "Allow read/insert/update/delete notifications",
--                  "Users can view/update/delete own notifications",
--                  "System can create/insert notifications" — all (true) —
--                  and "Users see/update own notifications" (is_active_user()).
-- All dropped. In their place (no browser code reads these tables — every
-- caller is an API route on the service role, which RLS does not apply to;
-- these are the second wall):
--   team_members   select: user_is_in_org(org_id) AND is_active_user();
--                  insert/update/delete: user_is_in_org(org_id) AND
--                  is_manager_or_above().
--   departments    select: user_is_in_org(org_id). No write policy (there was
--                  none; the service-role policy stays).
--   tasks          the same four role rules as before, each AND
--                  user_is_in_org(org_id) (the assigned_to = auth.uid()
--                  comparison is kept as it was — not widened).
--   notifications  select/update/delete: user_is_in_org(org_id) AND addressed
--                  to the caller (user_id = auth.uid(), or a team_members row
--                  of theirs); insert: user_is_in_org(org_id).
--
-- BACKFILL — every existing row goes to the company it can be traced to, in
-- this order; each rule fills only rows still without one. Helpers from
-- 20261202 (org_backfill_*). Rows nothing traces get the default organisation
-- (Travel2Egypt) AND a row in org_backfill_review.
--
--   team_members
--     1. the login's company: org_backfill_user_org(user_id)
--     2. a person in BOTH companies (their login is a member of both): the
--        row goes to the default organisation and a COPY is made for each
--        other company they belong to (same name, email, phone, role, login…,
--        a new id) — one row per company, so each company's screens, tasks
--        and conversations name its own. Original and copies are listed in
--        review: 'person in both companies — one row per company'.
--     3. no login: the email's login (auth.users) → that login's company
--     4. email @ats-hj.com → ATS
--     5. the default + review
--     Then (org_id, user_id) is unique where user_id is set. A login with two
--     rows in one company keeps the oldest; the later row's login link is
--     cleared (review: 'second row for one login in one company — login
--     unlinked').
--   departments
--     1. the default organisation (they were set up for Travel2Egypt)
--     2. after the team members and tasks are placed: a department that a
--        team member or task of ANOTHER company points at is COPIED into that
--        company (same name, description, service types, active flag) and
--        that company's rows are pointed at the copy (review on the copy:
--        'used by another company — copied'). A department nobody of the
--        other company uses stays the default's only: a company without
--        departments creates its own on the Departments screen.
--     UNIQUE (name) becomes UNIQUE (org_id, name); the one-active-owner-per-
--     service-type rule (lib/department-admin.ts) is per company.
--   tasks
--     1. what it is linked to: linked_type itinerary / client / invoice /
--        expense → that row's org_id
--     2. its assignee's company (team_members.org_id)
--     3. its department's company — the default, as every department starts
--        there (review: 'traced only by its department')
--     4. the default + review
--     Then the assignee is the SAME PERSON's row in the task's company (a
--     person in both companies has one); an assignee with no row in the
--     task's company is cleared (review: 'assignee is not in the task''s
--     company — unassigned').
--   notifications
--     1. related_itinerary_id → the itinerary's org
--     2. related_task_id → the task's org
--     3. the login's company: org_backfill_user_org(user_id)
--     4. the addressed team member's company
--     5. the default + review
--     Then team_member_id is the same person's row in the notification's
--     company where there is one (otherwise listed in review: 'addressed to
--     a team member of another company').
--
-- Other rows that name a team member and already have an org_id are pointed
-- at the same person's row in THEIR company (a person in both companies now
-- has one per company): itineraries.assigned_to, whatsapp_conversations
-- .assigned_team_member_id / .assigned_agent_id / .last_agent_id,
-- trip_events.actor_team_member_id, trip_messages.team_member_id, and
-- conversation_activity.team_member_id (through its conversation's org). A
-- reference to someone with no row in that company is left as it is and
-- listed in review ('<table>.<column> points at another company''s team
-- member'). email_conversations.assigned_team_member_id is repointed when
-- email_conversations gets its org_id.
--
-- Read the list afterwards:
--   SELECT * FROM org_backfill_review
--    WHERE table_name IN ('team_members','departments','tasks','notifications')
--       OR reason LIKE '%team member%' ORDER BY id;
--
-- DEAD objects dropped (grep of app/ lib/ components/ hooks/ scripts/: no
-- reader or writer; only types/database.types.ts named them):
--   views active_tasks, archived_tasks (over tasks)
--   tables agent_team_member_mapping, assignment_rules, reminder_settings
--     (each an ALL USING (true) policy for any signed-in user)
-- KEPT, though the inventory listed it dead: sales_agents. It is live —
-- app/api/whatsapp/activity/route.ts embeds agent:sales_agents(...) on every
-- read and write of a conversation's history (the WhatsApp inbox calls it),
-- and conversation_activity.agent_id references it. assign_conversation()
-- and get_next_available_agent() read only sales_agents, so they stay too.
--
-- org_id has no DEFAULT: the code stamps every insert (getCurrentOrgId(), or
-- the parent row's org in cron and webhook paths).
--
-- DEPLOY ORDER: apply this migration FIRST, then deploy the code. The code
-- selects, filters and inserts org_id on these tables and fails without it;
-- the old code keeps working on the new schema until then (org_id is only
-- NOT NULL once every row has one, and the old code inserts none — so between
-- the migration and the deploy a new task, team member, department or
-- notification would fail. Deploy promptly).
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every backfill fills
-- only NULLs, copies are made only where missing, review rows ON CONFLICT DO
-- NOTHING, policies dropped before created, each table guarded (to_regclass).
-- On a bare replay (no organisations) nothing is written.
BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_members', 'departments', 'tasks', 'notifications'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
      -- The backfill must not stamp every row as just edited.
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = 'set_updated_at') THEN
        EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER set_updated_at', t);
      END IF;
    END IF;
  END LOOP;
  -- Department names are unique per company from here on (a copy shares its
  -- original's name).
  IF to_regclass('public.departments') IS NOT NULL THEN
    ALTER TABLE public.departments DROP CONSTRAINT IF EXISTS departments_name_key;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dflt uuid;
  ats uuid;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO dflt;
  EXECUTE 'SELECT public.org_backfill_ats()' INTO ats;
  IF to_regclass('public.team_members') IS NULL OR dflt IS NULL THEN
    RAISE NOTICE 'team_members: no organisations — nothing to backfill';
    RETURN;
  END IF;

  -- 1. The login's company.
  UPDATE public.team_members SET org_id = public.org_backfill_user_org(user_id)
   WHERE org_id IS NULL AND user_id IS NOT NULL AND public.org_backfill_user_org(user_id) IS NOT NULL;

  -- 2. A person in both companies: the default (or, should they not be in
  --    it, their oldest company), and a copy for each other company.
  WITH both_people AS (
    SELECT user_id FROM public.organization_members GROUP BY user_id HAVING count(DISTINCT org_id) > 1
  ), placed AS (
    UPDATE public.team_members tm
       SET org_id = CASE
         WHEN EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = tm.user_id AND m.org_id = dflt) THEN dflt
         ELSE (SELECT m.org_id FROM public.organization_members m WHERE m.user_id = tm.user_id ORDER BY m.created_at, m.org_id LIMIT 1)
       END
     WHERE tm.org_id IS NULL AND tm.user_id IN (SELECT user_id FROM both_people)
    RETURNING tm.id, tm.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'team_members', id::text, org_id, 'person in both companies — one row per company' FROM placed
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  WITH both_people AS (
    SELECT user_id FROM public.organization_members GROUP BY user_id HAVING count(DISTINCT org_id) > 1
  ), source AS (
    -- One copy per (company, person), from their oldest row.
    SELECT DISTINCT ON (m.org_id, tm.user_id) tm.*, m.org_id AS target_org
      FROM public.team_members tm
      JOIN public.organization_members m ON m.user_id = tm.user_id AND m.org_id <> tm.org_id
     WHERE tm.user_id IN (SELECT user_id FROM both_people)
       AND tm.org_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.team_members x WHERE x.org_id = m.org_id AND x.user_id = tm.user_id)
     ORDER BY m.org_id, tm.user_id, tm.created_at, tm.id
  ), copied AS (
    INSERT INTO public.team_members (org_id, name, email, phone, role, notes, is_active, user_id,
                                     is_available, max_conversations, current_conversations,
                                     last_assigned_at, avatar_url, department_id, created_at, updated_at)
    SELECT target_org, name, email, phone, role, notes, is_active, user_id,
           is_available, max_conversations, 0, NULL, avatar_url, department_id, created_at, now()
      FROM source
    RETURNING id, org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'team_members', id::text, org_id, 'person in both companies — one row per company' FROM copied
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- 3. No (single-company) login: the login with the same email.
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE public.team_members tm SET org_id = public.org_backfill_user_org(u.id)
      FROM auth.users u
     WHERE tm.org_id IS NULL AND tm.email IS NOT NULL
       AND lower(u.email) = lower(trim(tm.email))
       AND public.org_backfill_user_org(u.id) IS NOT NULL;
  END IF;

  -- 4. The company's domain.
  IF ats IS NOT NULL THEN
    UPDATE public.team_members SET org_id = ats
     WHERE org_id IS NULL AND lower(trim(email)) LIKE '%@ats-hj.com';
  END IF;

  -- 5. The default, listed.
  WITH filled AS (
    UPDATE public.team_members SET org_id = dflt WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'team_members', id::text, dflt, 'no login, matching login email or company domain — default organisation' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- One row per login per company: the oldest keeps the link.
  WITH extra AS (
    SELECT id, org_id FROM (
      SELECT id, org_id, row_number() OVER (PARTITION BY org_id, user_id ORDER BY created_at, id) AS n
        FROM public.team_members WHERE user_id IS NOT NULL
    ) r WHERE n > 1
  ), logged AS (
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'team_members', id::text, org_id, 'second row for one login in one company — login unlinked' FROM extra
    ON CONFLICT (table_name, row_id, reason) DO NOTHING
  )
  UPDATE public.team_members SET user_id = NULL WHERE id IN (SELECT id FROM extra);
END
$$;

-- ---------------------------------------------------------------------------
-- departments: the default first; copies for the other company come after
-- tasks are placed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dflt uuid;
BEGIN
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO dflt;
  IF to_regclass('public.departments') IS NULL OR dflt IS NULL THEN RETURN; END IF;
  UPDATE public.departments SET org_id = dflt WHERE org_id IS NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dflt uuid;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO dflt;
  IF to_regclass('public.tasks') IS NULL OR dflt IS NULL THEN RETURN; END IF;

  -- 1. What it is linked to.
  UPDATE public.tasks t SET org_id = i.org_id FROM public.itineraries i
   WHERE t.org_id IS NULL AND t.linked_type = 'itinerary' AND i.id = t.linked_id AND i.org_id IS NOT NULL;
  UPDATE public.tasks t SET org_id = c.org_id FROM public.clients c
   WHERE t.org_id IS NULL AND t.linked_type = 'client' AND c.id = t.linked_id AND c.org_id IS NOT NULL;
  IF to_regclass('public.invoices') IS NOT NULL THEN
    UPDATE public.tasks t SET org_id = v.org_id FROM public.invoices v
     WHERE t.org_id IS NULL AND t.linked_type = 'invoice' AND v.id = t.linked_id AND v.org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN
    UPDATE public.tasks t SET org_id = e.org_id FROM public.expenses e
     WHERE t.org_id IS NULL AND t.linked_type = 'expense' AND e.id = t.linked_id AND e.org_id IS NOT NULL;
  END IF;

  -- 2. Its assignee's company.
  UPDATE public.tasks t SET org_id = tm.org_id FROM public.team_members tm
   WHERE t.org_id IS NULL AND tm.id = t.assigned_to AND tm.org_id IS NOT NULL;

  -- 3. Its department's (every department starts in the default).
  WITH filled AS (
    UPDATE public.tasks t SET org_id = d.org_id FROM public.departments d
     WHERE t.org_id IS NULL AND d.id = t.department_id AND d.org_id IS NOT NULL
    RETURNING t.id, t.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tasks', id::text, org_id, 'traced only by its department — default organisation' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- 4. The default, listed.
  WITH filled AS (
    UPDATE public.tasks SET org_id = dflt WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tasks', id::text, dflt, 'no linked record, assignee or department — default organisation' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dflt uuid;
BEGIN
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO dflt;
  IF to_regclass('public.notifications') IS NULL OR dflt IS NULL THEN RETURN; END IF;

  UPDATE public.notifications n SET org_id = i.org_id FROM public.itineraries i
   WHERE n.org_id IS NULL AND i.id = n.related_itinerary_id AND i.org_id IS NOT NULL;
  UPDATE public.notifications n SET org_id = t.org_id FROM public.tasks t
   WHERE n.org_id IS NULL AND t.id = n.related_task_id AND t.org_id IS NOT NULL;
  UPDATE public.notifications SET org_id = public.org_backfill_user_org(user_id)
   WHERE org_id IS NULL AND user_id IS NOT NULL AND public.org_backfill_user_org(user_id) IS NOT NULL;
  UPDATE public.notifications n SET org_id = tm.org_id FROM public.team_members tm
   WHERE n.org_id IS NULL AND tm.id = n.team_member_id AND tm.org_id IS NOT NULL;

  WITH filled AS (
    UPDATE public.notifications SET org_id = dflt WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'notifications', id::text, dflt, 'no trip, task, single-company login or team member — default organisation' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's rows point at its own department and its own person.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dflt uuid;
  spec text[];
  tbl text;
  col text;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO dflt;
  IF dflt IS NULL THEN RETURN; END IF;

  -- Departments another company uses: copied into it, its rows repointed.
  IF to_regclass('public.departments') IS NOT NULL THEN
    WITH used AS (
      SELECT department_id, org_id FROM public.team_members WHERE department_id IS NOT NULL
      UNION
      SELECT department_id, org_id FROM public.tasks WHERE department_id IS NOT NULL
    ), wanted AS (
      SELECT DISTINCT ON (u.org_id, d.name) u.org_id AS target_org, d.*
        FROM used u JOIN public.departments d ON d.id = u.department_id
       WHERE d.org_id <> u.org_id
         AND NOT EXISTS (SELECT 1 FROM public.departments x WHERE x.org_id = u.org_id AND x.name = d.name)
       ORDER BY u.org_id, d.name, d.created_at, d.id
    ), copied AS (
      INSERT INTO public.departments (org_id, name, description, service_types, is_active, created_at, updated_at)
      SELECT target_org, name, description, service_types, is_active, created_at, now() FROM wanted
      RETURNING id, org_id
    )
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'departments', id::text, org_id, 'used by another company — copied' FROM copied
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;

    UPDATE public.team_members tm SET department_id = c.id
      FROM public.departments d, public.departments c
     WHERE tm.department_id = d.id AND d.org_id <> tm.org_id AND c.org_id = tm.org_id AND c.name = d.name;
    UPDATE public.tasks t SET department_id = c.id
      FROM public.departments d, public.departments c
     WHERE t.department_id = d.id AND d.org_id <> t.org_id AND c.org_id = t.org_id AND c.name = d.name;
  END IF;

  -- A task's assignee: the same person in the task's company, else nobody.
  IF to_regclass('public.tasks') IS NOT NULL THEN
    UPDATE public.tasks t SET assigned_to = c.id
      FROM public.team_members o, public.team_members c
     WHERE t.assigned_to = o.id AND o.org_id <> t.org_id AND o.user_id IS NOT NULL
       AND c.user_id = o.user_id AND c.org_id = t.org_id;
    WITH foreign_assignee AS (
      SELECT t.id, t.org_id FROM public.tasks t JOIN public.team_members o ON o.id = t.assigned_to
       WHERE o.org_id <> t.org_id
    ), logged AS (
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT 'tasks', id::text, org_id, 'assignee is not in the task''s company — unassigned' FROM foreign_assignee
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    )
    UPDATE public.tasks SET assigned_to = NULL WHERE id IN (SELECT id FROM foreign_assignee);
  END IF;

  -- Everything else that names a team member and has an org_id: the same
  -- person's row in that company; otherwise listed, left as it is.
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['notifications', 'team_member_id'],
    ARRAY['itineraries', 'assigned_to'],
    ARRAY['whatsapp_conversations', 'assigned_team_member_id'],
    ARRAY['whatsapp_conversations', 'assigned_agent_id'],
    ARRAY['whatsapp_conversations', 'last_agent_id'],
    ARRAY['trip_events', 'actor_team_member_id'],
    ARRAY['trip_messages', 'team_member_id']
  ] LOOP
    tbl := spec[1];
    col := spec[2];
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = col)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'org_id') THEN
      CONTINUE;
    END IF;
    EXECUTE format($f$
      UPDATE public.%1$I r SET %2$I = c.id
        FROM public.team_members o, public.team_members c
       WHERE r.%2$I = o.id AND o.org_id <> r.org_id AND o.user_id IS NOT NULL
         AND c.user_id = o.user_id AND c.org_id = r.org_id
    $f$, tbl, col);
    EXECUTE format($f$
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT %1$L, r.id::text, r.org_id, %3$L
        FROM public.%1$I r JOIN public.team_members o ON o.id = r.%2$I
       WHERE o.org_id <> r.org_id
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    $f$, tbl, col,
      CASE WHEN tbl = 'notifications' THEN 'addressed to a team member of another company'
           ELSE format('%s.%s points at another company''s team member', tbl, col) END);
  END LOOP;

  -- conversation_activity: through its conversation's company.
  IF to_regclass('public.conversation_activity') IS NOT NULL AND to_regclass('public.whatsapp_conversations') IS NOT NULL THEN
    UPDATE public.conversation_activity a SET team_member_id = c.id
      FROM public.whatsapp_conversations w, public.team_members o, public.team_members c
     WHERE w.id = a.conversation_id AND a.team_member_id = o.id AND o.org_id <> w.org_id
       AND o.user_id IS NOT NULL AND c.user_id = o.user_id AND c.org_id = w.org_id;
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'conversation_activity', a.id::text, w.org_id, 'conversation_activity.team_member_id points at another company''s team member'
      FROM public.conversation_activity a
      JOIN public.whatsapp_conversations w ON w.id = a.conversation_id
      JOIN public.team_members o ON o.id = a.team_member_id
     WHERE o.org_id <> w.org_id
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- NOT NULL, indexes, per-company uniques, triggers back on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_members', 'departments', 'tasks', 'notifications'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = 'set_updated_at') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;

  IF to_regclass('public.team_members') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_team_members_org ON public.team_members (org_id, name);
    CREATE UNIQUE INDEX IF NOT EXISTS team_members_org_user_key ON public.team_members (org_id, user_id) WHERE user_id IS NOT NULL;
  END IF;
  IF to_regclass('public.departments') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_org_id_name_key') THEN
    ALTER TABLE public.departments ADD CONSTRAINT departments_org_id_name_key UNIQUE (org_id, name);
  END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tasks_org_due ON public.tasks (org_id, due_date);
  END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_org_user ON public.notifications (org_id, user_id, created_at DESC);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  addressee text := '(user_id = auth.uid() OR team_member_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid()))';
BEGIN
  IF to_regclass('public.team_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow read team_members" ON public.team_members;
    DROP POLICY IF EXISTS "Allow insert team_members" ON public.team_members;
    DROP POLICY IF EXISTS "Allow update team_members" ON public.team_members;
    DROP POLICY IF EXISTS "Allow delete team_members" ON public.team_members;
    DROP POLICY IF EXISTS "Users can view team members" ON public.team_members;
    DROP POLICY IF EXISTS "Managers can insert team members" ON public.team_members;
    DROP POLICY IF EXISTS "Managers can update team members" ON public.team_members;
    DROP POLICY IF EXISTS "Managers can delete team members" ON public.team_members;
    DROP POLICY IF EXISTS team_members_org_select ON public.team_members;
    DROP POLICY IF EXISTS team_members_org_insert ON public.team_members;
    DROP POLICY IF EXISTS team_members_org_update ON public.team_members;
    DROP POLICY IF EXISTS team_members_org_delete ON public.team_members;
    CREATE POLICY team_members_org_select ON public.team_members FOR SELECT TO authenticated
      USING (public.user_is_in_org(org_id) AND public.is_active_user());
    CREATE POLICY team_members_org_insert ON public.team_members FOR INSERT TO authenticated
      WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
    CREATE POLICY team_members_org_update ON public.team_members FOR UPDATE TO authenticated
      USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
      WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
    CREATE POLICY team_members_org_delete ON public.team_members FOR DELETE TO authenticated
      USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  END IF;

  IF to_regclass('public.departments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow authenticated read access to departments" ON public.departments;
    DROP POLICY IF EXISTS departments_org_select ON public.departments;
    CREATE POLICY departments_org_select ON public.departments FOR SELECT TO authenticated
      USING (public.user_is_in_org(org_id));
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Task visibility by role" ON public.tasks;
    DROP POLICY IF EXISTS "Task update by role" ON public.tasks;
    DROP POLICY IF EXISTS "Agents can create tasks" ON public.tasks;
    DROP POLICY IF EXISTS "Managers can delete tasks" ON public.tasks;
    DROP POLICY IF EXISTS tasks_org_select ON public.tasks;
    DROP POLICY IF EXISTS tasks_org_insert ON public.tasks;
    DROP POLICY IF EXISTS tasks_org_update ON public.tasks;
    DROP POLICY IF EXISTS tasks_org_delete ON public.tasks;
    CREATE POLICY tasks_org_select ON public.tasks FOR SELECT TO authenticated
      USING (public.user_is_in_org(org_id) AND (public.is_manager_or_above()
             OR (public.is_agent_or_above() AND (assigned_to)::text = (auth.uid())::text)));
    CREATE POLICY tasks_org_insert ON public.tasks FOR INSERT TO authenticated
      WITH CHECK (public.user_is_in_org(org_id) AND public.is_agent_or_above());
    CREATE POLICY tasks_org_update ON public.tasks FOR UPDATE TO authenticated
      USING (public.user_is_in_org(org_id) AND (public.is_manager_or_above() OR (assigned_to)::text = (auth.uid())::text))
      WITH CHECK (public.user_is_in_org(org_id));
    CREATE POLICY tasks_org_delete ON public.tasks FOR DELETE TO authenticated
      USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow read notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Allow insert notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Allow update notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Allow delete notifications" ON public.notifications;
    DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
    DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
    DROP POLICY IF EXISTS notifications_org_select ON public.notifications;
    DROP POLICY IF EXISTS notifications_org_insert ON public.notifications;
    DROP POLICY IF EXISTS notifications_org_update ON public.notifications;
    DROP POLICY IF EXISTS notifications_org_delete ON public.notifications;
    EXECUTE format('CREATE POLICY notifications_org_select ON public.notifications FOR SELECT TO authenticated USING (public.user_is_in_org(org_id) AND %s)', addressee);
    CREATE POLICY notifications_org_insert ON public.notifications FOR INSERT TO authenticated
      WITH CHECK (public.user_is_in_org(org_id));
    EXECUTE format('CREATE POLICY notifications_org_update ON public.notifications FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id) AND %s) WITH CHECK (public.user_is_in_org(org_id))', addressee);
    EXECUTE format('CREATE POLICY notifications_org_delete ON public.notifications FOR DELETE TO authenticated USING (public.user_is_in_org(org_id) AND %s)', addressee);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Dead objects
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.active_tasks;
DROP VIEW IF EXISTS public.archived_tasks;
DROP TABLE IF EXISTS public.agent_team_member_mapping;
DROP TABLE IF EXISTS public.assignment_rules;
DROP TABLE IF EXISTS public.reminder_settings;

COMMIT;

INSERT INTO public.schema_migrations (name) VALUES ('20261203_people_work_org_id') ON CONFLICT DO NOTHING;

-- ==================================================================
-- 20261204_email_org_id
-- ==================================================================
-- ============================================
-- Email and copilot threads: each company's own, by org_id
-- ============================================
-- WHAT LEAKED. gmail_tokens, email_conversations, email_messages and
-- email_templates had no org_id, and communication_threads /
-- concierge_briefs had one that could be NULL. With a second company (ATS)
-- live beside Travel2Egypt:
--   - every email list, the dashboard and the cron sync worked from "every
--     connected mailbox"; the hotfix (bc9f046) narrowed that to mailboxes
--     whose OWNER is a member of the caller's company (lib/auth/org-members)
--     — so a person in BOTH companies had their mailbox, and all its mail,
--     shown in both;
--   - the office-address rule, the known-contacts list and the "company
--     mailbox" were built from every company's tokens; the sync deduped
--     Gmail message ids across companies; the lead and order detectors
--     filed mail under the mailbox owner's OLDEST membership;
--   - copilot threads with no org_id were hidden from everyone.
-- And through PostgREST (RLS), with nothing but a session:
--   email_conversations, email_messages, email_sync_state
--       "Allow all for authenticated users" TO authenticated USING (true)
--       WITH CHECK (true) — every company's mail, readable and writable;
--   email_templates "Users can view templates" USING (is_active_user()),
--       "Managers can insert/update/delete templates" (is_manager_or_above(),
--       a role from user_profiles, any company), "Users can manage their own
--       templates" (auth.uid() = user_id);
--   gmail_tokens "Users access own gmail tokens" and "Users can manage their
--       own gmail tokens" (auth.uid() = user_id) — own row, no company;
--   communication_threads "Authenticated users can view threads",
--   communication_inbox "Authenticated users can view inbox messages",
--   communication_drafts "Authenticated users can view drafts",
--   concierge_briefs "Authenticated users can view concierge briefs" — all
--       USING (auth.uid() IS NOT NULL): any session, every company.
--
-- WHAT THIS DOES. org_id (REFERENCES organizations, as itineraries.org_id —
-- no default: the code stamps it) on gmail_tokens, email_conversations,
-- email_messages (denormalised from its conversation, for the sync's dedupe)
-- and email_templates; every row assigned; NOT NULL; the NULLs on
-- communication_threads and concierge_briefs assigned and NOT NULL. Policies
-- replaced by organisation-scoped ones. In the order each table's rows are
-- assigned (each rule fills only rows the rules before it left NULL):
--
--   gmail_tokens — a connected mailbox serves ONE company.
--     1. its owner's company, when they belong to exactly one
--        (org_backfill_user_org);
--     2. an @ats-hj.com address → ATS;
--     3. else the default company (Travel2Egypt) + review: "person in both
--        companies — mailbox assigned to default; reconnect from the other
--        company to move it", or "mailbox owner in no company".
--     UNIQUE(user_id) stays: one connection per person. A person in both
--     companies connects their mailbox to ONE company — the workspace that
--     is active when they connect (app/api/gmail/connect signs it into the
--     OAuth state; app/api/auth/google/callback stamps it). Connecting again
--     from the other company moves the connection there; the mail already
--     synced stays with the company it was synced for.
--     email_sync_state follows its token (per user; no column).
--
--   email_conversations
--     0. (review only) a linked client in one company and a connected
--        mailbox with this address in the other: "linked client and mailbox
--        in different companies — assigned by the client";
--     1. its linked client's company (client_id → clients.org_id);
--     2. the company of the connected mailbox with its address
--        (mailbox_email → gmail_tokens.org_id, as assigned above), when
--        that address is connected in exactly one company;
--     3. the company of its user's connected mailbox (user_id → token);
--     4. its user's company, when they belong to exactly one;
--     5. the company that lists its mailbox address (or that address's
--        domain) — or, with no mailbox address, the address its office
--        replies were sent from — in Settings → Email → Office addresses
--        (organizations.office_email_addresses), when exactly one does;
--     6. else the default company + review ("untraceable", or "mailbox
--        owner in both companies").
--     UNIQUE(thread_id) → UNIQUE(org_id, coalesce(lower(mailbox_email), ''),
--     thread_id). A Gmail thread id is an id inside ONE mailbox, so the same
--     id can be a conversation in each company's mailbox. Rows whose
--     address is unknown (mailbox_email NULL — before 20261128, kept as they
--     were) count as one mailbox per company: the sync finds them by
--     (org, thread, user) and never creates a second one for that thread
--     (lib/email/conversation-access findThreadConversation). The old key
--     was global, so no existing rows can collide under the new one.
--     assigned_team_member_id: 20261203 splits a person in both companies
--     into one team_members row per company; an assignment pointing at the
--     row in the other company moves to the same person's row (user_id, else
--     email) in the conversation's company, else stays and is listed:
--     "email_conversations.assigned_team_member_id points at another
--     company's team member". Skipped without team_members.org_id.
--     auto_link_email_to_client() now matches clients of NEW.org_id (it
--     matched the companies of the mailbox user — both, for a person in
--     both).
--
--   email_messages — CHILD of its conversation, org_id denormalised.
--     1. its conversation's company;
--     2. a message with no conversation: the company of the one conversation
--        with its Gmail thread id;
--     3. else the default company + review ("message with no conversation").
--     UNIQUE(message_id) → UNIQUE(org_id, message_id): the same Gmail message
--     can sit in two companies' mailboxes. A composite foreign key
--     (conversation_id, org_id) → email_conversations(id, org_id) keeps a
--     message in its conversation's company (and follows a conversation that
--     is moved, ON UPDATE CASCADE).
--     refresh_email_conversation_reply_state() reads only messages of the
--     conversation's company.
--
--   email_templates (legacy, per user)
--     1. its user's company, when they belong to exactly one;
--     2. else the default company + review.
--
--   communication_threads (org_id NULL only)
--     1. its WhatsApp conversation's company; 2. its email conversation's
--     (as assigned above); 3. its concierge brief's; 4. its client's;
--     5. else the default company + review.
--   concierge_briefs (org_id NULL only)
--     1. its client's company; 2. its copilot thread's (brief_id);
--     3. else the default company + review.
--   Both foreign keys were ON DELETE SET NULL, which NOT NULL forbids: now
--   plain references, as itineraries.org_id.
--   communication_inbox / communication_drafts are CHILD via thread_id (no
--   column): their policies ask the thread's company.
--
-- POLICIES (TO authenticated; the service role bypasses RLS, so no API
-- route is affected — they scope by org_id in code):
--   gmail_tokens          own row (auth.uid() = user_id) AND user_is_in_org(org_id).
--                         The browser reads/deletes only its own row
--                         (app/communications, app/settings, app/settings/email).
--   email_conversations,
--   email_messages        user_is_in_org(org_id). No browser access today.
--   email_templates       SELECT user_is_in_org(org_id) AND is_active_user();
--                         write: user_is_in_org(org_id) AND (own row OR
--                         is_manager_or_above()) — the same roles as before,
--                         within the company.
--   communication_threads,
--   concierge_briefs      SELECT user_is_in_org(org_id).
--   communication_inbox,
--   communication_drafts  SELECT EXISTS (the thread, user_is_in_org(thread.org_id)).
--   email_sync_state      a per-user table: the caller's own row (auth.uid()
--                         = user_id) instead of USING (true).
-- The dead view unified_conversations (email + WhatsApp, read by nothing)
-- is dropped rather than carried forward.
--
-- REVIEW. Every row assigned by default or by one of two conflicting signals
-- is listed:
--   SELECT * FROM org_backfill_review
--    WHERE table_name IN ('gmail_tokens', 'email_conversations', 'email_messages',
--                         'email_templates', 'communication_threads', 'concierge_briefs')
--    ORDER BY id;
--
-- DEPLOY ORDER. Apply this migration FIRST, then deploy the code that reads
-- and stamps org_id. Between the two, the running code inserts mailboxes,
-- conversations and messages without org_id, which NOT NULL refuses: Gmail
-- sync and connect fail until the deploy (nothing is lost — the next sync
-- fetches what it missed). Needs 20261202 (backfill helpers) and 20261128
-- (mailbox_email); runs after 20261203 (team_members.org_id) when present.
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS; every UPDATE fills
-- only rows still NULL; review rows ON CONFLICT DO NOTHING; constraints
-- dropped/added by name; policies DROP IF EXISTS before CREATE; each table
-- guarded by to_regclass. On a bare replay (no organisations) every helper
-- returns NULL and the tables are empty: nothing is written.
BEGIN;

-- ── gmail_tokens ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_default uuid := public.org_backfill_default();
  v_ats uuid := public.org_backfill_ats();
BEGIN
  IF to_regclass('public.gmail_tokens') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.gmail_tokens ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

  UPDATE public.gmail_tokens t
     SET org_id = public.org_backfill_user_org(t.user_id)
   WHERE t.org_id IS NULL AND t.user_id IS NOT NULL
     AND public.org_backfill_user_org(t.user_id) IS NOT NULL;

  IF v_ats IS NOT NULL THEN
    UPDATE public.gmail_tokens t SET org_id = v_ats
     WHERE t.org_id IS NULL AND lower(t.email) LIKE '%@ats-hj.com';
  END IF;

  IF v_default IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'gmail_tokens', t.id::text, v_default,
           CASE WHEN (SELECT count(DISTINCT m.org_id) FROM public.organization_members m WHERE m.user_id = t.user_id) > 1
                THEN 'person in both companies — mailbox assigned to default; reconnect from the other company to move it'
                ELSE 'mailbox owner in no company — mailbox assigned to default' END
      FROM public.gmail_tokens t
     WHERE t.org_id IS NULL
    ON CONFLICT DO NOTHING;
    UPDATE public.gmail_tokens SET org_id = v_default WHERE org_id IS NULL;
  END IF;

  ALTER TABLE public.gmail_tokens ALTER COLUMN org_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_gmail_tokens_org ON public.gmail_tokens (org_id, created_at);

  DROP POLICY IF EXISTS "Users access own gmail tokens" ON public.gmail_tokens;
  DROP POLICY IF EXISTS "Users can manage their own gmail tokens" ON public.gmail_tokens;
  DROP POLICY IF EXISTS gmail_tokens_own_in_org ON public.gmail_tokens;
  CREATE POLICY gmail_tokens_own_in_org ON public.gmail_tokens TO authenticated
    USING (auth.uid() = user_id AND public.user_is_in_org(org_id))
    WITH CHECK (auth.uid() = user_id AND public.user_is_in_org(org_id));
END
$$;

COMMENT ON COLUMN public.gmail_tokens.org_id IS
  'The company this mailbox serves: the workspace active when it was connected. One connection per person (UNIQUE user_id); connecting again from another company moves it.';

-- ── email_conversations ───────────────────────────────────────────────────
DO $$
DECLARE
  v_default uuid := public.org_backfill_default();
BEGIN
  IF to_regclass('public.email_conversations') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.email_conversations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

  -- 0. Conflicting signals, listed before rule 1 decides by the client.
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT DISTINCT 'email_conversations', ec.id::text, c.org_id,
         'linked client and mailbox in different companies — assigned by the client'
    FROM public.email_conversations ec
    JOIN public.clients c ON c.id = ec.client_id
    JOIN public.gmail_tokens t ON lower(t.email) = lower(ec.mailbox_email)
   WHERE ec.org_id IS NULL AND c.org_id IS NOT NULL AND t.org_id <> c.org_id
  ON CONFLICT DO NOTHING;

  -- 1. The linked client.
  UPDATE public.email_conversations ec SET org_id = c.org_id
    FROM public.clients c
   WHERE ec.org_id IS NULL AND c.id = ec.client_id AND c.org_id IS NOT NULL;

  -- 2. The connected mailbox with its address (one company only).
  UPDATE public.email_conversations ec SET org_id = s.org_id
    FROM (
      SELECT lower(email) AS email, min(org_id::text)::uuid AS org_id
        FROM public.gmail_tokens
       WHERE coalesce(email, '') <> ''
       GROUP BY lower(email)
      HAVING count(DISTINCT org_id) = 1
    ) s
   WHERE ec.org_id IS NULL AND lower(ec.mailbox_email) = s.email;

  -- 3. Its user's connected mailbox.
  UPDATE public.email_conversations ec SET org_id = t.org_id
    FROM public.gmail_tokens t
   WHERE ec.org_id IS NULL AND t.user_id = ec.user_id;

  -- 4. Its user's one company.
  UPDATE public.email_conversations ec
     SET org_id = public.org_backfill_user_org(ec.user_id)
   WHERE ec.org_id IS NULL AND ec.user_id IS NOT NULL
     AND public.org_backfill_user_org(ec.user_id) IS NOT NULL;

  -- 5. A company's listed office address: the mailbox address, else the
  --    address its office replies went out from (never the customer's).
  WITH addrs AS (
    SELECT ec.id, lower(ec.mailbox_email) AS a
      FROM public.email_conversations ec
     WHERE ec.org_id IS NULL AND ec.mailbox_email IS NOT NULL
    UNION
    SELECT ec.id, lower(trim(coalesce(substring(m.from_address FROM '<([^>]+)>'), m.from_address)))
      FROM public.email_conversations ec
      JOIN public.email_messages m ON m.conversation_id = ec.id AND m.direction = 'outbound'
     WHERE ec.org_id IS NULL AND ec.mailbox_email IS NULL
  ), hits AS (
    SELECT a.id, o.id AS org_id
      FROM addrs a
      JOIN public.organizations o
        ON EXISTS (SELECT 1 FROM unnest(o.office_email_addresses) e
                    WHERE lower(e) = a.a OR lower(e) = split_part(a.a, '@', 2))
  ), one AS (
    SELECT id, min(org_id::text)::uuid AS org_id FROM hits GROUP BY id HAVING count(DISTINCT org_id) = 1
  )
  UPDATE public.email_conversations ec SET org_id = one.org_id
    FROM one
   WHERE ec.id = one.id AND ec.org_id IS NULL;

  -- 6. The default company, listed.
  IF v_default IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'email_conversations', ec.id::text, v_default,
           CASE WHEN (SELECT count(DISTINCT m.org_id) FROM public.organization_members m WHERE m.user_id = ec.user_id) > 1
                THEN 'mailbox owner in both companies, no client or connected mailbox decides — assigned to default'
                ELSE 'untraceable conversation — assigned to default' END
      FROM public.email_conversations ec
     WHERE ec.org_id IS NULL
    ON CONFLICT DO NOTHING;
    UPDATE public.email_conversations SET org_id = v_default WHERE org_id IS NULL;
  END IF;

  ALTER TABLE public.email_conversations ALTER COLUMN org_id SET NOT NULL;

  -- One conversation per Gmail thread PER MAILBOX per company.
  ALTER TABLE public.email_conversations DROP CONSTRAINT IF EXISTS email_conversations_thread_id_key;
  CREATE UNIQUE INDEX IF NOT EXISTS email_conversations_org_mailbox_thread_key
    ON public.email_conversations (org_id, (coalesce(lower(mailbox_email), '')), thread_id);
  -- The target of email_messages' (conversation_id, org_id) key.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_conversations_id_org_key'
                    AND conrelid = 'public.email_conversations'::regclass) THEN
    ALTER TABLE public.email_conversations ADD CONSTRAINT email_conversations_id_org_key UNIQUE (id, org_id);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_email_conversations_org_last_message
    ON public.email_conversations (org_id, last_message_at DESC);

  DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.email_conversations;
  DROP POLICY IF EXISTS email_conversations_org_all ON public.email_conversations;
  CREATE POLICY email_conversations_org_all ON public.email_conversations TO authenticated
    USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));
END
$$;

COMMENT ON COLUMN public.email_conversations.org_id IS
  'The company whose mailbox this conversation is in — the connected mailbox''s (gmail_tokens.org_id) when synced.';

-- ── email_conversations.assigned_team_member_id → the conversation's company ─
-- 20261203 (batch 1a, applied before this one) gives team_members an org_id
-- and splits a person in both companies into one row per company. An
-- assignment pointing at the person's row in the OTHER company is moved to
-- the same person's row in the conversation's company (same user_id, else
-- the same email); with no such row it stays, listed for review. Skipped
-- when team_members has no org_id (a replay without 20261203).
DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL OR to_regclass('public.email_conversations') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'org_id') THEN
    RETURN;
  END IF;

  EXECUTE $q$
    UPDATE public.email_conversations ec
       SET assigned_team_member_id = (
             SELECT tm2.id FROM public.team_members tm2
              WHERE tm2.org_id = ec.org_id
                AND ((tm_old.user_id IS NOT NULL AND tm2.user_id = tm_old.user_id)
                     OR (tm_old.email IS NOT NULL AND lower(tm2.email) = lower(tm_old.email)))
              ORDER BY (tm_old.user_id IS NOT NULL AND tm2.user_id = tm_old.user_id) DESC, tm2.id
              LIMIT 1)
      FROM public.team_members tm_old
     WHERE tm_old.id = ec.assigned_team_member_id
       AND tm_old.org_id IS DISTINCT FROM ec.org_id
       AND EXISTS (SELECT 1 FROM public.team_members tm2
                    WHERE tm2.org_id = ec.org_id
                      AND ((tm_old.user_id IS NOT NULL AND tm2.user_id = tm_old.user_id)
                           OR (tm_old.email IS NOT NULL AND lower(tm2.email) = lower(tm_old.email))))
  $q$;

  EXECUTE $q$
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'email_conversations', ec.id::text, ec.org_id,
           'email_conversations.assigned_team_member_id points at another company''s team member'
      FROM public.email_conversations ec
      JOIN public.team_members tm ON tm.id = ec.assigned_team_member_id
     WHERE tm.org_id IS DISTINCT FROM ec.org_id
    ON CONFLICT DO NOTHING
  $q$;
END
$$;

-- ── email_messages ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_default uuid := public.org_backfill_default();
BEGIN
  IF to_regclass('public.email_messages') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

  UPDATE public.email_messages m SET org_id = ec.org_id
    FROM public.email_conversations ec
   WHERE m.org_id IS NULL AND ec.id = m.conversation_id;

  UPDATE public.email_messages m SET org_id = s.org_id
    FROM (
      SELECT thread_id, min(org_id::text)::uuid AS org_id
        FROM public.email_conversations
       GROUP BY thread_id
      HAVING count(DISTINCT org_id) = 1
    ) s
   WHERE m.org_id IS NULL AND m.conversation_id IS NULL AND m.thread_id = s.thread_id;

  IF v_default IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'email_messages', m.id::text, v_default, 'message with no conversation — assigned to default'
      FROM public.email_messages m
     WHERE m.org_id IS NULL
    ON CONFLICT DO NOTHING;
    UPDATE public.email_messages SET org_id = v_default WHERE org_id IS NULL;
  END IF;

  ALTER TABLE public.email_messages ALTER COLUMN org_id SET NOT NULL;

  ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS email_messages_message_id_key;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_messages_org_message_key'
                    AND conrelid = 'public.email_messages'::regclass) THEN
    ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_org_message_key UNIQUE (org_id, message_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_messages_conversation_org_fkey'
                    AND conrelid = 'public.email_messages'::regclass) THEN
    ALTER TABLE public.email_messages ADD CONSTRAINT email_messages_conversation_org_fkey
      FOREIGN KEY (conversation_id, org_id) REFERENCES public.email_conversations (id, org_id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.email_messages;
  DROP POLICY IF EXISTS email_messages_org_all ON public.email_messages;
  CREATE POLICY email_messages_org_all ON public.email_messages TO authenticated
    USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));
END
$$;

-- ── email_templates ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_default uuid := public.org_backfill_default();
BEGIN
  IF to_regclass('public.email_templates') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

  UPDATE public.email_templates t
     SET org_id = public.org_backfill_user_org(t.user_id)
   WHERE t.org_id IS NULL AND t.user_id IS NOT NULL
     AND public.org_backfill_user_org(t.user_id) IS NOT NULL;

  IF v_default IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'email_templates', t.id::text, v_default,
           CASE WHEN (SELECT count(DISTINCT m.org_id) FROM public.organization_members m WHERE m.user_id = t.user_id) > 1
                THEN 'template owner in both companies — assigned to default'
                ELSE 'template owner in no company — assigned to default' END
      FROM public.email_templates t
     WHERE t.org_id IS NULL
    ON CONFLICT DO NOTHING;
    UPDATE public.email_templates SET org_id = v_default WHERE org_id IS NULL;
  END IF;

  ALTER TABLE public.email_templates ALTER COLUMN org_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_email_templates_org_user ON public.email_templates (org_id, user_id);

  DROP POLICY IF EXISTS "Users can view templates" ON public.email_templates;
  DROP POLICY IF EXISTS "Users can manage their own templates" ON public.email_templates;
  DROP POLICY IF EXISTS "Managers can insert templates" ON public.email_templates;
  DROP POLICY IF EXISTS "Managers can update templates" ON public.email_templates;
  DROP POLICY IF EXISTS "Managers can delete templates" ON public.email_templates;
  DROP POLICY IF EXISTS email_templates_org_select ON public.email_templates;
  DROP POLICY IF EXISTS email_templates_org_insert ON public.email_templates;
  DROP POLICY IF EXISTS email_templates_org_update ON public.email_templates;
  DROP POLICY IF EXISTS email_templates_org_delete ON public.email_templates;
  CREATE POLICY email_templates_org_select ON public.email_templates FOR SELECT TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_active_user());
  CREATE POLICY email_templates_org_insert ON public.email_templates FOR INSERT TO authenticated
    WITH CHECK (public.user_is_in_org(org_id) AND (auth.uid() = user_id OR public.is_manager_or_above()));
  CREATE POLICY email_templates_org_update ON public.email_templates FOR UPDATE TO authenticated
    USING (public.user_is_in_org(org_id) AND (auth.uid() = user_id OR public.is_manager_or_above()))
    WITH CHECK (public.user_is_in_org(org_id) AND (auth.uid() = user_id OR public.is_manager_or_above()));
  CREATE POLICY email_templates_org_delete ON public.email_templates FOR DELETE TO authenticated
    USING (public.user_is_in_org(org_id) AND (auth.uid() = user_id OR public.is_manager_or_above()));
END
$$;

-- ── concierge_briefs + communication_threads (org_id NULLs) ───────────────
DO $$
DECLARE
  v_default uuid := public.org_backfill_default();
BEGIN
  IF to_regclass('public.communication_threads') IS NULL OR to_regclass('public.concierge_briefs') IS NULL THEN RETURN; END IF;

  -- Briefs by their client first: a thread may take its brief's company.
  UPDATE public.concierge_briefs b SET org_id = c.org_id
    FROM public.clients c
   WHERE b.org_id IS NULL AND c.id = b.client_id AND c.org_id IS NOT NULL;

  UPDATE public.communication_threads t SET org_id = w.org_id
    FROM public.whatsapp_conversations w
   WHERE t.org_id IS NULL AND w.id = t.whatsapp_conversation_id AND w.org_id IS NOT NULL;
  UPDATE public.communication_threads t SET org_id = ec.org_id
    FROM public.email_conversations ec
   WHERE t.org_id IS NULL AND ec.id = t.email_conversation_id;
  UPDATE public.communication_threads t SET org_id = b.org_id
    FROM public.concierge_briefs b
   WHERE t.org_id IS NULL AND b.id = t.brief_id AND b.org_id IS NOT NULL;
  UPDATE public.communication_threads t SET org_id = c.org_id
    FROM public.clients c
   WHERE t.org_id IS NULL AND c.id = t.client_id AND c.org_id IS NOT NULL;

  -- Briefs whose thread was traced.
  UPDATE public.concierge_briefs b SET org_id = t.org_id
    FROM public.communication_threads t
   WHERE b.org_id IS NULL AND t.brief_id = b.id AND t.org_id IS NOT NULL;

  IF v_default IS NOT NULL THEN
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'communication_threads', t.id::text, v_default, 'copilot thread with no conversation, brief or client — assigned to default'
      FROM public.communication_threads t WHERE t.org_id IS NULL
    ON CONFLICT DO NOTHING;
    UPDATE public.communication_threads SET org_id = v_default WHERE org_id IS NULL;

    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'concierge_briefs', b.id::text, v_default, 'concierge brief with no client or thread — assigned to default'
      FROM public.concierge_briefs b WHERE b.org_id IS NULL
    ON CONFLICT DO NOTHING;
    UPDATE public.concierge_briefs SET org_id = v_default WHERE org_id IS NULL;
  END IF;

  -- ON DELETE SET NULL contradicts NOT NULL: a plain reference, as itineraries.
  ALTER TABLE public.communication_threads DROP CONSTRAINT IF EXISTS communication_threads_org_id_fkey;
  ALTER TABLE public.communication_threads ADD CONSTRAINT communication_threads_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id);
  ALTER TABLE public.communication_threads ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE public.concierge_briefs DROP CONSTRAINT IF EXISTS concierge_briefs_org_id_fkey;
  ALTER TABLE public.concierge_briefs ADD CONSTRAINT concierge_briefs_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id);
  ALTER TABLE public.concierge_briefs ALTER COLUMN org_id SET NOT NULL;

  DROP POLICY IF EXISTS "Authenticated users can view threads" ON public.communication_threads;
  DROP POLICY IF EXISTS communication_threads_org_select ON public.communication_threads;
  CREATE POLICY communication_threads_org_select ON public.communication_threads FOR SELECT TO authenticated
    USING (public.user_is_in_org(org_id));

  DROP POLICY IF EXISTS "Authenticated users can view concierge briefs" ON public.concierge_briefs;
  DROP POLICY IF EXISTS concierge_briefs_org_select ON public.concierge_briefs;
  CREATE POLICY concierge_briefs_org_select ON public.concierge_briefs FOR SELECT TO authenticated
    USING (public.user_is_in_org(org_id));

  IF to_regclass('public.communication_inbox') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can view inbox messages" ON public.communication_inbox;
    DROP POLICY IF EXISTS communication_inbox_org_select ON public.communication_inbox;
    CREATE POLICY communication_inbox_org_select ON public.communication_inbox FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.communication_threads t
                      WHERE t.id = thread_id AND public.user_is_in_org(t.org_id)));
  END IF;
  IF to_regclass('public.communication_drafts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can view drafts" ON public.communication_drafts;
    DROP POLICY IF EXISTS communication_drafts_org_select ON public.communication_drafts;
    CREATE POLICY communication_drafts_org_select ON public.communication_drafts FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.communication_threads t
                      WHERE t.id = thread_id AND public.user_is_in_org(t.org_id)));
  END IF;
END
$$;

-- ── email_sync_state: the caller's own row ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.email_sync_state') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.email_sync_state;
  DROP POLICY IF EXISTS email_sync_state_own ON public.email_sync_state;
  CREATE POLICY email_sync_state_own ON public.email_sync_state TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END
$$;

-- ── The dead union view ──────────────────────────────────────────────────
DROP VIEW IF EXISTS public.unified_conversations;

-- ── Functions ─────────────────────────────────────────────────────────────
-- A conversation links only to a client of its own company.
CREATE OR REPLACE FUNCTION public.auto_link_email_to_client() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    matched_client RECORD;
BEGIN
    IF NEW.client_id IS NULL AND NEW.client_email IS NOT NULL AND NEW.org_id IS NOT NULL THEN
        SELECT c.id, CONCAT(c.first_name, ' ', c.last_name) AS full_name
        INTO matched_client
        FROM clients c
        WHERE LOWER(c.email) = LOWER(NEW.client_email)
          AND c.org_id = NEW.org_id
        ORDER BY c.created_at
        LIMIT 1;

        IF matched_client.id IS NOT NULL THEN
            NEW.client_id := matched_client.id;
            NEW.client_name := matched_client.full_name;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- The reply state from the conversation's own company's messages.
CREATE OR REPLACE FUNCTION public.refresh_email_conversation_reply_state(p_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_last_out timestamptz;
BEGIN
  SELECT org_id INTO v_org FROM public.email_conversations WHERE id = p_conversation;
  IF v_org IS NULL THEN RETURN; END IF;

  SELECT max(sent_at) INTO v_last_out
    FROM public.email_messages
   WHERE conversation_id = p_conversation AND org_id = v_org AND direction = 'outbound';

  UPDATE public.email_conversations c SET
    last_outbound_at = v_last_out,
    last_inbound_at = (
      SELECT max(sent_at) FROM public.email_messages
       WHERE conversation_id = p_conversation AND org_id = v_org AND direction = 'inbound'),
    awaiting_reply_since = (
      SELECT min(sent_at) FROM public.email_messages
       WHERE conversation_id = p_conversation AND org_id = v_org AND direction = 'inbound'
         AND sent_at > COALESCE(v_last_out, '-infinity'::timestamptz)),
    updated_at = now()
  WHERE c.id = p_conversation AND c.org_id = v_org;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_email_conversation_reply_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_email_conversation_reply_state(uuid) TO service_role;

COMMIT;

-- Check:
-- SELECT org_id, count(*) FROM email_conversations GROUP BY 1;
-- SELECT * FROM org_backfill_review WHERE table_name LIKE 'email_%' OR table_name IN ('gmail_tokens', 'communication_threads', 'concierge_briefs');

INSERT INTO public.schema_migrations (name) VALUES ('20261204_email_org_id') ON CONFLICT DO NOTHING;

-- ==================================================================
-- 20261205_suppliers_org_id
-- ==================================================================
-- ============================================
-- Suppliers belong to one company: suppliers and supplier_properties get an
-- org_id; a supplier both companies use becomes one row per company
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and suppliers had no org_id, so every supplier was both
-- companies':
--   - /api/suppliers (list, detail, edit, delete, import, export), the guide,
--     airport-staff and hotel-staff screens, the supplier properties panel
--     and every picker listed, edited and deleted the other company's
--     guides, hotels, drivers and their bank details;
--   - supplier_code was unique across the install, so the second company
--     could not hold its own SUP-0001, and a code lookup (CSV rate import,
--     lib/suppliers/resolve-supplier.ts) linked a rate to the other
--     company's supplier;
--   - /api/supplier-rates returned the rates of ANY supplier id;
--   - the pricing engine and the AI service builder picked guides from
--     both companies.
-- And through PostgREST (RLS), with nothing but a session:
--   suppliers            "suppliers_authenticated_all" TO authenticated
--                        USING (true) WITH CHECK (true)        (20260829)
--   supplier_properties  "supplier_properties_authenticated_all" TO
--                        authenticated USING (true) WITH CHECK (true)
--                                                              (20260831)
-- Both dropped. In their place:
--   select               user_is_in_org(org_id) — the itinerary editor reads
--                        suppliers in the browser (app/itineraries/[id]/edit)
--                        and agents open trips;
--   insert/update/delete user_is_in_org(org_id) AND is_manager_or_above() —
--                        the suppliers screen is manager-and-above.
-- (Every other caller is an API route on the service role, which RLS does
-- not apply to; these are the second wall.) The views airport_staff, guides
-- and hotel_staff are security_invoker, so they inherit the suppliers
-- policies.
--
-- WHAT THIS DOES.
--   suppliers.org_id     REFERENCES organizations ON DELETE CASCADE, NOT
--                        NULL, no DEFAULT (the code stamps it).
--   supplier_properties.org_id
--                        denormalised from its supplier — a BEFORE INSERT/
--                        UPDATE trigger sets it from the supplier every
--                        time, so a property can never sit in another
--                        company than its supplier.
--   supplier_code        UNIQUE (supplier_code) → UNIQUE (org_id,
--                        supplier_code): both companies can hold SUP-0001.
--                        suppliers_assign_code() (20261029) still mints from
--                        the ONE shared sequence suppliers_code_seq (so a
--                        number is never handed out twice, and a deleted
--                        supplier's code is never reused for another — the
--                        code is a business key other installs link rates
--                        by), but "is this code taken?" is now asked within
--                        the new row's company. A company's numbers are
--                        therefore not consecutive; they are unique within it.
--   views                airport_staff, guides and hotel_staff expose
--                        org_id; their INSTEAD OF triggers stamp it on insert
--                        (from the row given — the routes pass the caller's
--                        company) and never change it on update. hotel_staff
--                        had NO instead-of triggers: an insert through it
--                        failed (is_active is computed, type has no default)
--                        so /api/resources/hotel-staff POST never worked; it
--                        gets the same three triggers as airport_staff here.
--                        guides_view_insert never set types, so the
--                        type-in-types check refused every insert through it;
--                        it sets types now. airport_staff_view_delete
--                        removed the role before deleting, leaving a
--                        single-role row with a NULL type that NOT NULL
--                        refused — no airport assistant could be deleted;
--                        it deletes first now (hotel_staff the same).
--   copy maps            org_backfill_supplier_copies (original_id, copy_id,
--                        org_id) and org_backfill_property_copies, filled
--                        below. Migration 20261206 (rate tables) reads them
--                        to point each company's rates at its own copy. RLS
--                        on, no policy: service role and the SQL editor only.
--
-- BACKFILL — every supplier goes to the company that uses it. Helpers from
-- 20261202 (org_backfill_*). For each supplier, the set of companies of the
-- rows that point at it (each row's own org_id, or its parent's):
--     expenses.supplier_id, supplier_invoices.supplier_id,
--     supplier_documents.supplier_id, booking_extras.supplier_id,
--     commissions.supplier_id, extras_catalogue.supplier_id,
--     itineraries.assigned_guide_id / assigned_airport_staff_id /
--       assigned_hotel_staff_id, bookings.assigned_guide_id (no FK, but it
--       holds a supplier id — app/api/bookings/[id]),
--     itinerary_services.supplier_id / sold_by_supplier_id (→ itinerary_days
--       → itineraries.org_id),
--     itinerary_resources.resource_id where it is a supplier (guide,
--       airport_staff, hotel_staff assignments; → itineraries.org_id),
--     booking_supplier_status.supplier_id (→ bookings.org_id).
--   (b2b_partners has no supplier column — nothing to trace there.)
--   1. exactly one company uses it → that company.
--   2. BOTH companies use it → COPIED. The original stays with the company
--      that uses it MOST (count of the rows above); a tie goes to the
--      catalogue default (ATS), then the lower org id. A copy (same fields,
--      same supplier_code — the code is unique per company now, and keeping
--      it lets the other company's existing CSV exports still link; new id)
--      is made for each other company, with copies of its supplier_properties,
--      and that company's rows above are pointed at its copy. Original and
--      copy are listed in review: 'used by both companies — copied'.
--   3. nobody uses it → the companies of whoever CREATED its rates: INSERT
--      rows of rate_audit_log (only INSERTs — the service-role EUR→USD
--      cut-over wrote UPDATEs) for the rate tables' supplier_id, changed_by
--      → org_backfill_user_org (a person in both companies counts for
--      neither). One company → that company; both → copied as in 2.
--   4. still nothing → the catalogue default (ATS — the catalogue is mostly
--      ATS's, decided 2026-10-12) + review: 'no trip, booking, expense, bill,
--      document or rate creator traces it — catalogue default'.
--   supplier_properties: the supplier's company.
-- Rate rows are NOT touched here: a rate of a copied supplier still points
-- at the original. 20261206 assigns the rates and repoints them through the
-- copy maps.
--
-- Read the list afterwards:
--   SELECT * FROM org_backfill_review WHERE table_name = 'suppliers' ORDER BY id;
--   SELECT * FROM org_backfill_supplier_copies;
--
-- DEPLOY ORDER: apply this migration FIRST, then deploy the code. The code
-- selects, filters and inserts suppliers.org_id and fails without it. Between
-- the migration and the deploy the old code inserts suppliers without an
-- org_id, which NOT NULL refuses — deploy promptly.
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS; the backfill plans
-- only suppliers still without an org; copies are made only where the copy
-- map has none; repointing only moves rows still pointing at another
-- company's original; review rows ON CONFLICT DO NOTHING; policies dropped
-- before created; every table and column guarded. On a bare replay (no
-- organisations) nothing is written.
BEGIN;

-- pg_temp helpers for this migration only.
CREATE OR REPLACE FUNCTION pg_temp.has_col(t text, c text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t AND column_name = c)
$$;
CREATE OR REPLACE FUNCTION pg_temp.set_trigger(t text, trg text, enabled boolean) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || t) IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = trg) THEN
    EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I', t, CASE WHEN enabled THEN 'ENABLE' ELSE 'DISABLE' END, trg);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Columns, copy maps, the per-company code
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    ALTER TABLE public.supplier_properties ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- supplier_code is unique per company from here on (a copy keeps its
-- original's code).
DROP INDEX IF EXISTS public.suppliers_supplier_code_key;

CREATE TABLE IF NOT EXISTS public.org_backfill_supplier_copies (
  original_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  copy_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (original_id, org_id)
);
ALTER TABLE public.org_backfill_supplier_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_supplier_copies FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS public.org_backfill_property_copies (
      original_id uuid NOT NULL REFERENCES public.supplier_properties(id) ON DELETE CASCADE,
      copy_id uuid NOT NULL REFERENCES public.supplier_properties(id) ON DELETE CASCADE,
      org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (original_id, org_id)
    );
    ALTER TABLE public.org_backfill_property_copies ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.org_backfill_property_copies FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;

-- The code trigger of 20261029, with "taken" asked within the row's company.
-- Same contract otherwise: mint when blank, never blank a code on update,
-- an explicit SUP-#### fast-forwards the shared sequence past itself.
CREATE OR REPLACE FUNCTION public.suppliers_assign_code()
RETURNS trigger AS $$
DECLARE
  candidate  text;
  spent      bigint;
  seq_last   bigint;
  seq_called boolean;
  attempts   integer := 0;
BEGIN
  IF NEW.supplier_code IS NULL OR btrim(NEW.supplier_code) = '' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.supplier_code := OLD.supplier_code;
      RETURN NEW;
    END IF;

    LOOP
      attempts := attempts + 1;
      IF attempts > 10000 THEN
        RAISE EXCEPTION 'suppliers_assign_code: no free supplier code after % attempts', attempts;
      END IF;
      candidate := 'SUP-' || lpad(nextval('public.suppliers_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.suppliers
         WHERE supplier_code = candidate AND org_id IS NOT DISTINCT FROM NEW.org_id
      );
    END LOOP;

    NEW.supplier_code := candidate;
    RETURN NEW;
  END IF;

  IF NEW.supplier_code ~ '^SUP-[0-9]+$' THEN
    spent := substring(NEW.supplier_code from 5)::bigint;
    SELECT last_value, is_called INTO seq_last, seq_called
      FROM public.suppliers_code_seq;
    IF spent > seq_last OR (spent = seq_last AND NOT seq_called) THEN
      PERFORM setval('public.suppliers_code_seq', spent, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _sup_use (supplier_id uuid NOT NULL, org_id uuid NOT NULL, signal text NOT NULL) ON COMMIT DROP;

DO $$
DECLARE
  dflt uuid;
  cat uuid;
  spec text[];
  tbl text;
  col text;
  cols text;
  pcols text;
  rec record;
  new_id uuid;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO dflt;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF dflt IS NULL OR cat IS NULL THEN
    RAISE NOTICE 'suppliers: no organisations — nothing to backfill';
    RETURN;
  END IF;

  -- The backfill must not stamp every row as just edited, nor recompute a
  -- trip's totals because a service's supplier id moved to the copy.
  PERFORM pg_temp.set_trigger('suppliers', 'set_updated_at', false);
  PERFORM pg_temp.set_trigger('suppliers', 'update_suppliers_timestamp', false);

  -- 1–2. Who uses each supplier still without a company.
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'supplier_id'],
    ARRAY['supplier_invoices', 'supplier_id'],
    ARRAY['supplier_documents', 'supplier_id'],
    ARRAY['booking_extras', 'supplier_id'],
    ARRAY['commissions', 'supplier_id'],
    ARRAY['extras_catalogue', 'supplier_id'],
    ARRAY['itineraries', 'assigned_guide_id'],
    ARRAY['itineraries', 'assigned_airport_staff_id'],
    ARRAY['itineraries', 'assigned_hotel_staff_id'],
    ARRAY['bookings', 'assigned_guide_id']
  ] LOOP
    tbl := spec[1];
    col := spec[2];
    IF NOT pg_temp.has_col(tbl, col) OR NOT pg_temp.has_col(tbl, 'org_id') THEN CONTINUE; END IF;
    EXECUTE format($f$
      INSERT INTO _sup_use (supplier_id, org_id, signal)
      SELECT s.id, r.org_id, 'use'
        FROM public.%1$I r JOIN public.suppliers s ON s.id = r.%2$I
       WHERE r.org_id IS NOT NULL AND s.org_id IS NULL
    $f$, tbl, col);
  END LOOP;

  IF pg_temp.has_col('itinerary_services', 'itinerary_day_id') AND to_regclass('public.itinerary_days') IS NOT NULL THEN
    FOREACH col IN ARRAY ARRAY['supplier_id', 'sold_by_supplier_id'] LOOP
      IF NOT pg_temp.has_col('itinerary_services', col) THEN CONTINUE; END IF;
      EXECUTE format($f$
        INSERT INTO _sup_use (supplier_id, org_id, signal)
        SELECT s.id, i.org_id, 'use'
          FROM public.itinerary_services r
          JOIN public.itinerary_days d ON d.id = r.itinerary_day_id
          JOIN public.itineraries i ON i.id = d.itinerary_id
          JOIN public.suppliers s ON s.id = r.%1$I
         WHERE i.org_id IS NOT NULL AND s.org_id IS NULL
      $f$, col);
    END LOOP;
  END IF;

  IF pg_temp.has_col('itinerary_resources', 'resource_id') THEN
    INSERT INTO _sup_use (supplier_id, org_id, signal)
    SELECT s.id, i.org_id, 'use'
      FROM public.itinerary_resources r
      JOIN public.itineraries i ON i.id = r.itinerary_id
      JOIN public.suppliers s ON s.id = r.resource_id
     WHERE i.org_id IS NOT NULL AND s.org_id IS NULL;
  END IF;

  IF pg_temp.has_col('booking_supplier_status', 'supplier_id') THEN
    INSERT INTO _sup_use (supplier_id, org_id, signal)
    SELECT s.id, b.org_id, 'use'
      FROM public.booking_supplier_status r
      JOIN public.bookings b ON b.id = r.booking_id
      JOIN public.suppliers s ON s.id = r.supplier_id
     WHERE b.org_id IS NOT NULL AND s.org_id IS NULL;
  END IF;

  -- 3. Nobody uses it: who created its rates (INSERT rows only).
  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    FOREACH tbl IN ARRAY ARRAY[
      'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'assistant_rates',
      'entrance_fees', 'flight_rates', 'guide_rates', 'hotel_staff_rates', 'meal_rates',
      'nile_cruises', 'seasonal_rates', 'sleeping_train_rates', 'train_rates',
      'transportation_rates', 'vehicle_rates'
    ] LOOP
      IF NOT pg_temp.has_col(tbl, 'supplier_id') THEN CONTINUE; END IF;
      EXECUTE format($f$
        INSERT INTO _sup_use (supplier_id, org_id, signal)
        SELECT s.id, public.org_backfill_user_org(l.changed_by), 'rate'
          FROM public.%1$I r
          JOIN public.suppliers s ON s.id = r.supplier_id
          JOIN public.rate_audit_log l ON l.table_name = %1$L AND l.record_id = r.id AND l.action = 'INSERT'
         WHERE s.org_id IS NULL AND l.changed_by IS NOT NULL
           AND public.org_backfill_user_org(l.changed_by) IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM _sup_use u WHERE u.supplier_id = s.id AND u.signal = 'use')
      $f$, tbl);
    END LOOP;
  END IF;

  -- The plan: per supplier, its companies ranked — most rows first, a tie to
  -- the catalogue default, then the lower id. Rank 1 keeps the original;
  -- every other company gets a copy.
  CREATE TEMP TABLE _sup_plan ON COMMIT DROP AS
  SELECT supplier_id, org_id, n,
         row_number() OVER (PARTITION BY supplier_id ORDER BY n DESC, (org_id = cat) DESC, org_id::text) AS rnk,
         count(*) OVER (PARTITION BY supplier_id) AS orgs
    FROM (SELECT supplier_id, org_id, count(*) AS n FROM _sup_use GROUP BY supplier_id, org_id) g;

  UPDATE public.suppliers s SET org_id = p.org_id
    FROM _sup_plan p
   WHERE p.supplier_id = s.id AND p.rnk = 1 AND s.org_id IS NULL;

  -- 4. Nothing traces it: the catalogue default, listed.
  WITH filled AS (
    UPDATE public.suppliers SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'suppliers', id::text, cat, 'no trip, booking, expense, bill, document or rate creator traces it — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- supplier_properties: the supplier's company.
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    UPDATE public.supplier_properties sp SET org_id = s.org_id
      FROM public.suppliers s
     WHERE s.id = sp.supplier_id AND sp.org_id IS DISTINCT FROM s.org_id;
  END IF;

  -- 2. Copies for every other company that uses it.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name NOT IN ('id', 'org_id')
     AND is_generated = 'NEVER';
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO pcols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'supplier_properties'
       AND column_name NOT IN ('id', 'org_id', 'supplier_id') AND is_generated = 'NEVER';
  END IF;

  FOR rec IN
    SELECT p.supplier_id, p.org_id
      FROM _sup_plan p
     WHERE p.rnk > 1
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_supplier_copies m
                        WHERE m.original_id = p.supplier_id AND m.org_id = p.org_id)
     ORDER BY p.supplier_id, p.rnk
  LOOP
    EXECUTE format('INSERT INTO public.suppliers (org_id, %1$s) SELECT $1, %1$s FROM public.suppliers WHERE id = $2 RETURNING id', cols)
      INTO new_id USING rec.org_id, rec.supplier_id;
    INSERT INTO public.org_backfill_supplier_copies (original_id, copy_id, org_id)
    VALUES (rec.supplier_id, new_id, rec.org_id);
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'suppliers', s.id::text, s.org_id, 'used by both companies — copied'
      FROM public.suppliers s WHERE s.id IN (rec.supplier_id, new_id)
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;

    IF pcols IS NOT NULL THEN
      EXECUTE format($f$
        WITH src AS (
          SELECT id, %1$s FROM public.supplier_properties WHERE supplier_id = $1
        ), ins AS (
          INSERT INTO public.supplier_properties (supplier_id, org_id, %1$s)
          SELECT $2, $3, %1$s FROM src ORDER BY id
          RETURNING id, property_type, name
        )
        INSERT INTO public.org_backfill_property_copies (original_id, copy_id, org_id)
        SELECT src.id, ins.id, $3
          FROM src JOIN ins ON ins.property_type = src.property_type AND ins.name = src.name
      $f$, pcols) USING rec.supplier_id, new_id, rec.org_id;
    END IF;
  END LOOP;

  PERFORM pg_temp.set_trigger('suppliers', 'set_updated_at', true);
  PERFORM pg_temp.set_trigger('suppliers', 'update_suppliers_timestamp', true);
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's rows point at its own copy (runs on every replay: it only
-- moves rows still pointing at another company's original).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  spec text[];
  tbl text;
  col text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_backfill_supplier_copies) THEN RETURN; END IF;

  -- The repoint is not an edit: no updated_at bump, no totals recompute.
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'set_updated_at'], ARRAY['supplier_invoices', 'set_updated_at'],
    ARRAY['supplier_documents', 'set_updated_at'], ARRAY['supplier_documents', 'supplier_documents_updated_at'],
    ARRAY['commissions', 'set_updated_at'], ARRAY['commissions', 'update_commissions_timestamp'],
    ARRAY['itineraries', 'set_updated_at'], ARRAY['bookings', 'set_updated_at'],
    ARRAY['itinerary_resources', 'set_updated_at'], ARRAY['booking_supplier_status', 'set_updated_at'],
    ARRAY['itinerary_services', 'trg_recalc_on_service_update']
  ] LOOP
    PERFORM pg_temp.set_trigger(spec[1], spec[2], false);
  END LOOP;

  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'supplier_id'],
    ARRAY['supplier_invoices', 'supplier_id'],
    ARRAY['supplier_documents', 'supplier_id'],
    ARRAY['booking_extras', 'supplier_id'],
    ARRAY['commissions', 'supplier_id'],
    ARRAY['extras_catalogue', 'supplier_id'],
    ARRAY['itineraries', 'assigned_guide_id'],
    ARRAY['itineraries', 'assigned_airport_staff_id'],
    ARRAY['itineraries', 'assigned_hotel_staff_id'],
    ARRAY['bookings', 'assigned_guide_id']
  ] LOOP
    tbl := spec[1];
    col := spec[2];
    IF NOT pg_temp.has_col(tbl, col) OR NOT pg_temp.has_col(tbl, 'org_id') THEN CONTINUE; END IF;
    EXECUTE format($f$
      UPDATE public.%1$I r SET %2$I = m.copy_id
        FROM public.org_backfill_supplier_copies m
       WHERE r.%2$I = m.original_id AND r.org_id = m.org_id
    $f$, tbl, col);
  END LOOP;

  IF pg_temp.has_col('itinerary_services', 'itinerary_day_id') AND to_regclass('public.itinerary_days') IS NOT NULL THEN
    FOREACH col IN ARRAY ARRAY['supplier_id', 'sold_by_supplier_id'] LOOP
      IF NOT pg_temp.has_col('itinerary_services', col) THEN CONTINUE; END IF;
      EXECUTE format($f$
        UPDATE public.itinerary_services r SET %1$I = m.copy_id
          FROM public.itinerary_days d, public.itineraries i, public.org_backfill_supplier_copies m
         WHERE d.id = r.itinerary_day_id AND i.id = d.itinerary_id
           AND r.%1$I = m.original_id AND m.org_id = i.org_id
      $f$, col);
    END LOOP;
  END IF;

  IF pg_temp.has_col('itinerary_resources', 'resource_id') THEN
    UPDATE public.itinerary_resources r SET resource_id = m.copy_id
      FROM public.itineraries i, public.org_backfill_supplier_copies m
     WHERE i.id = r.itinerary_id AND r.resource_id = m.original_id AND m.org_id = i.org_id;
  END IF;

  IF pg_temp.has_col('booking_supplier_status', 'supplier_id') THEN
    UPDATE public.booking_supplier_status r SET supplier_id = m.copy_id
      FROM public.bookings b, public.org_backfill_supplier_copies m
     WHERE b.id = r.booking_id AND r.supplier_id = m.original_id AND m.org_id = b.org_id;
  END IF;

  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['expenses', 'set_updated_at'], ARRAY['supplier_invoices', 'set_updated_at'],
    ARRAY['supplier_documents', 'set_updated_at'], ARRAY['supplier_documents', 'supplier_documents_updated_at'],
    ARRAY['commissions', 'set_updated_at'], ARRAY['commissions', 'update_commissions_timestamp'],
    ARRAY['itineraries', 'set_updated_at'], ARRAY['bookings', 'set_updated_at'],
    ARRAY['itinerary_resources', 'set_updated_at'], ARRAY['booking_supplier_status', 'set_updated_at'],
    ARRAY['itinerary_services', 'trg_recalc_on_service_update']
  ] LOOP
    PERFORM pg_temp.set_trigger(spec[1], spec[2], true);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- NOT NULL, indexes, the per-company code, the property's company
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'supplier_properties'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_code_key ON public.suppliers (org_id, supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_name ON public.suppliers (org_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_types ON public.suppliers USING gin (types) WHERE org_id IS NOT NULL;

-- A property is always in its supplier's company: set from the supplier on
-- every insert and every change of supplier, whatever the caller sent. As
-- the invoking role (not definer): through PostgREST a user who cannot see
-- the supplier gets NULL here, which NOT NULL refuses.
CREATE OR REPLACE FUNCTION public.supplier_properties_org_from_supplier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.org_id := (SELECT s.org_id FROM public.suppliers s WHERE s.id = NEW.supplier_id);
  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_supplier_properties_org ON public.supplier_properties (org_id, supplier_id);
    DROP TRIGGER IF EXISTS supplier_properties_org_from_supplier ON public.supplier_properties;
    CREATE TRIGGER supplier_properties_org_from_supplier
      BEFORE INSERT OR UPDATE OF supplier_id, org_id ON public.supplier_properties
      FOR EACH ROW EXECUTE FUNCTION public.supplier_properties_org_from_supplier();
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- The staff views: org_id exposed, stamped on insert, kept on update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.airport_staff WITH (security_invoker='on') AS
 SELECT id,
    name,
    service_role AS role,
    airport_location,
    contact_phone AS phone,
    whatsapp,
    contact_email AS email,
    languages,
    shift_times,
    notes,
    ((status)::text = 'active'::text) AS is_active,
    created_at,
    updated_at,
    emergency_contact_name AS emergency_contact,
    tier,
    is_preferred,
    org_id
   FROM public.suppliers
  WHERE ('airport_assistant'::text = ANY (types));

CREATE OR REPLACE VIEW public.guides WITH (security_invoker='on') AS
 SELECT id,
    name,
    contact_email AS email,
    contact_phone AS phone,
    languages,
    specialties,
    certification_number,
    license_expiry,
    ((status)::text = 'active'::text) AS is_active,
    max_group_size,
    hourly_rate,
    daily_rate,
    emergency_contact_name,
    emergency_contact_phone,
    address,
    notes,
    profile_photo_url,
    created_at,
    updated_at,
    tier,
    is_preferred,
    city,
    whatsapp,
    org_id
   FROM public.suppliers
  WHERE ('guide'::text = ANY (types));

CREATE OR REPLACE VIEW public.hotel_staff WITH (security_invoker='on') AS
 SELECT id,
    name,
    service_role AS role,
    contact_phone AS phone,
    whatsapp,
    contact_email AS email,
    languages,
    shift_times,
    notes,
    ((status)::text = 'active'::text) AS is_active,
    created_at,
    updated_at,
    emergency_contact_name AS emergency_contact,
    tier,
    is_preferred,
    org_id
   FROM public.suppliers
  WHERE ('hotel_assistant'::text = ANY (types));

CREATE OR REPLACE FUNCTION public.airport_staff_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, org_id, name, type, types, entity_kind, status, service_role, airport_location,
    contact_phone, whatsapp, contact_email, languages, shift_times, notes,
    emergency_contact_name, tier, is_preferred, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.org_id, NEW.name, 'airport_assistant',
    ARRAY['airport_assistant'], 'individual',
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.role, NEW.airport_location, NEW.phone, NEW.whatsapp, NEW.email,
    NEW.languages, NEW.shift_times, NEW.notes, NEW.emergency_contact,
    NEW.tier, COALESCE(NEW.is_preferred, false),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

-- The company is never changed through the view: an update addresses the
-- row it was given, in the company it is in.
CREATE OR REPLACE FUNCTION public.airport_staff_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                   = NEW.name,
    service_role           = NEW.role,
    airport_location       = NEW.airport_location,
    contact_phone          = NEW.phone,
    whatsapp               = NEW.whatsapp,
    contact_email          = NEW.email,
    languages              = NEW.languages,
    shift_times            = NEW.shift_times,
    notes                  = NEW.notes,
    emergency_contact_name = NEW.emergency_contact,
    tier                   = NEW.tier,
    is_preferred           = NEW.is_preferred,
    status                 = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    updated_at             = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'airport_assistant' = ANY(types);
  NEW.org_id := OLD.org_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.airport_staff_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Staff and nothing else: the supplier goes. Staff among other roles:
  -- only this role goes. (Before, the role was removed first, which left a
  -- single-role row with no type — refused by NOT NULL, so no airport staff
  -- member could ever be deleted.)
  DELETE FROM public.suppliers
   WHERE id = OLD.id AND org_id = OLD.org_id AND (types IS NULL OR types <@ ARRAY['airport_assistant']);
  UPDATE public.suppliers
  SET types = array_remove(types, 'airport_assistant'),
      type = CASE WHEN type = 'airport_assistant'
                  THEN (array_remove(types, 'airport_assistant'))[1]
                  ELSE type END,
      updated_at = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'airport_assistant' = ANY(types);
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, org_id, type, types, entity_kind, name, contact_email, contact_phone, languages,
    specialties, certification_number, license_expiry, status, max_group_size,
    hourly_rate, daily_rate, emergency_contact_name, emergency_contact_phone,
    address, notes, profile_photo_url, tier, is_preferred, city, whatsapp,
    created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.org_id, 'guide', ARRAY['guide'], 'individual', NEW.name,
    NEW.email, NEW.phone, NEW.languages, NEW.specialties, NEW.certification_number,
    NEW.license_expiry,
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.max_group_size, NEW.hourly_rate, NEW.daily_rate, NEW.emergency_contact_name,
    NEW.emergency_contact_phone, NEW.address, NEW.notes, NEW.profile_photo_url,
    NEW.tier, COALESCE(NEW.is_preferred, false), NEW.city, NEW.whatsapp,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                    = NEW.name,
    contact_email           = NEW.email,
    contact_phone           = NEW.phone,
    languages               = NEW.languages,
    specialties             = NEW.specialties,
    certification_number    = NEW.certification_number,
    license_expiry          = NEW.license_expiry,
    status                  = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    max_group_size          = NEW.max_group_size,
    hourly_rate             = NEW.hourly_rate,
    daily_rate              = NEW.daily_rate,
    emergency_contact_name  = NEW.emergency_contact_name,
    emergency_contact_phone = NEW.emergency_contact_phone,
    address                 = NEW.address,
    notes                   = NEW.notes,
    profile_photo_url       = NEW.profile_photo_url,
    tier                    = NEW.tier,
    is_preferred            = NEW.is_preferred,
    city                    = NEW.city,
    whatsapp                = NEW.whatsapp,
    updated_at              = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND type = 'guide';
  NEW.org_id := OLD.org_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guides_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM public.suppliers WHERE id = OLD.id AND org_id = OLD.org_id AND type = 'guide';
  RETURN OLD;
END $$;

-- hotel_staff: the airport_staff triggers, for hotel assistants.
CREATE OR REPLACE FUNCTION public.hotel_staff_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, org_id, name, type, types, entity_kind, status, service_role,
    contact_phone, whatsapp, contact_email, languages, shift_times, notes,
    emergency_contact_name, tier, is_preferred, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.org_id, NEW.name, 'hotel_assistant',
    ARRAY['hotel_assistant'], 'individual',
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.role, NEW.phone, NEW.whatsapp, NEW.email,
    COALESCE(NEW.languages, '{}'), NEW.shift_times, NEW.notes, NEW.emergency_contact,
    NEW.tier, COALESCE(NEW.is_preferred, false),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hotel_staff_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                   = NEW.name,
    service_role           = NEW.role,
    contact_phone          = NEW.phone,
    whatsapp               = NEW.whatsapp,
    contact_email          = NEW.email,
    languages              = NEW.languages,
    shift_times            = NEW.shift_times,
    notes                  = NEW.notes,
    emergency_contact_name = NEW.emergency_contact,
    tier                   = NEW.tier,
    is_preferred           = NEW.is_preferred,
    status                 = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    updated_at             = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'hotel_assistant' = ANY(types);
  NEW.org_id := OLD.org_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hotel_staff_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Staff and nothing else: the supplier goes. Staff among other roles:
  -- only this role goes. (Before, the role was removed first, which left a
  -- single-role row with no type — refused by NOT NULL, so no airport staff
  -- member could ever be deleted.)
  DELETE FROM public.suppliers
   WHERE id = OLD.id AND org_id = OLD.org_id AND (types IS NULL OR types <@ ARRAY['hotel_assistant']);
  UPDATE public.suppliers
  SET types = array_remove(types, 'hotel_assistant'),
      type = CASE WHEN type = 'hotel_assistant'
                  THEN (array_remove(types, 'hotel_assistant'))[1]
                  ELSE type END,
      updated_at = now()
  WHERE id = OLD.id AND org_id = OLD.org_id AND 'hotel_assistant' = ANY(types);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS hotel_staff_view_insert_trg ON public.hotel_staff;
CREATE TRIGGER hotel_staff_view_insert_trg INSTEAD OF INSERT ON public.hotel_staff FOR EACH ROW EXECUTE FUNCTION public.hotel_staff_view_insert();
DROP TRIGGER IF EXISTS hotel_staff_view_update_trg ON public.hotel_staff;
CREATE TRIGGER hotel_staff_view_update_trg INSTEAD OF UPDATE ON public.hotel_staff FOR EACH ROW EXECUTE FUNCTION public.hotel_staff_view_update();
DROP TRIGGER IF EXISTS hotel_staff_view_delete_trg ON public.hotel_staff;
CREATE TRIGGER hotel_staff_view_delete_trg INSTEAD OF DELETE ON public.hotel_staff FOR EACH ROW EXECUTE FUNCTION public.hotel_staff_view_delete();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS suppliers_authenticated_all ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_select ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_insert ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_update ON public.suppliers;
DROP POLICY IF EXISTS suppliers_org_delete ON public.suppliers;
CREATE POLICY suppliers_org_select ON public.suppliers FOR SELECT TO authenticated
  USING (public.user_is_in_org(org_id));
CREATE POLICY suppliers_org_insert ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
CREATE POLICY suppliers_org_update ON public.suppliers FOR UPDATE TO authenticated
  USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
  WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
CREATE POLICY suppliers_org_delete ON public.suppliers FOR DELETE TO authenticated
  USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());

DO $$
BEGIN
  IF to_regclass('public.supplier_properties') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS supplier_properties_authenticated_all ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_select ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_insert ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_update ON public.supplier_properties;
  DROP POLICY IF EXISTS supplier_properties_org_delete ON public.supplier_properties;
  CREATE POLICY supplier_properties_org_select ON public.supplier_properties FOR SELECT TO authenticated
    USING (public.user_is_in_org(org_id));
  CREATE POLICY supplier_properties_org_insert ON public.supplier_properties FOR INSERT TO authenticated
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY supplier_properties_org_update ON public.supplier_properties FOR UPDATE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())
    WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  CREATE POLICY supplier_properties_org_delete ON public.supplier_properties FOR DELETE TO authenticated
    USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());
END
$$;

COMMIT;

INSERT INTO public.schema_migrations (name) VALUES ('20261205_suppliers_org_id') ON CONFLICT DO NOTHING;

-- ==================================================================
-- 20261206_rates_org_id
-- ==================================================================
-- ============================================
-- Rates belong to one company: every rate table gets an org_id
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and not one rate table had an org_id, so every rate was both
-- companies':
--   - /api/rates/** listed, edited and deleted the other company's hotels,
--     guides, transport, cruises, fees …; service codes were unique across the
--     install, so a company could not use a code the other had taken, and a
--     bulk import (onConflict 'service_code') OVERWROTE the other company's
--     row when the codes matched;
--   - the pricing engine (lib/auto-pricing-service, the pricing grid, B2B
--     pricing, the AI itinerary builder) priced one company's trips with the
--     other's rates;
--   - restampVehicleBands rewrote EVERY transportation rate with the
--     current company's vehicle vocabulary;
--   - the rate-change digest mailed every company's managers every company's
--     rate changes, and the invariants cron mailed one list of everyone's;
--   - destinations, fixed daily costs, attraction aliases, the fleet
--     (vehicles) and the legacy hotel / cruise / restaurant directories were
--     one shared set.
-- And through PostgREST (RLS, OR'd: one USING (true) opens a table), quoted
-- from the baseline and later migrations:
--   accommodation_rates, activity_rates, airport_staff_rates, guide_rates,
--   hotel_staff_rates, meal_rates, nile_cruises, tipping_rates,
--   transportation_rates          "<table>_authenticated_all" ALL TO
--                                 authenticated USING (true) WITH CHECK (true)
--   entrance_fees                 "entrance_fees_authenticated_all" (same) and
--                                 "Allow authenticated read access" SELECT (true)
--   flight_rates                  "Allow read access to flight_rates",
--                                 "Allow insert/update/delete for authenticated
--                                 users" — TO PUBLIC, (true)
--   train_rates, sleeping_train_rates
--                                 "Allow all for authenticated" ALL TO PUBLIC (true)
--   cruise_contacts               "Enable all access for authenticated users"
--                                 ALL TO PUBLIC (true)
--   assistant_rates, seasonal_rates, vehicle_rates, fixed_daily_costs,
--   hotel_contacts, restaurant_contacts, service_fees, vehicles,
--   entrance_fee_versions, b2b_partner_pricing
--                                 "<table>_authenticated" ALL TO authenticated (true)
--   attraction_aliases            "Allow authenticated read/insert/update/
--                                 delete" (true); "Allow service role full
--                                 access" (kept)
--   destinations, destination_cities
--                                 "<table>_read" SELECT TO authenticated (true);
--                                 "<table>_service" (kept)
--   rate_audit_log                "Authenticated users can read audit log"
--                                 SELECT (true); "Only system can insert audit
--                                 log" WITH CHECK (false) (kept — grants nothing)
--   extras_catalogue              "extras_catalogue_authenticated_all" (true) —
--                                 it HAD an org_id, the policy ignored it
--   b2b_transport_packages        "b2b_transport_packages_authenticated" (true) —
--                                 likewise
-- All of those (true) policies are dropped. In their place, on every table
-- above: select user_is_in_org(org_id); insert/update/delete
-- user_is_in_org(org_id) AND is_manager_or_above() (rates are manager-and-
-- above since #605). The CHILD tables check their parent's company:
-- entrance_fee_versions (entrance_fees), destination_cities (destinations,
-- select only, as before), b2b_partner_pricing (b2b_partners). rate_audit_log:
-- select user_is_in_org(org_id) AND is_manager_or_above(). Every caller is an
-- API route on the service role (RLS does not apply to it); these are the
-- second wall — the one browser read (the itinerary edit page's entrance fee /
-- activity lookups) now sees only its company's rates.
--
-- WHAT THIS DOES. org_id uuid REFERENCES organizations ON DELETE CASCADE (as
-- itineraries.org_id; no DEFAULT — the code stamps every insert) on:
--   accommodation_rates activity_rates airport_staff_rates hotel_staff_rates
--   guide_rates meal_rates nile_cruises flight_rates train_rates
--   sleeping_train_rates transportation_rates tipping_rates entrance_fees
--   service_fees assistant_rates seasonal_rates vehicle_rates
--   fixed_daily_costs attraction_aliases destinations vehicles
--   hotel_contacts cruise_contacts restaurant_contacts rate_audit_log
-- (entrance_fee_versions and destination_cities follow their parent.) Every
-- row assigned, NOT NULL, indexed (org_id, …).
--
-- BACKFILL — helpers from 20261202. Each rule fills only rows still NULL.
-- "Trips that use it" means, for a row R: an itinerary_services line whose
-- notes pin it ("__grid:slot:<slot>|rate_id:<R>[…]", the pricing grid) or
-- whose service_code is R's; an itinerary_resources assignment of R; a
-- b2b_pricing_rules row naming R; itineraries.assigned_vehicle_id /
-- assigned_hotel_id / assigned_restaurant_id / destination_id,
-- bookings.assigned_vehicle_id, tour_departures.assigned_vehicle_id = R —
-- each through that row's company.
--
--   RATES (every *_rates table, nile_cruises, entrance_fees, service_fees;
--   assistant_rates / seasonal_rates / vehicle_rates are barely used and have
--   only the first rule to go on), in order:
--     1. its supplier's company (suppliers.org_id — 20261205 gives suppliers
--        one; without that migration the rule is skipped)
--     2. the company of the person who created it (the rate_audit_log INSERT
--        row's changed_by, when they belong to exactly one company; the
--        EUR→USD cut-over's UPDATE rows are not creations and never count)
--     3. the one company whose trips use it
--     4. used by BOTH companies' trips and nothing above: the catalogue
--        default (ATS) when it is one of them, else the older company —
--        review: 'used by both companies — copied for the other'
--     5. nothing traces it: the catalogue default (ATS — decided 2026-10-12,
--        the catalogue is mostly ATS's) — review: 'no supplier, creator or
--        trip — catalogue default'
--   Then a row used by trips of a company OTHER than the one it landed in is
--   COPIED into that company (new id, same service code — codes are unique
--   per company now — same everything else) and that company's references
--   are pointed at the copy: its itinerary_services pins, its
--   itinerary_resources assignments, its b2b_pricing_rules (service_code
--   lines need nothing: the copy keeps the code). Both rows are listed:
--   'used by another company — copied'. An entrance fee's language versions
--   are copied with it. Copies are recorded in
--   org_backfill_rate_copies (table_name, original_id, copy_id, org_id).
--   A rate (copy or not) whose supplier / property is another company's is
--   pointed at that company's copy of it (org_backfill_supplier_copies /
--   org_backfill_property_copies, from 20261205); with no copy there it is
--   left and listed: 'supplier belongs to another company' / 'property
--   belongs to another company'.
--
--   fixed_daily_costs — nothing traces them: the catalogue default, and a
--     copy for every other company (each company has its own daily costs).
--   destinations — the catalogue default, and a copy (with its cities) for
--     every other company; each company's itineraries.destination_id is
--     pointed at its own copy.
--   attraction_aliases — its destination's company, else the catalogue
--     default; a copy for every other company, pointed at that company's
--     destination.
--   vehicles (fleet), hotel_contacts / cruise_contacts / restaurant_contacts
--     (legacy directories) — the company of the trips (itineraries
--     .assigned_*, itinerary_resources, bookings / tour_departures for
--     vehicles) that use them; used by both: copied as rates are; else the
--     catalogue default + review.
--   rate_audit_log — its rate row's company; a rate since deleted: the
--     company of the person who changed it, else the catalogue default +
--     review ('rate no longer exists — catalogue default').
--
-- NOT REPOINTED HERE (tables without an org_id yet — tours get theirs in the
-- next batch, which repoints them): tour_days.accommodation_id /
-- lunch_meal_id / dinner_meal_id / guide_id, tour_variation_services.rate_id,
-- content_library.destination_id, writing_rules.destination_id. They keep
-- pointing at the original row (in the catalogue default's company).
--
-- Read the list afterwards:
--   SELECT * FROM org_backfill_review WHERE table_name IN (<the tables above>)
--     ORDER BY id;
--   SELECT * FROM org_backfill_rate_copies ORDER BY table_name, original_id;
--
-- UNIQUE → PER COMPANY: every <table>_service_code_key (and the duplicate
-- index idx_flight_rates_service_code) → (org_id, service_code);
-- nile_cruises (cruise_code), fixed_daily_costs (cost_type), vehicles
-- (license_plate), attraction_aliases (alias), destinations (country_code),
-- b2b_transport_packages (package_code) → (org_id, …); uq_guide_rates_natural_key
-- → org_id first. The bulk import's onConflict is 'org_id,service_code'.
--
-- fn_rate_audit_trigger stamps rate_audit_log.org_id from the row
-- (NEW/OLD.org_id).
--
-- DEAD objects dropped (grep of app/ lib/ components/ hooks/ scripts/: no
-- reader or writer; only types/database.types.ts named them):
--   tables meal_costs, outside_cairo_fees, seasonal_adjustments,
--     transportation_contacts, profit_margins, discount_rules, booking_rules,
--     package_type_definitions, destinations_legacy_2025
--   view tour_overview (its only reader of destinations_legacy_2025; no code
--     reads it) and the foreign key tour_templates_primary_destination_id_fkey
--     (the column stays: the templates routes still accept it; nothing in the
--     UI sends it, and the table it pointed at is the dead legacy one).
-- KEPT GLOBAL: exchange_rates, exchange_rate_snapshots (market data).
--
-- DEPLOY ORDER: apply 20261205 (suppliers) and then this migration FIRST,
-- then deploy the code. The code filters and stamps org_id on these tables
-- and fails without it; the old code keeps reading on the new schema, but a
-- rate it inserts has no org_id and fails NOT NULL — deploy promptly.
-- Without 20261205 this still applies (the supplier rule and the supplier
-- remap are skipped).
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every rule fills only
-- NULLs, a copy is made only where none is recorded, review rows ON CONFLICT
-- DO NOTHING, policies dropped before created, tables guarded (to_regclass).
-- On a bare replay (no organisations) nothing is written.
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_backfill_rate_copies (
  table_name text NOT NULL,
  original_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, original_id, org_id)
);
ALTER TABLE public.org_backfill_rate_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_rate_copies FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns; triggers off for the backfill (it must neither stamp every row as
-- just edited nor write an audit row per assignment); global uniques dropped
-- (a copy keeps its original's code).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  trg text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'fixed_daily_costs', 'attraction_aliases', 'destinations',
    'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts', 'rate_audit_log'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
    FOREACH trg IN ARRAY ARRAY['set_updated_at', 'trg_audit_' || t] LOOP
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = trg) THEN
        EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', t, trg);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_service_code_key') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, t || '_service_code_key');
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.entrance_fee_versions') AND tgname = 'set_updated_at') THEN
    ALTER TABLE public.entrance_fee_versions DISABLE TRIGGER set_updated_at;
  END IF;
END
$$;
DROP INDEX IF EXISTS public.idx_flight_rates_service_code;
DROP INDEX IF EXISTS public.uq_guide_rates_natural_key;
ALTER TABLE IF EXISTS public.nile_cruises DROP CONSTRAINT IF EXISTS nile_cruises_cruise_code_key;
ALTER TABLE IF EXISTS public.fixed_daily_costs DROP CONSTRAINT IF EXISTS fixed_daily_costs_cost_type_key;
ALTER TABLE IF EXISTS public.vehicles DROP CONSTRAINT IF EXISTS vehicles_license_plate_key;
ALTER TABLE IF EXISTS public.attraction_aliases DROP CONSTRAINT IF EXISTS attraction_aliases_alias_key;
ALTER TABLE IF EXISTS public.destinations DROP CONSTRAINT IF EXISTS destinations_country_code_key;
ALTER TABLE IF EXISTS public.b2b_transport_packages DROP CONSTRAINT IF EXISTS b2b_transport_packages_package_code_key;
-- A database whose b2b_transport_packages predates org_id (the E2E project's:
-- see 20261018) gets the column here, so the per-company key and the
-- policies below have it. Production and a fresh install have it already.
ALTER TABLE IF EXISTS public.b2b_transport_packages
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Migration-only helpers (dropped at the end).
-- ---------------------------------------------------------------------------

-- Copy one row into another company: new id, that org, children with it.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_catalogue_row(p_table text, p_id uuid, p_org uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I, to_jsonb(r) || $1)).* FROM public.%1$I r WHERE r.id = $2',
    p_table) USING jsonb_build_object('id', new_id, 'org_id', p_org), p_id;
  INSERT INTO public.org_backfill_rate_copies (table_name, original_id, copy_id, org_id)
  VALUES (p_table, p_id, new_id, p_org);
  IF p_table = 'entrance_fees' AND to_regclass('public.entrance_fee_versions') IS NOT NULL THEN
    INSERT INTO public.entrance_fee_versions
    SELECT (jsonb_populate_record(NULL::public.entrance_fee_versions,
             to_jsonb(v) || jsonb_build_object('id', gen_random_uuid(), 'entrance_fee_id', new_id))).*
      FROM public.entrance_fee_versions v WHERE v.entrance_fee_id = p_id;
  ELSIF p_table = 'destinations' AND to_regclass('public.destination_cities') IS NOT NULL THEN
    INSERT INTO public.destination_cities
    SELECT (jsonb_populate_record(NULL::public.destination_cities,
             to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'destination_id', new_id))).*
      FROM public.destination_cities c WHERE c.destination_id = p_id;
  END IF;
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  VALUES (p_table, new_id::text, p_org, p_reason)
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  RETURN new_id;
END
$fn$;

-- Place one rate-like table's rows (rules 1-5 above), then copy each row into
-- every other company whose trips use it.
CREATE OR REPLACE FUNCTION public.org_backfill_place_catalogue(p_table text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  cat uuid := public.org_backfill_catalogue_default();
  has_sup boolean;
  has_code boolean;
  rec record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL OR cat IS NULL THEN RETURN; END IF;
  has_sup := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'supplier_id')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'org_id');
  has_code := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'service_code');

  -- This table's uses, by company.
  DELETE FROM _org_t_use;
  EXECUTE format('INSERT INTO _org_t_use SELECT DISTINCT u.rid, u.org FROM _org_rate_use u JOIN public.%I r ON r.id = u.rid', p_table);
  IF has_code AND to_regclass('public.itinerary_services') IS NOT NULL THEN
    EXECUTE format($q$
      INSERT INTO _org_t_use
      SELECT DISTINCT r.id, i.org_id
        FROM public.%I r
        JOIN public.itinerary_services s ON s.service_code = r.service_code
        JOIN public.itinerary_days d ON d.id = s.itinerary_day_id
        JOIN public.itineraries i ON i.id = d.itinerary_id
       WHERE coalesce(r.service_code, '') <> '' AND i.org_id IS NOT NULL
    $q$, p_table);
  END IF;

  -- 1. The supplier's company.
  IF has_sup THEN
    EXECUTE format('UPDATE public.%I r SET org_id = s.org_id FROM public.suppliers s
                     WHERE r.org_id IS NULL AND s.id = r.supplier_id AND s.org_id IS NOT NULL', p_table);
  END IF;

  -- 2. The creator's company (the audit trigger's INSERT row).
  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    EXECUTE format($q$
      UPDATE public.%I r SET org_id = a.o
        FROM (SELECT DISTINCT ON (record_id) record_id, public.org_backfill_user_org(changed_by) AS o
                FROM public.rate_audit_log
               WHERE table_name = %L AND action = 'INSERT' AND changed_by IS NOT NULL
               ORDER BY record_id, changed_at) a
       WHERE r.org_id IS NULL AND a.record_id = r.id AND a.o IS NOT NULL
    $q$, p_table, p_table);
  END IF;

  -- 3. The one company whose trips use it.
  EXECUTE format($q$
    UPDATE public.%I r SET org_id = u.o
      FROM (SELECT rid, min(org::text)::uuid AS o FROM _org_t_use GROUP BY rid HAVING count(DISTINCT org) = 1) u
     WHERE r.org_id IS NULL AND u.rid = r.id
  $q$, p_table);

  -- 4. Both companies' trips: the catalogue default when it is one of them.
  EXECUTE format($q$
    WITH filled AS (
      UPDATE public.%1$I r SET org_id = coalesce(
          (SELECT x.org FROM _org_t_use x WHERE x.rid = r.id AND x.org = %2$L::uuid LIMIT 1),
          (SELECT x.org FROM _org_t_use x JOIN public.organizations o ON o.id = x.org
            WHERE x.rid = r.id ORDER BY o.created_at, o.id LIMIT 1))
       WHERE r.org_id IS NULL AND r.id IN (SELECT rid FROM _org_t_use)
      RETURNING r.id, r.org_id
    )
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT %1$L, id::text, org_id, 'used by both companies — copied for the other' FROM filled
    ON CONFLICT (table_name, row_id, reason) DO NOTHING
  $q$, p_table, cat);

  -- 5. Nothing traces it.
  EXECUTE format($q$
    WITH filled AS (
      UPDATE public.%1$I SET org_id = %2$L::uuid WHERE org_id IS NULL RETURNING id
    )
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT %1$L, id::text, %2$L::uuid, 'no supplier, creator or trip — catalogue default' FROM filled
    ON CONFLICT (table_name, row_id, reason) DO NOTHING
  $q$, p_table, cat);

  -- A row another company's trips use: a copy for that company.
  FOR rec IN EXECUTE format($q$
    SELECT DISTINCT u.rid, u.org, r.org_id AS home
      FROM _org_t_use u JOIN public.%I r ON r.id = u.rid
     WHERE u.org <> r.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c
                        WHERE c.table_name = %L AND c.original_id = u.rid AND c.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c
                        WHERE c.table_name = %L AND c.copy_id = u.rid)
  $q$, p_table, p_table, p_table) LOOP
    PERFORM public.org_backfill_copy_catalogue_row(p_table, rec.rid, rec.org, 'used by another company — copied');
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES (p_table, rec.rid::text, rec.home, 'used by another company — copied')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;
END
$fn$;

-- One copy per other company of every row (fixed costs, destinations,
-- aliases: nothing traces them to a company, and each needs its own).
CREATE OR REPLACE FUNCTION public.org_backfill_copy_for_each(p_table text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  rec record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  FOR rec IN EXECUTE format($q$
    SELECT r.id, o.id AS org
      FROM public.%I r CROSS JOIN public.organizations o
     WHERE o.id <> r.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c WHERE c.table_name = %L AND c.copy_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies c
                        WHERE c.table_name = %L AND c.original_id = r.id AND c.org_id = o.id)
     ORDER BY r.id, o.id
  $q$, p_table, p_table, p_table) LOOP
    PERFORM public.org_backfill_copy_catalogue_row(p_table, rec.id, rec.org, 'copied for each company');
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------
-- What trips use: (row id, company). Ids are uuids, unique across tables, so
-- one list serves every table.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _org_rate_use (rid uuid, org uuid) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _org_t_use (rid uuid, org uuid) ON COMMIT DROP;

DO $$
DECLARE
  spec text[];
BEGIN
  IF to_regclass('public.itinerary_services') IS NOT NULL THEN
    INSERT INTO _org_rate_use
    SELECT m[1]::uuid, i.org_id
      FROM public.itinerary_services s
      JOIN public.itinerary_days d ON d.id = s.itinerary_day_id
      JOIN public.itineraries i ON i.id = d.itinerary_id
      CROSS JOIN LATERAL regexp_matches(s.notes, 'rate_id:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', 'g') AS m
     WHERE s.notes LIKE '%rate_id:%' AND i.org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.itinerary_resources') IS NOT NULL THEN
    INSERT INTO _org_rate_use
    SELECT r.resource_id, i.org_id FROM public.itinerary_resources r JOIN public.itineraries i ON i.id = r.itinerary_id
     WHERE i.org_id IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'b2b_pricing_rules' AND column_name = 'org_id') THEN
    INSERT INTO _org_rate_use SELECT rate_id, org_id FROM public.b2b_pricing_rules WHERE rate_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['itineraries', 'assigned_vehicle_id'],
    ARRAY['itineraries', 'assigned_hotel_id'],
    ARRAY['itineraries', 'assigned_restaurant_id'],
    ARRAY['itineraries', 'destination_id'],
    ARRAY['bookings', 'assigned_vehicle_id'],
    ARRAY['tour_departures', 'assigned_vehicle_id']
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = spec[2])
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = 'org_id') THEN
      EXECUTE format('INSERT INTO _org_rate_use SELECT %2$I, org_id FROM public.%1$I WHERE %2$I IS NOT NULL AND org_id IS NOT NULL', spec[1], spec[2]);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Place every table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  t text;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN
    RAISE NOTICE 'rates: no organisations — nothing to backfill';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts'
  ] LOOP
    PERFORM public.org_backfill_place_catalogue(t);
  END LOOP;

  -- Each company its own fixed costs and destinations.
  IF to_regclass('public.fixed_daily_costs') IS NOT NULL THEN
    UPDATE public.fixed_daily_costs SET org_id = cat WHERE org_id IS NULL;
    PERFORM public.org_backfill_copy_for_each('fixed_daily_costs');
  END IF;
  IF to_regclass('public.destinations') IS NOT NULL THEN
    UPDATE public.destinations SET org_id = cat WHERE org_id IS NULL;
    PERFORM public.org_backfill_copy_for_each('destinations');
  END IF;
  -- Aliases: their destination's company, else the catalogue default; one
  -- per company, each pointing at that company's destination.
  IF to_regclass('public.attraction_aliases') IS NOT NULL THEN
    UPDATE public.attraction_aliases a SET org_id = d.org_id FROM public.destinations d
     WHERE a.org_id IS NULL AND d.id = a.destination_id AND d.org_id IS NOT NULL;
    UPDATE public.attraction_aliases SET org_id = cat WHERE org_id IS NULL;
    PERFORM public.org_backfill_copy_for_each('attraction_aliases');
    UPDATE public.attraction_aliases a SET destination_id = c.copy_id
      FROM public.org_backfill_rate_copies c
     WHERE c.table_name = 'destinations' AND c.original_id = a.destination_id AND c.org_id = a.org_id;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's references point at its own copy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  spec text[];
  trg record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_backfill_rate_copies) THEN RETURN; END IF;

  -- These are fix-ups, not edits: no recalculation, no "updated" stamp, no
  -- client-status side effects. Only triggers that are on are turned off,
  -- and only those are turned back on.
  CREATE TEMP TABLE IF NOT EXISTS _org_trg_off (tbl text, tg text) ON COMMIT DROP;
  FOR trg IN
    SELECT c.relname AS tbl, t.tgname AS tg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgenabled = 'O' AND c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('itinerary_services', 'itinerary_resources', 'b2b_pricing_rules', 'itineraries', 'bookings', 'tour_departures')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', trg.tbl, trg.tg);
    INSERT INTO _org_trg_off VALUES (trg.tbl, trg.tg);
  END LOOP;

  IF to_regclass('public.itinerary_services') IS NOT NULL THEN
    UPDATE public.itinerary_services s
       SET notes = replace(s.notes, 'rate_id:' || c.original_id::text, 'rate_id:' || c.copy_id::text)
      FROM public.itinerary_days d, public.itineraries i, public.org_backfill_rate_copies c
     WHERE d.id = s.itinerary_day_id AND i.id = d.itinerary_id AND c.org_id = i.org_id
       AND s.notes LIKE '%rate_id:' || c.original_id::text || '%';
  END IF;
  IF to_regclass('public.itinerary_resources') IS NOT NULL THEN
    UPDATE public.itinerary_resources r SET resource_id = c.copy_id
      FROM public.itineraries i, public.org_backfill_rate_copies c
     WHERE i.id = r.itinerary_id AND c.original_id = r.resource_id AND c.org_id = i.org_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'b2b_pricing_rules' AND column_name = 'org_id') THEN
    UPDATE public.b2b_pricing_rules p SET rate_id = c.copy_id
      FROM public.org_backfill_rate_copies c
     WHERE c.original_id = p.rate_id AND c.org_id = p.org_id;
  END IF;
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['itineraries', 'assigned_vehicle_id'],
    ARRAY['itineraries', 'assigned_hotel_id'],
    ARRAY['itineraries', 'assigned_restaurant_id'],
    ARRAY['itineraries', 'destination_id'],
    ARRAY['bookings', 'assigned_vehicle_id'],
    ARRAY['tour_departures', 'assigned_vehicle_id']
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = spec[2])
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = spec[1] AND column_name = 'org_id') THEN
      EXECUTE format('UPDATE public.%1$I r SET %2$I = c.copy_id FROM public.org_backfill_rate_copies c
                       WHERE c.original_id = r.%2$I AND c.org_id = r.org_id', spec[1], spec[2]);
    END IF;
  END LOOP;

  FOR trg IN SELECT * FROM _org_trg_off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', trg.tbl, trg.tg);
  END LOOP;
  DELETE FROM _org_trg_off;
END
$$;

-- ---------------------------------------------------------------------------
-- A rate's supplier / property is its own company's (20261205's copies).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  sup_org boolean := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'org_id');
  prop_org boolean := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supplier_properties' AND column_name = 'org_id');
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'entrance_fees', 'assistant_rates', 'seasonal_rates', 'vehicle_rates'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF sup_org AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'supplier_id') THEN
      IF to_regclass('public.org_backfill_supplier_copies') IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I r SET supplier_id = m.copy_id
                          FROM public.org_backfill_supplier_copies m, public.suppliers s
                         WHERE m.original_id = r.supplier_id AND m.org_id = r.org_id
                           AND s.id = r.supplier_id AND s.org_id IS DISTINCT FROM r.org_id', t);
      END IF;
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT %1$L, r.id::text, r.org_id, 'supplier belongs to another company'
          FROM public.%1$I r JOIN public.suppliers s ON s.id = r.supplier_id
         WHERE s.org_id IS NOT NULL AND s.org_id <> r.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, t);
    END IF;
    IF prop_org AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'property_id') THEN
      IF to_regclass('public.org_backfill_property_copies') IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I r SET property_id = m.copy_id
                          FROM public.org_backfill_property_copies m, public.supplier_properties p
                         WHERE m.original_id = r.property_id AND m.org_id = r.org_id
                           AND p.id = r.property_id AND p.org_id IS DISTINCT FROM r.org_id', t);
      END IF;
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT %1$L, r.id::text, r.org_id, 'property belongs to another company'
          FROM public.%1$I r JOIN public.supplier_properties p ON p.id = r.property_id
         WHERE p.org_id IS NOT NULL AND p.org_id <> r.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, t);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- rate_audit_log: its rate's company.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  t text;
BEGIN
  IF to_regclass('public.rate_audit_log') IS NULL THEN RETURN; END IF;
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN RETURN; END IF;
  FOR t IN SELECT DISTINCT table_name FROM public.rate_audit_log WHERE org_id IS NULL LOOP
    IF to_regclass('public.' || t) IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id') THEN
      CONTINUE;
    END IF;
    EXECUTE format('UPDATE public.rate_audit_log l SET org_id = r.org_id FROM public.%I r
                     WHERE l.org_id IS NULL AND l.table_name = %L AND l.record_id = r.id AND r.org_id IS NOT NULL', t, t);
  END LOOP;
  UPDATE public.rate_audit_log SET org_id = public.org_backfill_user_org(changed_by)
   WHERE org_id IS NULL AND changed_by IS NOT NULL AND public.org_backfill_user_org(changed_by) IS NOT NULL;
  WITH filled AS (
    UPDATE public.rate_audit_log SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'rate_audit_log', id::text, cat, 'rate no longer exists — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- The audit row carries its rate's company.
CREATE OR REPLACE FUNCTION public.fn_rate_audit_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old_record jsonb;
  v_new_record jsonb;
  v_changed_fields jsonb := '{}';
  v_record_id uuid;
  v_org uuid;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
    v_record_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_key IN ('updated_at', 'created_at') THEN
        CONTINUE;
      END IF;
      v_old_val := v_old_record -> v_key;
      v_new_val := v_new_record -> v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old_val, 'new', v_new_val)
        );
      END IF;
    END LOOP;
    IF v_changed_fields = '{}' THEN
      RETURN NEW;
    END IF;
  END IF;

  v_org := coalesce((v_new_record ->> 'org_id')::uuid, (v_old_record ->> 'org_id')::uuid);
  -- A company being deleted takes its rates with it (ON DELETE CASCADE):
  -- there is no one left to read that trail, and no organisation to file it
  -- under.
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  INSERT INTO public.rate_audit_log (table_name, record_id, action, changed_fields, full_old_record, full_new_record, changed_by, org_id)
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    CASE WHEN v_changed_fields = '{}' THEN NULL ELSE v_changed_fields END,
    v_old_record,
    v_new_record,
    public.fn_rate_audit_actor(),
    v_org
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_rate_audit_trigger() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- NOT NULL, indexes, per-company uniques, triggers back on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  trg text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'fixed_daily_costs', 'attraction_aliases', 'destinations',
    'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts', 'rate_audit_log'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
    -- Tables with a service code are indexed by (org_id, service_code), below.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'service_code') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', 'idx_' || t || '_org', t);
    END IF;
    FOREACH trg IN ARRAY ARRAY['set_updated_at', 'trg_audit_' || t] LOOP
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = trg) THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', t, trg);
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.entrance_fee_versions') AND tgname = 'set_updated_at') THEN
    ALTER TABLE public.entrance_fee_versions ENABLE TRIGGER set_updated_at;
  END IF;

  -- Service codes, per company (literal statements: __tests__/migrations/
  -- bulk-upsert-keys.test.ts reads them — the importer's ON CONFLICT
  -- (org_id, service_code) needs exactly these).
  IF to_regclass('public.accommodation_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accommodation_rates_org_id_service_code_key') THEN
    ALTER TABLE public.accommodation_rates ADD CONSTRAINT accommodation_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.activity_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_rates_org_id_service_code_key') THEN
    ALTER TABLE public.activity_rates ADD CONSTRAINT activity_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.airport_staff_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'airport_staff_rates_org_id_service_code_key') THEN
    ALTER TABLE public.airport_staff_rates ADD CONSTRAINT airport_staff_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.hotel_staff_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotel_staff_rates_org_id_service_code_key') THEN
    ALTER TABLE public.hotel_staff_rates ADD CONSTRAINT hotel_staff_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.guide_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guide_rates_org_id_service_code_key') THEN
    ALTER TABLE public.guide_rates ADD CONSTRAINT guide_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.meal_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_rates_org_id_service_code_key') THEN
    ALTER TABLE public.meal_rates ADD CONSTRAINT meal_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.flight_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flight_rates_org_id_service_code_key') THEN
    ALTER TABLE public.flight_rates ADD CONSTRAINT flight_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.train_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'train_rates_org_id_service_code_key') THEN
    ALTER TABLE public.train_rates ADD CONSTRAINT train_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.sleeping_train_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sleeping_train_rates_org_id_service_code_key') THEN
    ALTER TABLE public.sleeping_train_rates ADD CONSTRAINT sleeping_train_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.transportation_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transportation_rates_org_id_service_code_key') THEN
    ALTER TABLE public.transportation_rates ADD CONSTRAINT transportation_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.tipping_rates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipping_rates_org_id_service_code_key') THEN
    ALTER TABLE public.tipping_rates ADD CONSTRAINT tipping_rates_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.entrance_fees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entrance_fees_org_id_service_code_key') THEN
    ALTER TABLE public.entrance_fees ADD CONSTRAINT entrance_fees_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.service_fees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_fees_org_id_service_code_key') THEN
    ALTER TABLE public.service_fees ADD CONSTRAINT service_fees_org_id_service_code_key UNIQUE (org_id, service_code);
  END IF;
  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_rate_audit_log_org_changed ON public.rate_audit_log (org_id, changed_at DESC);
  END IF;
  IF to_regclass('public.guide_rates') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_guide_rates_natural_key ON public.guide_rates
      (org_id, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), guide_language, guide_type, tour_duration, COALESCE(city, ''::character varying));
  END IF;
  IF to_regclass('public.nile_cruises') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nile_cruises_org_id_cruise_code_key') THEN
    ALTER TABLE public.nile_cruises ADD CONSTRAINT nile_cruises_org_id_cruise_code_key UNIQUE (org_id, cruise_code);
  END IF;
  IF to_regclass('public.fixed_daily_costs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fixed_daily_costs_org_id_cost_type_key') THEN
    ALTER TABLE public.fixed_daily_costs ADD CONSTRAINT fixed_daily_costs_org_id_cost_type_key UNIQUE (org_id, cost_type);
  END IF;
  IF to_regclass('public.vehicles') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_org_id_license_plate_key') THEN
    ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_org_id_license_plate_key UNIQUE (org_id, license_plate);
  END IF;
  IF to_regclass('public.attraction_aliases') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attraction_aliases_org_id_alias_key') THEN
    ALTER TABLE public.attraction_aliases ADD CONSTRAINT attraction_aliases_org_id_alias_key UNIQUE (org_id, alias);
  END IF;
  IF to_regclass('public.destinations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'destinations_org_id_country_code_key') THEN
    ALTER TABLE public.destinations ADD CONSTRAINT destinations_org_id_country_code_key UNIQUE (org_id, country_code);
  END IF;
  IF to_regclass('public.b2b_transport_packages') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'b2b_transport_packages_org_id_package_code_key') THEN
    ALTER TABLE public.b2b_transport_packages ADD CONSTRAINT b2b_transport_packages_org_id_package_code_key UNIQUE (org_id, package_code);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  p text;
BEGIN
  -- Every (true) policy, by table.
  FOR t, p IN
    SELECT * FROM (VALUES
      ('accommodation_rates', 'accommodation_rates_authenticated_all'),
      ('activity_rates', 'activity_rates_authenticated_all'),
      ('airport_staff_rates', 'airport_staff_rates_authenticated_all'),
      ('hotel_staff_rates', 'hotel_staff_rates_authenticated_all'),
      ('guide_rates', 'guide_rates_authenticated_all'),
      ('meal_rates', 'meal_rates_authenticated_all'),
      ('nile_cruises', 'nile_cruises_authenticated_all'),
      ('tipping_rates', 'tipping_rates_authenticated_all'),
      ('transportation_rates', 'transportation_rates_authenticated_all'),
      ('entrance_fees', 'entrance_fees_authenticated_all'),
      ('entrance_fees', 'Allow authenticated read access'),
      ('flight_rates', 'Allow read access to flight_rates'),
      ('flight_rates', 'Allow insert for authenticated users'),
      ('flight_rates', 'Allow update for authenticated users'),
      ('flight_rates', 'Allow delete for authenticated users'),
      ('train_rates', 'Allow all for authenticated'),
      ('sleeping_train_rates', 'Allow all for authenticated'),
      ('cruise_contacts', 'Enable all access for authenticated users'),
      ('assistant_rates', 'assistant_rates_authenticated'),
      ('seasonal_rates', 'seasonal_rates_authenticated'),
      ('vehicle_rates', 'vehicle_rates_authenticated'),
      ('fixed_daily_costs', 'fixed_daily_costs_authenticated'),
      ('hotel_contacts', 'hotel_contacts_authenticated'),
      ('restaurant_contacts', 'restaurant_contacts_authenticated'),
      ('service_fees', 'service_fees_authenticated'),
      ('vehicles', 'vehicles_authenticated'),
      ('attraction_aliases', 'Allow authenticated read'),
      ('attraction_aliases', 'Allow authenticated insert'),
      ('attraction_aliases', 'Allow authenticated update'),
      ('attraction_aliases', 'Allow authenticated delete'),
      ('destinations', 'destinations_read'),
      ('extras_catalogue', 'extras_catalogue_authenticated_all'),
      ('b2b_transport_packages', 'b2b_transport_packages_authenticated'),
      ('rate_audit_log', 'Authenticated users can read audit log'),
      ('entrance_fee_versions', 'entrance_fee_versions_authenticated'),
      ('destination_cities', 'destination_cities_read'),
      ('b2b_partner_pricing', 'b2b_partner_pricing_authenticated')
    ) AS v(t, p)
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END IF;
  END LOOP;

  -- ROOT tables: your company's rows; writes manager-and-above.
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates', 'fixed_daily_costs', 'attraction_aliases', 'destinations',
    'vehicles', 'hotel_contacts', 'cruise_contacts', 'restaurant_contacts',
    'extras_catalogue', 'b2b_transport_packages'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above()) WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_delete', t);
  END LOOP;

  IF to_regclass('public.rate_audit_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS rate_audit_log_org_select ON public.rate_audit_log;
    CREATE POLICY rate_audit_log_org_select ON public.rate_audit_log FOR SELECT TO authenticated
      USING (public.user_is_in_org(org_id) AND public.is_manager_or_above());
  END IF;

  -- CHILD tables: their parent's company.
  IF to_regclass('public.entrance_fee_versions') IS NOT NULL THEN
    DROP POLICY IF EXISTS entrance_fee_versions_org_select ON public.entrance_fee_versions;
    DROP POLICY IF EXISTS entrance_fee_versions_org_write ON public.entrance_fee_versions;
    CREATE POLICY entrance_fee_versions_org_select ON public.entrance_fee_versions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.entrance_fees f WHERE f.id = entrance_fee_id AND public.user_is_in_org(f.org_id)));
    CREATE POLICY entrance_fee_versions_org_write ON public.entrance_fee_versions FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.entrance_fees f WHERE f.id = entrance_fee_id AND public.user_is_in_org(f.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.entrance_fees f WHERE f.id = entrance_fee_id AND public.user_is_in_org(f.org_id)));
  END IF;
  IF to_regclass('public.destination_cities') IS NOT NULL THEN
    DROP POLICY IF EXISTS destination_cities_org_select ON public.destination_cities;
    CREATE POLICY destination_cities_org_select ON public.destination_cities FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = destination_id AND public.user_is_in_org(d.org_id)));
  END IF;
  IF to_regclass('public.b2b_partner_pricing') IS NOT NULL AND to_regclass('public.b2b_partners') IS NOT NULL THEN
    DROP POLICY IF EXISTS b2b_partner_pricing_org_select ON public.b2b_partner_pricing;
    DROP POLICY IF EXISTS b2b_partner_pricing_org_write ON public.b2b_partner_pricing;
    CREATE POLICY b2b_partner_pricing_org_select ON public.b2b_partner_pricing FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.b2b_partners p WHERE p.id = partner_id AND public.user_is_in_org(p.org_id)));
    CREATE POLICY b2b_partner_pricing_org_write ON public.b2b_partner_pricing FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.b2b_partners p WHERE p.id = partner_id AND public.user_is_in_org(p.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.b2b_partners p WHERE p.id = partner_id AND public.user_is_in_org(p.org_id)));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Dead objects; migration-only helpers
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.tour_overview;
ALTER TABLE IF EXISTS public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_primary_destination_id_fkey;
DROP TABLE IF EXISTS public.destinations_legacy_2025;
DROP TABLE IF EXISTS public.meal_costs;
DROP TABLE IF EXISTS public.outside_cairo_fees;
DROP TABLE IF EXISTS public.seasonal_adjustments;
DROP TABLE IF EXISTS public.transportation_contacts;
DROP TABLE IF EXISTS public.profit_margins;
DROP TABLE IF EXISTS public.discount_rules;
DROP TABLE IF EXISTS public.booking_rules;
DROP TABLE IF EXISTS public.package_type_definitions;

DROP FUNCTION IF EXISTS public.org_backfill_place_catalogue(text);
DROP FUNCTION IF EXISTS public.org_backfill_copy_for_each(text);
DROP FUNCTION IF EXISTS public.org_backfill_copy_catalogue_row(text, uuid, uuid, text);

COMMIT;

INSERT INTO public.schema_migrations (name) VALUES ('20261206_rates_org_id') ON CONFLICT DO NOTHING;

-- ==================================================================
-- 20261207_tours_org_id
-- ==================================================================
-- ============================================
-- Tours belong to one company: tour templates, their variations and the
-- legacy tours get an org_id; a template both companies use becomes one per
-- company
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and not one tour table had an org_id, so every programme was
-- both companies':
--   - /api/tours/** (the tour manager, browse, detail, versions, day builder,
--     variations and their services, bulk export / import) listed, edited and
--     deleted the other company's programmes; template_code and
--     variation_code were unique across the install, so a company could not
--     use a code the other had taken, and the bulk import (matched on
--     template_code) and scripts/import-programs.mjs (onConflict
--     'template_code') OVERWROTE the other company's programme when the codes
--     matched;
--   - DELETE /api/tours/templates/[id] deleted the other company's programme
--     with its variations, quotes' variation links and departures' links;
--   - /api/tours/recalculate-prices re-priced EVERY company's templates with
--     one company's rates and settings;
--   - the B2B calculator, quote builder, departures, the AI quote builder's
--     tour matcher, the website-order intake (lib/intake/process-order.ts)
--     and the programme itinerary document all read any company's template
--     by id or code.
-- And through PostgREST (RLS, OR'd: one USING (true) opens a table), quoted
-- from the baseline (20260829):
--   tour_templates            "tour_templates_authenticated_all" ALL TO
--                             authenticated USING (true) WITH CHECK (true)
--   tour_variations           "Enable read access for all users" SELECT TO
--                             anon, authenticated USING (true) — ANONYMOUS
--                             read of every programme's variations
--   tours, tour_days, tour_pricing, tour_template_versions,
--   tour_variation_services, tour_variation_versions,
--   variation_daily_itinerary, variation_pricing, variation_services
--                             "<table>_authenticated" ALL TO authenticated
--                             USING (true) WITH CHECK (true)
--   tour_day_activities       "Allow authenticated read/insert/update/
--                             delete" (true)
--   tour_categories, tour_availability, tour_reviews
--                             "<table>_authenticated" ALL (true)
--   tour_template_defaults    "Allow authenticated read/insert/update/delete
--                             defaults" (true)
-- All dropped. Nothing reads tour_variations anonymously: the public pages
-- (share links, the client portal, the order form) go through service-role
-- API routes. In their place:
--   tour_templates, tour_variations
--                             select user_is_in_org(org_id); insert/update/
--                             delete user_is_in_org(org_id) AND
--                             is_manager_or_above() (the tour manager is
--                             manager-and-above)
--   tours (legacy builder)    all user_is_in_org(org_id), as before (no role)
--   CHILD tables              their parent's company (EXISTS on the parent);
--                             writes to a template's / variation's children
--                             also need is_manager_or_above()
-- Every caller is an API route on the service role (RLS does not apply to
-- it); these are the second wall.
--
-- WHAT THIS DOES. org_id uuid REFERENCES organizations ON DELETE CASCADE (as
-- 20261205/20261206; no DEFAULT — the code stamps every insert), NOT NULL,
-- on tour_templates, tour_variations (denormalised from its template — the
-- variation routes, quotes and departures name a variation by id alone) and
-- tours (the legacy builder's root).
-- The CHILD tables get NO org_id; every reader reaches them through their
-- parent (the code checks the parent's company first, then reads the
-- children by the parent's id):
--   tour_template_versions, tour_day_activities  → tour_templates
--   tour_variation_versions, tour_variation_services,
--   variation_daily_itinerary, variation_pricing, variation_services
--                                                → tour_variations
--   tour_days, tour_pricing                      → tours
--
-- BACKFILL — helpers from 20261202. Each rule fills only rows still NULL.
--   tour_templates. "Used by" company X means a row of X that points at it:
--     itineraries.template_id; tour_departures.template_id, or its
--     variation_id's template; tour_quotes.variation_id's template;
--     b2b_partner_pricing.variation_id's template (the partner's company);
--     web_order_intakes.tour_code = template_code (the website order named
--     it). Then, in order:
--     1. used by exactly one company → that company
--     2. used by BOTH → the catalogue default (ATS) when it is one of them,
--        else the older company; COPIED for the other (below) — review:
--        'used by both companies — copied for the other'
--     3. nothing uses it, but it is plainly ATS's: website_url on
--        ats-hj.com, an ATS programme code (scripts/lib/program-code.mjs:
--        [airport][carrier][BZ?][days][seq][-type], e.g. NEK805-CR,
--        MSN-601), or a hotels list (only the ATS programme import writes
--        one) → ATS
--     4. nothing traces it → the catalogue default (ATS — decided
--        2026-10-12, the catalogue is mostly ATS's) — review: 'no trip,
--        departure, quote or web order — catalogue default'
--   COPY. A template another company uses is copied into that company: new
--   id, same template_code (codes are unique per company now), same
--   everything else, with its language versions, day-builder activities,
--   and every variation (same variation_code) with the variation's language
--   versions, services, daily itinerary, pricing and costed services. That
--   company's references are pointed at the copy: itineraries.template_id,
--   tour_departures.template_id / variation_id, tour_quotes.variation_id
--   (and the variation_id in its quote_revisions snapshots, so a revert
--   cannot bring the other company's variation back),
--   b2b_partner_pricing.variation_id, content_usage_log.variation_id (by its
--   itinerary's company). web_order_intakes and tour_departures.tour_code
--   need nothing: the copy keeps the code. Original and copy are listed:
--   'used by another company — copied'. Copies are recorded in
--   org_backfill_tour_copies (table_name, original_id, copy_id, org_id) —
--   RLS on, no policy: service role and the SQL editor only.
--   tour_variations. Its template's company. A variation with NO template:
--     the company of the quotes / departures / partner prices that use it;
--     used by both → copied as templates are; nothing → the catalogue
--     default — review: 'no template, quote, departure or partner price —
--     catalogue default'.
--   tours (the legacy tour builder: nothing else points at a tour) → the
--     catalogue default — every one listed: 'legacy tour — catalogue
--     default'.
--   ORPHANS. tour_days / tour_pricing rows with no tour_id, and
--   variation_daily_itinerary / variation_pricing / variation_services rows
--   with no variation_id, belong to nothing and no screen can reach them:
--   each is saved whole in org_backfill_tour_orphans (table_name, row_id,
--   row_data) — service role only — listed ('no parent — deleted') and
--   deleted; the column is then NOT NULL. A row WITH a parent is never
--   deleted.
--
-- RATES. tour_days.accommodation_id / lunch_meal_id / dinner_meal_id /
-- guide_id and tour_variation_services.rate_id must name a rate of THEIR
-- tour's company. One that names another company's rate is pointed at that
-- company's copy of it (org_backfill_rate_copies, 20261206: the copy made for
-- this company, or the original a copy was made from); with no copy it is
-- left and listed: 'rate belongs to another company'. Without 20261206 this
-- step is skipped.
--
-- Read the list afterwards:
--   SELECT * FROM org_backfill_review WHERE table_name IN ('tour_templates',
--     'tour_variations', 'tours', 'tour_days', 'tour_pricing',
--     'tour_variation_services', 'variation_daily_itinerary',
--     'variation_pricing', 'variation_services') ORDER BY id;
--   SELECT * FROM org_backfill_tour_copies ORDER BY table_name, original_id;
--   SELECT * FROM org_backfill_tour_orphans;
--
-- UNIQUE → PER COMPANY: tour_templates (template_code), tour_variations
-- (variation_code), tours (tour_code) → (org_id, …). The bulk import and
-- scripts/import-programs.mjs match on (org_id, template_code). Child
-- uniques ((template_id, language), (variation_id, day_number) …) stay —
-- their parent is one company's.
--
-- THEMES. tour_categories is retired (20261011 replaced it by the per-company
-- tour_theme vocabulary and tour_templates.theme_key; nothing writes a theme
-- through it). seed_tour_themes(p_org) copied every category into a new
-- company's vocabulary — one install-wide list, so a company's themes leaked
-- into the next company created; it now seeds a fixed default list. The
-- foreign key tour_templates_category_id_fkey, the column category_id (the
-- code no longer reads or writes it) and the table are dropped.
--
-- DEAD objects dropped (grep of app/ lib/ components/ hooks/ scripts/: no
-- reader or writer; only types/database.types.ts named them): tables
-- tour_template_defaults, tour_availability, tour_reviews; view
-- tour_templates_with_languages (tour_overview went in 20261206).
--
-- DEPLOY ORDER: apply 20261205, 20261206 and then this migration FIRST, then
-- deploy the code. The code filters and stamps org_id on these tables and
-- fails without it; the old code keeps reading on the new schema, but a
-- template, variation or tour it inserts has no org_id and fails NOT NULL —
-- deploy promptly. The old code also reads tour_categories, which is gone:
-- the tour list and detail return an error until the new code is deployed.
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every rule fills only
-- NULLs, a copy is made only where none is recorded, review rows ON CONFLICT
-- DO NOTHING, policies dropped before created, tables guarded (to_regclass).
-- On a bare replay (no organisations) nothing is written.
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_backfill_tour_copies (
  table_name text NOT NULL,
  original_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, original_id, org_id)
);
ALTER TABLE public.org_backfill_tour_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_tour_copies FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.org_backfill_tour_orphans (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);
ALTER TABLE public.org_backfill_tour_orphans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_tour_orphans FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns; the "updated" stamp off for the backfill (an assignment is not an
-- edit); global uniques dropped (a copy keeps its original's code).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours', 'tour_template_versions', 'tour_variation_versions',
                           'tour_variation_services', 'tour_day_activities', 'variation_pricing', 'variation_services'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at' AND tgenabled = 'O') THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;
END
$$;
ALTER TABLE IF EXISTS public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_template_code_key;
ALTER TABLE IF EXISTS public.tour_variations DROP CONSTRAINT IF EXISTS tour_variations_variation_code_key;
ALTER TABLE IF EXISTS public.tours DROP CONSTRAINT IF EXISTS tours_tour_code_key;

-- ---------------------------------------------------------------------------
-- Migration-only helpers (dropped at the end).
-- ---------------------------------------------------------------------------

-- Copy every row of a child table whose p_fk is p_from, onto p_to.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_tour_children(p_table text, p_fk text, p_from uuid, p_to uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I,
       to_jsonb(r) || jsonb_build_object(''id'', gen_random_uuid(), %2$L, $1))).*
       FROM public.%1$I r WHERE r.%2$I = $2',
    p_table, p_fk) USING p_to, p_from;
END
$fn$;

-- Copy one variation into a company (under p_template, which may be NULL),
-- with everything hanging off it.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_variation(p_id uuid, p_org uuid, p_template uuid)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
  child text;
BEGIN
  INSERT INTO public.tour_variations
  SELECT (jsonb_populate_record(NULL::public.tour_variations,
           to_jsonb(v) || jsonb_build_object('id', new_id, 'org_id', p_org, 'template_id', p_template))).*
    FROM public.tour_variations v WHERE v.id = p_id;
  FOREACH child IN ARRAY ARRAY['tour_variation_versions', 'tour_variation_services', 'variation_daily_itinerary',
                               'variation_pricing', 'variation_services'] LOOP
    PERFORM public.org_backfill_copy_tour_children(child, 'variation_id', p_id, new_id);
  END LOOP;
  INSERT INTO public.org_backfill_tour_copies (table_name, original_id, copy_id, org_id)
  VALUES ('tour_variations', p_id, new_id, p_org);
  RETURN new_id;
END
$fn$;

-- Copy one template into a company, with its versions, day activities and
-- every variation.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_template(p_id uuid, p_org uuid)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
  v record;
BEGIN
  INSERT INTO public.tour_templates
  SELECT (jsonb_populate_record(NULL::public.tour_templates,
           to_jsonb(t) || jsonb_build_object('id', new_id, 'org_id', p_org))).*
    FROM public.tour_templates t WHERE t.id = p_id;
  PERFORM public.org_backfill_copy_tour_children('tour_template_versions', 'template_id', p_id, new_id);
  PERFORM public.org_backfill_copy_tour_children('tour_day_activities', 'template_id', p_id, new_id);
  FOR v IN SELECT id FROM public.tour_variations WHERE template_id = p_id ORDER BY id LOOP
    PERFORM public.org_backfill_copy_variation(v.id, p_org, new_id);
  END LOOP;
  INSERT INTO public.org_backfill_tour_copies (table_name, original_id, copy_id, org_id)
  VALUES ('tour_templates', p_id, new_id, p_org);
  RETURN new_id;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Orphans: children with no parent. Saved whole, listed, deleted.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  spec text[];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['tour_days', 'tour_id'],
    ARRAY['tour_pricing', 'tour_id'],
    ARRAY['variation_daily_itinerary', 'variation_id'],
    ARRAY['variation_pricing', 'variation_id'],
    ARRAY['variation_services', 'variation_id']
  ] LOOP
    IF to_regclass('public.' || spec[1]) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($q$
      INSERT INTO public.org_backfill_tour_orphans (table_name, row_id, row_data)
      SELECT %1$L, r.id, to_jsonb(r) FROM public.%1$I r WHERE r.%2$I IS NULL
      ON CONFLICT (table_name, row_id) DO NOTHING
    $q$, spec[1], spec[2]);
    EXECUTE format($q$
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT %1$L, r.id::text, NULL, 'no parent — deleted' FROM public.%1$I r WHERE r.%2$I IS NULL
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    $q$, spec[1], spec[2]);
    EXECUTE format('DELETE FROM public.%I WHERE %I IS NULL', spec[1], spec[2]);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', spec[1], spec[2]);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Who uses what: (template id, company), (variation id, company).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _tour_t_use (tid uuid, org uuid) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _tour_v_use (vid uuid, org uuid) ON COMMIT DROP;

DO $$
BEGIN
  IF to_regclass('public.tour_templates') IS NULL THEN RETURN; END IF;
  DELETE FROM _tour_t_use;
  DELETE FROM _tour_v_use;

  IF to_regclass('public.itineraries') IS NOT NULL THEN
    INSERT INTO _tour_t_use SELECT template_id, org_id FROM public.itineraries
     WHERE template_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.tour_departures') IS NOT NULL THEN
    INSERT INTO _tour_t_use SELECT template_id, org_id FROM public.tour_departures
     WHERE template_id IS NOT NULL AND org_id IS NOT NULL;
    INSERT INTO _tour_v_use SELECT variation_id, org_id FROM public.tour_departures
     WHERE variation_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    INSERT INTO _tour_v_use SELECT variation_id, org_id FROM public.tour_quotes
     WHERE variation_id IS NOT NULL AND org_id IS NOT NULL;
  END IF;
  IF to_regclass('public.b2b_partner_pricing') IS NOT NULL AND to_regclass('public.b2b_partners') IS NOT NULL THEN
    INSERT INTO _tour_v_use SELECT pp.variation_id, p.org_id
      FROM public.b2b_partner_pricing pp JOIN public.b2b_partners p ON p.id = pp.partner_id
     WHERE pp.variation_id IS NOT NULL AND p.org_id IS NOT NULL;
  END IF;
  -- A variation's use is its template's use.
  INSERT INTO _tour_t_use SELECT v.template_id, u.org FROM _tour_v_use u
    JOIN public.tour_variations v ON v.id = u.vid WHERE v.template_id IS NOT NULL;
  IF to_regclass('public.web_order_intakes') IS NOT NULL THEN
    INSERT INTO _tour_t_use SELECT t.id, w.org_id FROM public.web_order_intakes w
      JOIN public.tour_templates t ON lower(trim(t.template_code)) = lower(trim(w.tour_code))
     WHERE coalesce(trim(w.tour_code), '') <> '' AND w.org_id IS NOT NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Place templates, variations and tours; copy what another company uses.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  ats uuid;
  rec record;
BEGIN
  IF to_regclass('public.tour_templates') IS NULL THEN RETURN; END IF;
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN
    RAISE NOTICE 'tours: no organisations — nothing to backfill';
    RETURN;
  END IF;
  EXECUTE 'SELECT public.org_backfill_ats()' INTO ats;

  -- 1. Used by exactly one company.
  UPDATE public.tour_templates t SET org_id = u.o
    FROM (SELECT tid, min(org::text)::uuid AS o FROM _tour_t_use GROUP BY tid HAVING count(DISTINCT org) = 1) u
   WHERE t.org_id IS NULL AND u.tid = t.id;

  -- 2. Used by both: the catalogue default when it is one of them, else the
  --    older company.
  WITH filled AS (
    UPDATE public.tour_templates t SET org_id = coalesce(
        (SELECT x.org FROM _tour_t_use x WHERE x.tid = t.id AND x.org = cat LIMIT 1),
        (SELECT x.org FROM _tour_t_use x JOIN public.organizations o ON o.id = x.org
          WHERE x.tid = t.id ORDER BY o.created_at, o.id LIMIT 1))
     WHERE t.org_id IS NULL AND t.id IN (SELECT tid FROM _tour_t_use)
    RETURNING t.id, t.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_templates', id::text, org_id, 'used by both companies — copied for the other' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- 3. Plainly ATS's.
  IF ats IS NOT NULL THEN
    UPDATE public.tour_templates SET org_id = ats
     WHERE org_id IS NULL
       AND (coalesce(website_url, '') ILIKE '%ats-hj.com%'
            OR replace(upper(translate(trim(template_code), '－ー–—', '----')), 'BZ', '')
               ~ '^([NK](EK|MS)|(EK|MS)[NK]?)-?[0-9]{3,4}(-?[A-Z]+)*$'
            OR (jsonb_typeof(hotels) = 'array' AND jsonb_array_length(hotels) > 0));
  END IF;

  -- 4. Nothing traces it.
  WITH filled AS (
    UPDATE public.tour_templates SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_templates', id::text, cat, 'no trip, departure, quote or web order — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- Variations: their template's company.
  UPDATE public.tour_variations v SET org_id = t.org_id FROM public.tour_templates t
   WHERE v.org_id IS NULL AND t.id = v.template_id;
  -- No template: the company of what uses it.
  UPDATE public.tour_variations v SET org_id = u.o
    FROM (SELECT vid, min(org::text)::uuid AS o FROM _tour_v_use GROUP BY vid HAVING count(DISTINCT org) = 1) u
   WHERE v.org_id IS NULL AND u.vid = v.id;
  WITH filled AS (
    UPDATE public.tour_variations v SET org_id = coalesce(
        (SELECT x.org FROM _tour_v_use x WHERE x.vid = v.id AND x.org = cat LIMIT 1),
        (SELECT x.org FROM _tour_v_use x JOIN public.organizations o ON o.id = x.org
          WHERE x.vid = v.id ORDER BY o.created_at, o.id LIMIT 1))
     WHERE v.org_id IS NULL AND v.id IN (SELECT vid FROM _tour_v_use)
    RETURNING v.id, v.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_variations', id::text, org_id, 'used by both companies — copied for the other' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  WITH filled AS (
    UPDATE public.tour_variations SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'tour_variations', id::text, cat, 'no template, quote, departure or partner price — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- Legacy tours: nothing points at them.
  IF to_regclass('public.tours') IS NOT NULL THEN
    WITH filled AS (
      UPDATE public.tours SET org_id = cat WHERE org_id IS NULL RETURNING id
    )
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'tours', id::text, cat, 'legacy tour — catalogue default' FROM filled
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;

  -- A template another company uses: a copy for that company.
  FOR rec IN
    SELECT DISTINCT u.tid, u.org, t.org_id AS home
      FROM _tour_t_use u JOIN public.tour_templates t ON t.id = u.tid
     WHERE u.org <> t.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_templates' AND c.original_id = u.tid AND c.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_templates' AND c.copy_id = u.tid)
     ORDER BY u.tid, u.org
  LOOP
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES ('tour_templates', public.org_backfill_copy_template(rec.tid, rec.org)::text, rec.org, 'used by another company — copied'),
           ('tour_templates', rec.tid::text, rec.home, 'used by another company — copied')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;

  -- A template-less variation another company uses: likewise.
  FOR rec IN
    SELECT DISTINCT u.vid, u.org, v.org_id AS home
      FROM _tour_v_use u JOIN public.tour_variations v ON v.id = u.vid
     WHERE v.template_id IS NULL AND u.org <> v.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_variations' AND c.original_id = u.vid AND c.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies c
                        WHERE c.table_name = 'tour_variations' AND c.copy_id = u.vid)
     ORDER BY u.vid, u.org
  LOOP
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES ('tour_variations', public.org_backfill_copy_variation(rec.vid, rec.org, NULL)::text, rec.org, 'used by another company — copied'),
           ('tour_variations', rec.vid::text, rec.home, 'used by another company — copied')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's references point at its own copy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  trg record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_backfill_tour_copies) THEN RETURN; END IF;

  -- Fix-ups, not edits: no recalculation, no "updated" stamp, no revision
  -- rows. Only triggers that are on are turned off, and only those back on.
  CREATE TEMP TABLE IF NOT EXISTS _tour_trg_off (tbl text, tg text) ON COMMIT DROP;
  FOR trg IN
    SELECT c.relname AS tbl, t.tgname AS tg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgenabled = 'O' AND c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('itineraries', 'tour_departures', 'tour_quotes', 'b2b_partner_pricing', 'quote_revisions', 'content_usage_log')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', trg.tbl, trg.tg);
    INSERT INTO _tour_trg_off VALUES (trg.tbl, trg.tg);
  END LOOP;

  IF to_regclass('public.itineraries') IS NOT NULL THEN
    UPDATE public.itineraries i SET template_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_templates' AND c.original_id = i.template_id AND c.org_id = i.org_id;
  END IF;
  IF to_regclass('public.tour_departures') IS NOT NULL THEN
    UPDATE public.tour_departures d SET template_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_templates' AND c.original_id = d.template_id AND c.org_id = d.org_id;
    UPDATE public.tour_departures d SET variation_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_variations' AND c.original_id = d.variation_id AND c.org_id = d.org_id;
  END IF;
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    UPDATE public.tour_quotes q SET variation_id = c.copy_id FROM public.org_backfill_tour_copies c
     WHERE c.table_name = 'tour_variations' AND c.original_id = q.variation_id AND c.org_id = q.org_id;
    IF to_regclass('public.quote_revisions') IS NOT NULL THEN
      UPDATE public.quote_revisions r
         SET quote_data = jsonb_set(r.quote_data, '{variation_id}', to_jsonb(c.copy_id::text))
        FROM public.tour_quotes q, public.org_backfill_tour_copies c
       WHERE r.quote_type = 'b2b' AND q.id = r.quote_id
         AND c.table_name = 'tour_variations' AND c.org_id = q.org_id
         AND c.original_id::text = r.quote_data ->> 'variation_id';
    END IF;
  END IF;
  IF to_regclass('public.b2b_partner_pricing') IS NOT NULL AND to_regclass('public.b2b_partners') IS NOT NULL THEN
    UPDATE public.b2b_partner_pricing pp SET variation_id = c.copy_id
      FROM public.b2b_partners p, public.org_backfill_tour_copies c
     WHERE p.id = pp.partner_id AND c.table_name = 'tour_variations'
       AND c.original_id = pp.variation_id AND c.org_id = p.org_id;
  END IF;
  IF to_regclass('public.content_usage_log') IS NOT NULL AND to_regclass('public.itineraries') IS NOT NULL THEN
    UPDATE public.content_usage_log l SET variation_id = c.copy_id
      FROM public.itineraries i, public.org_backfill_tour_copies c
     WHERE i.id = l.itinerary_id AND c.table_name = 'tour_variations'
       AND c.original_id = l.variation_id AND c.org_id = i.org_id;
  END IF;

  FOR trg IN SELECT * FROM _tour_trg_off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', trg.tbl, trg.tg);
  END LOOP;
  DELETE FROM _tour_trg_off;
END
$$;

-- ---------------------------------------------------------------------------
-- A tour's rates are its own company's (20261206's copies).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  spec text[];
BEGIN
  IF to_regclass('public.org_backfill_rate_copies') IS NULL THEN RETURN; END IF;

  -- Every rate's company. Ids are uuids, unique across the rate tables.
  CREATE TEMP TABLE IF NOT EXISTS _tour_rate_home (id uuid PRIMARY KEY, org uuid) ON COMMIT DROP;
  DELETE FROM _tour_rate_home;
  FOREACH t IN ARRAY ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
    'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
    'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees', 'assistant_rates',
    'seasonal_rates', 'vehicle_rates'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id') THEN
      CONTINUE;
    END IF;
    EXECUTE format('INSERT INTO _tour_rate_home SELECT id, org_id FROM public.%I ON CONFLICT (id) DO NOTHING', t);
  END LOOP;

  -- The same rate in a given company: the copy made for it, or the original
  -- a copy was made from.
  CREATE TEMP TABLE IF NOT EXISTS _tour_rate_twin (rid uuid, org uuid, twin uuid) ON COMMIT DROP;
  DELETE FROM _tour_rate_twin;
  INSERT INTO _tour_rate_twin SELECT original_id, org_id, copy_id FROM public.org_backfill_rate_copies;
  INSERT INTO _tour_rate_twin SELECT c.copy_id, h.org, c.original_id
    FROM public.org_backfill_rate_copies c JOIN _tour_rate_home h ON h.id = c.original_id;
  INSERT INTO _tour_rate_twin SELECT c1.copy_id, c2.org_id, c2.copy_id
    FROM public.org_backfill_rate_copies c1 JOIN public.org_backfill_rate_copies c2
      ON c2.original_id = c1.original_id AND c2.org_id <> c1.org_id;

  IF to_regclass('public.tour_days') IS NOT NULL AND EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tours' AND column_name = 'org_id') THEN
    FOREACH spec SLICE 1 IN ARRAY ARRAY[
      ARRAY['accommodation_id'], ARRAY['lunch_meal_id'], ARRAY['dinner_meal_id'], ARRAY['guide_id']
    ] LOOP
      EXECUTE format($q$
        UPDATE public.tour_days d SET %1$I = w.twin
          FROM public.tours tr, _tour_rate_home h, _tour_rate_twin w
         WHERE tr.id = d.tour_id AND h.id = d.%1$I AND h.org <> tr.org_id
           AND w.rid = d.%1$I AND w.org = tr.org_id
      $q$, spec[1]);
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT 'tour_days', d.id::text, tr.org_id, 'rate belongs to another company'
          FROM public.tour_days d JOIN public.tours tr ON tr.id = d.tour_id
          JOIN _tour_rate_home h ON h.id = d.%1$I
         WHERE h.org <> tr.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, spec[1]);
    END LOOP;
  END IF;

  IF to_regclass('public.tour_variation_services') IS NOT NULL THEN
    UPDATE public.tour_variation_services s SET rate_id = w.twin
      FROM public.tour_variations v, _tour_rate_home h, _tour_rate_twin w
     WHERE v.id = s.variation_id AND h.id = s.rate_id AND h.org <> v.org_id
       AND w.rid = s.rate_id AND w.org = v.org_id;
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    SELECT 'tour_variation_services', s.id::text, v.org_id, 'rate belongs to another company'
      FROM public.tour_variation_services s JOIN public.tour_variations v ON v.id = s.variation_id
      JOIN _tour_rate_home h ON h.id = s.rate_id
     WHERE h.org <> v.org_id
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- NOT NULL, per-company uniques, triggers back on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations', 'tours', 'tour_template_versions', 'tour_variation_versions',
                           'tour_variation_services', 'tour_day_activities', 'variation_pricing', 'variation_services'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at' AND tgenabled = 'D') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;

  IF to_regclass('public.tour_templates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_templates_org_id_template_code_key') THEN
    ALTER TABLE public.tour_templates ADD CONSTRAINT tour_templates_org_id_template_code_key UNIQUE (org_id, template_code);
  END IF;
  IF to_regclass('public.tour_variations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_variations_org_id_variation_code_key') THEN
    ALTER TABLE public.tour_variations ADD CONSTRAINT tour_variations_org_id_variation_code_key UNIQUE (org_id, variation_code);
  END IF;
  IF to_regclass('public.tours') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tours_org_id_tour_code_key') THEN
    ALTER TABLE public.tours ADD CONSTRAINT tours_org_id_tour_code_key UNIQUE (org_id, tour_code);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Themes: a fixed default list, never another company's categories; then
-- tour_categories goes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_tour_themes(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.org_vocabularies (org_id, kind, key, label, label_ja, rank) VALUES
    (p_org, 'tour_theme', 'cultural',     'Cultural & Historical', '文化・歴史',     1),
    (p_org, 'tour_theme', 'adventure',    'Adventure & Active',    'アドベンチャー', 2),
    (p_org, 'tour_theme', 'beach',        'Beach & Relaxation',    'ビーチ・リゾート', 3),
    (p_org, 'tour_theme', 'family',       'Family Holiday',        'ファミリー',     4),
    (p_org, 'tour_theme', 'luxury',       'Luxury Experience',     'ラグジュアリー', 5),
    (p_org, 'tour_theme', 'culinary',     'Food & Culinary',       '食・グルメ',     6)
  ON CONFLICT ON CONSTRAINT org_vocabularies_unique_key DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_tour_themes(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_tour_themes(uuid) TO service_role;

ALTER TABLE IF EXISTS public.tour_templates DROP CONSTRAINT IF EXISTS tour_templates_category_id_fkey;
DROP INDEX IF EXISTS public.idx_tour_templates_category;
DROP VIEW IF EXISTS public.tour_templates_with_languages;
ALTER TABLE IF EXISTS public.tour_templates DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS public.tour_categories;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  p text;
BEGIN
  -- Every (true) policy, by table.
  FOR t, p IN
    SELECT * FROM (VALUES
      ('tour_templates', 'tour_templates_authenticated_all'),
      ('tour_variations', 'Enable read access for all users'),
      ('tours', 'tours_authenticated'),
      ('tour_days', 'tour_days_authenticated'),
      ('tour_pricing', 'tour_pricing_authenticated'),
      ('tour_template_versions', 'tour_template_versions_authenticated'),
      ('tour_variation_services', 'tour_variation_services_authenticated'),
      ('tour_variation_versions', 'tour_variation_versions_authenticated'),
      ('variation_daily_itinerary', 'variation_daily_itinerary_authenticated'),
      ('variation_pricing', 'variation_pricing_authenticated'),
      ('variation_services', 'variation_services_authenticated'),
      ('tour_day_activities', 'Allow authenticated read'),
      ('tour_day_activities', 'Allow authenticated insert'),
      ('tour_day_activities', 'Allow authenticated update'),
      ('tour_day_activities', 'Allow authenticated delete')
    ) AS v(t, p)
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END IF;
  END LOOP;

  -- Templates and variations: your company's; writes manager-and-above.
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above()) WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_delete', t);
  END LOOP;

  -- Legacy tours: your company's (the builder had no role gate).
  IF to_regclass('public.tours') IS NOT NULL THEN
    DROP POLICY IF EXISTS tours_org_all ON public.tours;
    CREATE POLICY tours_org_all ON public.tours FOR ALL TO authenticated
      USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));
  END IF;
  FOREACH t IN ARRAY ARRAY['tour_days', 'tour_pricing'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.tours p WHERE p.id = tour_id AND public.user_is_in_org(p.org_id)))
      WITH CHECK (EXISTS (SELECT 1 FROM public.tours p WHERE p.id = tour_id AND public.user_is_in_org(p.org_id)))',
      t || '_org_all', t);
  END LOOP;

  -- CHILD tables of a template / a variation: their parent's company.
  FOR t, p IN
    SELECT * FROM (VALUES
      ('tour_template_versions', 'tour_templates|template_id'),
      ('tour_day_activities', 'tour_templates|template_id'),
      ('tour_variation_versions', 'tour_variations|variation_id'),
      ('tour_variation_services', 'tour_variations|variation_id'),
      ('variation_daily_itinerary', 'tour_variations|variation_id'),
      ('variation_pricing', 'tour_variations|variation_id'),
      ('variation_services', 'tour_variations|variation_id')
    ) AS v(t, p)
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I AND public.user_is_in_org(p.org_id)))',
      t || '_org_select', t, split_part(p, '|', 1), split_part(p, '|', 2));
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.%3$I p WHERE p.id = %4$I AND public.user_is_in_org(p.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.%3$I p WHERE p.id = %4$I AND public.user_is_in_org(p.org_id)))',
      t || '_org_write', t, split_part(p, '|', 1), split_part(p, '|', 2));
  END LOOP;
END
$$;
REVOKE ALL ON public.tour_variations FROM anon;

-- ---------------------------------------------------------------------------
-- Dead objects; migration-only helpers
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.tour_template_defaults;
DROP TABLE IF EXISTS public.tour_availability;
DROP TABLE IF EXISTS public.tour_reviews;

DROP FUNCTION IF EXISTS public.org_backfill_copy_template(uuid, uuid);
DROP FUNCTION IF EXISTS public.org_backfill_copy_variation(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.org_backfill_copy_tour_children(text, text, uuid, uuid);

COMMIT;

INSERT INTO public.schema_migrations (name) VALUES ('20261207_tours_org_id') ON CONFLICT DO NOTHING;

-- ==================================================================
-- 20261208_content_org_id
-- ==================================================================
-- ============================================
-- Content belongs to one company: the content library, its categories,
-- writing rules and prompt templates get an org_id
-- ============================================
-- WHAT LEAKED. A second company (ATS) runs on this install beside
-- Travel2Egypt, and none of the six content tables had an org_id, so every
-- description, category, writing rule and prompt was both companies':
--   - /api/content-library/** (on the signed-in session, so RLS decided)
--     listed, edited and deleted the other company's content items, their
--     tier variations, categories, writing rules and prompt templates;
--     slugs were unique across the install, so a company could not use a
--     slug the other had taken;
--   - the AI itinerary builder (app/api/ai/generate-itinerary, on the
--     service role) wrote one company's trips with the other company's
--     content library, cruise programmes and writing rules, and logged
--     usage into one shared log;
--   - "set as default" on a prompt template un-defaulted the other
--     company's template for that purpose.
-- And through PostgREST, quoted from the baseline (no later migration
-- touched them):
--   content_categories   content_categories_authenticated  ALL TO authenticated USING (true) WITH CHECK (true)
--   content_library      content_library_authenticated     (same)
--   content_variations   content_variations_authenticated  (same)
--   content_usage_log    content_usage_log_authenticated   (same)
--   prompt_templates     prompt_templates_authenticated    (same)
--   writing_rules        writing_rules_authenticated       (same)
-- All six are dropped. In their place: content_categories, content_library,
-- writing_rules, prompt_templates, content_usage_log — select
-- user_is_in_org(org_id); insert / update / delete user_is_in_org(org_id) AND
-- is_manager_or_above() (Communicate › Content Library and Writing Rules are
-- manager-and-above; any member may READ, since generation reads them on the
-- server for agents too). content_variations is a child: its content item's
-- company (EXISTS on content_library), writes manager-and-above.
--
-- WHAT THIS DOES. org_id uuid REFERENCES organizations ON DELETE CASCADE (as
-- itineraries.org_id; no DEFAULT — the code stamps every insert) on
-- content_categories, content_library, content_usage_log, writing_rules,
-- prompt_templates; every row assigned, NOT NULL, indexed.
-- content_variations follows its content item: content_id becomes NOT NULL
-- (a variation with no content item is unreachable — deleted and listed).
--
-- BACKFILL — helpers from 20261202. Each rule fills only rows still NULL.
--
--   content_categories — a private taxonomy: the catalogue default (ATS),
--     and a copy for every other company, so each company has the full set.
--   writing_rules, prompt_templates — the company of the person who created
--     it (org_backfill_user_org(created_by)), else the catalogue default —
--     review: 'no single-company author — catalogue default'. Then a COPY for
--     every other company — review: 'copied for each company'. Decided for
--     the AI style rules and prompts: each company keeps the full current set,
--     so neither loses the generation behaviour it has today; each edits its
--     own from here.
--   content_library — "uses" are tour_day_activities.content_id through its
--     tour template's company (tour_templates.org_id, from 20261207; without
--     it this signal is skipped) and content_usage_log.itinerary_id through
--     the itinerary's company. In order:
--       1. the one company that uses it
--       2. used by BOTH: the catalogue default (ATS) when it is one of them,
--          else the older company — review: 'used by both companies — copied
--          for the other'
--       3. not used: the one company of the people who wrote it
--          (created_by / updated_by, and its variations' created_by /
--          updated_by, each through org_backfill_user_org)
--       4. nothing traces it: the catalogue default — review: 'no tour,
--          itinerary or single-company author — catalogue default'
--     Then an item another company uses is COPIED into that company (new id,
--     same slug — slugs are unique per company now — same everything else,
--     its tier variations copied with it), and that company's tour day
--     activities and usage log rows are pointed at the copy. Both rows are
--     listed: 'used by another company — copied'.
--   Every content item's category_id points at ITS company's copy of the
--   category. content_library.destination_id and writing_rules.destination_id
--   point at the company's copy of the destination (20261206 recorded those
--   in org_backfill_rate_copies, table_name 'destinations'); with no copy
--   there the row is left and listed: 'destination belongs to another
--   company'.
--   content_usage_log — its itinerary's company, else its content item's,
--     else the default (operational) — review: 'no itinerary or content —
--     default'.
--   prompt_templates — one default per purpose per company: where a company
--     ends up with more than one, the most recently updated stays default,
--     the others are listed: 'another default for this purpose — no longer
--     default'.
-- Copies are recorded in org_backfill_content_copies (table_name,
-- original_id, copy_id, org_id) — service role only. Read the list:
--   SELECT * FROM org_backfill_review WHERE table_name IN ('content_categories',
--     'content_library', 'content_variations', 'content_usage_log',
--     'writing_rules', 'prompt_templates') ORDER BY id;
--   SELECT * FROM org_backfill_content_copies ORDER BY table_name, original_id;
--
-- UNIQUE → PER COMPANY: content_categories_slug_key → (org_id, slug);
-- content_library_slug_key and content_library_category_id_slug_key →
-- (org_id, slug) (a category is one company's, so (org_id, slug) also covers
-- the per-category rule); one is_default per purpose → partial unique
-- (org_id, purpose) WHERE is_default.
--
-- DEPLOY ORDER: apply 20261206 (rates/destinations), 20261207 (tours) and
-- then this migration FIRST, then deploy the code. The code filters and
-- stamps org_id on these tables and fails without it; the old code keeps
-- reading on the new schema, but an item it inserts has no org_id and fails
-- NOT NULL — deploy promptly. Without 20261207 this still applies (the tour
-- signal is skipped); without 20261206 destinations are left as they are.
--
-- Idempotent and replay-safe: ADD COLUMN IF NOT EXISTS, every rule fills only
-- NULLs, copies are made only for rows placed in this run (or, for content,
-- where none is recorded), review rows ON CONFLICT DO NOTHING, policies
-- dropped before created, tables guarded (to_regclass). On a bare replay (no
-- organisations) nothing is written.
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_backfill_content_copies (
  table_name text NOT NULL,
  original_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, original_id, org_id)
);
ALTER TABLE public.org_backfill_content_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_backfill_content_copies FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns; set_updated_at off for the backfill (an assignment is not an
-- edit); global uniques dropped (a copy keeps its original's slug).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_variations', 'writing_rules', 'prompt_templates'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at') THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;
END
$$;
ALTER TABLE IF EXISTS public.content_categories DROP CONSTRAINT IF EXISTS content_categories_slug_key;
ALTER TABLE IF EXISTS public.content_library DROP CONSTRAINT IF EXISTS content_library_slug_key;
ALTER TABLE IF EXISTS public.content_library DROP CONSTRAINT IF EXISTS content_library_category_id_slug_key;

-- ---------------------------------------------------------------------------
-- Migration-only helpers (dropped at the end).
-- ---------------------------------------------------------------------------

-- Copy one row into another company: new id, that org; a content item's
-- tier variations come with it.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_content_row(p_table text, p_id uuid, p_org uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  new_id uuid := gen_random_uuid();
  v record;
  new_vid uuid;
BEGIN
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I, to_jsonb(r) || $1)).* FROM public.%1$I r WHERE r.id = $2',
    p_table) USING jsonb_build_object('id', new_id, 'org_id', p_org), p_id;
  INSERT INTO public.org_backfill_content_copies (table_name, original_id, copy_id, org_id)
  VALUES (p_table, p_id, new_id, p_org);
  IF p_table = 'content_library' AND to_regclass('public.content_variations') IS NOT NULL THEN
    FOR v IN SELECT id FROM public.content_variations WHERE content_id = p_id LOOP
      new_vid := gen_random_uuid();
      INSERT INTO public.content_variations
      SELECT (jsonb_populate_record(NULL::public.content_variations,
               to_jsonb(cv) || jsonb_build_object('id', new_vid, 'content_id', new_id))).*
        FROM public.content_variations cv WHERE cv.id = v.id;
      INSERT INTO public.org_backfill_content_copies (table_name, original_id, copy_id, org_id)
      VALUES ('content_variations', v.id, new_vid, p_org);
    END LOOP;
  END IF;
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  VALUES (p_table, new_id::text, p_org, p_reason)
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  RETURN new_id;
END
$fn$;

-- Rows placed in THIS run, by table: only these are copied for each company
-- (a re-run must not copy what a company created after the first one).
CREATE TEMP TABLE IF NOT EXISTS _org_content_placed (tbl text, id uuid) ON COMMIT DROP;
-- What uses a content item: (content id, company).
CREATE TEMP TABLE IF NOT EXISTS _org_content_use (cid uuid, org uuid) ON COMMIT DROP;

-- One copy per other company of every row placed in this run.
CREATE OR REPLACE FUNCTION public.org_backfill_copy_content_for_each(p_table text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  rec record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  FOR rec IN EXECUTE format($q$
    SELECT r.id, o.id AS org
      FROM public.%I r
      JOIN _org_content_placed p ON p.tbl = %L AND p.id = r.id
      CROSS JOIN public.organizations o
     WHERE o.id <> r.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies c WHERE c.table_name = %L AND c.copy_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies c
                        WHERE c.table_name = %L AND c.original_id = r.id AND c.org_id = o.id)
     ORDER BY r.id, o.id
  $q$, p_table, p_table, p_table, p_table) LOOP
    PERFORM public.org_backfill_copy_content_row(p_table, rec.id, rec.org, 'copied for each company');
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Categories, writing rules, prompt templates.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  t text;
BEGIN
  -- The helpers come from 20261202; without them (a replay that skips it)
  -- there is nothing to backfill with.
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN
    RAISE NOTICE 'content: no organisations — nothing to backfill';
    RETURN;
  END IF;

  -- Each company the full category set.
  IF to_regclass('public.content_categories') IS NOT NULL THEN
    WITH filled AS (
      UPDATE public.content_categories SET org_id = cat WHERE org_id IS NULL RETURNING id
    )
    INSERT INTO _org_content_placed SELECT 'content_categories', id FROM filled;
    PERFORM public.org_backfill_copy_content_for_each('content_categories');
  END IF;

  -- The author's company, else the catalogue default; then one for each.
  FOREACH t IN ARRAY ARRAY['writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($q$
      WITH filled AS (
        UPDATE public.%I r SET org_id = public.org_backfill_user_org(r.created_by)
         WHERE r.org_id IS NULL AND r.created_by IS NOT NULL
           AND public.org_backfill_user_org(r.created_by) IS NOT NULL
        RETURNING r.id
      )
      INSERT INTO _org_content_placed SELECT %L, id FROM filled
    $q$, t, t);
    EXECUTE format($q$
      WITH filled AS (
        UPDATE public.%1$I SET org_id = %2$L::uuid WHERE org_id IS NULL RETURNING id
      ), placed AS (
        INSERT INTO _org_content_placed SELECT %1$L, id FROM filled RETURNING id
      )
      INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
      SELECT %1$L, id::text, %2$L::uuid, 'no single-company author — catalogue default' FROM placed
      ON CONFLICT (table_name, row_id, reason) DO NOTHING
    $q$, t, cat);
    PERFORM public.org_backfill_copy_content_for_each(t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- The content library.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cat uuid;
  rec record;
BEGIN
  IF to_regclass('public.content_library') IS NULL THEN RETURN; END IF;
  IF to_regprocedure('public.org_backfill_catalogue_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_catalogue_default()' INTO cat;
  IF cat IS NULL THEN RETURN; END IF;

  -- What uses it, by company.
  DELETE FROM _org_content_use;
  IF to_regclass('public.tour_day_activities') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'org_id') THEN
    EXECUTE $q$
      INSERT INTO _org_content_use
      SELECT DISTINCT a.content_id, t.org_id
        FROM public.tour_day_activities a JOIN public.tour_templates t ON t.id = a.template_id
       WHERE a.content_id IS NOT NULL AND t.org_id IS NOT NULL
    $q$;
  END IF;
  IF to_regclass('public.content_usage_log') IS NOT NULL THEN
    INSERT INTO _org_content_use
    SELECT DISTINCT l.content_id, i.org_id
      FROM public.content_usage_log l JOIN public.itineraries i ON i.id = l.itinerary_id
     WHERE l.content_id IS NOT NULL AND i.org_id IS NOT NULL;
  END IF;
  -- Only items that exist (tour_day_activities.content_id has no FK).
  DELETE FROM _org_content_use u WHERE NOT EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = u.cid);

  -- 1. The one company that uses it.
  UPDATE public.content_library c SET org_id = u.o
    FROM (SELECT cid, min(org::text)::uuid AS o FROM _org_content_use GROUP BY cid HAVING count(DISTINCT org) = 1) u
   WHERE c.org_id IS NULL AND u.cid = c.id;

  -- 2. Both: the catalogue default when it is one of them, else the older.
  WITH filled AS (
    UPDATE public.content_library c SET org_id = coalesce(
        (SELECT x.org FROM _org_content_use x WHERE x.cid = c.id AND x.org = cat LIMIT 1),
        (SELECT x.org FROM _org_content_use x JOIN public.organizations o ON o.id = x.org
          WHERE x.cid = c.id ORDER BY o.created_at, o.id LIMIT 1))
     WHERE c.org_id IS NULL AND c.id IN (SELECT cid FROM _org_content_use)
    RETURNING c.id, c.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_library', id::text, org_id, 'used by both companies — copied for the other' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- 3. Not used: the one company of the people who wrote it.
  WITH authors AS (
    SELECT c.id, public.org_backfill_user_org(a.u) AS o
      FROM public.content_library c CROSS JOIN LATERAL (VALUES (c.created_by), (c.updated_by)) AS a(u)
     WHERE c.org_id IS NULL AND a.u IS NOT NULL
    UNION ALL
    SELECT c.id, public.org_backfill_user_org(a.u)
      FROM public.content_library c
      JOIN public.content_variations v ON v.content_id = c.id
      CROSS JOIN LATERAL (VALUES (v.created_by), (v.updated_by)) AS a(u)
     WHERE c.org_id IS NULL AND a.u IS NOT NULL
  )
  UPDATE public.content_library c SET org_id = x.o
    FROM (SELECT id, min(o::text)::uuid AS o FROM authors WHERE o IS NOT NULL GROUP BY id HAVING count(DISTINCT o) = 1) x
   WHERE c.org_id IS NULL AND x.id = c.id;

  -- 4. Nothing traces it.
  WITH filled AS (
    UPDATE public.content_library SET org_id = cat WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_library', id::text, cat, 'no tour, itinerary or single-company author — catalogue default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;

  -- An item another company uses: a copy for that company.
  FOR rec IN
    SELECT DISTINCT u.cid, u.org, c.org_id AS home
      FROM _org_content_use u JOIN public.content_library c ON c.id = u.cid
     WHERE u.org <> c.org_id
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies m
                        WHERE m.table_name = 'content_library' AND m.original_id = u.cid AND m.org_id = u.org)
       AND NOT EXISTS (SELECT 1 FROM public.org_backfill_content_copies m
                        WHERE m.table_name = 'content_library' AND m.copy_id = u.cid)
  LOOP
    PERFORM public.org_backfill_copy_content_row('content_library', rec.cid, rec.org, 'used by another company — copied');
    INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
    VALUES ('content_library', rec.cid::text, rec.home, 'used by another company — copied')
    ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Each company's references point at its own copy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  trg record;
  has_dest_org boolean := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'destinations' AND column_name = 'org_id');
  t text;
BEGIN
  -- Fix-ups, not edits: only triggers that are on are turned off, and only
  -- those are turned back on.
  CREATE TEMP TABLE IF NOT EXISTS _org_content_trg_off (tbl text, tg text) ON COMMIT DROP;
  FOR trg IN
    SELECT c.relname AS tbl, t.tgname AS tg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgenabled = 'O' AND c.relnamespace = 'public'::regnamespace
       AND c.relname IN ('tour_day_activities', 'content_usage_log')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', trg.tbl, trg.tg);
    INSERT INTO _org_content_trg_off VALUES (trg.tbl, trg.tg);
  END LOOP;

  -- Tour day activities: their template's company's copy.
  IF to_regclass('public.tour_day_activities') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_templates' AND column_name = 'org_id') THEN
    EXECUTE $q$
      UPDATE public.tour_day_activities a SET content_id = m.copy_id
        FROM public.tour_templates t, public.org_backfill_content_copies m
       WHERE t.id = a.template_id AND m.table_name = 'content_library'
         AND m.original_id = a.content_id AND m.org_id = t.org_id
    $q$;
  END IF;

  -- Usage log: its itinerary's company's copy (item and tier variation).
  IF to_regclass('public.content_usage_log') IS NOT NULL THEN
    UPDATE public.content_usage_log l SET content_id = m.copy_id
      FROM public.itineraries i, public.org_backfill_content_copies m
     WHERE i.id = l.itinerary_id AND m.table_name = 'content_library'
       AND m.original_id = l.content_id AND m.org_id = i.org_id;
    UPDATE public.content_usage_log l SET variation_id = m.copy_id
      FROM public.itineraries i, public.org_backfill_content_copies m
     WHERE i.id = l.itinerary_id AND m.table_name = 'content_variations'
       AND m.original_id = l.variation_id AND m.org_id = i.org_id;
  END IF;

  -- A content item's category is its company's.
  IF to_regclass('public.content_library') IS NOT NULL THEN
    UPDATE public.content_library c SET category_id = m.copy_id
      FROM public.content_categories k, public.org_backfill_content_copies m
     WHERE k.id = c.category_id AND k.org_id IS DISTINCT FROM c.org_id
       AND m.table_name = 'content_categories' AND m.original_id = c.category_id AND m.org_id = c.org_id;
  END IF;

  -- Destinations: the company's copy (20261206).
  IF has_dest_org THEN
    FOREACH t IN ARRAY ARRAY['content_library', 'writing_rules'] LOOP
      IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
      IF to_regclass('public.org_backfill_rate_copies') IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I r SET destination_id = m.copy_id
                          FROM public.org_backfill_rate_copies m, public.destinations d
                         WHERE m.table_name = ''destinations'' AND m.original_id = r.destination_id AND m.org_id = r.org_id
                           AND d.id = r.destination_id AND d.org_id IS DISTINCT FROM r.org_id', t);
      END IF;
      EXECUTE format($q$
        INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
        SELECT %1$L, r.id::text, r.org_id, 'destination belongs to another company'
          FROM public.%1$I r JOIN public.destinations d ON d.id = r.destination_id
         WHERE d.org_id IS NOT NULL AND r.org_id IS NOT NULL AND d.org_id <> r.org_id
        ON CONFLICT (table_name, row_id, reason) DO NOTHING
      $q$, t);
    END LOOP;
  END IF;

  FOR trg IN SELECT * FROM _org_content_trg_off LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', trg.tbl, trg.tg);
  END LOOP;
  DELETE FROM _org_content_trg_off;
END
$$;

-- ---------------------------------------------------------------------------
-- Usage log: its itinerary's company, else its content item's.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  def uuid;
BEGIN
  IF to_regclass('public.content_usage_log') IS NULL THEN RETURN; END IF;
  IF to_regprocedure('public.org_backfill_default()') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT public.org_backfill_default()' INTO def;
  IF def IS NULL THEN RETURN; END IF;
  UPDATE public.content_usage_log l SET org_id = i.org_id FROM public.itineraries i
   WHERE l.org_id IS NULL AND i.id = l.itinerary_id AND i.org_id IS NOT NULL;
  UPDATE public.content_usage_log l SET org_id = c.org_id FROM public.content_library c
   WHERE l.org_id IS NULL AND c.id = l.content_id AND c.org_id IS NOT NULL;
  WITH filled AS (
    UPDATE public.content_usage_log SET org_id = def WHERE org_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_usage_log', id::text, def, 'no itinerary or content — default' FROM filled
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- ---------------------------------------------------------------------------
-- A variation belongs to a content item; one with none is unreachable.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.content_variations') IS NULL THEN RETURN; END IF;
  WITH gone AS (
    DELETE FROM public.content_variations WHERE content_id IS NULL RETURNING id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'content_variations', id::text, NULL, 'no content item — deleted' FROM gone
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
  ALTER TABLE public.content_variations ALTER COLUMN content_id SET NOT NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- One default prompt per purpose per company.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.prompt_templates') IS NULL THEN RETURN; END IF;
  WITH ranked AS (
    SELECT id, org_id, row_number() OVER (
             PARTITION BY org_id, purpose
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id) AS n
      FROM public.prompt_templates
     WHERE is_default AND org_id IS NOT NULL
  ), demoted AS (
    UPDATE public.prompt_templates p SET is_default = false
      FROM ranked r WHERE r.id = p.id AND r.n > 1
    RETURNING p.id, p.org_id
  )
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'prompt_templates', id::text, org_id, 'another default for this purpose — no longer default' FROM demoted
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

-- ---------------------------------------------------------------------------
-- NOT NULL, indexes, per-company uniques, triggers back on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  nulls boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id IS NULL)', t) INTO nulls;
    IF nulls THEN
      RAISE NOTICE '%: rows without an organisation remain — org_id left nullable', t;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_variations', 'writing_rules', 'prompt_templates'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || t) AND tgname = 'set_updated_at') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER set_updated_at', t);
    END IF;
  END LOOP;

  IF to_regclass('public.content_categories') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_content_categories_org ON public.content_categories (org_id, sort_order);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_categories_org_id_slug_key') THEN
      ALTER TABLE public.content_categories ADD CONSTRAINT content_categories_org_id_slug_key UNIQUE (org_id, slug);
    END IF;
  END IF;
  IF to_regclass('public.content_library') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_content_library_org ON public.content_library (org_id, category_id);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_library_org_id_slug_key') THEN
      ALTER TABLE public.content_library ADD CONSTRAINT content_library_org_id_slug_key UNIQUE (org_id, slug);
    END IF;
  END IF;
  IF to_regclass('public.content_usage_log') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_content_usage_log_org ON public.content_usage_log (org_id, used_at DESC);
  END IF;
  IF to_regclass('public.writing_rules') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_writing_rules_org ON public.writing_rules (org_id, priority DESC);
  END IF;
  IF to_regclass('public.prompt_templates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_prompt_templates_org ON public.prompt_templates (org_id, purpose);
    CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_org_purpose_default_key
      ON public.prompt_templates (org_id, purpose) WHERE is_default;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_variations', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated', t);
    END IF;
  END LOOP;

  -- ROOT tables: your company's rows; writes manager-and-above.
  FOREACH t IN ARRAY ARRAY['content_categories', 'content_library', 'content_usage_log', 'writing_rules', 'prompt_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_is_in_org(org_id))', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above()) WITH CHECK (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_is_in_org(org_id) AND public.is_manager_or_above())', t || '_org_delete', t);
  END LOOP;

  -- CHILD: a variation is its content item's company's.
  IF to_regclass('public.content_variations') IS NOT NULL THEN
    DROP POLICY IF EXISTS content_variations_org_select ON public.content_variations;
    DROP POLICY IF EXISTS content_variations_org_write ON public.content_variations;
    CREATE POLICY content_variations_org_select ON public.content_variations FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = content_id AND public.user_is_in_org(c.org_id)));
    CREATE POLICY content_variations_org_write ON public.content_variations FOR ALL TO authenticated
      USING (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = content_id AND public.user_is_in_org(c.org_id)))
      WITH CHECK (public.is_manager_or_above() AND EXISTS (SELECT 1 FROM public.content_library c WHERE c.id = content_id AND public.user_is_in_org(c.org_id)));
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.org_backfill_copy_content_for_each(text);
DROP FUNCTION IF EXISTS public.org_backfill_copy_content_row(text, uuid, uuid, text);

COMMIT;

INSERT INTO public.schema_migrations (name) VALUES ('20261208_content_org_id') ON CONFLICT DO NOTHING;

-- ==================================================================
-- 20261209_tenancy_followups
-- ==================================================================
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

INSERT INTO public.schema_migrations (name) VALUES ('20261209_tenancy_followups') ON CONFLICT DO NOTHING;
