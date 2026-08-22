-- ============================================
-- Notifications addressed to a LOGIN, not to the legacy roster
-- ============================================
-- notifications.team_member_id points at team_members, the WhatsApp-inbox
-- roster: seven rows, one active, one linked to a real login. Nothing a
-- colleague does in the app creates a team_members row, so every in-app
-- notification ever produced went to nobody — the table has held 0 rows in
-- production since the feature shipped. Roles live in organization_members
-- (PR #67); a notification must be addressable to those people.
--
-- user_id is the new address. team_member_id stays for the legacy rows and
-- for the inbox routing that still keys on it; a row needs one of the two.
-- ============================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ALTER COLUMN team_member_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

-- Roster entries whose e-mail is a login's e-mail ARE that login. Tasks and
-- trip assignments still point at the roster (tasks.assigned_to,
-- itineraries.assigned_to → team_members), so this link is what lets those
-- alerts reach the person's bell. Never overwrites an existing link.
UPDATE public.team_members tm
SET user_id = up.id
FROM public.user_profiles up
WHERE tm.user_id IS NULL
  AND tm.email IS NOT NULL
  AND lower(tm.email) = lower(up.email);

-- Legacy rows addressed to a roster entry that IS linked to a login follow
-- that login; the rest keep their roster address and stay reachable through
-- the same link at read time.
UPDATE public.notifications n
SET user_id = tm.user_id
FROM public.team_members tm
WHERE tm.id = n.team_member_id AND tm.user_id IS NOT NULL AND n.user_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_recipient_check') THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_recipient_check
      CHECK (user_id IS NOT NULL OR team_member_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.notifications.user_id IS
  'The login this notification is for (auth.users). Preferred address; team_member_id is the legacy roster address.';
