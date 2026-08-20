-- ============================================
-- The operator's own high dates
-- ============================================
-- Seasonality already existed here, but only as something suppliers do TO the
-- operator: every hotel and cruise rate row carries its own high/peak windows
-- and its own seasonal cost. Nothing let the operator say "Golden Week sells
-- out, charge more for it".
--
-- That is a different thing and it sits on the other side of the margin. This
-- is a DEMAND PREMIUM: the supplier cost already moved on its own, and this is
-- added on top of the selling price.
--
-- REAL DATES, NOT MONTH-DAY. The supplier windows are month-day and repeat
-- every year, which is fine for a Nile cruise high season. It is useless for
-- Golden Week, Obon or New Year, which move — and the operator plans twelve
-- months ahead, so 2027's dates must be able to differ from 2026's.
--
-- TWO TABLES. A season is a name and a percentage; the dates are a list, because
-- one season is several windows — Obon is one period, New Year is another, and
-- both may be "peak" at the same premium.

CREATE TABLE IF NOT EXISTS pricing_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What the operator calls it: ゴールデンウィーク, お盆, 年末年始.
  name VARCHAR(80) NOT NULL,

  -- Added to the selling price. 15 means +15%. Zero is legitimate — a season
  -- worth naming and watching before deciding to charge for it.
  uplift_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (uplift_percent >= 0 AND uplift_percent <= 200),

  -- For the calendar, so a glance shows which dates are which.
  colour VARCHAR(7) NOT NULL DEFAULT '#647C47',

  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS pricing_season_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES pricing_seasons(id) ON DELETE CASCADE,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Optional, for the operator's own eye: "2027 GW", "お盆 2026".
  label VARCHAR(120),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (end_date >= start_date)
);

-- The lookup is always "which window contains this departure date", so the
-- index leads with the dates.
CREATE INDEX IF NOT EXISTS idx_pricing_season_dates_range
  ON pricing_season_dates(org_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pricing_season_dates_season
  ON pricing_season_dates(season_id);

ALTER TABLE pricing_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_season_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_seasons_org_all ON pricing_seasons;
CREATE POLICY pricing_seasons_org_all ON pricing_seasons
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS pricing_season_dates_org_all ON pricing_season_dates;
CREATE POLICY pricing_season_dates_org_all ON pricing_season_dates
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

COMMENT ON TABLE pricing_seasons IS
  'The operator''s own high dates and what they add to the selling price. A DEMAND premium, applied after margin — distinct from the supplier seasonality already carried on each hotel and cruise rate row.';
COMMENT ON COLUMN pricing_seasons.uplift_percent IS
  'Added to the upliftable selling price. Fixed pass-throughs (tips, entrance fees, and the taxes/visa/insurance that are invoice lines rather than priced services) are never included.';
COMMENT ON TABLE pricing_season_dates IS
  'Real dated windows, not month-day: Golden Week and Obon move each year, and the operator plans twelve months ahead. One season may hold several windows.';
