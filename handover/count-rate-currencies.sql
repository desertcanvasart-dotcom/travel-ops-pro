-- Rates entered in a currency other than the company's rate currency.
-- READ-ONLY. Run in Supabase -> SQL Editor (production project).
-- A row with rate_currency NULL is in the company's rate currency (USD for A.T.S).
WITH org AS (
  SELECT COALESCE(NULLIF(upper(trim(rate_currency)), ''), 'EUR') AS org_currency
  FROM organizations WHERE slug = 'ats'
),
rates AS (
            SELECT 'accommodation_rates'    AS rate_table, rate_currency, is_active FROM accommodation_rates
  UNION ALL SELECT 'nile_cruises',            rate_currency, is_active FROM nile_cruises
  UNION ALL SELECT 'transportation_rates',    rate_currency, is_active FROM transportation_rates
  UNION ALL SELECT 'b2b_transport_packages',  rate_currency, is_active FROM b2b_transport_packages
  UNION ALL SELECT 'guide_rates',             rate_currency, is_active FROM guide_rates
  UNION ALL SELECT 'meal_rates',              rate_currency, is_active FROM meal_rates
  UNION ALL SELECT 'entrance_fees',           rate_currency, is_active FROM entrance_fees
  UNION ALL SELECT 'activity_rates',          rate_currency, is_active FROM activity_rates
  UNION ALL SELECT 'tipping_rates',           rate_currency, is_active FROM tipping_rates
  UNION ALL SELECT 'airport_staff_rates',     rate_currency, is_active FROM airport_staff_rates
  UNION ALL SELECT 'hotel_staff_rates',       rate_currency, is_active FROM hotel_staff_rates
  UNION ALL SELECT 'flight_rates',            rate_currency, is_active FROM flight_rates
  UNION ALL SELECT 'train_rates',             rate_currency, is_active FROM train_rates
  UNION ALL SELECT 'sleeping_train_rates',    rate_currency, is_active FROM sleeping_train_rates
  UNION ALL SELECT 'fixed_daily_costs',       rate_currency, is_active FROM fixed_daily_costs
  UNION ALL SELECT 'extras_catalogue',        rate_currency, is_active FROM extras_catalogue
)
SELECT r.rate_table,
       COALESCE(upper(trim(r.rate_currency)), org.org_currency) AS entered_in,
       COALESCE(upper(trim(r.rate_currency)), org.org_currency) <> org.org_currency AS affected,
       count(*) FILTER (WHERE r.is_active IS DISTINCT FROM false) AS active_rows,
       count(*) AS all_rows
FROM rates r CROSS JOIN org
GROUP BY 1, 2, 3
ORDER BY 3 DESC, 1, 2;
-- affected = true: rates entered in another currency than the company's — the ones this work affects.
-- No affected rows means nothing changes until someone enters a rate in another currency.
