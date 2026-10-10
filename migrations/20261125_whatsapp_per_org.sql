-- ============================================================================
-- 20261125 — each organization has its own WhatsApp number
-- ============================================================================
--
-- One Twilio sender served the whole deployment and no inbox table carried an
-- org: every organization's agents saw, answered and reassigned every other
-- organization's customers (DEFERRED_GATES.md G1). Decided 2026-10-10: each
-- organization gets its OWN sender number in the one Twilio account, and the
-- number a customer writes TO says which organization the thread belongs to.
--
--   organizations.whatsapp_number   the org's sender, E.164 ('+819012345678').
--                                   Unique: one number, one inbox. NULL = not
--                                   set up (lib/whatsapp-org.ts: while NO org
--                                   has one, the env sender and the default
--                                   org stand in, as before).
--   whatsapp_conversations.org_id   the owning org. Every inbox route filters
--                                   on it (service role, RLS does not help).
--
-- phone_number was unique across the deployment; the same customer may now
-- write to two organizations, so it is unique per org instead.
--
-- whatsapp_messages gets no org_id: it hangs off conversation_id, and every
-- route reaches messages through a conversation it has already scoped.
--
-- BACKFILL: existing threads all arrived on the one shared number, so they
-- belong to the default org. lib/auth/default-org.ts prefers env
-- DEFAULT_ORG_ID, which SQL cannot read; this uses its fallback, the OLDEST
-- organization by created_at. If DEFAULT_ORG_ID names a different org on a
-- deployment, move the rows by hand:
--   UPDATE whatsapp_conversations SET org_id = '<DEFAULT_ORG_ID>';
--
-- org_id becomes NOT NULL once no row lacks it (a bare schema replay has no
-- organizations and no threads; a NOTICE says when rows were left NULL).
-- Replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- The same shape lib/whatsapp-phone.ts toWhatsAppE164 produces.
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_whatsapp_number_e164;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_whatsapp_number_e164
  CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');

CREATE UNIQUE INDEX IF NOT EXISTS organizations_whatsapp_number_key
  ON public.organizations (whatsapp_number) WHERE whatsapp_number IS NOT NULL;

COMMENT ON COLUMN public.organizations.whatsapp_number IS
  'This organization''s WhatsApp sender in the shared Twilio account, E.164. Inbound messages TO it land in this org''s inbox.';

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org
  ON public.whatsapp_conversations (org_id, last_message_at DESC);

COMMENT ON COLUMN public.whatsapp_conversations.org_id IS
  'Owning organization: the one whose whatsapp_number the customer wrote to.';

UPDATE public.whatsapp_conversations
   SET org_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
 WHERE org_id IS NULL;

-- Until the code that stamps org_id is deployed, the running code inserts
-- threads without one; with org_id NOT NULL below, every new inbound chat
-- would fail between this migration and the deploy. A missing org_id is
-- filled the same way as the backfill above, so the migration can run first.
CREATE OR REPLACE FUNCTION public.whatsapp_conversation_default_org() RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1);
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trigger_whatsapp_conversation_default_org ON public.whatsapp_conversations;
CREATE TRIGGER trigger_whatsapp_conversation_default_org
  BEFORE INSERT ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_conversation_default_org();

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_phone_number_key;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'whatsapp_conversations_org_phone_key'
                    AND conrelid = 'public.whatsapp_conversations'::regclass) THEN
    ALTER TABLE public.whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_org_phone_key UNIQUE (org_id, phone_number);
  END IF;

  IF EXISTS (SELECT 1 FROM public.whatsapp_conversations WHERE org_id IS NULL) THEN
    RAISE NOTICE 'whatsapp_conversations: rows without an organization remain (no organizations row?) — org_id left nullable';
  ELSE
    ALTER TABLE public.whatsapp_conversations ALTER COLUMN org_id SET NOT NULL;
  END IF;
END $$;

COMMIT;

-- Check:
-- SELECT org_id, count(*) FROM public.whatsapp_conversations GROUP BY 1;
-- SELECT id, name, whatsapp_number FROM public.organizations ORDER BY created_at;
