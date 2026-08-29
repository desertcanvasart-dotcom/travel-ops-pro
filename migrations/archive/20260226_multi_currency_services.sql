-- ============================================
-- Multi-Currency at Transaction Level
-- ============================================
-- Adds per-service currency tracking and exchange rate snapshots.
-- Allows services to be in a different currency than the itinerary.

-- 1. Add columns to itinerary_services for per-service currency tracking
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS supplier_currency text DEFAULT 'EUR';
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS supplier_cost_original numeric;
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS exchange_rate_used numeric;

-- 2. Create exchange_rate_snapshots table for historical rate storage
CREATE TABLE IF NOT EXISTS exchange_rate_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  base_currency text NOT NULL,
  target_currency text NOT NULL,
  rate numeric NOT NULL,
  source text DEFAULT 'frankfurter',
  captured_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies
  ON exchange_rate_snapshots(base_currency, target_currency, captured_at);

-- 3. Backfill existing services: set supplier_currency to 'EUR' and
--    supplier_cost_original to total_cost (since all existing rates are EUR-based)
UPDATE itinerary_services
SET supplier_currency = 'EUR',
    supplier_cost_original = total_cost,
    exchange_rate_used = 1.0
WHERE supplier_currency IS NULL OR supplier_cost_original IS NULL;

-- 4. Add comments for documentation
COMMENT ON COLUMN itinerary_services.supplier_currency IS 'The currency of the original supplier rate (e.g., EUR, EGP, USD)';
COMMENT ON COLUMN itinerary_services.supplier_cost_original IS 'The cost in the supplier''s original currency before conversion';
COMMENT ON COLUMN itinerary_services.exchange_rate_used IS 'The exchange rate used to convert from supplier_currency to itinerary currency';
COMMENT ON TABLE exchange_rate_snapshots IS 'Historical exchange rate snapshots captured at itinerary generation time';
