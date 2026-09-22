-- 20261031_guest_surveys.sql
-- The ATS guest satisfaction survey (アンケートのお願い): one row per booking's
-- survey — the token the customer opens, when the invite went out (email /
-- WhatsApp), and the responses they submit.
--
-- WHY: the paper questionnaire is being put online. A daily job mints a survey
-- for each itinerary that ENDS today (the day the party lands back in Japan)
-- and sends the /survey/<token> link by email and WhatsApp; the customer taps
-- their ratings on mobile and submits. The printed sheet's QR points at the
-- same token, so paper and online converge. The questionnaire's structure
-- lives in code (lib/surveys/guest-survey.ts); this table holds only the token,
-- send state, a trip snapshot captured at send time, and the JSONB responses.
--
-- Additive: new table only, no changes to existing tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_surveys (
  id              uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id          uuid NOT NULL,
  itinerary_id    uuid,
  -- The opaque link token (URL: /survey/<token>). Unguessable; the survey is
  -- reachable without login by this token alone.
  token           character varying(64) NOT NULL,
  language        character varying(5) DEFAULT 'ja' NOT NULL,
  status          character varying(20) DEFAULT 'pending' NOT NULL,
  -- Which channels the invite went out on, and when.
  sent_email      boolean DEFAULT false NOT NULL,
  sent_whatsapp   boolean DEFAULT false NOT NULL,
  sent_at         timestamp with time zone,
  submitted_at    timestamp with time zone,
  -- Trip details captured when the invite is sent, so the survey reads whole
  -- even if the itinerary changes later (tour name, dates, cities, contact).
  trip_snapshot   jsonb DEFAULT '{}'::jsonb NOT NULL,
  -- The customer's answers (ratings / comments / extras / free text).
  responses       jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT guest_surveys_pkey PRIMARY KEY (id),
  CONSTRAINT guest_surveys_token_key UNIQUE (token),
  CONSTRAINT guest_surveys_status_check CHECK (status IN ('pending', 'sent', 'submitted')),
  CONSTRAINT guest_surveys_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT guest_surveys_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE SET NULL
);

-- One survey per itinerary (the daily job upserts on this so a re-run never
-- double-sends). Partial: only where an itinerary is linked.
CREATE UNIQUE INDEX IF NOT EXISTS guest_surveys_itinerary_uniq
  ON public.guest_surveys (itinerary_id) WHERE itinerary_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_surveys_org_status_idx
  ON public.guest_surveys (org_id, status);

-- Keep updated_at fresh (same trigger fn other tables use).
DROP TRIGGER IF EXISTS trg_guest_surveys_updated_at ON public.guest_surveys;
CREATE TRIGGER trg_guest_surveys_updated_at
  BEFORE UPDATE ON public.guest_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_tour_departures_updated_at();

COMMIT;
