-- ============================================
-- Travel insurance: the plans, and what they cost
-- ============================================
-- A.T.S send the 海外旅行参加申込書 with the トラベルセーフティプラン加入申込書
-- attached. The traveller picks one of four plan codes (HC/HD/HE/HF) and the
-- premium follows from that code AND the length of the trip — a grid of 4 plans
-- × 14 duration bands, published yearly by 海外渡航者安全事業共済会.
--
-- Today that grid lives only on a scanned PDF, and their invoice tells the
-- customer to work it out themselves: "海外旅行傷害保険のご加入をご希望の場合は、
-- 保険料を加算してご入金下さい". This table is what lets the system quote the
-- premium instead of asking the customer to.
--
-- TWO TABLES, NOT ONE. The plan is what is being bought (and its cover amounts
-- go on the customer's paperwork); the premium is what it costs this year for
-- this trip length. Rates are reissued annually — a new year is new premium
-- rows against the same plans, so a booking made last year can still be
-- explained by the rates that applied when it was made.
--
-- ORG-SCOPED because this app is sold to more than one operator, and another
-- operator's insurer is not this one.

CREATE TABLE IF NOT EXISTS insurance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- The code the traveller writes on the form: HC, HD, HE, HF.
  plan_code VARCHAR(10) NOT NULL,
  provider VARCHAR(255) NOT NULL DEFAULT '海外渡航者安全事業共済会',
  product_name VARCHAR(255) NOT NULL DEFAULT 'トラベルセーフティプラン',

  -- 共済金額 — the cover, in JPY. Printed on the customer's copy, never used in
  -- arithmetic, so stored as given rather than reduced to a number.
  cover_accidental_death BIGINT,      -- 傷害死亡・後遺障害
  cover_illness_death BIGINT,         -- 疾病死亡
  cover_treatment_rescue BIGINT,      -- 治療・救援者費用
  cover_liability BIGINT,             -- 賠償責任
  cover_baggage BIGINT,               -- 携行品
  cover_baggage_delay BIGINT,         -- 航空機寄託手荷物遅延
  cover_flight_delay BIGINT,          -- 航空機遅延

  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, plan_code)
);

-- 掛金表. One row per (plan, duration band, rate year).
--
-- max_days is the TOP of the band — the published table reads "3日まで",
-- "4日まで", "6日まで", so the premium for a trip is the cheapest row whose
-- max_days is >= the trip length. Bands are not contiguous by one day and the
-- gaps are deliberate: a 5-day trip pays the 6日まで rate.
CREATE TABLE IF NOT EXISTS insurance_premiums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES insurance_plans(id) ON DELETE CASCADE,

  -- Which published table this row came from. 2025 rates stay readable after
  -- the 2026 sheet lands.
  rate_year INTEGER NOT NULL,

  max_days INTEGER NOT NULL CHECK (max_days > 0),
  band_label VARCHAR(30) NOT NULL,     -- as printed: 「11日まで」「3ヵ月まで」

  -- JPY, and JPY only. The published grid is yen; converting it would invent a
  -- precision the insurer never quoted. Includes the NPO 会費 (50円) and the
  -- 出資金 (50円), exactly as the published table does.
  premium_jpy INTEGER NOT NULL CHECK (premium_jpy >= 0),

  -- 「28日まで」から「3ヶ月まで」の期間については、満69歳までの方が申込みいただけます。
  -- Longer bands are age-restricted; the shorter ones are not.
  max_age INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (plan_id, rate_year, max_days)
);

CREATE INDEX IF NOT EXISTS idx_insurance_premiums_lookup
  ON insurance_premiums(org_id, rate_year, max_days);

ALTER TABLE insurance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_premiums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_plans_org_all ON insurance_plans;
CREATE POLICY insurance_plans_org_all ON insurance_plans
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

DROP POLICY IF EXISTS insurance_premiums_org_all ON insurance_premiums;
CREATE POLICY insurance_premiums_org_all ON insurance_premiums
  FOR ALL USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));

COMMENT ON TABLE insurance_plans IS
  'Travel insurance plans a traveller can choose on the 申込書 (HC/HD/HE/HF for A.T.S). Cover amounts are JPY, for printing on the customer copy.';
