-- =====================================================
-- ADD B2B PARTNER SUPPORT TO ITINERARIES
-- =====================================================
-- This migration enables itineraries to be linked to B2B partners
-- allowing both template-based and AI-generated itineraries to
-- flow through the same operational pipeline.
-- =====================================================

-- Add partner_id to link itineraries to B2B partners
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES b2b_partners(id) ON DELETE SET NULL;

-- Add source field to track where the itinerary came from
-- Values: 'b2c_direct', 'b2c_whatsapp', 'b2b_template', 'b2b_custom'
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'b2c_direct';

-- Add partner commission tracking
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS partner_commission_percent DECIMAL(5,2) DEFAULT 0;

ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS partner_commission_amount DECIMAL(12,2) DEFAULT 0;

-- Create index for partner lookups
CREATE INDEX IF NOT EXISTS idx_itineraries_partner_id ON itineraries(partner_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_source ON itineraries(source);

-- Add comments for documentation
COMMENT ON COLUMN itineraries.partner_id IS 'B2B partner (travel agency) who requested this itinerary';
COMMENT ON COLUMN itineraries.source IS 'Origin: b2c_direct, b2c_whatsapp, b2b_template, b2b_custom';
COMMENT ON COLUMN itineraries.partner_commission_percent IS 'Commission percentage for the B2B partner';
COMMENT ON COLUMN itineraries.partner_commission_amount IS 'Calculated commission amount for the partner';

-- =====================================================
-- UPDATE BOOKINGS TABLE TO TRACK PARTNER
-- =====================================================

-- Add partner tracking to bookings as well
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES b2b_partners(id) ON DELETE SET NULL;

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS partner_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_bookings_partner_id ON bookings(partner_id);

COMMENT ON COLUMN bookings.partner_id IS 'B2B partner associated with this booking (copied from itinerary)';
COMMENT ON COLUMN bookings.partner_name IS 'Denormalized partner company name for quick access';
