-- ============================================
-- Rate Audit Trail
-- Tracks all changes to rate tables with before/after values
-- ============================================

-- 1. Create the audit log table
CREATE TABLE IF NOT EXISTS rate_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields jsonb,        -- { field: { old: X, new: Y } }
  full_old_record jsonb,       -- entire row before change
  full_new_record jsonb,       -- entire row after change
  changed_by uuid,             -- user_id from auth.uid()
  changed_at timestamptz DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_rate_audit_table_record ON rate_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_rate_audit_changed_at ON rate_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_audit_table_name ON rate_audit_log(table_name);

COMMENT ON TABLE rate_audit_log IS 'Audit trail for all rate table changes — captures old/new values, changed fields, and actor';

-- 2. Generic audit trigger function
CREATE OR REPLACE FUNCTION fn_rate_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_old_record jsonb;
  v_new_record jsonb;
  v_changed_fields jsonb := '{}';
  v_record_id uuid;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
BEGIN
  -- Determine record ID and build JSONB representations
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
    v_record_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE -- UPDATE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;

    -- Compute diff: only fields that actually changed
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      -- Skip metadata fields from diff (they always change)
      IF v_key IN ('updated_at', 'created_at') THEN
        CONTINUE;
      END IF;

      v_old_val := v_old_record -> v_key;
      v_new_val := v_new_record -> v_key;

      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old_val, 'new', v_new_val)
        );
      END IF;
    END LOOP;

    -- Skip logging if nothing actually changed (e.g., save without edits)
    IF v_changed_fields = '{}' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Insert audit record
  INSERT INTO rate_audit_log (table_name, record_id, action, changed_fields, full_old_record, full_new_record, changed_by)
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    CASE WHEN v_changed_fields = '{}' THEN NULL ELSE v_changed_fields END,
    v_old_record,
    v_new_record,
    auth.uid()
  );

  -- Return appropriate row
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger to all rate tables
-- Each trigger fires AFTER INSERT/UPDATE/DELETE

DO $$
DECLARE
  rate_tables text[] := ARRAY[
    'accommodation_rates',
    'transportation_rates',
    'guide_rates',
    'meal_rates',
    'entrance_fees',
    'flight_rates',
    'activity_rates',
    'tipping_rates',
    'airport_staff_rates',
    'hotel_staff_rates',
    'nile_cruises',
    'train_rates',
    'sleeping_train_rates'
  ];
  tbl text;
  trigger_name text;
BEGIN
  FOREACH tbl IN ARRAY rate_tables
  LOOP
    trigger_name := 'trg_audit_' || tbl;

    -- Drop if exists to make this idempotent
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, tbl);

    -- Create the trigger
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_rate_audit_trigger()',
      trigger_name,
      tbl
    );

    RAISE NOTICE 'Created audit trigger on %', tbl;
  END LOOP;
END $$;

-- 4. Add missing updated_at columns to tables that lack them
-- (guide_rates, tipping_rates, airport_staff_rates, hotel_staff_rates, nile_cruises, train_rates, sleeping_train_rates)

DO $$
DECLARE
  tables_needing_updated_at text[] := ARRAY[
    'guide_rates',
    'tipping_rates',
    'airport_staff_rates',
    'hotel_staff_rates',
    'nile_cruises',
    'train_rates',
    'sleeping_train_rates'
  ];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY tables_needing_updated_at
  LOOP
    -- Add column if it doesn't exist
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()',
      tbl
    );
    RAISE NOTICE 'Ensured updated_at column on %', tbl;
  END LOOP;
END $$;

-- 5. Enable RLS on rate_audit_log (read-only for authenticated users)
ALTER TABLE rate_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit log"
  ON rate_audit_log FOR SELECT
  TO authenticated
  USING (true);

-- Only the trigger function (SECURITY DEFINER) can insert
CREATE POLICY "Only system can insert audit log"
  ON rate_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (false);
