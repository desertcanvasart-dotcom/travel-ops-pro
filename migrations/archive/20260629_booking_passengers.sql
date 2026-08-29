-- ============================================================
-- booking_passengers — per-booking passenger manifest
-- ============================================================
-- Ported from the sibling app (autoura-saas migration 100), adapted to THIS
-- app's ORG multi-tenancy (org_id + RLS via public.user_is_in_org) and a
-- self-contained updated_at trigger (this DB has no generic helper).
--
-- One row per traveller on a booking: identity, contact, travel documents,
-- rooming, dietary/mobility/medical needs. Lead passenger floats to the top.
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Personal details
  title VARCHAR(10),                       -- Mr, Mrs, Ms, Dr
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) GENERATED ALWAYS AS (
    CASE
      WHEN title IS NOT NULL THEN title || ' ' || first_name || ' ' || last_name
      ELSE first_name || ' ' || last_name
    END
  ) STORED,
  date_of_birth DATE,
  gender VARCHAR(20),
  nationality VARCHAR(100),

  -- Contact information
  email VARCHAR(255),
  phone VARCHAR(50),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),

  -- Travel documents
  passport_number VARCHAR(50),
  passport_expiry DATE,
  passport_issuing_country VARCHAR(100),
  visa_required BOOLEAN DEFAULT false,

  -- Passenger type
  passenger_type VARCHAR(20) NOT NULL DEFAULT 'adult'
    CHECK (passenger_type IN ('adult', 'child', 'infant', 'tour_leader')),
  is_lead_passenger BOOLEAN DEFAULT false,

  -- Room assignment
  room_type VARCHAR(50),                   -- single, double, twin, triple
  roommate_id UUID REFERENCES booking_passengers(id) ON DELETE SET NULL,

  -- Special requirements
  meal_preference VARCHAR(50),             -- vegetarian, vegan, halal, kosher, gluten_free, …
  mobility_requirements TEXT,
  medical_conditions TEXT,
  special_requests TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_passengers_booking ON booking_passengers(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_passengers_org ON booking_passengers(org_id);
CREATE INDEX IF NOT EXISTS idx_booking_passengers_lead ON booking_passengers(is_lead_passenger) WHERE is_lead_passenger = true;

ALTER TABLE booking_passengers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_passengers_org_all ON booking_passengers;
CREATE POLICY booking_passengers_org_all ON booking_passengers
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

CREATE OR REPLACE FUNCTION update_booking_passengers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_passengers_updated_at ON booking_passengers;
CREATE TRIGGER trg_booking_passengers_updated_at
  BEFORE UPDATE ON booking_passengers
  FOR EACH ROW EXECUTE FUNCTION update_booking_passengers_updated_at();

COMMENT ON TABLE booking_passengers IS 'Per-booking passenger manifest (org-scoped). Ported from sibling autoura-saas, adapted to org_id + RLS.';
