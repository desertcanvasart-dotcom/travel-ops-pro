-- ============================================================
-- Booking portal links — the traveller's own page
-- ============================================================
-- itinerary_shares already exists and shows a TRIP: read-only, no money beyond
-- the headline price, nothing to fill in. A booking portal is a different
-- thing. It shows what is owed and by when, carries the documents A.T.S post
-- today, and — the point of it — lets the traveller enter their own passport
-- and contact details instead of returning a form by fax.
--
-- Separate table rather than a column on itinerary_shares, because the two
-- differ in what they expose and in whether they ACCEPT anything. Conflating a
-- read-only link with a write-capable one is how a token ends up granting more
-- than whoever sent it believed.
--
-- Security model, deliberately identical to itinerary_shares:
--   * The public page never reads this table with the anon key. A server route
--     using the service role validates the token, checks revocation and expiry,
--     and projects through the allowlist in lib/booking-portal.ts.
--   * NO anon policies. The token list is not browser-queryable and revocation
--     cannot be bypassed.
--   * Tokens are 192 bits of crypto randomness, minted in TypeScript.
--
-- One thing this table has that itinerary_shares does not: an EXPIRY. A link
-- that collects passport details should not answer forever, and a trip that
-- departed last year has no reason to keep a live form.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_portal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,

  -- base64url of 24 random bytes. Minted in lib/booking-portal.ts.
  token TEXT NOT NULL UNIQUE,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A revoked link keeps its row as the record of what was shared and when.
  revoked_at TIMESTAMPTZ,

  -- After this the token stops resolving. Set from the departure date when the
  -- link is minted; NULL means it does not expire.
  expires_at TIMESTAMPTZ,

  -- Whether the traveller may still change their answers. Their paper form is
  -- one-shot; a portal does not have to be, but at some point the manifest is
  -- sent to Cairo and further edits would diverge from what was sent.
  details_locked_at TIMESTAMPTZ,

  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);

-- One live link per booking: re-sending gives the same URL rather than minting
-- infinite ones, and revoking kills the only link that exists.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_portal_links_active
  ON public.booking_portal_links (booking_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_booking_portal_links_org
  ON public.booking_portal_links (org_id);

ALTER TABLE public.booking_portal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_portal_links_org ON public.booking_portal_links;
CREATE POLICY booking_portal_links_org ON public.booking_portal_links
  FOR ALL TO authenticated
  USING (public.user_is_in_org(org_id))
  WITH CHECK (public.user_is_in_org(org_id));

COMMENT ON TABLE public.booking_portal_links IS
  'Token-gated page for the traveller: their trip, what is owed and by when, their documents, and the form that replaces the posted 海外旅行参加申込書.';
COMMENT ON COLUMN public.booking_portal_links.details_locked_at IS
  'Once set, the form is read-only. The manifest has gone to the ground operator and later edits would diverge from what was sent.';
