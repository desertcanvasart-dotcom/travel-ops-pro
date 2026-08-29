-- ============================================
-- What a quote was charged for the season
-- ============================================
-- A saved quote prints cost, margin and selling price stacked on the detail
-- page. With the operator's seasonal premium inside the selling price, those
-- three no longer add up — the reader sees a gap and nothing that explains it.
--
-- So the quote records what it charged: the season's name, its percentage, and
-- the money. total_cost + margin_amount + season_uplift_amount = selling_price
-- again, and a quote from last April can still say why it cost what it did even
-- if the calendar has been edited since.
--
-- Both quote tables, because a departure is priced the same way whoever it is
-- sold to. Additive and nullable: an ordinary date leaves all three NULL/0.

ALTER TABLE tour_quotes
  ADD COLUMN IF NOT EXISTS season_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS season_uplift_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_uplift_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE b2c_quotes
  ADD COLUMN IF NOT EXISTS season_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS season_uplift_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_uplift_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN tour_quotes.season_name IS
  'The operator season this departure fell in when the quote was made, or NULL for an ordinary date. A NAME, not a guess from the month — the column tour_quotes.season used to hold low/high/peak from a hardcoded month map that priced nothing.';
COMMENT ON COLUMN tour_quotes.season_uplift_amount IS
  'The demand premium inside selling_price. total_cost + margin_amount + season_uplift_amount = selling_price.';
COMMENT ON COLUMN b2c_quotes.season_uplift_amount IS
  'The demand premium inside selling_price. total_cost + margin_amount + season_uplift_amount = selling_price.';

-- The premium no longer exempts tips and entrance fees: the engine already
-- applies the operator's margin to both, so exempting them from the premium
-- alone was half a rule. Keep the column comment honest.
COMMENT ON COLUMN pricing_seasons.uplift_percent IS
  'Added to the whole selling price of the tour, tips and entrance fees included. Airport tax, visa and insurance are invoice lines rather than priced services and are outside the engine entirely.';
