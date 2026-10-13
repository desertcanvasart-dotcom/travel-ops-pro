-- ============================================
-- Follow-ups scheduled before they had an owner get one
-- ============================================
-- Since the Operate audit (Tasks and Follow-ups), whoever schedules a client
-- follow-up owns it (client_followups.assigned_to = their login id, stamped
-- by POST /api/followups), and the task-reminders job gives the owner an
-- in-app reminder on the due date. Follow-ups scheduled before that have
-- assigned_to NULL, so they never remind anyone.
--
-- This names an owner for each PENDING follow-up with none, from the first
-- rule that names one. Every rule only ever names a login that is a member
-- (organization_members) of the company of the follow-up's client — the
-- reminder job sends to nobody else, and a follow-up must not land with
-- another company's staff.
--
--   1. The activity log: the person whose POST /api/followups was logged in
--      the client's company within 60 seconds of the follow-up being created
--      — the person who scheduled it. Used only when exactly ONE such person
--      is found; two people scheduling follow-ups in the same minute name
--      nobody.
--   2. The client's creator: clients.created_by, when it is the id of such a
--      member.
--   3. The client's latest trip with an assignee: the most recently created
--      itinerary of this client in the same company whose assignee
--      (itineraries.assigned_to → team_members) has a login that is such a
--      member and is not deactivated — the person handling that client now.
--
-- Anything left is listed in org_backfill_review ('client_followups',
-- follow-up id, the client's company, reason below) for someone to assign by
-- hand; it stays unowned (and unreminded) until then.
--
-- Completed and cancelled follow-ups are left alone: they never remind, so a
-- guessed owner would change nothing but the record.
--
-- DATA: client_followups.assigned_to is set on pending follow-ups that had
-- none; rows the rules cannot place are added to org_backfill_review. Nothing
-- else changes (updated_at, reminder_sent and the rest are left as they were).
--
-- Idempotent: every rule touches only rows still NULL, and the review insert
-- is ON CONFLICT DO NOTHING. Guarded on the tables it reads existing.
BEGIN;

DO $$
DECLARE
  v_reason constant text := 'pending follow-up with no owner: the activity log, the client''s creator and the client''s trips name nobody in the client''s company — assign it by hand';
BEGIN
  IF to_regclass('public.client_followups') IS NULL
     OR to_regclass('public.clients') IS NULL
     OR to_regclass('public.organization_members') IS NULL
     OR to_regclass('public.org_backfill_review') IS NULL THEN
    RETURN;
  END IF;

  -- 1. Who scheduled it, by the activity log.
  IF to_regclass('public.activity_log') IS NOT NULL THEN
    UPDATE public.client_followups f
       SET assigned_to = pick.user_id::text
      FROM (
        SELECT f2.id, min(a.user_id::text) AS user_id
          FROM public.client_followups f2
          JOIN public.clients c ON c.id = f2.client_id
          JOIN public.activity_log a
            ON a.org_id = c.org_id
           AND a.method = 'POST'
           AND split_part(a.path, '?', 1) = '/api/followups'
           AND a.created_at BETWEEN f2.created_at - interval '60 seconds' AND f2.created_at + interval '60 seconds'
          JOIN public.organization_members m ON m.org_id = c.org_id AND m.user_id = a.user_id
         WHERE f2.assigned_to IS NULL AND f2.status = 'pending' AND f2.created_at IS NOT NULL
         GROUP BY f2.id
        HAVING count(DISTINCT a.user_id) = 1
      ) pick
     WHERE f.id = pick.id AND f.assigned_to IS NULL;
  END IF;

  -- 2. The client's creator. Compared as text: created_by is free text, and
  -- casting a value that is not a uuid would fail the migration.
  UPDATE public.client_followups f
     SET assigned_to = m.user_id::text
    FROM public.clients c
    JOIN public.organization_members m ON m.org_id = c.org_id
   WHERE c.id = f.client_id
     AND f.assigned_to IS NULL AND f.status = 'pending'
     AND c.created_by IS NOT NULL
     AND m.user_id::text = lower(trim(c.created_by));

  -- 3. The assignee of the client's latest trip that has one.
  IF to_regclass('public.itineraries') IS NOT NULL AND to_regclass('public.team_members') IS NOT NULL THEN
    UPDATE public.client_followups f
       SET assigned_to = pick.user_id::text
      FROM (
        SELECT DISTINCT ON (f2.id) f2.id, tm.user_id
          FROM public.client_followups f2
          JOIN public.clients c ON c.id = f2.client_id
          JOIN public.itineraries i ON i.client_id = c.id AND i.org_id = c.org_id AND i.assigned_to IS NOT NULL
          JOIN public.team_members tm ON tm.id = i.assigned_to AND tm.user_id IS NOT NULL AND tm.is_active IS DISTINCT FROM false
          JOIN public.organization_members m ON m.org_id = c.org_id AND m.user_id = tm.user_id
         WHERE f2.assigned_to IS NULL AND f2.status = 'pending'
         ORDER BY f2.id, i.created_at DESC NULLS LAST, i.id DESC
      ) pick
     WHERE f.id = pick.id AND f.assigned_to IS NULL;
  END IF;

  -- 4. The rest, for a person to assign.
  INSERT INTO public.org_backfill_review (table_name, row_id, assigned_org, reason)
  SELECT 'client_followups', f.id::text, c.org_id, v_reason
    FROM public.client_followups f
    JOIN public.clients c ON c.id = f.client_id
   WHERE f.assigned_to IS NULL AND f.status = 'pending'
  ON CONFLICT (table_name, row_id, reason) DO NOTHING;
END
$$;

COMMIT;
