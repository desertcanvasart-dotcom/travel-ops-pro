-- =====================================================================
-- Operator Capacity + Tour Departures
-- =====================================================================
-- Ported from the sibling app (autoura-saas migrations 127 + 128), adapted to
-- this app's ORG multi-tenancy (org_id, RLS via public.user_is_in_org) and
-- self-contained updated_at triggers (this DB has no generic
-- update_updated_at_column() helper).
--   operator_capacity : per-date availability (available/limited/busy/blackout)
--                       with group/guide/vehicle counts.
--   tour_departures   : scheduled group departures with seat inventory, linked
--                       to tour_templates / tour_variations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. OPERATOR CAPACITY
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  date DATE NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'limited', 'busy', 'blackout')),

  max_groups INTEGER NOT NULL DEFAULT 3,
  booked_groups INTEGER NOT NULL DEFAULT 0,

  max_guides INTEGER DEFAULT NULL,
  booked_guides INTEGER DEFAULT 0,
  max_vehicles INTEGER DEFAULT NULL,
  booked_vehicles INTEGER DEFAULT 0,

  notes TEXT,
  internal_notes TEXT,
  reason VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_operator_capacity_org    ON operator_capacity(org_id);
CREATE INDEX IF NOT EXISTS idx_operator_capacity_date   ON operator_capacity(date);
CREATE INDEX IF NOT EXISTS idx_operator_capacity_status ON operator_capacity(status);
CREATE INDEX IF NOT EXISTS idx_operator_capacity_range  ON operator_capacity(org_id, date, status);

ALTER TABLE operator_capacity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_capacity_org_all ON operator_capacity;
CREATE POLICY operator_capacity_org_all ON operator_capacity
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

CREATE OR REPLACE FUNCTION update_operator_capacity_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operator_capacity_updated_at ON operator_capacity;
CREATE TRIGGER trg_operator_capacity_updated_at
  BEFORE UPDATE ON operator_capacity
  FOR EACH ROW EXECUTE FUNCTION update_operator_capacity_updated_at();

COMMENT ON TABLE operator_capacity IS 'Per-org per-date capacity (groups/guides/vehicles) for availability checking.';

-- ---------------------------------------------------------------------
-- 2. TOUR DEPARTURES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tour_departures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  template_id  UUID REFERENCES tour_templates(id) ON DELETE SET NULL,
  variation_id UUID REFERENCES tour_variations(id) ON DELETE SET NULL,

  tour_name VARCHAR(255) NOT NULL,
  tour_code VARCHAR(50),
  duration_days INTEGER NOT NULL DEFAULT 1,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  max_pax INTEGER NOT NULL DEFAULT 20,
  booked_pax INTEGER NOT NULL DEFAULT 0,
  min_pax INTEGER DEFAULT 2,

  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'limited', 'full', 'guaranteed', 'cancelled')),

  cutoff_days INTEGER DEFAULT 3,
  is_guaranteed BOOLEAN DEFAULT false,

  price_per_person DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'EUR',

  assigned_guide_id UUID,
  assigned_vehicle_id UUID,

  public_notes TEXT,
  internal_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(org_id, template_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_tour_departures_org      ON tour_departures(org_id);
CREATE INDEX IF NOT EXISTS idx_tour_departures_template ON tour_departures(template_id);
CREATE INDEX IF NOT EXISTS idx_tour_departures_dates    ON tour_departures(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tour_departures_status   ON tour_departures(status);
CREATE INDEX IF NOT EXISTS idx_tour_departures_upcoming ON tour_departures(org_id, start_date, status)
  WHERE status IN ('open', 'limited', 'guaranteed');

ALTER TABLE tour_departures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_departures_org_all ON tour_departures;
CREATE POLICY tour_departures_org_all ON tour_departures
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

CREATE OR REPLACE FUNCTION update_tour_departures_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tour_departures_updated_at ON tour_departures;
CREATE TRIGGER trg_tour_departures_updated_at
  BEFORE UPDATE ON tour_departures
  FOR EACH ROW EXECUTE FUNCTION update_tour_departures_updated_at();

COMMENT ON TABLE tour_departures IS 'Scheduled group tour departures with seat inventory, linked to tour_templates.';
