-- ============================================
-- 20270111: a company can require two-factor login
-- ============================================
-- organizations.require_two_factor — the owner's switch under Settings →
-- Organization. When true, an owner, administrator or manager with no
-- authenticator app is sent to set one up before any page or API answers
-- (middleware.ts, lib/auth/two-factor.ts). Anyone who HAS set one up is
-- asked for its code at every login whatever this says.
--
-- Off by default: switching it on is the owner's decision, made after they
-- have set up their own authenticator (the API refuses it otherwise), so a
-- deploy never locks a manager out mid-day.
-- ============================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_two_factor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.require_two_factor IS
  'Owners, administrators and managers must set up an authenticator app before using the app (middleware.ts). Off by default.';
