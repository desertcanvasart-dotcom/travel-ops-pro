-- =====================================================
-- BOOKINGS MODULE - DATABASE SCHEMA
-- =====================================================
-- Run this migration in Supabase SQL Editor
-- =====================================================

-- 1. Main bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code VARCHAR(20) UNIQUE NOT NULL,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,

  -- Client (denormalized for quick access)
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255),
  client_phone VARCHAR(50),

  -- Trip Details (copied from itinerary at creation)
  trip_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  num_adults INTEGER DEFAULT 1,
  num_children INTEGER DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'EUR',
  tier VARCHAR(20),

  -- Booking Status
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending',
    'supplier_confirmed',
    'payment_received',
    'ready',
    'in_progress',
    'completed',
    'cancelled'
  )),

  -- Payment Tracking
  deposit_amount DECIMAL(12,2) DEFAULT 0,
  deposit_paid BOOLEAN DEFAULT FALSE,
  deposit_paid_date DATE,
  balance_due DECIMAL(12,2) DEFAULT 0,
  payment_deadline DATE,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'deposit_received', 'partial', 'paid', 'refunded'
  )),

  -- Resource Assignment
  assigned_guide_id UUID,
  assigned_vehicle_id UUID,

  -- Operational Details
  emergency_contact VARCHAR(255),
  emergency_phone VARCHAR(50),
  special_requests TEXT,
  operational_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT
);

-- Indexes for bookings
CREATE INDEX IF NOT EXISTS idx_bookings_itinerary_id ON bookings(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings(start_date);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings(booking_code);

-- 2. Supplier status tracking table
CREATE TABLE IF NOT EXISTS booking_supplier_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Supplier Info
  supplier_id UUID,
  supplier_type VARCHAR(50) NOT NULL,
  supplier_name VARCHAR(255) NOT NULL,

  -- Service Details
  service_description TEXT,
  service_date DATE,

  -- Confirmation Status
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending',
    'requested',
    'confirmed',
    'waitlist',
    'rejected',
    'cancelled'
  )),

  -- Confirmation Details
  confirmation_number VARCHAR(100),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmation_notes TEXT,

  -- Contact
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),

  -- Cost
  quoted_cost DECIMAL(12,2),
  confirmed_cost DECIMAL(12,2),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for supplier status
CREATE INDEX IF NOT EXISTS idx_booking_supplier_booking_id ON booking_supplier_status(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_supplier_status ON booking_supplier_status(status);

-- 3. Payment tracking table
CREATE TABLE IF NOT EXISTS booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- Payment Details
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN (
    'deposit', 'partial', 'final', 'refund', 'adjustment'
  )),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Payment Method
  payment_method VARCHAR(30),
  payment_date DATE NOT NULL,

  -- Reference
  transaction_reference VARCHAR(100),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for payments
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_id ON booking_payments(booking_id);

-- 4. Enable RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_supplier_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (allow all for authenticated users - adjust as needed)
CREATE POLICY "Allow all for authenticated users" ON bookings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON booking_supplier_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON booking_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Function to generate booking code
CREATE OR REPLACE FUNCTION generate_booking_code()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  new_code TEXT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(booking_code FROM 10 FOR 4) AS INTEGER)
  ), 0) + 1
  INTO sequence_num
  FROM bookings
  WHERE booking_code LIKE 'BKG-' || year_part || '-%';

  new_code := 'BKG-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;
