-- ============================================
-- DEPARTMENTS TABLE + SEED DATA
-- Run this in Supabase SQL Editor
-- ============================================

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  service_types TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the 4 departments
INSERT INTO departments (name, description, service_types) VALUES
  ('Reservation', 'Hotels, cruises, restaurants, vehicles & transport', ARRAY['accommodation', 'cruise', 'meal', 'transportation']),
  ('Aviation', 'Flight ticket bookings', ARRAY['flight']),
  ('Execution', 'Guides, entrance tickets, airport services, airport transfers, hotel porterage', ARRAY['guide', 'entrance', 'airport_service', 'hotel_service']),
  ('Accounting', 'Invoices, payments, commissions', ARRAY['invoice', 'payment', 'commission'])
ON CONFLICT (name) DO NOTHING;

-- Add department_id to team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

-- Add department_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

-- Index for looking up team members by department
CREATE INDEX IF NOT EXISTS idx_team_members_department ON team_members(department_id) WHERE department_id IS NOT NULL;

-- Index for looking up tasks by department
CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id) WHERE department_id IS NOT NULL;

-- RLS policies for departments (allow authenticated users to read)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access to departments"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role full access to departments"
  ON departments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
