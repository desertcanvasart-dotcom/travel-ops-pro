-- ============================================
-- A travel request by email becomes a Lead; a booking makes it a Customer
-- ============================================
-- Operator, 2026-09-17: "Upon receiving a request, this one is not a client,
-- not a customer yet, but a potential customer. So I want to assign it as a
-- lead, and if he confirmed, turn it into a customer." Client and customer
-- are the same thing: ONE clients row whose status says which. New emails
-- only.
--
-- 1. email_conversations.lead_checked_at / lead_check: each conversation is
--    judged ONCE (lib/email/email-leads.ts, run by the scheduled Gmail sync):
--    a travel request from someone who is not already a client, supplier,
--    partner or the office becomes a clients row with status 'lead'. Every
--    conversation that exists now is marked checked — "new only".
--
-- 2. email_lead_dismissals: "Not a lead" on a conversation removes the lead
--    and remembers the sender, so their next email is not made a lead again.
--
-- 3. A booking that is not cancelled means the customer confirmed: its client
--    moves from lead / prospect to customer (trigger on bookings). bookings
--    has no client_id — the client is the booked itinerary's, else the org's
--    client with the booking's email.

BEGIN;

ALTER TABLE public.email_conversations
  ADD COLUMN IF NOT EXISTS lead_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_check text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.email_conversations'::regclass AND conname = 'email_conversations_lead_check_values') THEN
    ALTER TABLE public.email_conversations
      ADD CONSTRAINT email_conversations_lead_check_values
      CHECK (lead_check IS NULL OR lead_check IN ('lead_created', 'not_a_request', 'known_contact', 'office', 'dismissed', 'skipped', 'error'));
  END IF;
END
$$;

COMMENT ON COLUMN public.email_conversations.lead_checked_at IS
  'When the conversation was judged for a new lead (lib/email/email-leads.ts). Conversations older than migration 20261021 are marked checked: leads come from new email only.';

-- New only: everything already in the inbox has been seen.
UPDATE public.email_conversations
   SET lead_checked_at = now(), lead_check = 'skipped'
 WHERE lead_checked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_conversations_lead_unchecked
  ON public.email_conversations (created_at)
  WHERE lead_checked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_lead_dismissals (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, email)
);

COMMENT ON TABLE public.email_lead_dismissals IS
  'Senders marked "Not a lead": their email is never made a lead again (lib/email/email-leads.ts).';

ALTER TABLE public.email_lead_dismissals ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- A booking confirms the customer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_client_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client uuid;
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT i.client_id INTO v_client
    FROM public.itineraries i
   WHERE i.id = NEW.itinerary_id;

  IF v_client IS NULL AND NEW.client_email IS NOT NULL AND btrim(NEW.client_email) <> '' THEN
    SELECT c.id INTO v_client
      FROM public.clients c
     WHERE c.org_id = NEW.org_id AND lower(c.email) = lower(btrim(NEW.client_email))
     ORDER BY c.created_at
     LIMIT 1;
  END IF;

  IF v_client IS NOT NULL THEN
    UPDATE public.clients
       SET status = 'customer', updated_at = now()
     WHERE id = v_client AND status IN ('lead', 'prospect');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_client_on_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_promote_client_on_booking ON public.bookings;
CREATE TRIGGER trg_promote_client_on_booking
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.promote_client_on_booking();

-- Leads already booked are customers (without touching the bookings).
UPDATE public.clients c
   SET status = 'customer', updated_at = now()
 WHERE c.status IN ('lead', 'prospect')
   AND EXISTS (
     SELECT 1 FROM public.bookings b
       LEFT JOIN public.itineraries i ON i.id = b.itinerary_id
      WHERE b.status IS DISTINCT FROM 'cancelled'
        AND (i.client_id = c.id
             OR (i.client_id IS NULL AND b.org_id = c.org_id AND lower(btrim(b.client_email)) = lower(c.email))));

COMMIT;
