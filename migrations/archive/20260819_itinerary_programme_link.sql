-- ============================================
-- A customer's trip, and the programme it follows
-- ============================================
-- The 日程表 is generated from a programme (tour_templates), because that is
-- where the office's own Japanese day-by-day text lives. Who is travelling and
-- when they leave live on the trip (itineraries). Nothing joined the two, so
-- the customer name and departure date were typed by hand into a dialog every
-- time a document was generated — retyping, onto a document sent to that exact
-- person, facts the database already held.
--
-- tour_departures was NOT the place for this link: it is scheduled-group seat
-- inventory, UNIQUE(org_id, template_id, start_date), so one row is shared by
-- every customer on that date. A bespoke trip needs its own reference.
--
-- Nullable on purpose. Most itineraries are assembled from scratch rather than
-- taken from a programme, and those keep working exactly as before — they
-- simply have no 日程表 to generate.

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES tour_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_itineraries_template ON itineraries(template_id);

COMMENT ON COLUMN itineraries.template_id IS
  'The programme (tour_templates) this trip follows, when it follows one. Lets the 日程表 be generated from the trip: programme text from the template, customer name and dates from the itinerary. NULL for bespoke itineraries built from scratch.';
