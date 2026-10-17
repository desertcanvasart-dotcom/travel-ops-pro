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
