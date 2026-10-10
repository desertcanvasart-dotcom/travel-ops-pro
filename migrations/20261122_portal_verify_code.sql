-- ============================================================================
-- 20261122 — a friend's portal link asks for a one-time code from their email
-- ============================================================================
--
-- In friends mode the lead coordinator sees each friend's private link and
-- their family name and date of birth — exactly what the link's gate asked
-- for — so the lead could open a friend's form (passport, health answers).
-- A per-traveller link now also asks for a 6-digit code emailed to that
-- traveller. Only its HMAC is stored; it is single-use, expires, and dies
-- after five wrong tries.
--
-- Replay-safe.

ALTER TABLE public.booking_portal_links
  ADD COLUMN IF NOT EXISTS verify_code_hash text,
  ADD COLUMN IF NOT EXISTS verify_code_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS verify_code_issued_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS verify_code_attempts integer DEFAULT 0 NOT NULL;
