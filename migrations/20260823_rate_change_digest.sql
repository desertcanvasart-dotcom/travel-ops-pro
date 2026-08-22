-- ============================================
-- Rate-change alerts: who changed it, and a digest for managers
-- ============================================
-- rate_audit_log.changed_by has been NULL on every row: the API writes rate
-- tables with the service-role key, so auth.uid() is NULL inside the
-- trigger. The app now sends the verified user in an `x-tops-actor` request
-- header (lib/supabase-actor.ts); PostgREST exposes request headers to SQL
-- as current_setting('request.headers'), so the trigger can read it. A real
-- auth.uid() still wins when present.
--
-- Plus: a watermark table for cron digests, and the org's alert preference.
-- ============================================

CREATE OR REPLACE FUNCTION fn_rate_audit_actor()
RETURNS uuid AS $$
DECLARE
  v_hdr text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN auth.uid();
  END IF;
  v_hdr := current_setting('request.headers', true)::json ->> 'x-tops-actor';
  IF v_hdr IS NOT NULL AND v_hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_hdr::uuid;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- A malformed header must never abort the rate write itself.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

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
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
    v_record_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);
    v_record_id := NEW.id;
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
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
    IF v_changed_fields = '{}' THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO rate_audit_log (table_name, record_id, action, changed_fields, full_old_record, full_new_record, changed_by)
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    CASE WHEN v_changed_fields = '{}' THEN NULL ELSE v_changed_fields END,
    v_old_record,
    v_new_record,
    fn_rate_audit_actor()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Where each scheduled digest last looked. One row per job.
CREATE TABLE IF NOT EXISTS public.cron_watermarks (
  job text PRIMARY KEY,
  last_run_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_watermarks ENABLE ROW LEVEL SECURITY;
-- service role only; no policies on purpose.

-- The org's choice: tell managers about rate changes in the app, also by
-- e-mail, or not at all.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS rate_change_alerts text NOT NULL DEFAULT 'in_app';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_rate_change_alerts_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_rate_change_alerts_check
      CHECK (rate_change_alerts IN ('off', 'in_app', 'in_app_email'));
  END IF;
END $$;
COMMENT ON COLUMN public.organizations.rate_change_alerts IS
  'Rate-change digest for owners/admins/managers: off | in_app | in_app_email. Sent by /api/cron/rate-change-digest.';
