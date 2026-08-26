-- ============================================
-- Staff ↔ traveller conversation inside the portal
-- ============================================
-- The traveller already fills in a form and attaches a passport here. What
-- they could not do was ASK anything — questions went to email or LINE, where
-- the answer detached from the booking it was about.
--
-- WHO CAN SEE A MESSAGE MIRRORS THE LINK. A booking-level (family) link gets
-- one shared conversation. A private per-traveller (friends) link gets that
-- traveller's own conversation, which nobody else on the booking can read.
-- That is exactly how passports and personal details already behave, so the
-- rule a traveller has already learned still holds — see the partial unique
-- index below, which is the same COALESCE trick booking_portal_links uses.
--
-- Idempotent: safe to run twice.

-- ── 1. Office hours, so the portal can say when a reply is coming.
--    Egypt office, Japanese travellers, six or seven hours apart: a message
--    sent in the Japanese evening lands overnight. Saying so is the difference
--    between "they are closed" and "they are ignoring me".
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS support_hours JSONB;

COMMENT ON COLUMN public.organizations.support_hours IS
  'A LIST of offices, each with its own clock and working week: [{label, labelJa, timezone, days:[1-7, Mon=1], from:"09:00", to:"17:00"}]. NULL means no hours are stated and the portal promises no reply time rather than promising wrongly.';

-- The operator's actual offices. Two, on different working weeks: Cairo runs
-- Sunday to Thursday, Tokyo and Osaka Monday to Friday. Between them they cover
-- most of a Japanese waking day — Cairo's afternoon is the Japanese evening —
-- which is why the portal can tell a traveller something better than "we are
-- closed". Friday is Japan only, Sunday is Cairo only, Saturday is nobody.
--
-- Only set when unset, so re-running never overwrites hours the operator has
-- since edited.
UPDATE public.organizations
SET support_hours = '[
  {"label":"Tokyo / Osaka","labelJa":"東京・大阪","timezone":"Asia/Tokyo","days":[1,2,3,4,5],"from":"09:00","to":"17:00"},
  {"label":"Cairo","labelJa":"カイロ","timezone":"Africa/Cairo","days":[7,1,2,3,4],"from":"09:00","to":"17:00"}
]'::jsonb
WHERE support_hours IS NULL;

-- ── 2. One conversation.
CREATE TABLE IF NOT EXISTS public.portal_message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- NULL = the booking's shared conversation, reached by a family link.
  -- Set   = one traveller's private conversation, reached by their own link.
  passenger_id UUID REFERENCES booking_passengers(id) ON DELETE CASCADE,

  -- Denormalised so the inbox can sort and preview without reading every
  -- message. Kept in step by the API that writes messages.
  last_message_at TIMESTAMPTZ,
  last_message_snippet TEXT,
  last_sender TEXT CHECK (last_sender IN ('customer', 'staff', 'system')),

  -- "Unread" is a timestamp, not a counter: a counter drifts the moment two
  -- people read at once, and a timestamp can always be recomputed.
  staff_last_read_at TIMESTAMPTZ,
  customer_last_read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One conversation per link. COALESCE onto the nil UUID because NULL never
-- equals NULL in a unique index, so without it a booking could collect any
-- number of "shared" threads.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_threads_one_per_link
  ON public.portal_message_threads(
    booking_id,
    COALESCE(passenger_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_portal_threads_org_recent
  ON public.portal_message_threads(org_id, last_message_at DESC);

-- ── 3. The messages.
CREATE TABLE IF NOT EXISTS public.portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES portal_message_threads(id) ON DELETE CASCADE,

  -- 'system' is the automatic acknowledgement. It is a real message rather
  -- than UI text so the traveller sees it in sequence with everything else,
  -- and so the operator can see exactly what was promised and when.
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'staff', 'system')),

  -- Who on the team wrote it, and their name AT THE TIME. The snapshot means a
  -- staff member leaving does not blank out the history of what was said.
  sender_user_id UUID,
  sender_name VARCHAR(120),

  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_thread
  ON public.portal_messages(thread_id, created_at);

ALTER TABLE public.portal_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

-- Same posture as every other table here: no anon access. The traveller
-- reaches these only through the service role, behind the token gate.
DROP POLICY IF EXISTS portal_message_threads_org_all ON public.portal_message_threads;
CREATE POLICY portal_message_threads_org_all ON public.portal_message_threads
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS portal_messages_org_all ON public.portal_messages;
CREATE POLICY portal_messages_org_all ON public.portal_messages
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

COMMENT ON TABLE public.portal_message_threads IS
  'One conversation per portal link: passenger_id NULL = the booking''s shared thread (family link), set = one traveller''s private thread (friends link). Mirrors who can already see whose passport.';
COMMENT ON COLUMN public.portal_message_threads.staff_last_read_at IS
  'Unread is derived by comparing this to message timestamps. A stored counter drifts the moment two people read at once; a timestamp can be recomputed from the messages.';
