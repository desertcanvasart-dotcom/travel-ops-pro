-- ============================================================================
-- Department routing, trip assignees, and the P&L's commission inputs
-- ============================================================================
-- Three requested features, one migration, because all three are additive
-- (new nullable columns + data corrections to a lookup table; nothing existing
-- changes shape):
--
--   1. departments.service_types — corrected so routing actually matches the
--      service_type values the app writes AND the ones already in the data.
--   2. itineraries.assigned_to / assigned_at — the named internal owner of a
--      trip, plus notifications.related_itinerary_id so the in-app alert can
--      link back to it.
--   3. commissions.transaction_date backfill guard — the P&L converts a
--      commission at the rate on its own date, so a NULL date is an FX hole.
--
-- Idempotent throughout: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DEPARTMENT ROUTING — make service_types match reality
-- ----------------------------------------------------------------------------
-- The seed in 20260217_create_departments.sql listed 'airport_service' and
-- 'hotel_service' (singular). The live itinerary_services rows carry the PLURAL
-- 'airport_services' / 'hotel_services' (14 of 89 rows), while today's code
-- writes the singular form (lib/ai/service-creation.ts). Neither spelling is
-- wrong to route — only one of them was listed, so half the work fell through.
--
-- 'activity', 'tips' and 'supplies' were never listed at all: 22 more rows
-- routing to no department, silently.
--
-- Routing is a lookup, so being permissive costs nothing and being narrow
-- silently drops work on the floor. Both spellings are listed deliberately.
UPDATE public.departments
SET service_types = ARRAY[
      'accommodation',
      'cruise',
      'meal',
      'transportation'
    ],
    updated_at = NOW()
WHERE name = 'Reservation';

UPDATE public.departments
SET service_types = ARRAY['flight'],
    updated_at = NOW()
WHERE name = 'Aviation';

UPDATE public.departments
SET service_types = ARRAY[
      'guide',
      'entrance',
      'activity',
      -- Both spellings: singular is what the app writes now, plural is what the
      -- existing rows carry. See the note above.
      'airport_service',
      'airport_services',
      'hotel_service',
      'hotel_services',
      'tips',
      'supplies'
    ],
    updated_at = NOW()
WHERE name = 'Execution';

-- Accounting routes the non-service work types; left as seeded, restated here
-- so the whole routing table is readable in one place.
UPDATE public.departments
SET service_types = ARRAY['invoice', 'payment', 'commission'],
    updated_at = NOW()
WHERE name = 'Accounting';

COMMENT ON COLUMN public.departments.service_types IS
  'itinerary_services.service_type values this department owns. Must stay in '
  'sync with lib/departments.ts SERVICE_TYPE_ROUTING — the API cross-checks '
  'them and reports drift rather than silently failing to route.';

-- ----------------------------------------------------------------------------
-- 2. TRIP ASSIGNEE — the named internal owner of a trip
-- ----------------------------------------------------------------------------
-- itineraries already has assigned_guide_id / assigned_vehicle_id / etc., but
-- those are OPERATIONAL RESOURCES booked for the client. None of them answers
-- "who inside the company owns this trip" — that is what this is.
--
-- ON DELETE SET NULL, not CASCADE: removing a team member must never delete
-- the trip. An unassigned trip is a visible gap; a deleted trip is a disaster.
ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.itineraries.assigned_to IS
  'The team member who owns this trip end to end. Distinct from '
  'assigned_guide_id and friends, which are resources booked FOR the client.';

CREATE INDEX IF NOT EXISTS idx_itineraries_assigned_to
  ON public.itineraries(assigned_to) WHERE assigned_to IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. NOTIFICATIONS — let an alert point at a trip
-- ----------------------------------------------------------------------------
-- notifications already has related_task_id. An assignment alert is about a
-- trip, and stuffing the id into the free-text link would make it unqueryable
-- (e.g. "has this person already been told about this trip?").
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_related_itinerary
  ON public.notifications(related_itinerary_id) WHERE related_itinerary_id IS NOT NULL;

-- Unread-count and inbox queries both filter on this pair; the notification
-- list is the one query a user hits on every page load.
CREATE INDEX IF NOT EXISTS idx_notifications_member_unread
  ON public.notifications(team_member_id, is_read, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. COMMISSIONS — the P&L needs a date to convert on
-- ----------------------------------------------------------------------------
-- The realized P&L converts each commission at the rate on ITS OWN date, the
-- same rule expenses follow. A commission with no date cannot be converted at
-- all, so it would be excluded as an FX hole. Default it at the DB level so no
-- future writer can create one that is silently unconvertible.
ALTER TABLE public.commissions
  ALTER COLUMN transaction_date SET DEFAULT CURRENT_DATE;

UPDATE public.commissions
SET transaction_date = COALESCE(transaction_date, created_at::date, CURRENT_DATE)
WHERE transaction_date IS NULL;

-- The P&L groups by trip and by who owes whom; both are filtered every load.
CREATE INDEX IF NOT EXISTS idx_commissions_itinerary_type
  ON public.commissions(itinerary_id, commission_type) WHERE itinerary_id IS NOT NULL;
