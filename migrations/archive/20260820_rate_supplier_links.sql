-- ============================================
-- Who provides an airport or hotel service
-- ============================================
-- The rate rows for airport meet-and-assist and hotel assistance could not name
-- a supplier: hotel_staff_rates had no supplier column at all, and
-- airport_staff_rates had only a free-text `supplier_name` — a label with
-- nothing behind it, so the rate could not be reached from the supplier, the
-- supplier could not be reached from the rate, and two spellings of one company
-- were two companies.
--
-- train_rates and sleeping_train_rates already had supplier_id; they get the
-- picker in the same change, no schema needed here.
--
-- Nullable on purpose: a rate whose provider nobody has recorded yet is normal,
-- and forcing a value would mean inventing one. ON DELETE SET NULL because
-- removing a supplier must not silently take the operator's prices with it.

ALTER TABLE airport_staff_rates
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE hotel_staff_rates
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_supplier ON airport_staff_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_supplier ON hotel_staff_rates(supplier_id);

COMMENT ON COLUMN airport_staff_rates.supplier_id IS
  'The airport assistant (or company) this rate is bought from. Part of the natural key the save path dedups on: two suppliers may quote the same airport and service, and without this the second overwrites the first.';
COMMENT ON COLUMN hotel_staff_rates.supplier_id IS
  'The hotel assistant (or company) this rate is bought from. Part of the natural key the save path dedups on.';