COMMENT ON TABLE insurance_premiums IS
  '掛金表: premium in JPY by plan and trip length, per published rate year. max_days is the TOP of the band — a trip takes the cheapest row whose max_days >= its length.';
COMMENT ON COLUMN insurance_premiums.max_age IS
  'Age ceiling for this band. The published 2025 table restricts 28日まで and longer to 満69歳まで; shorter bands are unrestricted (NULL).';

-- ============================================
-- What the traveller answers on the insurance application
-- ============================================
-- The 申込書 already had somewhere to record identity, passport, address and
-- 保険希望 yes/no — booking_passengers carries all of it. What it had nowhere
-- for is the 加入申込書 itself: which plan, and the 告知事項 the insurer
-- requires with it.
--
-- HEALTH INFORMATION. insurance_under_treatment / insurance_disability and
-- their detail columns are medical facts about a named person — a different
-- class of data from a passport number, and the reason this block is called
-- out rather than folded in silently. They are reachable only through the
-- portal's own token behind the confirmation gate, and every read of this table
-- is service-role and server-side. Whoever writes the customer-facing privacy
-- notice needs to know these columns exist.
ALTER TABLE booking_passengers
  ADD COLUMN IF NOT EXISTS insurance_application_date DATE,

  -- 告知事項 ●目的
  ADD COLUMN IF NOT EXISTS insurance_purpose VARCHAR(20)
    CHECK (insurance_purpose IS NULL OR insurance_purpose IN
      ('sightseeing', 'business', 'study', 'pilot_licence', 'other')),
  ADD COLUMN IF NOT EXISTS insurance_purpose_other TEXT,

  -- ●旅行中に危険なお仕事や運動などをなさいますか
  ADD COLUMN IF NOT EXISTS insurance_hazardous BOOLEAN,
  ADD COLUMN IF NOT EXISTS insurance_hazardous_detail TEXT,

  -- ●現在ケガや病気で医師の治療を受けていますか
  ADD COLUMN IF NOT EXISTS insurance_under_treatment BOOLEAN,
  ADD COLUMN IF NOT EXISTS insurance_treatment_detail TEXT,

  -- ●身体に障害がありますか
  ADD COLUMN IF NOT EXISTS insurance_disability BOOLEAN,
  ADD COLUMN IF NOT EXISTS insurance_disability_detail TEXT,

  -- ●下記のいずれかの保険にご加入なさっていますか（生命保険は除く）
  ADD COLUMN IF NOT EXISTS insurance_other_policy BOOLEAN,
  ADD COLUMN IF NOT EXISTS insurance_other_policy_kinds TEXT[],   -- 普通傷害 / 海外旅行傷害 / その他
  ADD COLUMN IF NOT EXISTS insurance_other_policy_insurer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS insurance_other_policy_death_benefit BIGINT,

  -- What the choice costs. Resolved from insurance_premiums when the traveller
  -- picks a plan, and STORED — a rate table reissued next year must not change
  -- what somebody was quoted this year. premium_id records which row it came
  -- from, so the figure can always be explained.
  ADD COLUMN IF NOT EXISTS insurance_premium_jpy INTEGER,
  ADD COLUMN IF NOT EXISTS insurance_premium_id UUID REFERENCES insurance_premiums(id) ON DELETE SET NULL,

  -- The office's confirmation. A traveller choosing a plan is a request, not a
  -- charge: nothing reaches an invoice until somebody here confirms it, which
  -- is also what 領収金額合計 means on the paper form — the office's figure.
  ADD COLUMN IF NOT EXISTS insurance_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insurance_confirmed_by UUID;

COMMENT ON COLUMN booking_passengers.insurance_plan_code IS
  'The plan the traveller asked for (HC/HD/HE/HF). A request until insurance_confirmed_at is set.';
COMMENT ON COLUMN booking_passengers.insurance_premium_jpy IS
  'JPY premium resolved when the plan was chosen, stored rather than recomputed so a reissued rate table cannot rewrite an existing quote.';
COMMENT ON COLUMN booking_passengers.insurance_under_treatment IS
  'HEALTH DATA (告知事項). See the migration header before exposing this anywhere new.';
