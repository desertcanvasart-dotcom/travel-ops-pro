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
