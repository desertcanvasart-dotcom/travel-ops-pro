-- ============================================
-- Four supplier types the operator actually buys from
-- ============================================
-- The vocabulary had one bucket for everything that moves people ('transport')
-- and nothing at all for the people who meet them. So a train company, an
-- airline and the assistant who walks a client through Cairo airport were all
-- filed as 'transport' or left out — and the rate screens that price exactly
-- those services (trains, sleeping trains, flights, airport services, hotel
-- services) had no matching supplier type to link to.
--
--   train_operator     — a railway company (ENR, Abela) rather than a car firm
--   air_carrier        — an airline, for the domestic flight rates
--   airport_assistant  — the person who meets the client airside
--   hotel_assistant    — the person stationed at the hotel
--
-- The last two are PEOPLE more often than firms, which is what suppliers.
-- entity_kind = 'individual' already exists to record; nothing here forces it.
--
-- Additive only: every value previously allowed is still allowed, and no row
-- changes. Rows already filed as 'transport' stay put — reclassifying Abela
-- Sleeping Trains is the operator's call, not a migration's.

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_type_check;

ALTER TABLE suppliers ADD CONSTRAINT suppliers_type_check
  CHECK (type IN (
    'hotel',
    'transport',
    'local_operator',
    'driver',
    'guide',
    'cruise',
    'activity_provider',
    'attraction',
    'tour_operator',
    'ground_handler',
    'restaurant',
    'shop',
    -- added 2026-08-20
    'train_operator',
    'air_carrier',
    'airport_assistant',
    'hotel_assistant',
    'other'
  ));

COMMENT ON COLUMN suppliers.type IS
  'What this supplier sells. Drives the rate screens'' supplier pickers and the guides view (suppliers where type = ''guide''). Extend by migration — the CHECK is the vocabulary.';
