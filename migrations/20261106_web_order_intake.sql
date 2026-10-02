-- 20261106_web_order_intake.sql
-- The website's order emails become quotes by themselves (operator,
-- 2026-10-02: "All information inside this web form [is] connected to the
-- correct email and to the correct program, the customer information linked
-- to it, then start the operation as per the existing pipeline").
--
-- A customer applies on ats-hj.com; the T-UP system emails the office a
-- 【T-UP】 notification. The scheduled Gmail sync stores it; then
-- lib/intake/web-order-intake.ts reads it (lib/intake/tup-mail.ts), finds
-- the programme, finds or creates the client, writes ONE draft quote and
-- holds the seats on the matching departure — no click.
--
-- 1. tour_templates.website_url — the programme's page on the website
--    (https://tour.ats-hj.com/opt_detail.php?id=67). Every notification
--    carries it, so it is the surest way to the programme; the tour code is
--    the fallback. Typed by the office on the programme.
--
-- 2. email_messages.order_checked_at — each inbound message is looked at
--    ONCE for an order. Per message, not per conversation: the website's
--    notifications share a subject, so Gmail threads different customers'
--    orders into one conversation. Messages older than 14 days are marked
--    checked — new mail only, with a fortnight's grace so orders that
--    arrived since the mailbox was connected are not lost.
--
-- 3. web_order_intakes — one row per order email: what was read, what came
--    of it (a quote, a duplicate of one, or "needs attention" and why), and
--    the links — message, client, quote, departure hold. The office's list
--    of website orders, and the reason an order is never processed twice.
--
-- 4. email_conversations.lead_check gains 'web_order': a conversation that
--    is the website's notifications is not a lead to ask the AI about.
--
-- Additive; safe to replay.

BEGIN;

-- 1 ---------------------------------------------------------------------------
ALTER TABLE public.tour_templates
  ADD COLUMN IF NOT EXISTS website_url text;

COMMENT ON COLUMN public.tour_templates.website_url IS
  'The programme''s page on the agency website (e.g. https://tour.ats-hj.com/opt_detail.php?id=67). A website order names this page; it is matched before the tour code (lib/intake/tour-up-order.ts matchProgramme).';

-- 2 ---------------------------------------------------------------------------
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS order_checked_at timestamptz;

COMMENT ON COLUMN public.email_messages.order_checked_at IS
  'When this inbound message was looked at for a website order (lib/intake/web-order-intake.ts). Messages older than 14 days at migration 20261106 are marked checked.';

UPDATE public.email_messages
   SET order_checked_at = now()
 WHERE order_checked_at IS NULL
   AND (direction <> 'inbound' OR sent_at < now() - interval '14 days');

CREATE INDEX IF NOT EXISTS idx_email_messages_order_unchecked
  ON public.email_messages (sent_at)
  WHERE order_checked_at IS NULL AND direction = 'inbound';

-- 3 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_order_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_message_id uuid UNIQUE REFERENCES public.email_messages(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.email_conversations(id) ON DELETE SET NULL,
  received_at timestamptz,
  subject text,
  outcome text NOT NULL,
  reason text,
  tour_code text,
  travel_date date,
  customer_email text,
  customer_name text,
  order_text text NOT NULL,
  order_data jsonb,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.tour_quotes(id) ON DELETE SET NULL,
  departure_booking_id uuid REFERENCES public.departure_bookings(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_order_intakes_outcome_values
    CHECK (outcome IN ('quote_created', 'needs_attention', 'duplicate'))
);

COMMENT ON TABLE public.web_order_intakes IS
  'One row per website order email: what was read and what came of it (lib/intake/web-order-intake.ts). needs_attention rows are finished by hand on /intake/order.';

CREATE INDEX IF NOT EXISTS idx_web_order_intakes_org_created
  ON public.web_order_intakes (org_id, created_at DESC);

-- The same customer, code and date sent twice (a double click, the
-- customer's copy forwarded) is one order.
CREATE INDEX IF NOT EXISTS idx_web_order_intakes_dedupe
  ON public.web_order_intakes (org_id, lower(customer_email), tour_code, travel_date)
  WHERE outcome = 'quote_created';

ALTER TABLE public.web_order_intakes ENABLE ROW LEVEL SECURITY;

-- 4 ---------------------------------------------------------------------------
ALTER TABLE public.email_conversations
  DROP CONSTRAINT IF EXISTS email_conversations_lead_check_values;
ALTER TABLE public.email_conversations
  ADD CONSTRAINT email_conversations_lead_check_values
  CHECK (lead_check IS NULL OR lead_check IN ('lead_created', 'not_a_request', 'known_contact', 'office', 'dismissed', 'skipped', 'error', 'web_order'));

COMMIT;
