--
-- ============================================================
-- BASELINE SCHEMA — the origin these migrations never had
-- ============================================================
-- T3 of docs/plans/self-hosting.md. Generated 2026-08-29 from the production
-- database with:
--
--   pg_dump --schema-only --schema=public --no-owner --no-privileges \
--           --no-comments --exclude-table=copilot_knowledge
--
-- then transformed (see the PR that added this file):
--   1. psql meta-commands (\restrict / \unrestrict) stripped — not SQL
--   2. CREATE SCHEMA public made IF NOT EXISTS
--   3. SET transaction_timeout dropped — PG17+ only
--   4. match_copilot_knowledge removed — typed on public.vector
--
-- WHY THIS EXISTS. The 125 files now in migrations/archive/ were written
-- against a database that already existed. 114 of the 177 objects in
-- production were never created by any of them: there is no CREATE TABLE
-- anywhere for itineraries, clients, invoices, payments or suppliers. Replaying
-- them from nothing applied 17 of 125. They are a change log, not a schema.
--
-- This file IS the schema. A fresh install runs this and then only migrations
-- added after it. The archive is history: kept so an old database can still be
-- understood, never replayed again.
--
-- THE pgvector OBJECTS ARE NOT HERE. copilot_knowledge, its HNSW index and
-- match_copilot_knowledge stay the property of
-- archive/20260628_copilot_knowledge_rag.sql, which still creates them on a
-- real Supabase project. They are excluded so this file replays anywhere
-- without pgvector.
--
-- schema_migrations IS NOT IN THIS FILE, deliberately. It belongs to the
-- migration RUNNER, not to the application, and the runner creates it before
-- applying anything (TRACKER_BOOTSTRAP in scripts/migrate-core.mjs). It was in
-- the original dump only because production had already been baselined when
-- the dump was taken — so a genuine from-scratch install died on
-- `relation "schema_migrations" already exists`. Found by standing one up.
--
-- ON AN EXISTING DATABASE THIS MUST BE RECORDED, NOT RUN. It is not idempotent
-- — it is a dump, full of bare CREATE TABLE. The runner refuses to apply it to
-- a database that already has the schema and tells you to use --baseline
-- instead. That refusal is tested.
--

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

-- Wrapped in a transaction so a failure leaves NOTHING behind.
-- pg_dump does not do this itself (it is a psql --single-transaction flag), and
-- without it a partial apply left a half-built database that then tripped the
-- runner's own baseline guard: "this database already has the schema".
BEGIN;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: package_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.package_type_enum AS ENUM (
    'day-trips',
    'tours-only',
    'land-package',
    'full-package',
    'cruise-land',
    'shore-excursions',
    'cruise-package'
);


--
-- Name: activity_log_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_log_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only';
END $$;


--
-- Name: airport_staff_view_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.airport_staff_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers
  SET types = array_remove(types, 'airport_assistant'),
      type = CASE WHEN type = 'airport_assistant'
                  THEN (array_remove(types, 'airport_assistant'))[1]
                  ELSE type END,
      updated_at = now()
  WHERE id = OLD.id;
  DELETE FROM public.suppliers WHERE id = OLD.id AND (types IS NULL OR cardinality(types) = 0);
  RETURN OLD;
END $$;


--
-- Name: airport_staff_view_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.airport_staff_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, name, type, types, entity_kind, status, service_role, airport_location,
    contact_phone, whatsapp, contact_email, languages, shift_times, notes,
    emergency_contact_name, tier, is_preferred, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.name, 'airport_assistant',
    ARRAY['airport_assistant'], 'individual',
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.role, NEW.airport_location, NEW.phone, NEW.whatsapp, NEW.email,
    NEW.languages, NEW.shift_times, NEW.notes, NEW.emergency_contact,
    NEW.tier, COALESCE(NEW.is_preferred, false),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;


--
-- Name: airport_staff_view_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.airport_staff_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                   = NEW.name,
    service_role           = NEW.role,
    airport_location       = NEW.airport_location,
    contact_phone          = NEW.phone,
    whatsapp               = NEW.whatsapp,
    contact_email          = NEW.email,
    languages              = NEW.languages,
    shift_times            = NEW.shift_times,
    notes                  = NEW.notes,
    emergency_contact_name = NEW.emergency_contact,
    tier                   = NEW.tier,
    is_preferred           = NEW.is_preferred,
    status                 = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    updated_at             = now()
  WHERE id = OLD.id AND 'airport_assistant' = ANY(types);
  RETURN NEW;
END $$;


--
-- Name: assign_conversation(uuid, uuid, uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_conversation(p_conversation_id uuid, p_agent_id uuid, p_assigned_by uuid DEFAULT NULL::uuid, p_action_type character varying DEFAULT 'assigned'::character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  old_agent_id UUID;
BEGIN
  -- Get current agent
  SELECT assigned_agent_id INTO old_agent_id
  FROM whatsapp_conversations
  WHERE id = p_conversation_id;
  
  -- Decrement old agent's count
  IF old_agent_id IS NOT NULL THEN
    UPDATE sales_agents 
    SET current_conversations = GREATEST(0, current_conversations - 1)
    WHERE id = old_agent_id;
  END IF;
  
  -- Update conversation
  UPDATE whatsapp_conversations
  SET 
    assigned_agent_id = p_agent_id,
    assigned_at = NOW(),
    updated_at = NOW()
  WHERE id = p_conversation_id;
  
  -- Increment new agent's count and update last_assigned_at
  IF p_agent_id IS NOT NULL THEN
    UPDATE sales_agents 
    SET 
      current_conversations = current_conversations + 1,
      last_assigned_at = NOW()
    WHERE id = p_agent_id;
  END IF;
  
  -- Log activity
  INSERT INTO conversation_activity (conversation_id, agent_id, action_type, action_details)
  VALUES (
    p_conversation_id, 
    p_agent_id, 
    p_action_type,
    jsonb_build_object(
      'assigned_by', p_assigned_by,
      'previous_agent_id', old_agent_id
    )
  );
  
  RETURN true;
END;
$$;


--
-- Name: audit_trigger_func(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trigger_func() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_action VARCHAR(50);
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_data := to_jsonb(NEW);
    PERFORM log_audit(v_action, TG_TABLE_NAME, NEW.id, NULL, v_new_data);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    PERFORM log_audit(v_action, TG_TABLE_NAME, NEW.id, v_old_data, v_new_data);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old_data := to_jsonb(OLD);
    PERFORM log_audit(v_action, TG_TABLE_NAME, OLD.id, v_old_data, NULL);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;


--
-- Name: auto_link_client_to_itinerary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_link_client_to_itinerary() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  matched UUID;
  n INT;
BEGIN
  -- The application knows which client it meant. Keep it.
  IF NEW.client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- By email: the key the CRM treats as identifying.
  IF NEW.client_email IS NOT NULL AND btrim(NEW.client_email) <> '' THEN
    SELECT id, COUNT(*) OVER () INTO matched, n
    FROM clients
    WHERE lower(btrim(email)) = lower(btrim(NEW.client_email))
    LIMIT 1;
    IF n = 1 THEN
      NEW.client_id := matched;
      RETURN NEW;
    END IF;
  END IF;

  -- By full name, only when it names exactly one client. Two "Ahmed Ali"s
  -- must not be linked to whichever LIMIT 1 happened to return.
  IF NEW.client_name IS NOT NULL AND btrim(NEW.client_name) <> '' THEN
    SELECT id, COUNT(*) OVER () INTO matched, n
    FROM clients
    WHERE lower(btrim(concat_ws(' ', first_name, last_name))) = lower(btrim(NEW.client_name))
    LIMIT 1;
    IF n = 1 THEN
      NEW.client_id := matched;
    END IF;
  END IF;

  RETURN NEW;
END $$;


--
-- Name: auto_link_email_to_client(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_link_email_to_client() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    matched_client RECORD;
BEGIN
    -- Only if client_id is null and client_email is provided
    IF NEW.client_id IS NULL AND NEW.client_email IS NOT NULL THEN
        SELECT id, CONCAT(first_name, ' ', last_name) AS full_name
        INTO matched_client
        FROM clients
        WHERE LOWER(email) = LOWER(NEW.client_email)
        LIMIT 1;

        IF matched_client.id IS NOT NULL THEN
            NEW.client_id := matched_client.id;
            NEW.client_name := matched_client.full_name;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: bump_whatsapp_conversation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_whatsapp_conversation(p_conversation_id uuid, p_last_message text) RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE public.whatsapp_conversations
     SET last_message    = p_last_message,
         last_message_at = NOW(),
         -- COALESCE: the column is nullable on older rows, and NULL + 1 is NULL.
         unread_count    = COALESCE(unread_count, 0) + 1,
         updated_at      = NOW()
   WHERE id = p_conversation_id;
$$;


--
-- Name: calculate_next_reminder_date(date, integer, timestamp without time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_next_reminder_date(p_due_date date, p_reminder_count integer, p_last_reminder_sent timestamp without time zone) RETURNS date
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_next_date DATE;
  v_days_overdue INTEGER;
BEGIN
  -- If no due date, no reminder
  IF p_due_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_days_overdue := CURRENT_DATE - p_due_date;
  
  -- Before due date
  IF v_days_overdue < -7 THEN
    v_next_date := p_due_date - 7;
  ELSIF v_days_overdue < -3 THEN
    v_next_date := p_due_date - 3;
  ELSIF v_days_overdue < 0 THEN
    v_next_date := p_due_date;
  -- On or after due date
  ELSIF v_days_overdue < 7 THEN
    v_next_date := p_due_date + 7;
  ELSIF v_days_overdue < 14 THEN
    v_next_date := p_due_date + 14;
  ELSIF v_days_overdue < 30 THEN
    v_next_date := p_due_date + 30;
  ELSE
    -- After 30 days, remind every 14 days
    v_next_date := COALESCE(p_last_reminder_sent::DATE, CURRENT_DATE) + 14;
  END IF;
  
  -- Don't set reminder in the past
  IF v_next_date < CURRENT_DATE THEN
    v_next_date := CURRENT_DATE;
  END IF;
  
  RETURN v_next_date;
END;
$$;


--
-- Name: cleanup_old_audit_logs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_audit_logs(days_to_keep integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: create_b2c_quote_revision(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_b2c_quote_revision(p_quote_id uuid, p_changed_by uuid DEFAULT NULL::uuid, p_change_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_quote b2c_quotes%ROWTYPE;
  v_version_number INTEGER;
  v_revision_id UUID;
  v_prev JSONB;
  v_diff JSONB;
BEGIN
  SELECT * INTO v_quote FROM b2c_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'B2C quote not found: %', p_quote_id; END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
    FROM quote_revisions WHERE quote_type = 'b2c' AND quote_id = p_quote_id;

  SELECT quote_data INTO v_prev FROM quote_revisions
   WHERE quote_type = 'b2c' AND quote_id = p_quote_id
   ORDER BY version_number DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_diff := jsonb_build_object(
      'status_changed',        (v_prev->>'status')        IS DISTINCT FROM v_quote.status,
      'selling_price_changed', (v_prev->>'selling_price')::numeric IS DISTINCT FROM v_quote.selling_price,
      'margin_changed',        (v_prev->>'margin_percent')::numeric IS DISTINCT FROM v_quote.margin_percent
    );
  END IF;

  UPDATE quote_revisions SET is_current = false
   WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND is_current = true;

  INSERT INTO quote_revisions (quote_type, quote_id, version_number, is_current, quote_data, changed_by, change_reason, changes_diff)
  VALUES ('b2c', p_quote_id, v_version_number, true, to_jsonb(v_quote), p_changed_by, p_change_reason, v_diff)
  RETURNING id INTO v_revision_id;

  UPDATE b2c_quotes SET version = v_version_number, last_modified_by = p_changed_by, last_modified_at = NOW()
   WHERE id = p_quote_id;

  RETURN v_revision_id;
END;
$$;


--
-- Name: create_quote_revision(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_quote_revision(p_quote_id uuid, p_changed_by uuid DEFAULT NULL::uuid, p_change_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_quote tour_quotes%ROWTYPE;
  v_version_number INTEGER;
  v_revision_id UUID;
  v_prev JSONB;
  v_diff JSONB;
BEGIN
  SELECT * INTO v_quote FROM tour_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found: %', p_quote_id; END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
    FROM quote_revisions WHERE quote_type = 'b2b' AND quote_id = p_quote_id;

  SELECT quote_data INTO v_prev FROM quote_revisions
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id
   ORDER BY version_number DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_diff := jsonb_build_object(
      'status_changed',        (v_prev->>'status')        IS DISTINCT FROM v_quote.status,
      'selling_price_changed', (v_prev->>'selling_price')::numeric IS DISTINCT FROM v_quote.selling_price,
      'total_cost_changed',    (v_prev->>'total_cost')::numeric    IS DISTINCT FROM v_quote.total_cost,
      'margin_changed',        (v_prev->>'margin_percent')::numeric IS DISTINCT FROM v_quote.margin_percent
    );
  END IF;

  UPDATE quote_revisions SET is_current = false
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id AND is_current = true;

  INSERT INTO quote_revisions (quote_type, quote_id, version_number, is_current, quote_data, changed_by, change_reason, changes_diff)
  VALUES ('b2b', p_quote_id, v_version_number, true, to_jsonb(v_quote), p_changed_by, p_change_reason, v_diff)
  RETURNING id INTO v_revision_id;

  UPDATE tour_quotes SET version = v_version_number, last_modified_by = p_changed_by, last_modified_at = NOW()
   WHERE id = p_quote_id;

  RETURN v_revision_id;
END;
$$;


--
-- Name: delete_client_safely(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_client_safely(client_uuid uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  itinerary_count INT;
  invoice_count INT;
BEGIN
  -- Check for itineraries
  SELECT COUNT(*) INTO itinerary_count 
  FROM itineraries WHERE client_id = client_uuid;
  
  IF itinerary_count > 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Client has ' || itinerary_count || ' itinerary(ies). Please delete or reassign them first.'
    );
  END IF;
  
  -- Check for invoices (if table exists)
  BEGIN
    SELECT COUNT(*) INTO invoice_count 
    FROM invoices WHERE client_id = client_uuid;
    
    IF invoice_count > 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Client has ' || invoice_count || ' invoice(s). Please delete or reassign them first.'
      );
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- invoices table doesn't exist, continue
    NULL;
  END;
  
  -- Delete related records that can be safely deleted
  DELETE FROM follow_ups WHERE client_id = client_uuid;
  DELETE FROM whatsapp_messages WHERE conversation_id IN (
    SELECT id FROM whatsapp_conversations WHERE client_id = client_uuid
  );
  DELETE FROM whatsapp_conversations WHERE client_id = client_uuid;
  
  -- Delete the client
  DELETE FROM clients WHERE id = client_uuid;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Client deleted successfully'
  );
END;
$$;


--
-- Name: extract_template_placeholders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.extract_template_placeholders() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  placeholder_array TEXT[];
  matches TEXT[];
BEGIN
  -- Extract all {{placeholder}} patterns from content and subject
  SELECT array_agg(DISTINCT m[1])
  INTO placeholder_array
  FROM regexp_matches(
    COALESCE(NEW.content, '') || ' ' || COALESCE(NEW.subject, ''),
    '\{\{\s*(\w+)\s*\}\}',
    'g'
  ) AS m;
  
  NEW.placeholders := COALESCE(placeholder_array, '{}');
  RETURN NEW;
END;
$$;


--
-- Name: fn_rate_audit_actor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_rate_audit_actor() RETURNS uuid
    LANGUAGE plpgsql STABLE
    AS $_$
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
$_$;


--
-- Name: fn_rate_audit_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_rate_audit_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: generate_booking_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_booking_code() RETURNS text
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: generate_client_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_client_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  next_number INTEGER;
  new_code VARCHAR(20);
BEGIN
  -- Get the next number by counting existing clients
  SELECT COUNT(*) + 1 INTO next_number FROM clients;
  
  -- Generate code like CLI-001, CLI-002, etc.
  new_code := 'CLI-' || LPAD(next_number::TEXT, 4, '0');
  
  -- Ensure uniqueness (in case of parallel inserts)
  WHILE EXISTS (SELECT 1 FROM clients WHERE client_code = new_code) LOOP
    next_number := next_number + 1;
    new_code := 'CLI-' || LPAD(next_number::TEXT, 4, '0');
  END LOOP;
  
  NEW.client_code := new_code;
  RETURN NEW;
END;
$$;


--
-- Name: generate_document_number(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_document_number(doc_type character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  prefix VARCHAR(3);
  year_str VARCHAR(4);
  seq_num INTEGER;
  new_number VARCHAR(50);
BEGIN
  -- Set prefix based on document type
  prefix := CASE doc_type
    WHEN 'hotel_voucher' THEN 'HV'
    WHEN 'service_order' THEN 'SO'
    WHEN 'transport_voucher' THEN 'TV'
    WHEN 'activity_voucher' THEN 'AV'
    WHEN 'guide_assignment' THEN 'GA'
    WHEN 'cruise_voucher' THEN 'CV'
    ELSE 'SD'
  END;
  
  year_str := TO_CHAR(NOW(), 'YYYY');
  
  -- Get next sequence number for this type and year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(document_number FROM prefix || '-' || year_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM supplier_documents
  WHERE document_number LIKE prefix || '-' || year_str || '-%';
  
  new_number := prefix || '-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
  
  RETURN new_number;
END;
$$;


--
-- Name: generate_quote_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_quote_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 9) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM tour_quotes
  WHERE quote_number LIKE CONCAT('QT-', year_part, '-%');
  
  NEW.quote_number := CONCAT('QT-', year_part, '-', LPAD(seq_num::TEXT, 5, '0'));
  RETURN NEW;
END;
$$;


--
-- Name: get_next_available_agent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_available_agent() RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  next_agent_id UUID;
BEGIN
  -- Get the agent who was assigned longest ago (or never)
  -- Must be active, available, and under max conversations
  SELECT id INTO next_agent_id
  FROM sales_agents
  WHERE is_active = true 
    AND is_available = true
    AND current_conversations < max_conversations
  ORDER BY last_assigned_at ASC NULLS FIRST, created_at ASC
  LIMIT 1;
  
  RETURN next_agent_id;
END;
$$;


--
-- Name: get_org_agent_memories(uuid, uuid, text, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_org_agent_memories(p_org_id uuid, p_subject_id uuid DEFAULT NULL::uuid, p_subject_type text DEFAULT NULL::text, p_min_confidence double precision DEFAULT 0.3, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, memory_type text, subject_name text, content text, confidence double precision, observation_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT am.id, am.memory_type, am.subject_name, am.content, am.confidence, am.observation_count
  FROM agent_memory am
  WHERE am.org_id = p_org_id AND am.confidence >= p_min_confidence
    AND (am.expires_at IS NULL OR am.expires_at > NOW())
    AND (p_subject_id IS NULL OR am.subject_id = p_subject_id)
    AND (p_subject_type IS NULL OR am.subject_type = p_subject_type)
  ORDER BY
    CASE WHEN am.subject_type = 'client' AND am.subject_id = p_subject_id THEN 0 ELSE 1 END,
    am.confidence DESC, am.observation_count DESC
  LIMIT p_limit;

  UPDATE agent_memory SET last_accessed_at = NOW()
  WHERE org_id = p_org_id AND confidence >= p_min_confidence
    AND (expires_at IS NULL OR expires_at > NOW());
END; $$;


--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;


--
-- Name: guides_view_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guides_view_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM public.suppliers WHERE id = OLD.id AND type = 'guide';
  RETURN OLD;
END $$;


--
-- Name: guides_view_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guides_view_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.suppliers (
    id, type, entity_kind, name, contact_email, contact_phone, languages,
    specialties, certification_number, license_expiry, status, max_group_size,
    hourly_rate, daily_rate, emergency_contact_name, emergency_contact_phone,
    address, notes, profile_photo_url, tier, is_preferred, city, whatsapp,
    created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), 'guide', 'individual', NEW.name,
    NEW.email, NEW.phone, NEW.languages, NEW.specialties, NEW.certification_number,
    NEW.license_expiry,
    CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    NEW.max_group_size, NEW.hourly_rate, NEW.daily_rate, NEW.emergency_contact_name,
    NEW.emergency_contact_phone, NEW.address, NEW.notes, NEW.profile_photo_url,
    NEW.tier, COALESCE(NEW.is_preferred, false), NEW.city, NEW.whatsapp,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;


--
-- Name: guides_view_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guides_view_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.suppliers SET
    name                    = NEW.name,
    contact_email           = NEW.email,
    contact_phone           = NEW.phone,
    languages               = NEW.languages,
    specialties             = NEW.specialties,
    certification_number    = NEW.certification_number,
    license_expiry          = NEW.license_expiry,
    status                  = CASE WHEN NEW.is_active IS FALSE THEN 'inactive' ELSE 'active' END,
    max_group_size          = NEW.max_group_size,
    hourly_rate             = NEW.hourly_rate,
    daily_rate              = NEW.daily_rate,
    emergency_contact_name  = NEW.emergency_contact_name,
    emergency_contact_phone = NEW.emergency_contact_phone,
    address                 = NEW.address,
    notes                   = NEW.notes,
    profile_photo_url       = NEW.profile_photo_url,
    tier                    = NEW.tier,
    is_preferred            = NEW.is_preferred,
    city                    = NEW.city,
    whatsapp                = NEW.whatsapp,
    updated_at              = now()
  WHERE id = OLD.id AND type = 'guide';
  RETURN NEW;
END $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;


--
-- Name: invoices_touch_client_revenue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoices_touch_client_revenue() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Both sides: moving an invoice between clients has to correct the one it left.
  IF TG_OP <> 'INSERT' AND OLD.client_id IS NOT NULL THEN
    PERFORM public.recompute_client_revenue(OLD.client_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    PERFORM public.recompute_client_revenue(NEW.client_id);
  ELSIF TG_OP <> 'DELETE' AND NEW.client_id IS NOT NULL THEN
    PERFORM public.recompute_client_revenue(NEW.client_id);
  END IF;
  RETURN NULL;
END $$;


--
-- Name: is_active_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() 
    AND is_active = true
  )
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() 
    AND role = 'admin' 
    AND is_active = true
  )
$$;


--
-- Name: is_agent_or_above(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_agent_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'manager', 'agent') 
    AND is_active = true
  )
$$;


--
-- Name: is_manager_or_above(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_manager_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'manager') 
    AND is_active = true
  )
$$;


--
-- Name: itineraries_touch_client_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.itineraries_touch_client_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.client_id IS NOT NULL THEN
    PERFORM public.recompute_client_revenue(OLD.client_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.client_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
    PERFORM public.recompute_client_revenue(NEW.client_id);
  END IF;
  RETURN NULL;
END $$;


--
-- Name: log_audit(character varying, character varying, uuid, jsonb, jsonb, character varying, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit(p_action character varying, p_table_name character varying DEFAULT NULL::character varying, p_record_id uuid DEFAULT NULL::uuid, p_old_data jsonb DEFAULT NULL::jsonb, p_new_data jsonb DEFAULT NULL::jsonb, p_status character varying DEFAULT 'success'::character varying, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_user_email VARCHAR(255);
  v_user_role VARCHAR(50);
  v_changes JSONB;
  v_log_id UUID;
BEGIN
  -- Get current user info
  SELECT id, email, role INTO v_user_id, v_user_email, v_user_role
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Calculate changes if both old and new data provided
  IF p_old_data IS NOT NULL AND p_new_data IS NOT NULL THEN
    SELECT jsonb_object_agg(key, value)
    INTO v_changes
    FROM jsonb_each(p_new_data)
    WHERE p_old_data->key IS DISTINCT FROM value;
  END IF;
  
  -- Insert audit log
  INSERT INTO audit_logs (
    user_id,
    user_email,
    user_role,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    changes,
    status,
    error_message,
    metadata
  ) VALUES (
    v_user_id,
    v_user_email,
    v_user_role,
    p_action,
    p_table_name,
    p_record_id,
    p_old_data,
    p_new_data,
    v_changes,
    p_status,
    p_error_message,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;



--
-- Name: purge_expired_agent_memories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_agent_memories() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $$;


--
-- Name: recalculate_itinerary_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_itinerary_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_itinerary_id UUID;
  v_total_cost NUMERIC;
  v_total_revenue NUMERIC;
BEGIN
  -- Get the itinerary_id from the affected day
  IF TG_OP = 'DELETE' THEN
    SELECT itinerary_id INTO v_itinerary_id
    FROM itinerary_days
    WHERE id = OLD.itinerary_day_id;
  ELSE
    SELECT itinerary_id INTO v_itinerary_id
    FROM itinerary_days
    WHERE id = NEW.itinerary_day_id;
  END IF;

  -- Calculate totals from all services
  SELECT 
    COALESCE(SUM(total_cost), 0),
    COALESCE(SUM(client_price), 0)
  INTO v_total_cost, v_total_revenue
  FROM itinerary_services s
  JOIN itinerary_days d ON s.itinerary_day_id = d.id
  WHERE d.itinerary_id = v_itinerary_id;

  -- Update itinerary with new totals
  UPDATE itineraries
  SET 
    total_cost = v_total_revenue,  -- total_cost stores client price
    total_revenue = v_total_revenue,
    updated_at = NOW()
  WHERE id = v_itinerary_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: recompute_client_revenue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_client_revenue(p_client uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_revenue   JSONB := '{}'::jsonb;
  v_collected JSONB := '{}'::jsonb;
  v_bookings  INTEGER := 0;
  v_currency  TEXT;
  v_total     NUMERIC := 0;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

  -- Money: what has been billed and collected, per currency, from invoices.
  SELECT
    COALESCE(jsonb_object_agg(cur, billed) FILTER (WHERE billed <> 0), '{}'::jsonb),
    COALESCE(jsonb_object_agg(cur, paid)   FILTER (WHERE paid   <> 0), '{}'::jsonb)
  INTO v_revenue, v_collected
  FROM (
    SELECT
      UPPER(COALESCE(i.currency, 'EUR')) AS cur,
      SUM(COALESCE(i.total_amount, 0))   AS billed,
      SUM(COALESCE(i.amount_paid, 0))    AS paid
    FROM invoices i
    WHERE i.client_id = p_client
      AND COALESCE(i.status, '') NOT IN ('draft', 'cancelled')
    GROUP BY UPPER(COALESCE(i.currency, 'EUR'))
  ) per_currency;

  -- Bookings: confirmed trips. Counted, never incremented.
  SELECT COUNT(*)
  INTO v_bookings
  FROM itineraries t
  WHERE t.client_id = p_client
    AND t.status IN ('confirmed', 'completed');

  SELECT key, value::numeric
  INTO v_currency, v_total
  FROM jsonb_each_text(v_revenue)
  ORDER BY value::numeric DESC
  LIMIT 1;

  UPDATE clients SET
    revenue_by_currency     = v_revenue,
    collected_by_currency   = v_collected,
    revenue_currency        = v_currency,
    total_revenue_generated = COALESCE(v_total, 0),
    total_bookings_count    = COALESCE(v_bookings, 0),
    average_booking_value   = CASE WHEN COALESCE(v_bookings, 0) > 0
                                   THEN COALESCE(v_total, 0) / v_bookings
                                   ELSE 0 END,
    updated_at              = now()
  WHERE id = p_client;
END $$;


--
-- Name: record_booking_payment(uuid, text, numeric, text, text, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_booking_payment(p_booking_id uuid, p_payment_type text, p_amount numeric, p_currency text, p_payment_method text, p_payment_date date, p_transaction_reference text, p_notes text) RETURNS TABLE(payment_id uuid, payment_status text, balance_due numeric, deposit_paid boolean)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
declare
  v_booking record;
  v_payment_id uuid;
  v_total_paid numeric;
  v_balance_due numeric;
  v_payment_status text := 'pending';
  v_deposit_paid boolean := false;
  v_new_status text;
begin
  -- Lock the booking row for the rest of the transaction. Concurrent
  -- record_booking_payment calls on the same booking_id now serialize here.
  select id, total_cost, deposit_amount, currency, deposit_paid, status
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

  if not found then
    raise exception 'Booking % not found', p_booking_id;
  end if;

  -- Currency must match the booking's own currency (M21). The application
  -- layer already validates this; the RPC repeats it so the rule is enforced
  -- at the data layer too.
  if p_currency is null or p_currency <> coalesce(v_booking.currency, 'EUR') then
    raise exception 'Payment currency (%) must match booking currency (%)',
      p_currency, coalesce(v_booking.currency, 'EUR');
  end if;

  -- Insert the payment.
  insert into public.booking_payments (
    booking_id, payment_type, amount, currency, payment_method,
    payment_date, transaction_reference, notes
  ) values (
    p_booking_id, p_payment_type, p_amount, p_currency, p_payment_method,
    p_payment_date, p_transaction_reference, p_notes
  )
  returning id into v_payment_id;

  -- Recompute total_paid in the booking's currency. Refunds subtract;
  -- legacy rows with a different currency are excluded (matches M21's
  -- application-layer behavior).
  select coalesce(sum(
    case when payment_type = 'refund' then -amount else amount end
  ), 0)
    into v_total_paid
    from public.booking_payments
    where booking_id = p_booking_id
      and coalesce(currency, 'EUR') = coalesce(v_booking.currency, 'EUR');

  v_balance_due := greatest(0, coalesce(v_booking.total_cost, 0) - v_total_paid);

  -- Determine the new payment_status. Matches the JS helper's logic
  -- exactly so the route's observable behavior is unchanged.
  if v_total_paid >= coalesce(v_booking.total_cost, 0) then
    v_payment_status := 'paid';
    v_deposit_paid := true;
  elsif v_total_paid >= coalesce(v_booking.deposit_amount, 0) then
    if v_total_paid > coalesce(v_booking.deposit_amount, 0) then
      v_payment_status := 'partial';
    else
      v_payment_status := 'deposit_received';
    end if;
    v_deposit_paid := true;
  end if;

  -- Promote bookings.status from supplier_confirmed → payment_received
  -- when this payment moves it past 'pending'. Mirrors the JS behavior.
  v_new_status := v_booking.status;
  if v_payment_status <> 'pending' and v_booking.status = 'supplier_confirmed' then
    v_new_status := 'payment_received';
  end if;

  -- Write the booking back. deposit_paid_date is set ONLY on the first
  -- transition (when deposit_paid was previously false), so re-runs and
  -- subsequent payments don't keep updating it.
  update public.bookings
    set payment_status = v_payment_status,
        deposit_paid = v_deposit_paid,
        balance_due = v_balance_due,
        deposit_paid_date = case
          when v_deposit_paid and not coalesce(v_booking.deposit_paid, false)
            then current_date
          else deposit_paid_date
        end,
        status = v_new_status,
        updated_at = now()
    where id = p_booking_id;

  -- Return the new payment id + the computed status so the route can
  -- echo them back without a second SELECT round-trip.
  return query select v_payment_id, v_payment_status, v_balance_due, v_deposit_paid;
end$$;


--
-- Name: revert_b2c_quote_to_revision(uuid, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revert_b2c_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE d JSONB; v_new_id UUID;
BEGIN
  SELECT quote_data INTO d FROM quote_revisions
   WHERE quote_type = 'b2c' AND quote_id = p_quote_id AND version_number = p_version_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

  UPDATE b2c_quotes SET
    num_travelers    = NULLIF(d->>'num_travelers','')::integer,
    tier             = d->>'tier',
    total_cost       = NULLIF(d->>'total_cost','')::numeric,
    margin_percent   = NULLIF(d->>'margin_percent','')::numeric,
    margin_amount    = NULLIF(d->>'margin_amount','')::numeric,
    selling_price    = NULLIF(d->>'selling_price','')::numeric,
    price_per_person = NULLIF(d->>'price_per_person','')::numeric,
    currency         = d->>'currency',
    cost_breakdown   = d->'cost_breakdown',
    status           = d->>'status',
    valid_until      = NULLIF(d->>'valid_until','')::date,
    internal_notes   = d->>'internal_notes',
    client_notes     = d->>'client_notes',
    updated_at       = NOW()
  WHERE id = p_quote_id;

  SELECT create_b2c_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
  RETURN v_new_id;
END;
$$;


--
-- Name: revert_quote_to_revision(uuid, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revert_quote_to_revision(p_quote_id uuid, p_version_number integer, p_reverted_by uuid DEFAULT NULL::uuid, p_revert_reason text DEFAULT 'Reverted to previous version'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE d JSONB; v_new_id UUID;
BEGIN
  SELECT quote_data INTO d FROM quote_revisions
   WHERE quote_type = 'b2b' AND quote_id = p_quote_id AND version_number = p_version_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found: quote_id=%, version=%', p_quote_id, p_version_number; END IF;

  UPDATE tour_quotes SET
    variation_id = NULLIF(d->>'variation_id','')::uuid,
    itinerary_id = NULLIF(d->>'itinerary_id','')::uuid,
    trip_name = d->>'trip_name',
    partner_id = NULLIF(d->>'partner_id','')::uuid,
    client_name = d->>'client_name',
    client_email = d->>'client_email',
    client_phone = d->>'client_phone',
    client_nationality = d->>'client_nationality',
    travel_date = NULLIF(d->>'travel_date','')::date,
    num_adults = NULLIF(d->>'num_adults','')::integer,
    num_children = NULLIF(d->>'num_children','')::integer,
    services_snapshot = d->'services_snapshot',
    total_cost = NULLIF(d->>'total_cost','')::numeric,
    margin_percent = NULLIF(d->>'margin_percent','')::numeric,
    margin_amount = NULLIF(d->>'margin_amount','')::numeric,
    selling_price = NULLIF(d->>'selling_price','')::numeric,
    price_per_person = NULLIF(d->>'price_per_person','')::numeric,
    currency = d->>'currency',
    tour_leader_included = NULLIF(d->>'tour_leader_included','')::boolean,
    tour_leader_cost = NULLIF(d->>'tour_leader_cost','')::numeric,
    single_supplement = NULLIF(d->>'single_supplement','')::numeric,
    is_eur_passport = NULLIF(d->>'is_eur_passport','')::boolean,
    season = d->>'season',
    status = d->>'status',
    valid_until = NULLIF(d->>'valid_until','')::date,
    notes = d->>'notes',
    updated_at = NOW()
  WHERE id = p_quote_id;

  SELECT create_quote_revision(p_quote_id, p_reverted_by, p_revert_reason || ' (v' || p_version_number || ')') INTO v_new_id;
  RETURN v_new_id;
END;
$$;


--
-- Name: save_pricing_grid_days(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_pricing_grid_days(p_itinerary_id uuid, p_days jsonb) RETURNS TABLE(days_inserted integer, services_inserted integer)
    LANGUAGE plpgsql
    AS $$
declare
  v_day jsonb;
  v_svc jsonb;
  v_day_id uuid;
  v_days_count int := 0;
  v_services_count int := 0;
begin
  -- Wipe the existing days + services for this itinerary. Services first
  -- (FK to itinerary_days). Both deletes and every insert below run in this
  -- one function-transaction, so an error anywhere rolls the whole thing
  -- back and the prior state survives.
  delete from public.itinerary_services
   where itinerary_day_id in (
     select id from public.itinerary_days where itinerary_id = p_itinerary_id
   );
  delete from public.itinerary_days where itinerary_id = p_itinerary_id;

  -- Insert the new days and, per day, its services using the new day id.
  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb))
  loop
    insert into public.itinerary_days (
      itinerary_id, day_number, title, description, city, overnight_city, date,
      day_type, overnight, has_sightseeing, airport_arrival, airport_departure,
      hotel_check_in, hotel_check_out, intercity
    ) values (
      p_itinerary_id,
      (v_day->>'day_number')::int,
      v_day->>'title',
      v_day->>'description',
      v_day->>'city',
      v_day->>'overnight_city',
      (v_day->>'date')::date,
      v_day->>'day_type',
      (v_day->>'overnight')::boolean,
      (v_day->>'has_sightseeing')::boolean,
      (v_day->>'airport_arrival')::boolean,
      (v_day->>'airport_departure')::boolean,
      (v_day->>'hotel_check_in')::boolean,
      (v_day->>'hotel_check_out')::boolean,
      (v_day->>'intercity')::boolean
    )
    returning id into v_day_id;
    v_days_count := v_days_count + 1;

    for v_svc in select * from jsonb_array_elements(coalesce(v_day->'services', '[]'::jsonb))
    loop
      insert into public.itinerary_services (
        itinerary_day_id, service_type, service_name, quantity,
        rate_eur, rate_non_eur, total_cost, client_price, supplier_id, notes
      ) values (
        v_day_id,
        v_svc->>'service_type',
        v_svc->>'service_name',
        (v_svc->>'quantity')::numeric,
        (v_svc->>'rate_eur')::numeric,
        (v_svc->>'rate_non_eur')::numeric,
        (v_svc->>'total_cost')::numeric,
        (v_svc->>'client_price')::numeric,
        nullif(v_svc->>'supplier_id', '')::uuid,
        v_svc->>'notes'
      );
      v_services_count := v_services_count + 1;
    end loop;
  end loop;

  return query select v_days_count, v_services_count;
end$$;


--
-- Name: save_pricing_grid_days(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_pricing_grid_days(p_itinerary_id uuid, p_days jsonb, p_services jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  -- Remove the itinerary's existing days and their services. (Services also
  -- cascade via FK, but we delete explicitly so behavior is independent of it.)
  delete from public.itinerary_services
   where itinerary_day_id in (
     select id from public.itinerary_days where itinerary_id = p_itinerary_id
   );
  delete from public.itinerary_days where itinerary_id = p_itinerary_id;

  -- Insert the new days and, in the SAME statement, the services that reference
  -- them by day_number — resolved to the freshly-inserted day id via the CTE.
  -- A data-modifying CTE always runs to completion, so days are inserted even
  -- when there are no services.
  with new_days as (
    insert into public.itinerary_days
      (itinerary_id, day_number, title, description, city, overnight_city, "date")
    select
      p_itinerary_id, d.day_number, d.title, d.description, d.city, d.overnight_city, d."date"
    from jsonb_to_recordset(coalesce(p_days, '[]'::jsonb)) as d(
      day_number int, title text, description text, city text, overnight_city text, "date" date
    )
    returning id, day_number
  )
  insert into public.itinerary_services
    (itinerary_day_id, service_type, service_name, quantity, rate_eur, rate_non_eur, total_cost, notes)
  select
    nd.id, s.service_type, s.service_name, s.quantity, s.rate_eur, s.rate_non_eur, s.total_cost, s.notes
  from jsonb_to_recordset(coalesce(p_services, '[]'::jsonb)) as s(
    day_number int, service_type text, service_name text, quantity int,
    rate_eur numeric, rate_non_eur numeric, total_cost numeric, notes text
  )
  join new_days nd on nd.day_number = s.day_number;
end;
$$;


--
-- Name: update_agent_memory_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_memory_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_b2c_quotes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_b2c_quotes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_booking_passengers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_booking_passengers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_client_last_contact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_client_last_contact() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE clients 
  SET last_contacted_at = NEW.communication_date
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_client_status_on_booking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_client_status_on_booking() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('confirmed', 'completed') THEN
    UPDATE clients SET status = 'customer'
    WHERE id = NEW.client_id AND status IN ('lead', 'prospect');
  ELSIF NEW.status IN ('pending', 'quoted') THEN
    UPDATE clients SET status = 'prospect'
    WHERE id = NEW.client_id AND status = 'lead';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: update_commission_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_commission_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_communication_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_communication_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_concierge_briefs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_concierge_briefs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_conversation_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversation_on_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET 
    last_message = NEW.message_body,
    last_message_at = NEW.sent_at,
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN unread_count + 1 
      ELSE unread_count 
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_copilot_knowledge_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_copilot_knowledge_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_email_conversation_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_email_conversation_on_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE email_conversations SET
        last_message_snippet = NEW.snippet,
        last_message_at = NEW.sent_at,
        message_count = message_count + 1,
        unread_count = CASE
            WHEN NEW.direction = 'inbound' AND NOT NEW.is_read
            THEN unread_count + 1
            ELSE unread_count
        END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;


--
-- Name: update_integrations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_integrations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_invoice_on_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invoice_on_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Update amount_paid and balance_due
  UPDATE invoices
  SET 
    amount_paid = (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE invoice_id = NEW.invoice_id),
    balance_due = total_amount - (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE invoice_id = NEW.invoice_id),
    status = CASE 
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE invoice_id = NEW.invoice_id) >= total_amount THEN 'paid'
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE invoice_id = NEW.invoice_id) > 0 THEN 'partial'
      ELSE status
    END,
    paid_at = CASE 
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE invoice_id = NEW.invoice_id) >= total_amount THEN NOW()
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_notifications_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notifications_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_operator_capacity_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_operator_capacity_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_supplier_documents_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_supplier_documents_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_supplier_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_supplier_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_template_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_template_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_tour_departures_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tour_departures_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_user_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_whatsapp_conversation_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_whatsapp_conversation_on_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE whatsapp_conversations SET
        last_message = NEW.message_body,
        last_message_at = COALESCE(NEW.sent_at, NOW()),
        unread_count = CASE
            WHEN NEW.direction = 'inbound'
            THEN COALESCE(unread_count, 0) + 1
            ELSE unread_count
        END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;


--
-- Name: user_is_in_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_in_org(p_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org_id
      and user_id = auth.uid()
  )
$$;


--
-- Name: user_is_org_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_org_owner(p_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accommodation_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accommodation_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    property_name character varying(255) NOT NULL,
    property_type character varying(100) NOT NULL,
    star_rating integer,
    room_type character varying(100),
    board_basis character varying(50),
    city character varying(100),
    base_rate_eur numeric(10,2),
    base_rate_non_eur numeric(10,2),
    season character varying(50),
    rate_valid_from date,
    rate_valid_to date,
    supplier_name character varying(255),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tier text,
    single_supplement_eur numeric(10,2) DEFAULT 0,
    single_supplement_non_eur numeric(10,2) DEFAULT 0,
    high_season_rate_eur numeric(10,2),
    high_season_rate_non_eur numeric(10,2),
    low_season_rate_eur numeric(10,2),
    low_season_rate_non_eur numeric(10,2),
    supplier_id uuid,
    single_rate_eur numeric(10,2),
    double_rate_eur numeric(10,2),
    triple_rate_eur numeric(10,2),
    suite_rate_eur numeric(10,2),
    single_rate_non_eur numeric(10,2),
    double_rate_non_eur numeric(10,2),
    triple_rate_non_eur numeric(10,2),
    suite_rate_non_eur numeric(10,2),
    peak_season_single_eur numeric(10,2),
    peak_season_double_eur numeric(10,2),
    peak_season_triple_eur numeric(10,2),
    peak_season_suite_eur numeric(10,2),
    peak_season_single_non_eur numeric(10,2),
    peak_season_double_non_eur numeric(10,2),
    peak_season_triple_non_eur numeric(10,2),
    peak_season_suite_non_eur numeric(10,2),
    high_season_single_eur numeric(10,2),
    high_season_double_eur numeric(10,2),
    high_season_triple_eur numeric(10,2),
    high_season_suite_eur numeric(10,2),
    high_season_single_non_eur numeric(10,2),
    high_season_double_non_eur numeric(10,2),
    high_season_triple_non_eur numeric(10,2),
    high_season_suite_non_eur numeric(10,2),
    low_season_from date,
    low_season_to date,
    high_season_from date,
    high_season_to date,
    peak_season_from date,
    peak_season_to date,
    peak_season_2_from date,
    peak_season_2_to date,
    contact_name text,
    contact_email text,
    contact_phone text,
    reservations_email text,
    reservations_phone text,
    pp_double_eur numeric(10,2) DEFAULT 0,
    single_supp_eur numeric(10,2) DEFAULT 0,
    triple_red_eur numeric(10,2) DEFAULT 0,
    pp_double_non_eur numeric(10,2) DEFAULT 0,
    single_supp_non_eur numeric(10,2) DEFAULT 0,
    triple_red_non_eur numeric(10,2) DEFAULT 0,
    high_pp_double_eur numeric(10,2) DEFAULT 0,
    high_single_supp_eur numeric(10,2) DEFAULT 0,
    high_triple_red_eur numeric(10,2) DEFAULT 0,
    high_pp_double_non_eur numeric(10,2) DEFAULT 0,
    high_single_supp_non_eur numeric(10,2) DEFAULT 0,
    high_triple_red_non_eur numeric(10,2) DEFAULT 0,
    peak_pp_double_eur numeric(10,2) DEFAULT 0,
    peak_single_supp_eur numeric(10,2) DEFAULT 0,
    peak_triple_red_eur numeric(10,2) DEFAULT 0,
    peak_pp_double_non_eur numeric(10,2) DEFAULT 0,
    peak_single_supp_non_eur numeric(10,2) DEFAULT 0,
    peak_triple_red_non_eur numeric(10,2) DEFAULT 0,
    seasons jsonb,
    rate_currency text,
    CONSTRAINT accommodation_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text])))),
    CONSTRAINT accommodation_rates_tier_check CHECK ((tier = ANY (ARRAY['budget'::text, 'standard'::text, 'deluxe'::text, 'luxury'::text])))
);


--
-- Name: accounting_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    external_id text,
    external_number text,
    sync_status text DEFAULT 'pending'::text,
    last_synced_at timestamp with time zone,
    last_error text,
    retry_count integer DEFAULT 0,
    next_retry_at timestamp with time zone,
    request_payload jsonb,
    response_payload jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    org_id uuid NOT NULL,
    CONSTRAINT accounting_sync_log_entity_type_check CHECK ((entity_type = ANY (ARRAY['invoice'::text, 'expense'::text, 'invoice_payment'::text, 'expense_payment'::text, 'contact'::text]))),
    CONSTRAINT accounting_sync_log_provider_check CHECK ((provider = ANY (ARRAY['xero'::text, 'quickbooks'::text]))),
    CONSTRAINT accounting_sync_log_sync_status_check CHECK ((sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: accounting_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expiry timestamp with time zone NOT NULL,
    tenant_id text,
    realm_id text,
    company_name text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    org_id uuid NOT NULL,
    CONSTRAINT accounting_tokens_provider_check CHECK ((provider = ANY (ARRAY['xero'::text, 'quickbooks'::text])))
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    due_date date,
    priority character varying(20) DEFAULT 'medium'::character varying,
    status character varying(20) DEFAULT 'todo'::character varying,
    assigned_to uuid,
    linked_type character varying(50),
    linked_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    archived boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    department_id uuid
);


--
-- Name: active_tasks; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_tasks WITH (security_invoker='on') AS
 SELECT id,
    title,
    description,
    due_date,
    priority,
    status,
    assigned_to,
    linked_type,
    linked_id,
    notes,
    created_at,
    updated_at,
    completed_at,
    archived,
    archived_at
   FROM public.tasks
  WHERE (archived = false);


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    user_id uuid NOT NULL,
    user_email text,
    method text NOT NULL,
    path text NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    activity_name character varying(255) NOT NULL,
    activity_category character varying(100),
    activity_type character varying(100),
    duration character varying(100),
    city character varying(100),
    base_rate_eur numeric(10,2),
    base_rate_non_eur numeric(10,2),
    season character varying(50),
    rate_valid_from date,
    rate_valid_to date,
    supplier_name character varying(255),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    supplier_id uuid,
    is_addon boolean DEFAULT false,
    addon_note text,
    pricing_type character varying(20) DEFAULT 'per_person'::character varying,
    unit_label character varying(50),
    min_capacity integer DEFAULT 1,
    max_capacity integer DEFAULT 99,
    tiers jsonb,
    rate_currency text,
    CONSTRAINT activity_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: agent_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    memory_type text NOT NULL,
    subject_id uuid,
    subject_type text,
    subject_name text,
    content text NOT NULL,
    confidence double precision DEFAULT 0.5,
    observation_count integer DEFAULT 1,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_memory_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT agent_memory_memory_type_check CHECK ((memory_type = ANY (ARRAY['client_preference'::text, 'pricing_pattern'::text, 'inquiry_pattern'::text, 'supplier_note'::text]))),
    CONSTRAINT agent_memory_subject_type_check CHECK ((subject_type = ANY (ARRAY['client'::text, 'supplier'::text, 'tour_type'::text, 'destination'::text])))
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    agent_type text NOT NULL,
    triggered_by uuid,
    input_summary text,
    output_summary text,
    tokens_used integer,
    duration_ms integer,
    status text DEFAULT 'success'::text,
    itinerary_id uuid,
    memories_injected integer DEFAULT 0,
    processed_for_memory boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_runs_agent_type_check CHECK ((agent_type = ANY (ARRAY['itinerary'::text, 'pricing'::text]))),
    CONSTRAINT agent_runs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text, 'quota_exceeded'::text])))
);


--
-- Name: agent_team_member_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_team_member_mapping (
    sales_agent_id uuid NOT NULL,
    team_member_id uuid NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    contact_name character varying(255),
    contact_email character varying(255),
    contact_phone character varying(50),
    website character varying(255),
    address text,
    city character varying(100),
    country character varying(100) DEFAULT 'Egypt'::character varying,
    default_commission_rate numeric(5,2),
    commission_type character varying(20),
    payment_terms character varying(255),
    bank_details text,
    status character varying(20) DEFAULT 'active'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone2 character varying(50),
    whatsapp character varying(50),
    languages text[],
    vehicle_types text[],
    star_rating character varying(20),
    property_type character varying(50),
    cuisine_types text[],
    routes text[],
    ship_name character varying(255),
    cabin_count integer,
    capacity integer,
    parent_supplier_id uuid,
    is_property boolean DEFAULT false,
    entity_kind text,
    tier text,
    daily_rate numeric,
    hourly_rate numeric,
    is_preferred boolean DEFAULT false,
    max_group_size integer,
    specialties text[],
    certification_number text,
    license_expiry date,
    emergency_contact_name text,
    emergency_contact_phone text,
    profile_photo_url text,
    types text[] DEFAULT '{}'::text[] NOT NULL,
    airport_location text,
    shift_times text,
    service_role text,
    CONSTRAINT suppliers_commission_type_check CHECK (((commission_type)::text = ANY ((ARRAY['receivable'::character varying, 'payable'::character varying])::text[]))),
    CONSTRAINT suppliers_entity_kind_check CHECK (((entity_kind IS NULL) OR (entity_kind = ANY (ARRAY['individual'::text, 'company'::text])))),
    CONSTRAINT suppliers_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'pending'::character varying])::text[]))),
    CONSTRAINT suppliers_type_check CHECK (((type)::text = ANY ((ARRAY['hotel'::character varying, 'transport'::character varying, 'local_operator'::character varying, 'driver'::character varying, 'guide'::character varying, 'cruise'::character varying, 'activity_provider'::character varying, 'attraction'::character varying, 'tour_operator'::character varying, 'ground_handler'::character varying, 'restaurant'::character varying, 'shop'::character varying, 'train_operator'::character varying, 'air_carrier'::character varying, 'airport_assistant'::character varying, 'hotel_assistant'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT suppliers_type_in_types_check CHECK (((type IS NULL) OR ((type)::text = ANY (types)))),
    CONSTRAINT suppliers_types_vocab_check CHECK ((types <@ ARRAY['hotel'::text, 'transport'::text, 'local_operator'::text, 'driver'::text, 'guide'::text, 'cruise'::text, 'activity_provider'::text, 'attraction'::text, 'tour_operator'::text, 'ground_handler'::text, 'restaurant'::text, 'shop'::text, 'train_operator'::text, 'air_carrier'::text, 'airport_assistant'::text, 'hotel_assistant'::text, 'other'::text]))
);


--
-- Name: airport_staff; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.airport_staff WITH (security_invoker='on') AS
 SELECT id,
    name,
    service_role AS role,
    airport_location,
    contact_phone AS phone,
    whatsapp,
    contact_email AS email,
    languages,
    shift_times,
    notes,
    ((status)::text = 'active'::text) AS is_active,
    created_at,
    updated_at,
    emergency_contact_name AS emergency_contact,
    tier,
    is_preferred
   FROM public.suppliers
  WHERE ('airport_assistant'::text = ANY (types));


--
-- Name: airport_staff_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airport_staff_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    airport_code character varying(10) NOT NULL,
    airport_name character varying(100),
    service_type character varying(50) NOT NULL,
    direction character varying(20) NOT NULL,
    rate_eur numeric(10,2),
    rate_valid_from date,
    rate_valid_to date,
    supplier_name character varying(100),
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    supplier_id uuid,
    rate_currency text,
    CONSTRAINT airport_staff_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: archived_tasks; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.archived_tasks WITH (security_invoker='on') AS
 SELECT id,
    title,
    description,
    due_date,
    priority,
    status,
    assigned_to,
    linked_type,
    linked_id,
    notes,
    created_at,
    updated_at,
    completed_at,
    archived,
    archived_at
   FROM public.tasks
  WHERE (archived = true);


--
-- Name: assignment_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    rule_type character varying(50) NOT NULL,
    conditions jsonb,
    agent_id uuid,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: assistant_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assistant_type character varying(50) NOT NULL,
    cost_per_service numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    supplier_id uuid
);


--
-- Name: attraction_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attraction_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    alias text NOT NULL,
    source_table text DEFAULT 'entrance_fees'::text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    destination_id uuid
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_email character varying(255),
    user_role character varying(50),
    action character varying(50) NOT NULL,
    table_name character varying(100),
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    changes jsonb,
    ip_address character varying(50),
    user_agent text,
    request_path character varying(500),
    status character varying(20) DEFAULT 'success'::character varying,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: b2b_partner_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2b_partner_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    variation_id uuid NOT NULL,
    margin_percent_override numeric(5,2),
    fixed_price_per_pax numeric(10,2),
    price_1_pax numeric(10,2),
    price_2_pax numeric(10,2),
    price_3_pax numeric(10,2),
    price_4_pax numeric(10,2),
    price_5_pax numeric(10,2),
    price_6_pax numeric(10,2),
    price_7_plus_pax numeric(10,2),
    valid_from date,
    valid_to date,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: b2b_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2b_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_code character varying(20) NOT NULL,
    company_name character varying(255) NOT NULL,
    contact_name character varying(255),
    email character varying(255),
    phone character varying(50),
    country character varying(100),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    default_margin_percent numeric(5,2) DEFAULT 20,
    show_net_rates boolean DEFAULT false,
    show_cost_breakdown boolean DEFAULT false,
    pricing_model character varying(20) DEFAULT 'margin'::character varying,
    commission_percent numeric(5,2),
    is_active boolean DEFAULT true,
    credit_limit numeric(12,2),
    payment_terms character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    org_id uuid NOT NULL
);


--
-- Name: b2b_pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2b_pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rate_table character varying(50),
    rate_id uuid,
    service_name character varying(255),
    service_category character varying(50),
    pricing_model character varying(20) DEFAULT 'per_person'::character varying NOT NULL,
    unit_type character varying(50),
    unit_capacity integer,
    tier1_min_pax integer DEFAULT 1,
    tier1_max_pax integer,
    tier1_rate_eur numeric(10,2),
    tier1_label character varying(50),
    tier2_min_pax integer,
    tier2_max_pax integer,
    tier2_rate_eur numeric(10,2),
    tier2_label character varying(50),
    tier3_min_pax integer,
    tier3_max_pax integer,
    tier3_rate_eur numeric(10,2),
    tier3_label character varying(50),
    tier4_min_pax integer,
    tier4_max_pax integer,
    tier4_rate_eur numeric(10,2),
    tier4_label character varying(50),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    applies_to character varying(20) DEFAULT 'both'::character varying,
    org_id uuid NOT NULL,
    CONSTRAINT check_applies_to_values CHECK (((applies_to)::text = ANY ((ARRAY['b2b_only'::character varying, 'b2c_only'::character varying, 'both'::character varying])::text[])))
);


--
-- Name: b2b_transport_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2b_transport_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_code character varying(50) NOT NULL,
    package_name character varying(255) NOT NULL,
    package_type character varying(50) NOT NULL,
    origin_city character varying(100),
    destination_city character varying(100),
    duration_days integer DEFAULT 1,
    sedan_rate numeric(10,2),
    sedan_capacity integer DEFAULT 3,
    minivan_rate numeric(10,2),
    minivan_capacity integer DEFAULT 7,
    van_rate numeric(10,2),
    van_capacity integer DEFAULT 12,
    minibus_rate numeric(10,2),
    minibus_capacity integer DEFAULT 20,
    bus_rate numeric(10,2),
    bus_capacity integer DEFAULT 50,
    description text,
    includes text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    org_id uuid NOT NULL,
    rate_currency text,
    CONSTRAINT b2b_transport_packages_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: b2c_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2c_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    itinerary_id uuid NOT NULL,
    client_id uuid,
    quote_number text,
    num_travelers integer DEFAULT 2 NOT NULL,
    tier text,
    total_cost numeric DEFAULT 0 NOT NULL,
    margin_percent numeric DEFAULT 0 NOT NULL,
    margin_amount numeric DEFAULT 0 NOT NULL,
    selling_price numeric DEFAULT 0 NOT NULL,
    price_per_person numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    cost_breakdown jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    valid_until date,
    sent_via text,
    sent_at timestamp with time zone,
    accepted_at timestamp with time zone,
    internal_notes text,
    client_notes text,
    version integer DEFAULT 1,
    last_modified_by uuid,
    last_modified_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    season_name character varying(80),
    season_uplift_percent numeric(5,2) DEFAULT 0 NOT NULL,
    season_uplift_amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT b2c_quotes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'expired'::text])))
);


--
-- Name: booking_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    kind text DEFAULT 'add_traveller'::text NOT NULL,
    requested_count integer NOT NULL,
    note text,
    requested_via text DEFAULT 'portal'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    CONSTRAINT booking_change_requests_kind_check CHECK ((kind = 'add_traveller'::text)),
    CONSTRAINT booking_change_requests_requested_count_check CHECK ((requested_count > 0)),
    CONSTRAINT booking_change_requests_requested_via_check CHECK ((requested_via = ANY (ARRAY['portal'::text, 'operator'::text]))),
    CONSTRAINT booking_change_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: booking_extras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_extras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    passenger_id uuid,
    kind text DEFAULT 'addon'::text NOT NULL,
    title text NOT NULL,
    description text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric,
    currency text,
    supplier_cost numeric,
    supplier_currency text,
    supplier_id uuid,
    source_kind text,
    source_id uuid,
    replaces_service_id uuid,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_via text DEFAULT 'operator'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    priced_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    confirmed_by uuid,
    resolved_at timestamp with time zone,
    invoiced_at timestamp with time zone,
    invoice_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_extras_cost_has_currency CHECK (((supplier_cost IS NULL) OR (supplier_currency IS NOT NULL))),
    CONSTRAINT booking_extras_kind_check CHECK ((kind = ANY (ARRAY['addon'::text, 'upgrade'::text]))),
    CONSTRAINT booking_extras_price_has_currency CHECK (((unit_price IS NULL) OR (currency IS NOT NULL))),
    CONSTRAINT booking_extras_price_not_negative CHECK (((unit_price IS NULL) OR (unit_price >= (0)::numeric))),
    CONSTRAINT booking_extras_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT booking_extras_requested_via_check CHECK ((requested_via = ANY (ARRAY['portal'::text, 'operator'::text]))),
    CONSTRAINT booking_extras_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'offered'::text, 'accepted'::text, 'confirmed'::text, 'declined'::text, 'withdrawn'::text])))
);


--
-- Name: booking_passenger_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_passenger_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    passenger_id uuid NOT NULL,
    kind text DEFAULT 'other'::text NOT NULL,
    label character varying(120),
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    original_filename character varying(255),
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_via text DEFAULT 'portal'::text NOT NULL,
    purge_after timestamp with time zone,
    purged_at timestamp with time zone,
    CONSTRAINT booking_passenger_documents_kind_check CHECK ((kind = ANY (ARRAY['passport'::text, 'other'::text]))),
    CONSTRAINT booking_passenger_documents_size_bytes_check CHECK ((size_bytes > 0)),
    CONSTRAINT booking_passenger_documents_uploaded_via_check CHECK ((uploaded_via = ANY (ARRAY['portal'::text, 'operator'::text])))
);


--
-- Name: booking_passengers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_passengers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    title character varying(10),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    full_name character varying(255) GENERATED ALWAYS AS (
CASE
    WHEN (title IS NOT NULL) THEN (((((title)::text || ' '::text) || (first_name)::text) || ' '::text) || (last_name)::text)
    ELSE (((first_name)::text || ' '::text) || (last_name)::text)
END) STORED,
    date_of_birth date,
    gender character varying(20),
    nationality character varying(100),
    email character varying(255),
    phone character varying(50),
    emergency_contact_name character varying(255),
    emergency_contact_phone character varying(50),
    passport_number character varying(50),
    passport_expiry date,
    passport_issuing_country character varying(100),
    visa_required boolean DEFAULT false,
    passenger_type character varying(20) DEFAULT 'adult'::character varying NOT NULL,
    is_lead_passenger boolean DEFAULT false,
    room_type character varying(50),
    roommate_id uuid,
    meal_preference character varying(50),
    mobility_requirements text,
    medical_conditions text,
    special_requests text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    family_name_kanji character varying(100),
    given_name_kanji character varying(100),
    family_name_kana character varying(100),
    given_name_kana character varying(100),
    passport_issued_date date,
    passport_status character varying(20) DEFAULT 'held'::character varying NOT NULL,
    passport_expected_date date,
    emergency_contact_kana character varying(255),
    emergency_contact_relationship character varying(50),
    postal_code character varying(16),
    address text,
    address_kana text,
    documents_postal_code character varying(16),
    documents_address text,
    documents_address_kana text,
    home_phone character varying(50),
    fax character varying(50),
    employer_name character varying(255),
    employer_phone character varying(50),
    insurance_requested boolean,
    insurance_plan_code character varying(10),
    details_submitted_at timestamp with time zone,
    details_source character varying(20),
    insurance_application_date date,
    insurance_purpose character varying(20),
    insurance_purpose_other text,
    insurance_hazardous boolean,
    insurance_hazardous_detail text,
    insurance_under_treatment boolean,
    insurance_treatment_detail text,
    insurance_disability boolean,
    insurance_disability_detail text,
    insurance_other_policy boolean,
    insurance_other_policy_kinds text[],
    insurance_other_policy_insurer character varying(255),
    insurance_other_policy_death_benefit bigint,
    insurance_premium_jpy integer,
    insurance_premium_id uuid,
    insurance_confirmed_at timestamp with time zone,
    insurance_confirmed_by uuid,
    CONSTRAINT booking_passengers_details_source CHECK (((details_source IS NULL) OR ((details_source)::text = ANY ((ARRAY['customer'::character varying, 'staff'::character varying])::text[])))),
    CONSTRAINT booking_passengers_insurance_purpose_check CHECK (((insurance_purpose IS NULL) OR ((insurance_purpose)::text = ANY ((ARRAY['sightseeing'::character varying, 'business'::character varying, 'study'::character varying, 'pilot_licence'::character varying, 'other'::character varying])::text[])))),
    CONSTRAINT booking_passengers_passenger_type_check CHECK (((passenger_type)::text = ANY ((ARRAY['adult'::character varying, 'child'::character varying, 'infant'::character varying, 'tour_leader'::character varying])::text[]))),
    CONSTRAINT booking_passengers_passport_status CHECK (((passport_status)::text = ANY ((ARRAY['held'::character varying, 'applying'::character varying])::text[])))
);


--
-- Name: booking_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    payment_type character varying(20) NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    payment_method character varying(30),
    payment_date date NOT NULL,
    transaction_reference character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT booking_payments_payment_type_check CHECK (((payment_type)::text = ANY ((ARRAY['deposit'::character varying, 'partial'::character varying, 'final'::character varying, 'refund'::character varying, 'adjustment'::character varying])::text[])))
);


--
-- Name: booking_portal_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_portal_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    token text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone,
    details_locked_at timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    last_viewed_at timestamp with time zone,
    passenger_id uuid,
    last_sent_at timestamp with time zone
);


--
-- Name: booking_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_type character varying(50) NOT NULL,
    minimum_amount numeric(10,2),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: booking_supplier_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_supplier_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    supplier_type character varying(50) NOT NULL,
    supplier_name character varying(255) NOT NULL,
    service_date date,
    status character varying(30) DEFAULT 'pending'::character varying,
    confirmation_number character varying(100),
    confirmed_at timestamp with time zone,
    quoted_cost numeric(12,2),
    created_at timestamp with time zone DEFAULT now(),
    service_description text,
    supplier_id uuid,
    confirmation_notes text,
    contact_name character varying(255),
    contact_email character varying(255),
    contact_phone character varying(50),
    confirmed_cost numeric(12,2),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_code character varying(20) NOT NULL,
    itinerary_id uuid NOT NULL,
    client_name character varying(255) NOT NULL,
    client_email character varying(255),
    client_phone character varying(50),
    trip_name character varying(255) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    num_adults integer DEFAULT 1,
    num_children integer DEFAULT 0,
    total_cost numeric(12,2) DEFAULT 0,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    tier character varying(20),
    status character varying(30) DEFAULT 'pending'::character varying,
    deposit_amount numeric(12,2) DEFAULT 0,
    deposit_paid boolean DEFAULT false,
    balance_due numeric(12,2) DEFAULT 0,
    payment_deadline date,
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    assigned_guide_id uuid,
    assigned_vehicle_id uuid,
    emergency_contact character varying(255),
    special_requests text,
    operational_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    org_id uuid NOT NULL,
    deposit_paid_date date,
    emergency_phone character varying(50),
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    partner_id uuid,
    partner_name character varying(255),
    quote_id uuid,
    quote_type character varying(3),
    deposit_percent numeric(5,2),
    balance_due_date date,
    payment_schedule_overridden boolean DEFAULT false NOT NULL,
    payment_schedule_note text,
    portal_mode text DEFAULT 'family'::text NOT NULL,
    base_total_cost numeric,
    extras_total numeric,
    CONSTRAINT bookings_deposit_percent_check CHECK (((deposit_percent IS NULL) OR ((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric)))),
    CONSTRAINT bookings_portal_mode_check CHECK ((portal_mode = ANY (ARRAY['family'::text, 'friends'::text]))),
    CONSTRAINT bookings_quote_type_check CHECK (((quote_type IS NULL) OR ((quote_type)::text = ANY ((ARRAY['b2b'::character varying, 'b2c'::character varying])::text[]))))
);


--
-- Name: client_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    contact_type character varying(50) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    relationship character varying(100),
    email character varying(255),
    phone character varying(50),
    date_of_birth date,
    passport_number character varying(100),
    passport_expiry date,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: client_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    document_type character varying(100) NOT NULL,
    document_name character varying(255) NOT NULL,
    file_url text NOT NULL,
    file_size_kb integer,
    file_type character varying(50),
    description text,
    document_number character varying(100),
    issue_date date,
    expiry_date date,
    related_itinerary_id uuid,
    is_confidential boolean DEFAULT false,
    uploaded_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: client_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    followup_type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    due_date date NOT NULL,
    due_time time without time zone,
    assigned_to character varying(100),
    priority character varying(20) DEFAULT 'normal'::character varying,
    status character varying(50) DEFAULT 'pending'::character varying,
    completed_at timestamp with time zone,
    completed_by character varying(100),
    related_itinerary_id uuid,
    related_communication_id uuid,
    send_reminder boolean DEFAULT true,
    reminder_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completion_notes text
);


--
-- Name: client_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    note_type character varying(50) NOT NULL,
    title character varying(255),
    content text NOT NULL,
    category character varying(100),
    is_important boolean DEFAULT false,
    is_pinned boolean DEFAULT false,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: client_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    preferred_travel_style text[],
    preferred_destinations text[],
    preferred_activities text[],
    preferred_hotel_chains text[],
    room_preferences text[],
    cuisine_preferences text[],
    dietary_restrictions text[],
    favorite_restaurants text[],
    preferred_transportation_types text[],
    seat_preferences character varying(50),
    preferred_guide_languages text[],
    preferred_guide_specializations text[],
    typical_budget_range character varying(50),
    price_sensitivity character varying(50),
    mobility_requirements text,
    health_considerations text,
    age_related_needs text,
    destinations_to_avoid text[],
    activities_to_avoid text[],
    typical_advance_booking_days integer,
    preferred_booking_channels text[],
    decision_making_style character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_code character varying(20) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255),
    phone character varying(50),
    alternative_phone character varying(50),
    nationality character varying(100),
    passport_type character varying(50),
    date_of_birth date,
    preferred_language character varying(50),
    country character varying(100),
    city character varying(100),
    address_line1 text,
    address_line2 text,
    postal_code character varying(20),
    preferred_contact_method character varying(50),
    best_time_to_contact character varying(100),
    timezone character varying(100),
    preferred_accommodation_level character varying(50),
    dietary_restrictions text[],
    accessibility_needs text[],
    special_interests text[],
    company_name character varying(255),
    job_title character varying(100),
    is_travel_agent boolean DEFAULT false,
    agent_commission_rate numeric(5,2),
    client_type character varying(50) DEFAULT 'individual'::character varying,
    vip_status boolean DEFAULT false,
    client_source character varying(100),
    referred_by_client_id uuid,
    marketing_consent boolean DEFAULT false,
    newsletter_subscribed boolean DEFAULT false,
    sms_consent boolean DEFAULT false,
    total_bookings_count integer DEFAULT 0,
    total_revenue_generated numeric(12,2) DEFAULT 0.00,
    currency_preference character varying(10) DEFAULT 'EUR'::character varying,
    average_booking_value numeric(12,2) DEFAULT 0.00,
    status character varying(50) DEFAULT 'lead'::character varying,
    tags text[],
    rating integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by character varying(100),
    last_contacted_at timestamp with time zone,
    internal_notes text,
    lead_source character varying(50),
    revenue_by_currency jsonb DEFAULT '{}'::jsonb NOT NULL,
    collected_by_currency jsonb DEFAULT '{}'::jsonb NOT NULL,
    revenue_currency text,
    org_id uuid NOT NULL,
    CONSTRAINT clients_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT clients_status_check CHECK (((status)::text = ANY ((ARRAY['lead'::character varying, 'prospect'::character varying, 'customer'::character varying, 'inactive'::character varying])::text[])))
);


--
-- Name: communication_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    communication_type character varying(50) NOT NULL,
    direction character varying(20) NOT NULL,
    subject character varying(255),
    content text,
    whatsapp_conversation_text text,
    email_from character varying(255),
    email_to character varying(255),
    email_cc character varying(255),
    phone_duration_minutes integer,
    phone_number character varying(50),
    handled_by character varying(100),
    status character varying(50) DEFAULT 'completed'::character varying,
    priority character varying(20),
    related_itinerary_id uuid,
    attachments jsonb,
    communication_date timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    internal_notes text
);


--
-- Name: client_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.client_summary WITH (security_invoker='on') AS
 SELECT id,
    client_code,
    first_name,
    last_name,
    email,
    phone,
    nationality,
    client_type,
    vip_status,
    status,
    lead_source,
    created_at,
    last_contacted_at,
    COALESCE(total_bookings_count, 0) AS total_bookings_count,
    COALESCE(total_revenue_generated, (0)::numeric) AS total_revenue_generated,
    ( SELECT count(*) AS count
           FROM public.client_followups cf
          WHERE ((cf.client_id = c.id) AND ((cf.status)::text = 'pending'::text))) AS pending_followups,
    ( SELECT count(*) AS count
           FROM public.communication_history ch
          WHERE (ch.client_id = c.id)) AS total_communications
   FROM public.clients c;


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid,
    supplier_id uuid,
    client_id uuid,
    commission_type character varying(20) NOT NULL,
    category character varying(50) NOT NULL,
    source_name character varying(255),
    source_contact character varying(255),
    description text,
    base_amount numeric(12,2) DEFAULT 0,
    cost_amount numeric(12,2) DEFAULT 0,
    commission_rate numeric(5,2),
    commission_amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    transaction_date date DEFAULT CURRENT_DATE,
    due_date date,
    paid_date date,
    payment_method character varying(50),
    payment_reference character varying(255),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    org_id uuid NOT NULL,
    CONSTRAINT commissions_category_check CHECK (((category)::text = ANY ((ARRAY['hotel'::character varying, 'shopping'::character varying, 'restaurant'::character varying, 'transport'::character varying, 'cruise'::character varying, 'attraction'::character varying, 'optional_tour'::character varying, 'activity'::character varying, 'show'::character varying, 'spa'::character varying, 'agent_referral'::character varying, 'partner'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT commissions_commission_type_check CHECK (((commission_type)::text = ANY ((ARRAY['receivable'::character varying, 'payable'::character varying])::text[]))),
    CONSTRAINT commissions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'invoiced'::character varying, 'received'::character varying, 'paid'::character varying, 'cancelled'::character varying, 'disputed'::character varying])::text[])))
);


--
-- Name: communication_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    inbox_message_id uuid NOT NULL,
    parent_draft_id uuid,
    draft_body text NOT NULL,
    edited_body text,
    was_edited boolean DEFAULT false NOT NULL,
    operator_notes text,
    ai_model text,
    ai_confidence text,
    ai_flags jsonb DEFAULT '{}'::jsonb,
    context_used jsonb DEFAULT '{}'::jsonb,
    generation_time_ms integer,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    sent_at timestamp with time zone,
    send_channel text,
    send_message_id text,
    send_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT communication_drafts_ai_confidence_check CHECK ((ai_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT communication_drafts_send_channel_check CHECK ((send_channel = ANY (ARRAY['whatsapp'::text, 'email'::text]))),
    CONSTRAINT communication_drafts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'sent'::text, 'expired'::text])))
);


--
-- Name: communication_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    channel text NOT NULL,
    source_message_id text NOT NULL,
    sender_name text,
    sender_contact text NOT NULL,
    message_body text NOT NULL,
    message_snippet text,
    subject text,
    status text DEFAULT 'new'::text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    CONSTRAINT communication_inbox_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text]))),
    CONSTRAINT communication_inbox_status_check CHECK ((status = ANY (ARRAY['new'::text, 'draft_pending'::text, 'draft_ready'::text, 'draft_failed'::text, 'responded'::text, 'skipped'::text])))
);


--
-- Name: communication_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    whatsapp_conversation_id uuid,
    email_conversation_id uuid,
    client_id uuid,
    client_name text,
    contact_info text NOT NULL,
    subject text,
    status text DEFAULT 'open'::text NOT NULL,
    urgency text DEFAULT 'normal'::text NOT NULL,
    last_message_at timestamp with time zone,
    last_draft_at timestamp with time zone,
    message_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brief_id uuid,
    origin text,
    org_id uuid,
    CONSTRAINT communication_threads_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text]))),
    CONSTRAINT communication_threads_status_check CHECK ((status = ANY (ARRAY['open'::text, 'waiting'::text, 'resolved'::text, 'archived'::text]))),
    CONSTRAINT communication_threads_urgency_check CHECK ((urgency = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))
);


--
-- Name: concierge_brief_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concierge_brief_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brief_id uuid NOT NULL,
    conversation_id text NOT NULL,
    brief_revision integer NOT NULL,
    is_update boolean,
    payload jsonb NOT NULL,
    request_id text,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: concierge_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concierge_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id text NOT NULL,
    session_id text,
    brief_revision integer DEFAULT 1 NOT NULL,
    is_update boolean DEFAULT false NOT NULL,
    prompt_version text,
    language text,
    submitted_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    visitor_name text,
    visitor_email text,
    visitor_phone text,
    preferred_contact text,
    visitor_timezone text,
    travelers_count integer,
    travelers_detail text,
    dates_specific text,
    dates_window text,
    trip_length_days integer,
    origin_city text,
    nationality text,
    international_flights boolean,
    destinations jsonb,
    comfort_level text,
    interests jsonb,
    must_see jsonb,
    must_avoid jsonb,
    constraint_dietary text,
    constraint_mobility text,
    constraint_religious text,
    constraint_medical text,
    brief_summary text,
    full_transcript jsonb,
    committed_response_by timestamp with time zone,
    cairo_time_label text,
    visitor_local_label text,
    client_id uuid,
    review_status text DEFAULT 'needs_review'::text NOT NULL,
    is_actionable boolean DEFAULT true NOT NULL,
    flags text[] DEFAULT '{}'::text[] NOT NULL,
    raw_payload jsonb NOT NULL,
    request_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid,
    CONSTRAINT concierge_briefs_review_status_check CHECK ((review_status = ANY (ARRAY['needs_review'::text, 'in_progress'::text, 'responded'::text, 'archived'::text])))
);


--
-- Name: content_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    icon character varying(50),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: content_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    short_description text,
    location character varying(255),
    duration character varying(100),
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    duration_days integer,
    route character varying(100),
    is_cruise boolean DEFAULT false,
    start_city character varying(100),
    end_city character varying(100),
    tour_type character varying(50),
    destination_id uuid
);


--
-- Name: content_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_id uuid,
    variation_id uuid,
    itinerary_id uuid,
    used_at timestamp with time zone DEFAULT now(),
    context character varying(100)
);


--
-- Name: content_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_variations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_id uuid,
    tier character varying(20) NOT NULL,
    title character varying(255),
    description text NOT NULL,
    highlights text[] DEFAULT '{}'::text[],
    inclusions text[] DEFAULT '{}'::text[],
    internal_notes text,
    is_active boolean DEFAULT true,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    day_by_day jsonb,
    recommended_suppliers jsonb,
    CONSTRAINT content_variations_tier_check CHECK (((tier)::text = ANY ((ARRAY['budget'::character varying, 'standard'::character varying, 'deluxe'::character varying, 'luxury'::character varying])::text[])))
);


--
-- Name: conversation_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    agent_id uuid,
    action_type character varying(50) NOT NULL,
    action_details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    team_member_id uuid
);


--
-- Name: conversation_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    agent_id uuid,
    note text NOT NULL,
    is_pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    team_member_id uuid
);


--
-- Name: copilot_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copilot_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tone text DEFAULT 'professional'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copilot_settings_tone_check CHECK ((tone = ANY (ARRAY['professional'::text, 'friendly'::text, 'formal'::text])))
);


--
-- Name: cron_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_locks (
    job text NOT NULL,
    slot timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cron_watermarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_watermarks (
    job text NOT NULL,
    last_run_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cruise_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cruise_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    ship_name character varying(255),
    cruise_type character varying(100),
    star_rating character varying(10),
    route character varying(255),
    cabin_count integer,
    contact_person character varying(255),
    email character varying(255),
    phone character varying(100),
    whatsapp character varying(100),
    address text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tier character varying(20) DEFAULT 'standard'::character varying,
    is_preferred boolean DEFAULT false,
    routes text[]
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    service_types text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: departure_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departure_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    departure_id uuid NOT NULL,
    itinerary_id uuid,
    client_id uuid,
    client_name character varying(255),
    pax integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'confirmed'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT departure_bookings_pax_check CHECK ((pax > 0)),
    CONSTRAINT departure_bookings_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: destination_cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.destination_cities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    destination_id uuid NOT NULL,
    name text NOT NULL,
    name_ja text,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    lat numeric,
    lng numeric,
    airport_codes text[] DEFAULT '{}'::text[] NOT NULL,
    timezone text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: destinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.destinations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code text NOT NULL,
    name text NOT NULL,
    name_ja text,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    generation_brief text,
    glossary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: destinations_legacy_2025; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.destinations_legacy_2025 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    destination_code character varying(50) NOT NULL,
    destination_name character varying(100) NOT NULL,
    region character varying(50),
    description text,
    popular_attractions text[],
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: discount_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_type character varying(50) NOT NULL,
    max_age integer,
    discount_percentage numeric(5,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: email_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid,
    message_id text,
    thread_id text,
    activity_type text NOT NULL,
    subject text,
    from_email text,
    to_email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_cache_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_cache_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    folder text NOT NULL,
    history_id text,
    last_fetch timestamp with time zone DEFAULT now(),
    email_count integer DEFAULT 0
);


--
-- Name: email_client_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_client_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message_id text NOT NULL,
    thread_id text,
    client_id uuid,
    email_address text,
    auto_linked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id character varying(255) NOT NULL,
    user_id uuid,
    client_id uuid,
    client_name character varying(255),
    client_email character varying(255),
    subject character varying(500),
    last_message_snippet text,
    last_message_at timestamp with time zone,
    message_count integer DEFAULT 0,
    unread_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    is_starred boolean DEFAULT false,
    is_hidden boolean DEFAULT false,
    assigned_team_member_id uuid,
    assigned_at timestamp with time zone,
    last_sync_at timestamp with time zone,
    gmail_history_id character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    message_id character varying(255) NOT NULL,
    thread_id character varying(255) NOT NULL,
    direction character varying(10) NOT NULL,
    from_address character varying(255) NOT NULL,
    to_addresses text[],
    cc_addresses text[],
    bcc_addresses text[],
    subject character varying(500),
    body_text text,
    body_html text,
    snippet text,
    attachments jsonb DEFAULT '[]'::jsonb,
    is_read boolean DEFAULT false,
    is_starred boolean DEFAULT false,
    labels text[],
    sent_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_messages_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[])))
);


--
-- Name: email_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    content text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    last_history_id character varying(50),
    last_full_sync_at timestamp with time zone,
    last_incremental_sync_at timestamp with time zone,
    sync_status character varying(20) DEFAULT 'idle'::character varying,
    error_message text,
    emails_synced integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_sync_state_sync_status_check CHECK (((sync_status)::text = ANY ((ARRAY['idle'::character varying, 'running'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'general'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    placeholders text[] DEFAULT '{}'::text[]
);


--
-- Name: entrance_fee_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrance_fee_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entrance_fee_id uuid NOT NULL,
    language character varying(2) NOT NULL,
    attraction_name text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT entrance_fee_versions_language_check CHECK (((language)::text = ANY ((ARRAY['en'::character varying, 'ja'::character varying])::text[])))
);


--
-- Name: entrance_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrance_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    attraction_name character varying(255) NOT NULL,
    city character varying(100) NOT NULL,
    fee_type character varying(50),
    eur_rate numeric(10,2) NOT NULL,
    non_eur_rate numeric(10,2) NOT NULL,
    egyptian_rate numeric(10,2),
    student_discount_percentage integer,
    season character varying(50),
    rate_valid_from date NOT NULL,
    rate_valid_to date NOT NULL,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    child_discount_percent integer DEFAULT 50,
    category text,
    supplier_id uuid,
    is_addon boolean DEFAULT false,
    addon_note text,
    rate_currency text,
    CONSTRAINT entrance_fees_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: exchange_rate_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rate_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    base_currency text NOT NULL,
    target_currency text NOT NULL,
    rate numeric NOT NULL,
    source text DEFAULT 'frankfurter'::text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rate_snapshots_rate_check CHECK ((rate > (0)::numeric))
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    base_currency text NOT NULL,
    target_currency text NOT NULL,
    rate numeric NOT NULL,
    source text DEFAULT 'api'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    api_fetched_at timestamp with time zone,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_distinct_currencies CHECK ((base_currency <> target_currency)),
    CONSTRAINT exchange_rates_rate_check CHECK ((rate > (0)::numeric))
);


--
-- Name: expense_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expense_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_number character varying,
    itinerary_id uuid,
    supplier_id uuid,
    category character varying NOT NULL,
    description text,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    expense_date date NOT NULL,
    supplier_name character varying,
    supplier_type character varying,
    receipt_url text,
    receipt_filename character varying,
    status character varying DEFAULT 'pending'::character varying,
    payment_method character varying,
    payment_date date,
    payment_reference character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    tax_included boolean DEFAULT true,
    org_id uuid NOT NULL
);


--
-- Name: fixed_daily_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_daily_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cost_type character varying(50) NOT NULL,
    cost_per_person_per_day numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    description text,
    rate_currency text,
    CONSTRAINT fixed_daily_costs_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: flight_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(100) NOT NULL,
    route_from character varying(100) NOT NULL,
    route_to character varying(100) NOT NULL,
    route_name character varying(255),
    airline character varying(100) NOT NULL,
    airline_code character varying(10),
    flight_number character varying(20),
    flight_type character varying(50) DEFAULT 'domestic'::character varying NOT NULL,
    cabin_class character varying(50) DEFAULT 'economy'::character varying NOT NULL,
    departure_time time without time zone,
    arrival_time time without time zone,
    duration_minutes integer,
    frequency character varying(100),
    base_rate_eur numeric(10,2) DEFAULT 0 NOT NULL,
    base_rate_non_eur numeric(10,2) DEFAULT 0,
    tax_eur numeric(10,2) DEFAULT 0,
    tax_non_eur numeric(10,2) DEFAULT 0,
    baggage_kg integer DEFAULT 23,
    carry_on_kg integer DEFAULT 7,
    season character varying(50),
    rate_valid_from date,
    rate_valid_to date,
    supplier_id uuid,
    supplier_name character varying(255),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    rate_currency text,
    CONSTRAINT flight_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: gmail_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gmail_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expiry timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_history_id text
);


--
-- Name: guide_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guide_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    guide_language character varying(50) NOT NULL,
    guide_type character varying(50) NOT NULL,
    city character varying(100),
    tour_duration character varying(50),
    base_rate_eur numeric(10,2) NOT NULL,
    base_rate_non_eur numeric(10,2) NOT NULL,
    season character varying(50),
    rate_valid_from date,
    rate_valid_to date,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    supplier_id uuid,
    rate_currency text,
    CONSTRAINT guide_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: guides; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.guides WITH (security_invoker='on') AS
 SELECT id,
    name,
    contact_email AS email,
    contact_phone AS phone,
    languages,
    specialties,
    certification_number,
    license_expiry,
    ((status)::text = 'active'::text) AS is_active,
    max_group_size,
    hourly_rate,
    daily_rate,
    emergency_contact_name,
    emergency_contact_phone,
    address,
    notes,
    profile_photo_url,
    created_at,
    updated_at,
    tier,
    is_preferred,
    city,
    whatsapp
   FROM public.suppliers
  WHERE ('guide'::text = ANY (types));


--
-- Name: high_value_clients; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.high_value_clients WITH (security_invoker='on') AS
 SELECT id,
    client_code,
    first_name,
    last_name,
    email,
    phone,
    alternative_phone,
    nationality,
    passport_type,
    date_of_birth,
    preferred_language,
    country,
    city,
    address_line1,
    address_line2,
    postal_code,
    preferred_contact_method,
    best_time_to_contact,
    timezone,
    preferred_accommodation_level,
    dietary_restrictions,
    accessibility_needs,
    special_interests,
    company_name,
    job_title,
    is_travel_agent,
    agent_commission_rate,
    client_type,
    vip_status,
    client_source,
    referred_by_client_id,
    marketing_consent,
    newsletter_subscribed,
    sms_consent,
    total_bookings_count,
    total_revenue_generated,
    currency_preference,
    average_booking_value,
    status,
    tags,
    rating,
    created_at,
    updated_at,
    created_by,
    last_contacted_at,
    internal_notes,
    rank() OVER (ORDER BY total_revenue_generated DESC) AS revenue_rank
   FROM public.clients c
  WHERE (total_revenue_generated > (0)::numeric)
  ORDER BY total_revenue_generated DESC;


--
-- Name: hotel_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    property_type text,
    star_rating integer,
    city text NOT NULL,
    address text,
    contact_person text,
    phone text,
    email text,
    whatsapp text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    amenities text[],
    capacity integer,
    rate_single_eur numeric(10,2) DEFAULT 0,
    rate_double_eur numeric(10,2) DEFAULT 0,
    rate_triple_eur numeric(10,2) DEFAULT 0,
    rate_single_non_eur numeric(10,2) DEFAULT 0,
    rate_double_non_eur numeric(10,2) DEFAULT 0,
    rate_triple_non_eur numeric(10,2) DEFAULT 0,
    rate_suite_eur numeric(10,2) DEFAULT 0,
    rate_suite_non_eur numeric(10,2) DEFAULT 0,
    high_season_markup_percent numeric(5,2) DEFAULT 0,
    peak_season_markup_percent numeric(5,2) DEFAULT 0,
    breakfast_included boolean DEFAULT true,
    breakfast_rate_eur numeric(10,2) DEFAULT 0,
    rate_valid_from date DEFAULT CURRENT_DATE,
    rate_valid_to date DEFAULT '2099-12-31'::date,
    meal_plan text DEFAULT 'BB'::text,
    child_policy text,
    tier character varying(20) DEFAULT 'standard'::character varying,
    is_preferred boolean DEFAULT false,
    low_season_from date,
    low_season_to date,
    high_season_from date,
    high_season_to date,
    peak_season_from date,
    peak_season_to date,
    peak_season_2_from date,
    peak_season_2_to date,
    contact_name character varying(255),
    contact_email character varying(255),
    contact_phone character varying(50),
    reservations_email character varying(255),
    reservations_phone character varying(50)
);


--
-- Name: hotel_staff; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hotel_staff WITH (security_invoker='on') AS
 SELECT id,
    name,
    service_role AS role,
    contact_phone AS phone,
    whatsapp,
    contact_email AS email,
    languages,
    shift_times,
    notes,
    ((status)::text = 'active'::text) AS is_active,
    created_at,
    updated_at,
    emergency_contact_name AS emergency_contact,
    tier,
    is_preferred
   FROM public.suppliers
  WHERE ('hotel_assistant'::text = ANY (types));


--
-- Name: hotel_staff_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_staff_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    service_type character varying(50) NOT NULL,
    hotel_category character varying(20),
    rate_eur numeric(10,2),
    rate_valid_from date,
    rate_valid_to date,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    destination text,
    supplier_id uuid,
    rate_currency text,
    CONSTRAINT hotel_staff_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: insurance_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    plan_code character varying(10) NOT NULL,
    provider character varying(255) DEFAULT '海外渡航者安全事業共済会'::character varying NOT NULL,
    product_name character varying(255) DEFAULT 'トラベルセーフティプラン'::character varying NOT NULL,
    cover_accidental_death bigint,
    cover_illness_death bigint,
    cover_treatment_rescue bigint,
    cover_liability bigint,
    cover_baggage bigint,
    cover_baggage_delay bigint,
    cover_flight_delay bigint,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: insurance_premiums; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_premiums (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    rate_year integer NOT NULL,
    max_days integer NOT NULL,
    band_label character varying(30) NOT NULL,
    premium_jpy integer NOT NULL,
    max_age integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT insurance_premiums_max_days_check CHECK ((max_days > 0)),
    CONSTRAINT insurance_premiums_premium_jpy_check CHECK ((premium_jpy >= 0))
);


--
-- Name: integration_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    direction character varying(10) NOT NULL,
    event_type character varying(60) DEFAULT 'departures.sync'::character varying NOT NULL,
    external_event_id character varying(200),
    status character varying(20) DEFAULT 'received'::character varying NOT NULL,
    payload jsonb,
    result jsonb,
    error text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT integration_events_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[]))),
    CONSTRAINT integration_events_status_check CHECK (((status)::text = ANY ((ARRAY['received'::character varying, 'processed'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    provider character varying(50) DEFAULT 'generic'::character varying NOT NULL,
    name character varying(120) NOT NULL,
    endpoint_token character varying(64),
    direction character varying(10) DEFAULT 'both'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    inbound_secret text,
    outbound_key_hash text,
    outbound_key_prefix character varying(24),
    outbound_key_issued_at timestamp with time zone,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_inbound_at timestamp with time zone,
    last_outbound_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT integrations_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying, 'both'::character varying])::text[])))
);


--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid,
    amount numeric NOT NULL,
    currency character varying DEFAULT 'EUR'::character varying,
    payment_method character varying,
    payment_date date DEFAULT CURRENT_DATE,
    transaction_reference character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: invoice_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    reminder_type character varying(50) NOT NULL,
    recipient_email character varying(255) NOT NULL,
    subject character varying(500),
    status character varying(20) DEFAULT 'sent'::character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number character varying NOT NULL,
    client_id uuid,
    itinerary_id uuid,
    client_name character varying,
    client_email character varying,
    line_items jsonb DEFAULT '[]'::jsonb,
    subtotal numeric DEFAULT 0,
    tax_rate numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    currency character varying DEFAULT 'EUR'::character varying,
    amount_paid numeric DEFAULT 0,
    balance_due numeric DEFAULT 0,
    status character varying DEFAULT 'draft'::character varying,
    issue_date date DEFAULT CURRENT_DATE,
    due_date date,
    notes text,
    payment_terms text DEFAULT 'Payment due within 14 days'::text,
    payment_instructions text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    last_reminder_sent timestamp without time zone,
    reminder_count integer DEFAULT 0,
    next_reminder_date date,
    reminder_paused boolean DEFAULT false,
    invoice_type character varying(20) DEFAULT 'standard'::character varying,
    deposit_percent numeric DEFAULT 10,
    parent_invoice_id uuid,
    org_id uuid NOT NULL,
    full_trip_cost numeric(12,2),
    CONSTRAINT invoices_invoice_type_check CHECK (((invoice_type)::text = ANY ((ARRAY['standard'::character varying, 'deposit'::character varying, 'final'::character varying])::text[])))
);


--
-- Name: itineraries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itineraries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_code character varying(50) NOT NULL,
    client_name character varying(255) NOT NULL,
    client_email character varying(255),
    client_phone character varying(50),
    trip_name character varying(255) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_days integer NOT NULL,
    num_adults integer DEFAULT 2,
    num_children integer DEFAULT 0,
    currency character varying(10) DEFAULT 'EUR'::character varying,
    total_cost numeric(10,2) DEFAULT 0.00,
    status character varying(50) DEFAULT 'draft'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    cancelled_at timestamp without time zone,
    cancellation_reason text,
    user_id uuid,
    client_id uuid,
    payment_status character varying(50) DEFAULT 'not_paid'::character varying,
    total_paid numeric(10,2) DEFAULT 0,
    deposit_amount numeric(10,2),
    balance_due numeric(10,2),
    assigned_guide_id uuid,
    assigned_vehicle_id uuid,
    guide_notes text,
    vehicle_notes text,
    pickup_location text,
    pickup_time time without time zone,
    destinations text,
    num_travelers integer,
    assigned_hotel_id uuid,
    assigned_restaurant_id uuid,
    assigned_airport_staff_id uuid,
    assigned_hotel_staff_id uuid,
    hotel_notes text,
    restaurant_notes text,
    airport_staff_notes text,
    hotel_staff_notes text,
    total_revenue numeric(10,2),
    margin_percent numeric(5,2) DEFAULT 25,
    tier character varying(20) DEFAULT 'standard'::character varying,
    cost_mode character varying(10) DEFAULT 'auto'::character varying,
    package_type public.package_type_enum DEFAULT 'full-package'::public.package_type_enum,
    supplier_cost numeric(10,2) DEFAULT 0,
    profit numeric(10,2) DEFAULT 0,
    num_infants integer DEFAULT 0,
    partner_id uuid,
    source character varying(30) DEFAULT 'b2c_direct'::character varying,
    partner_commission_percent numeric(5,2) DEFAULT 0,
    partner_commission_amount numeric(12,2) DEFAULT 0,
    cabin_allocation jsonb,
    inclusions text[] DEFAULT ARRAY['Private transportation throughout: all airport transfers'::text, 'Licensed private guiding: Egyptologist-naturalist for sightseeing'::text, 'Entrance fees to all sites listed'::text, 'Accommodation as specified in the itinerary'::text, 'Curated lunches in clean, reliable restaurants'::text, 'Tips for drivers, porters, and hotel concierge'::text, 'All taxes and service charges'::text],
    exclusions text[] DEFAULT ARRAY['International flights'::text, 'Meals not specified in the itinerary'::text, 'Gratuities for your guide (appreciated but not obligatory)'::text, 'Travel insurance'::text, 'Personal expenses'::text, 'Visa fees (if applicable)'::text, 'Optional activities not mentioned in the itinerary'::text],
    idempotency_key text,
    generation_warnings jsonb,
    org_id uuid NOT NULL,
    thread_id uuid,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    template_id uuid,
    fx_frozen jsonb,
    destination_id uuid
);


--
-- Name: itineraries_with_languages; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.itineraries_with_languages AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(50) AS itinerary_code,
    NULL::character varying(255) AS client_name,
    NULL::character varying(255) AS client_email,
    NULL::character varying(50) AS client_phone,
    NULL::character varying(255) AS trip_name,
    NULL::date AS start_date,
    NULL::date AS end_date,
    NULL::integer AS total_days,
    NULL::integer AS num_adults,
    NULL::integer AS num_children,
    NULL::character varying(10) AS currency,
    NULL::numeric(10,2) AS total_cost,
    NULL::character varying(50) AS status,
    NULL::text AS notes,
    NULL::timestamp without time zone AS created_at,
    NULL::timestamp without time zone AS updated_at,
    NULL::timestamp without time zone AS cancelled_at,
    NULL::text AS cancellation_reason,
    NULL::uuid AS user_id,
    NULL::uuid AS client_id,
    NULL::character varying(50) AS payment_status,
    NULL::numeric(10,2) AS total_paid,
    NULL::numeric(10,2) AS deposit_amount,
    NULL::numeric(10,2) AS balance_due,
    NULL::uuid AS assigned_guide_id,
    NULL::uuid AS assigned_vehicle_id,
    NULL::text AS guide_notes,
    NULL::text AS vehicle_notes,
    NULL::text AS pickup_location,
    NULL::time without time zone AS pickup_time,
    NULL::text AS destinations,
    NULL::integer AS num_travelers,
    NULL::uuid AS assigned_hotel_id,
    NULL::uuid AS assigned_restaurant_id,
    NULL::uuid AS assigned_airport_staff_id,
    NULL::uuid AS assigned_hotel_staff_id,
    NULL::text AS hotel_notes,
    NULL::text AS restaurant_notes,
    NULL::text AS airport_staff_notes,
    NULL::text AS hotel_staff_notes,
    NULL::numeric(10,2) AS total_revenue,
    NULL::numeric(5,2) AS margin_percent,
    NULL::character varying(20) AS tier,
    NULL::character varying(10) AS cost_mode,
    NULL::public.package_type_enum AS package_type,
    NULL::numeric(10,2) AS supplier_cost,
    NULL::numeric(10,2) AS profit,
    NULL::character varying[] AS available_languages,
    NULL::bigint AS version_count;


--
-- Name: itinerary_day_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_day_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_day_id uuid NOT NULL,
    language character varying(2) NOT NULL,
    title text,
    description text,
    city text,
    overnight_city text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT itinerary_day_versions_language_check CHECK (((language)::text = ANY ((ARRAY['en'::character varying, 'ja'::character varying])::text[])))
);


--
-- Name: itinerary_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid NOT NULL,
    day_number integer NOT NULL,
    date date NOT NULL,
    city character varying(100),
    title character varying(255),
    description text,
    overnight_city character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    attractions text[] DEFAULT '{}'::text[],
    guide_required boolean DEFAULT true,
    lunch_included boolean DEFAULT true,
    dinner_included boolean DEFAULT false,
    hotel_included boolean DEFAULT true,
    flight_from text,
    is_cruise_day boolean DEFAULT false,
    transport_type text,
    skip_arrival_checkin boolean DEFAULT false NOT NULL,
    extras text[] DEFAULT '{}'::text[] NOT NULL,
    day_type text DEFAULT 'tour'::text NOT NULL,
    overnight boolean,
    has_sightseeing boolean,
    airport_arrival boolean,
    airport_departure boolean,
    hotel_check_in boolean,
    hotel_check_out boolean,
    intercity text,
    CONSTRAINT itinerary_days_day_type_check CHECK ((day_type = ANY (ARRAY['arrival'::text, 'tour'::text, 'transfer'::text, 'cruise'::text, 'free'::text, 'departure'::text]))),
    CONSTRAINT itinerary_days_intercity_check CHECK (((intercity IS NULL) OR (intercity = ANY (ARRAY['none'::text, 'road'::text, 'flight'::text])))),
    CONSTRAINT itinerary_days_transport_type_check CHECK (((transport_type IS NULL) OR (transport_type = ANY (ARRAY['flight'::text, 'ground'::text]))))
);


--
-- Name: itinerary_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid NOT NULL,
    itinerary_day_id uuid,
    resource_type character varying(50) NOT NULL,
    resource_id uuid NOT NULL,
    resource_name character varying(255),
    start_date date NOT NULL,
    end_date date,
    notes text,
    quantity integer DEFAULT 1,
    cost_eur numeric(10,2),
    cost_non_eur numeric(10,2),
    status character varying(50) DEFAULT 'confirmed'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: itinerary_service_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_service_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_service_id uuid NOT NULL,
    language character varying(2) NOT NULL,
    service_name text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT itinerary_service_versions_language_check CHECK (((language)::text = ANY ((ARRAY['en'::character varying, 'ja'::character varying])::text[])))
);


--
-- Name: itinerary_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_day_id uuid NOT NULL,
    service_type character varying(50) NOT NULL,
    service_code character varying(50),
    service_name character varying(255) NOT NULL,
    quantity integer DEFAULT 1,
    rate_eur numeric(10,2),
    rate_non_eur numeric(10,2),
    total_cost numeric(10,2),
    supplier_name character varying(255),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    client_price numeric(10,2),
    supplier_id uuid,
    is_preferred_supplier boolean DEFAULT false,
    commission_rate numeric(5,2),
    commission_amount numeric(12,2),
    commission_status character varying(20) DEFAULT 'pending'::character varying,
    vehicle_type character varying(50),
    pickup_location text,
    dropoff_location text,
    pickup_time time without time zone,
    supplier_currency text DEFAULT 'EUR'::text,
    supplier_cost_original numeric,
    exchange_rate_used numeric,
    sold_by_supplier_id uuid
);


--
-- Name: itinerary_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    itinerary_id uuid NOT NULL,
    token text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    last_viewed_at timestamp with time zone
);


--
-- Name: itinerary_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itinerary_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid NOT NULL,
    language character varying(2) NOT NULL,
    trip_name text NOT NULL,
    notes text,
    pickup_location text,
    guide_notes text,
    vehicle_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    inclusions text[],
    exclusions text[],
    CONSTRAINT itinerary_versions_language_check CHECK (((language)::text = ANY ((ARRAY['en'::character varying, 'ja'::character varying])::text[])))
);


--
-- Name: meal_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meal_type character varying(50) NOT NULL,
    cost_per_person numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: meal_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    restaurant_name character varying(255) NOT NULL,
    meal_type character varying(50),
    cuisine_type character varying(100),
    restaurant_type character varying(100),
    city character varying(100),
    base_rate_eur numeric(10,2),
    base_rate_non_eur numeric(10,2),
    season character varying(50),
    rate_valid_from date,
    rate_valid_to date,
    supplier_name character varying(255),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tier text,
    meal_category text,
    dietary_options text[],
    per_person_rate boolean DEFAULT true,
    minimum_pax integer DEFAULT 1,
    supplier_id uuid,
    is_preferred boolean DEFAULT false,
    rate_currency text,
    CONSTRAINT meal_rates_meal_category_check CHECK ((meal_category = ANY (ARRAY['buffet'::text, 'a_la_carte'::text, 'picnic'::text, 'box_lunch'::text, 'fine_dining'::text, 'casual'::text]))),
    CONSTRAINT meal_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text])))),
    CONSTRAINT meal_rates_tier_check CHECK ((tier = ANY (ARRAY['budget'::text, 'standard'::text, 'deluxe'::text, 'luxury'::text])))
);


--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(50) DEFAULT 'customer'::character varying NOT NULL,
    subcategory character varying(100),
    channel character varying(20) DEFAULT 'email'::character varying NOT NULL,
    subject character varying(500),
    body text NOT NULL,
    placeholders jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    last_used_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    language text DEFAULT 'en'::text NOT NULL,
    CONSTRAINT message_templates_language_check CHECK ((language = ANY (ARRAY['en'::text, 'ja'::text])))
);


--
-- Name: nile_cruises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nile_cruises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cruise_code character varying(50) NOT NULL,
    ship_name character varying(100) NOT NULL,
    ship_category character varying(20) NOT NULL,
    route_name character varying(100) NOT NULL,
    embark_city character varying(50) NOT NULL,
    disembark_city character varying(50) NOT NULL,
    duration_nights integer NOT NULL,
    cabin_type character varying(20) NOT NULL,
    rate_single_eur numeric(10,2) NOT NULL,
    rate_double_eur numeric(10,2) NOT NULL,
    rate_triple_eur numeric(10,2),
    meals_included character varying(20) DEFAULT 'full_board'::character varying,
    sightseeing_included boolean DEFAULT false,
    rate_valid_from date,
    rate_valid_to date,
    season character varying(20) DEFAULT 'all_year'::character varying,
    supplier_name character varying(100),
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    supplier_id uuid,
    is_preferred boolean DEFAULT false,
    season_start date,
    season_end date,
    rate_double_eur_low numeric(10,2),
    rate_double_eur_high numeric(10,2),
    rate_double_eur_peak numeric(10,2),
    tier character varying(50) DEFAULT 'standard'::character varying,
    low_season_start date,
    low_season_end date,
    rate_low_single_eur numeric(10,2) DEFAULT 0,
    rate_low_double_eur numeric(10,2) DEFAULT 0,
    rate_low_triple_eur numeric(10,2) DEFAULT 0,
    rate_low_suite_eur numeric(10,2) DEFAULT 0,
    rate_low_single_non_eur numeric(10,2) DEFAULT 0,
    rate_low_double_non_eur numeric(10,2) DEFAULT 0,
    rate_low_triple_non_eur numeric(10,2) DEFAULT 0,
    rate_low_suite_non_eur numeric(10,2) DEFAULT 0,
    high_season_start date,
    high_season_end date,
    rate_high_single_eur numeric(10,2) DEFAULT 0,
    rate_high_double_eur numeric(10,2) DEFAULT 0,
    rate_high_triple_eur numeric(10,2) DEFAULT 0,
    rate_high_suite_eur numeric(10,2) DEFAULT 0,
    rate_high_single_non_eur numeric(10,2) DEFAULT 0,
    rate_high_double_non_eur numeric(10,2) DEFAULT 0,
    rate_high_triple_non_eur numeric(10,2) DEFAULT 0,
    rate_high_suite_non_eur numeric(10,2) DEFAULT 0,
    peak_season_1_start date,
    peak_season_1_end date,
    peak_season_2_start date,
    peak_season_2_end date,
    rate_peak_single_eur numeric(10,2) DEFAULT 0,
    rate_peak_double_eur numeric(10,2) DEFAULT 0,
    rate_peak_triple_eur numeric(10,2) DEFAULT 0,
    rate_peak_suite_eur numeric(10,2) DEFAULT 0,
    rate_peak_single_non_eur numeric(10,2) DEFAULT 0,
    rate_peak_double_non_eur numeric(10,2) DEFAULT 0,
    rate_peak_triple_non_eur numeric(10,2) DEFAULT 0,
    rate_peak_suite_non_eur numeric(10,2) DEFAULT 0,
    seasons jsonb,
    rate_currency text,
    CONSTRAINT nile_cruises_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text,
    link character varying(500),
    related_task_id uuid,
    is_read boolean DEFAULT false,
    email_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    related_itinerary_id uuid,
    user_id uuid,
    CONSTRAINT notifications_recipient_check CHECK (((user_id IS NOT NULL) OR (team_member_id IS NOT NULL)))
);


--
-- Name: operator_capacity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_capacity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    date date NOT NULL,
    status character varying(20) DEFAULT 'available'::character varying NOT NULL,
    max_groups integer DEFAULT 3 NOT NULL,
    booked_groups integer DEFAULT 0 NOT NULL,
    max_guides integer,
    booked_guides integer DEFAULT 0,
    max_vehicles integer,
    booked_vehicles integer DEFAULT 0,
    notes text,
    internal_notes text,
    reason character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT operator_capacity_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'limited'::character varying, 'busy'::character varying, 'blackout'::character varying])::text[])))
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_ai_enabled boolean DEFAULT false NOT NULL,
    logo_url text,
    primary_color text,
    secondary_color text,
    contact_email text,
    company_phone text,
    company_website text,
    tagline text,
    deposit_percent numeric(5,2),
    deposit_due_days integer,
    balance_due_days_before_departure integer,
    company_address text,
    document_contacts jsonb DEFAULT '{}'::jsonb NOT NULL,
    offices jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_currency character varying(3),
    rate_currency character varying(3) DEFAULT 'EUR'::character varying NOT NULL,
    default_margin_percent numeric(5,2),
    rate_change_alerts text DEFAULT 'in_app'::text NOT NULL,
    support_hours jsonb,
    CONSTRAINT organizations_default_currency_check CHECK (((default_currency IS NULL) OR ((default_currency)::text = ANY ((ARRAY['USD'::character varying, 'EUR'::character varying, 'GBP'::character varying, 'EGP'::character varying, 'JPY'::character varying])::text[])))),
    CONSTRAINT organizations_default_margin_percent_check CHECK (((default_margin_percent IS NULL) OR ((default_margin_percent >= (0)::numeric) AND (default_margin_percent <= (100)::numeric)))),
    CONSTRAINT organizations_deposit_percent_range CHECK (((deposit_percent IS NULL) OR ((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric)))),
    CONSTRAINT organizations_payment_days_non_negative CHECK ((((deposit_due_days IS NULL) OR (deposit_due_days >= 0)) AND ((balance_due_days_before_departure IS NULL) OR (balance_due_days_before_departure >= 0)))),
    CONSTRAINT organizations_rate_change_alerts_check CHECK ((rate_change_alerts = ANY (ARRAY['off'::text, 'in_app'::text, 'in_app_email'::text]))),
    CONSTRAINT organizations_rate_currency_check CHECK (((rate_currency)::text = ANY ((ARRAY['USD'::character varying, 'EUR'::character varying, 'GBP'::character varying, 'EGP'::character varying, 'JPY'::character varying])::text[])))
);


--
-- Name: outside_cairo_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outside_cairo_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fee_per_person numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: overdue_followups; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.overdue_followups WITH (security_invoker='on') AS
 SELECT cf.id,
    cf.client_id,
    cf.followup_type,
    cf.title,
    cf.description,
    cf.due_date,
    cf.due_time,
    cf.assigned_to,
    cf.priority,
    cf.status,
    cf.completed_at,
    cf.completed_by,
    cf.related_itinerary_id,
    cf.related_communication_id,
    cf.send_reminder,
    cf.reminder_sent,
    cf.created_at,
    cf.updated_at,
    cf.completion_notes,
    (((c.first_name)::text || ' '::text) || (c.last_name)::text) AS client_name,
    c.email AS client_email,
    c.phone AS client_phone
   FROM (public.client_followups cf
     JOIN public.clients c ON ((cf.client_id = c.id)))
  WHERE (((cf.status)::text = 'pending'::text) AND (cf.due_date < CURRENT_DATE));


--
-- Name: package_type_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_type_definitions (
    slug character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    include_accommodation boolean DEFAULT false,
    include_airport_transfers boolean DEFAULT false,
    include_internal_transfers boolean DEFAULT true,
    include_tours boolean DEFAULT true,
    include_meals character varying(20) DEFAULT 'optional'::character varying,
    icon character varying(50),
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid NOT NULL,
    payment_type character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    payment_method character varying(50),
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    transaction_reference character varying(255),
    payment_date timestamp without time zone,
    due_date timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    org_id uuid NOT NULL
);


--
-- Name: portal_message_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_message_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    passenger_id uuid,
    last_message_at timestamp with time zone,
    last_message_snippet text,
    last_sender text,
    staff_last_read_at timestamp with time zone,
    customer_last_read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT portal_message_threads_last_sender_check CHECK ((last_sender = ANY (ARRAY['customer'::text, 'staff'::text, 'system'::text])))
);


--
-- Name: portal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    sender text NOT NULL,
    sender_user_id uuid,
    sender_name character varying(120),
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT portal_messages_body_check CHECK ((length(btrim(body)) > 0)),
    CONSTRAINT portal_messages_sender_check CHECK ((sender = ANY (ARRAY['customer'::text, 'staff'::text, 'system'::text])))
);


--
-- Name: pricing_season_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_season_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    season_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    label character varying(120),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_season_dates_check CHECK ((end_date >= start_date))
);


--
-- Name: pricing_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    uplift_percent numeric(5,2) DEFAULT 0 NOT NULL,
    colour character varying(7) DEFAULT '#647C47'::character varying NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_seasons_uplift_percent_check CHECK (((uplift_percent >= (0)::numeric) AND (uplift_percent <= (200)::numeric)))
);


--
-- Name: profit_margins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profit_margins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tour_type character varying(50) NOT NULL,
    margin_percentage numeric(5,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: prompt_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    purpose character varying(100) NOT NULL,
    description text,
    system_prompt text,
    user_prompt_template text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    model character varying(50) DEFAULT 'claude-sonnet-4-20250514'::character varying,
    temperature numeric(2,1) DEFAULT 0.7,
    max_tokens integer DEFAULT 2000,
    is_active boolean DEFAULT true,
    version integer DEFAULT 1,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_default boolean DEFAULT false
);


--
-- Name: quote_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_type character varying(10) DEFAULT 'b2b'::character varying NOT NULL,
    quote_id uuid NOT NULL,
    version_number integer NOT NULL,
    is_current boolean DEFAULT false,
    quote_data jsonb NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    change_reason text,
    change_summary text,
    changes_diff jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT quote_revisions_quote_type_check CHECK (((quote_type)::text = ANY ((ARRAY['b2c'::character varying, 'b2b'::character varying])::text[])))
);


--
-- Name: quote_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    language character varying(2) NOT NULL,
    title text,
    notes text,
    terms_conditions text,
    special_requests text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT quote_versions_language_check CHECK (((language)::text = ANY ((ARRAY['en'::character varying, 'ja'::character varying])::text[])))
);


--
-- Name: quotes_with_languages; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.quotes_with_languages AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(50) AS quote_number,
    NULL::uuid AS variation_id,
    NULL::uuid AS partner_id,
    NULL::character varying(255) AS client_name,
    NULL::character varying(255) AS client_email,
    NULL::character varying(50) AS client_phone,
    NULL::character varying(100) AS client_nationality,
    NULL::date AS travel_date,
    NULL::integer AS num_adults,
    NULL::integer AS num_children,
    NULL::jsonb AS services_snapshot,
    NULL::numeric(12,2) AS total_cost,
    NULL::numeric(5,2) AS margin_percent,
    NULL::numeric(12,2) AS margin_amount,
    NULL::numeric(12,2) AS selling_price,
    NULL::numeric(10,2) AS price_per_person,
    NULL::character varying(3) AS currency,
    NULL::character varying(20) AS status,
    NULL::date AS valid_until,
    NULL::uuid AS converted_to_itinerary_id,
    NULL::timestamp with time zone AS converted_at,
    NULL::text AS notes,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::uuid AS created_by,
    NULL::boolean AS tour_leader_included,
    NULL::numeric AS tour_leader_cost,
    NULL::numeric AS single_supplement,
    NULL::boolean AS is_eur_passport,
    NULL::character varying(20) AS season,
    NULL::character varying[] AS available_languages,
    NULL::bigint AS version_count;


--
-- Name: rate_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL,
    changed_fields jsonb,
    full_old_record jsonb,
    full_new_record jsonb,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    notes text,
    CONSTRAINT rate_audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: recent_audit_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.recent_audit_activity WITH (security_invoker='on') AS
 SELECT id,
    created_at,
    user_email,
    user_role,
    action,
    table_name,
    record_id,
    status,
    error_message,
    changes
   FROM public.audit_logs al
  ORDER BY created_at DESC
 LIMIT 100;


--
-- Name: reminder_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    days_offset integer NOT NULL,
    is_active boolean DEFAULT true,
    email_subject_template character varying(500),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: resource_calendar; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.resource_calendar WITH (security_invoker='on') AS
 SELECT ir.id,
    ir.itinerary_id,
    ir.itinerary_day_id,
    ir.resource_type,
    ir.resource_id,
    ir.resource_name,
    ir.start_date,
    COALESCE(ir.end_date, ir.start_date) AS end_date,
    ir.quantity,
    ir.status,
    ir.notes,
    i.itinerary_code,
    i.client_name,
    i.num_travelers,
    i.status AS itinerary_status
   FROM (public.itinerary_resources ir
     JOIN public.itineraries i ON ((ir.itinerary_id = i.id)))
  WHERE ((i.status)::text <> 'cancelled'::text)
  ORDER BY ir.start_date, ir.resource_type, ir.resource_name;


--
-- Name: resource_conflicts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.resource_conflicts WITH (security_invoker='on') AS
 SELECT r1.id AS assignment_1_id,
    r2.id AS assignment_2_id,
    r1.resource_type,
    r1.resource_id,
    r1.resource_name,
    r1.itinerary_id AS itinerary_1_id,
    r2.itinerary_id AS itinerary_2_id,
    i1.itinerary_code AS itinerary_1_code,
    i2.itinerary_code AS itinerary_2_code,
    i1.client_name AS client_1,
    i2.client_name AS client_2,
    r1.start_date AS start_1,
    COALESCE(r1.end_date, r1.start_date) AS end_1,
    r2.start_date AS start_2,
    COALESCE(r2.end_date, r2.start_date) AS end_2
   FROM (((public.itinerary_resources r1
     JOIN public.itinerary_resources r2 ON ((((r1.resource_type)::text = (r2.resource_type)::text) AND (r1.resource_id = r2.resource_id) AND (r1.id < r2.id) AND ((r1.status)::text = 'confirmed'::text) AND ((r2.status)::text = 'confirmed'::text) AND (r1.start_date <= COALESCE(r2.end_date, r2.start_date)) AND (COALESCE(r1.end_date, r1.start_date) >= r2.start_date))))
     JOIN public.itineraries i1 ON ((r1.itinerary_id = i1.id)))
     JOIN public.itineraries i2 ON ((r2.itinerary_id = i2.id)))
  WHERE (((i1.status)::text <> 'cancelled'::text) AND ((i2.status)::text <> 'cancelled'::text));


--
-- Name: restaurant_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    restaurant_type text,
    cuisine_type text,
    city text NOT NULL,
    address text,
    contact_person text,
    phone text,
    email text,
    whatsapp text,
    capacity integer,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    meal_types text[] DEFAULT '{}'::text[],
    dietary_options text[] DEFAULT '{}'::text[],
    rate_per_person_eur numeric(10,2) DEFAULT 0,
    rate_per_person_non_eur numeric(10,2) DEFAULT 0,
    rate_breakfast_eur numeric(10,2) DEFAULT 0,
    rate_lunch_eur numeric(10,2) DEFAULT 0,
    rate_dinner_eur numeric(10,2) DEFAULT 0,
    rate_breakfast_non_eur numeric(10,2) DEFAULT 0,
    rate_lunch_non_eur numeric(10,2) DEFAULT 0,
    rate_dinner_non_eur numeric(10,2) DEFAULT 0,
    drinks_included boolean DEFAULT false,
    tip_included boolean DEFAULT false,
    child_discount_percent numeric(5,2) DEFAULT 50,
    group_discount_percent numeric(5,2) DEFAULT 0,
    group_min_size integer DEFAULT 10,
    rate_valid_from date DEFAULT CURRENT_DATE,
    rate_valid_to date DEFAULT '2099-12-31'::date,
    tier character varying(20) DEFAULT 'standard'::character varying,
    is_preferred boolean DEFAULT false,
    cuisine_types text[]
);


--
-- Name: sales_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    avatar_url text,
    is_active boolean DEFAULT true,
    is_available boolean DEFAULT true,
    max_conversations integer DEFAULT 50,
    current_conversations integer DEFAULT 0,
    last_assigned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);




--
-- Name: seasonal_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasonal_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_name character varying(50) NOT NULL,
    season_code character varying(20) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    price_multiplier numeric(4,2) DEFAULT 1.00,
    applies_to_categories uuid[],
    applies_to_destinations uuid[],
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: seasonal_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasonal_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_name character varying(50) NOT NULL,
    start_month integer NOT NULL,
    end_month integer NOT NULL,
    increase_percentage numeric(5,2) NOT NULL,
    applies_to character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    supplier_id uuid
);


--
-- Name: service_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    service_name character varying(255) NOT NULL,
    service_category character varying(100) NOT NULL,
    service_type character varying(100),
    city character varying(100),
    base_rate_eur numeric(10,2) NOT NULL,
    base_rate_non_eur numeric(10,2) NOT NULL,
    rate_type character varying(50),
    season character varying(50),
    rate_valid_from date NOT NULL,
    rate_valid_to date NOT NULL,
    supplier_name character varying(255),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: sleeping_train_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleeping_train_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    origin_city character varying(50),
    destination_city character varying(50),
    cabin_type character varying(20),
    rate_oneway_eur numeric(10,2),
    rate_roundtrip_eur numeric(10,2),
    departure_time character varying(10),
    arrival_time character varying(10),
    rate_valid_from date,
    rate_valid_to date,
    season character varying(20) DEFAULT 'all_year'::character varying,
    operator_name character varying(100),
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    supplier_id uuid,
    rate_currency text,
    CONSTRAINT sleeping_train_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: supplier_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid,
    supplier_id uuid,
    document_type character varying(50) NOT NULL,
    document_number character varying(50) NOT NULL,
    supplier_name character varying(255) NOT NULL,
    supplier_contact_name character varying(255),
    supplier_contact_email character varying(255),
    supplier_contact_phone character varying(50),
    supplier_address text,
    client_name character varying(255) NOT NULL,
    client_nationality character varying(100),
    num_adults integer DEFAULT 1,
    num_children integer DEFAULT 0,
    services jsonb DEFAULT '[]'::jsonb,
    city character varying(100),
    service_date date,
    check_in date,
    check_out date,
    pickup_time time without time zone,
    pickup_location text,
    dropoff_location text,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    total_cost numeric(12,2) DEFAULT 0,
    payment_terms character varying(50),
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    special_requests text,
    internal_notes text,
    status character varying(20) DEFAULT 'draft'::character varying,
    sent_at timestamp with time zone,
    sent_via character varying(20),
    confirmed_at timestamp with time zone,
    confirmed_by character varying(255),
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    selected_attractions jsonb DEFAULT '[]'::jsonb,
    supplier_whatsapp character varying(50),
    selected_routes jsonb,
    selected_meals jsonb,
    selected_guides jsonb
);


--
-- Name: supplier_invoice_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_invoice_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_invoice_id uuid NOT NULL,
    expense_id uuid NOT NULL,
    matched_amount numeric(12,2),
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: supplier_invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_invoice_number text NOT NULL,
    internal_reference text,
    supplier_name text NOT NULL,
    supplier_id uuid,
    invoice_date date NOT NULL,
    due_date date,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'EUR'::text,
    tax_amount numeric(12,2) DEFAULT 0,
    description text,
    line_items jsonb,
    status text DEFAULT 'received'::text,
    match_status text DEFAULT 'unmatched'::text,
    matched_amount numeric(12,2) DEFAULT 0,
    discrepancy_amount numeric(12,2) DEFAULT 0,
    discrepancy_notes text,
    document_url text,
    document_filename text,
    document_storage_path text,
    approved_by uuid,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    payment_method text,
    payment_reference text,
    notes text,
    itinerary_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    org_id uuid NOT NULL,
    CONSTRAINT supplier_invoices_match_status_check CHECK ((match_status = ANY (ARRAY['unmatched'::text, 'partial'::text, 'matched'::text, 'discrepancy'::text]))),
    CONSTRAINT supplier_invoices_status_check CHECK ((status = ANY (ARRAY['received'::text, 'matched'::text, 'approved'::text, 'paid'::text, 'disputed'::text, 'cancelled'::text])))
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    role character varying(50) DEFAULT 'staff'::character varying,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    is_available boolean DEFAULT true,
    max_conversations integer DEFAULT 50,
    current_conversations integer DEFAULT 0,
    last_assigned_at timestamp with time zone,
    avatar_url text,
    department_id uuid
);


--
-- Name: template_placeholders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_placeholders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    placeholder character varying(100) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    data_source character varying(100),
    category character varying(50),
    example_value character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    display_name_ja text,
    description_ja text,
    example_value_ja text
);


--
-- Name: template_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    template_name character varying(255),
    channel character varying(20),
    client_id uuid,
    itinerary_id uuid,
    recipient_email character varying(255),
    recipient_phone character varying(50),
    subject character varying(500),
    body_preview text,
    status character varying(20) DEFAULT 'sent'::character varying,
    error_message text,
    sent_by uuid,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: tipping_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipping_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    role_type character varying(50) NOT NULL,
    rate_unit character varying(20) NOT NULL,
    rate_eur numeric(10,2) NOT NULL,
    context character varying(50),
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    rate_currency text,
    CONSTRAINT tipping_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: tour_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid,
    date date NOT NULL,
    is_available boolean DEFAULT true,
    available_spots integer,
    reason character varying(200),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: tour_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_code character varying(50) NOT NULL,
    category_name character varying(100) NOT NULL,
    description text,
    icon character varying(50),
    sort_order integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: tour_day_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_day_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    day_number integer NOT NULL,
    sequence_order integer DEFAULT 1,
    content_id uuid,
    activity_type text NOT NULL,
    activity_name text NOT NULL,
    city text,
    duration_hours numeric(4,2),
    start_time time without time zone,
    is_optional boolean DEFAULT false,
    is_included boolean DEFAULT true,
    requires_guide boolean DEFAULT true,
    notes text,
    internal_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT tour_day_activities_activity_type_check CHECK ((activity_type = ANY (ARRAY['attraction'::text, 'transfer'::text, 'accommodation'::text, 'meal'::text, 'cruise'::text, 'activity'::text, 'free_time'::text, 'flight'::text])))
);


--
-- Name: tour_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_days (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tour_id uuid,
    day_number integer NOT NULL,
    city character varying(100) NOT NULL,
    accommodation_id uuid,
    breakfast_included boolean DEFAULT true,
    lunch_meal_id uuid,
    dinner_meal_id uuid,
    guide_required boolean DEFAULT true,
    guide_id uuid,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT tour_days_day_number_check CHECK ((day_number > 0))
);


--
-- Name: tour_departures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_departures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    template_id uuid,
    variation_id uuid,
    tour_name character varying(255) NOT NULL,
    tour_code character varying(50),
    duration_days integer DEFAULT 1 NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    max_pax integer DEFAULT 20 NOT NULL,
    booked_pax integer DEFAULT 0 NOT NULL,
    min_pax integer DEFAULT 2,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    cutoff_days integer DEFAULT 3,
    is_guaranteed boolean DEFAULT false,
    price_per_person numeric(10,2),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    assigned_guide_id uuid,
    assigned_vehicle_id uuid,
    public_notes text,
    internal_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    source_integration_id uuid,
    external_id character varying(200),
    externally_managed boolean DEFAULT false NOT NULL,
    external_synced_at timestamp with time zone,
    CONSTRAINT tour_departures_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'open'::character varying, 'limited'::character varying, 'full'::character varying, 'guaranteed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: tour_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_code character varying(100) NOT NULL,
    template_name character varying(200) NOT NULL,
    category_id uuid,
    tour_type character varying(50) NOT NULL,
    duration_days integer NOT NULL,
    duration_nights integer DEFAULT 0,
    primary_destination_id uuid,
    destinations_covered uuid[],
    cities_covered character varying(100)[],
    short_description text,
    long_description text,
    highlights text[],
    main_attractions text[],
    best_for character varying(50)[],
    physical_level character varying(20),
    age_suitability character varying(50),
    pickup_required boolean DEFAULT true,
    accommodation_nights integer DEFAULT 0,
    meals_included character varying(20)[],
    image_url text,
    gallery_urls text[],
    is_featured boolean DEFAULT false,
    is_active boolean DEFAULT true,
    popularity_score integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    default_transportation_service character varying(50) DEFAULT 'day_tour'::character varying,
    transportation_city character varying(50),
    pricing_mode text DEFAULT 'auto'::text,
    uses_day_builder boolean DEFAULT false,
    inclusions text[] DEFAULT '{}'::text[],
    exclusions text[] DEFAULT '{}'::text[],
    itinerary jsonb DEFAULT '[]'::jsonb,
    cached_starting_price numeric,
    cached_starting_tier text,
    cached_price_updated_at timestamp with time zone,
    hotels jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: tour_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_variations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    variation_code character varying(100) NOT NULL,
    variation_name character varying(200) NOT NULL,
    tier character varying(20) NOT NULL,
    group_type character varying(20) NOT NULL,
    min_pax integer DEFAULT 1 NOT NULL,
    max_pax integer DEFAULT 15 NOT NULL,
    optimal_pax integer,
    inclusions text[] NOT NULL,
    exclusions text[] NOT NULL,
    optional_extras text[],
    guide_type character varying(50),
    guide_languages character varying(20)[],
    vehicle_type character varying(50),
    accommodation_standard character varying(20),
    meal_quality character varying(20),
    private_experience boolean DEFAULT false,
    skip_line_access boolean DEFAULT false,
    vip_treatment boolean DEFAULT false,
    flexible_itinerary boolean DEFAULT false,
    typical_start_time time without time zone,
    typical_end_time time without time zone,
    pickup_time_range character varying(50),
    is_active boolean DEFAULT true,
    available_seasons character varying(20)[],
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: variation_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variation_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid,
    min_pax integer NOT NULL,
    max_pax integer NOT NULL,
    price_per_person numeric(10,2),
    total_group_price numeric(10,2),
    single_supplement numeric(10,2),
    child_price_per_person numeric(10,2),
    child_age_range character varying(20),
    base_cost numeric(10,2),
    markup_percentage integer DEFAULT 25,
    final_price numeric(10,2),
    season character varying(20),
    valid_from date,
    valid_to date,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    pricing_notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT variation_pricing_check CHECK ((max_pax >= min_pax))
);


--
-- Name: tour_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tour_overview WITH (security_invoker='on') AS
 SELECT t.template_code,
    t.template_name,
    c.category_name,
    d.destination_name,
    t.duration_days,
    v.variation_code,
    v.tier,
    v.group_type,
    v.min_pax,
    v.max_pax,
    min(vp.price_per_person) AS price_from,
    t.is_featured,
    t.popularity_score
   FROM ((((public.tour_templates t
     JOIN public.tour_categories c ON ((t.category_id = c.id)))
     LEFT JOIN public.destinations_legacy_2025 d ON ((t.primary_destination_id = d.id)))
     JOIN public.tour_variations v ON ((t.id = v.template_id)))
     LEFT JOIN public.variation_pricing vp ON ((v.id = vp.variation_id)))
  WHERE ((t.is_active = true) AND (v.is_active = true))
  GROUP BY t.id, t.template_code, t.template_name, c.category_name, d.destination_name, t.duration_days, v.id, v.variation_code, v.tier, v.group_type, v.min_pax, v.max_pax, t.is_featured, t.popularity_score;


--
-- Name: tour_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_pricing (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tour_id uuid,
    pax integer NOT NULL,
    is_euro_passport boolean NOT NULL,
    total_accommodation numeric(10,2) DEFAULT 0,
    total_meals numeric(10,2) DEFAULT 0,
    total_guides numeric(10,2) DEFAULT 0,
    total_transportation numeric(10,2) DEFAULT 0,
    total_entrances numeric(10,2) DEFAULT 0,
    grand_total numeric(10,2) DEFAULT 0,
    per_person_total numeric(10,2) DEFAULT 0,
    calculated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT tour_pricing_pax_check CHECK ((pax > 0))
);


--
-- Name: tour_quote_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tour_quote_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tour_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_number character varying(50) NOT NULL,
    variation_id uuid,
    partner_id uuid,
    client_name character varying(255),
    client_email character varying(255),
    client_phone character varying(50),
    client_nationality character varying(100),
    travel_date date,
    num_adults integer DEFAULT 2 NOT NULL,
    num_children integer DEFAULT 0,
    services_snapshot jsonb,
    total_cost numeric(12,2),
    margin_percent numeric(5,2),
    margin_amount numeric(12,2),
    selling_price numeric(12,2),
    price_per_person numeric(10,2),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    status character varying(20) DEFAULT 'draft'::character varying,
    valid_until date,
    converted_to_itinerary_id uuid,
    converted_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    tour_leader_included boolean DEFAULT false,
    tour_leader_cost numeric,
    single_supplement numeric,
    is_eur_passport boolean DEFAULT true,
    season character varying(20),
    itinerary_id uuid,
    trip_name text,
    source character varying(30) DEFAULT 'b2b_template'::character varying,
    version integer DEFAULT 1,
    last_modified_by uuid,
    last_modified_at timestamp with time zone,
    season_name character varying(80),
    season_uplift_percent numeric(5,2) DEFAULT 0 NOT NULL,
    season_uplift_amount numeric(12,2) DEFAULT 0 NOT NULL,
    org_id uuid NOT NULL,
    CONSTRAINT tour_quotes_source_check CHECK (((variation_id IS NOT NULL) OR (itinerary_id IS NOT NULL)))
);


--
-- Name: tour_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    variation_id uuid,
    customer_name character varying(200),
    customer_country character varying(100),
    rating integer,
    review_title character varying(200),
    review_text text,
    pros text[],
    cons text[],
    would_recommend boolean,
    travel_date date,
    review_date timestamp without time zone DEFAULT now(),
    is_verified boolean DEFAULT false,
    is_featured boolean DEFAULT false,
    is_published boolean DEFAULT true,
    CONSTRAINT tour_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: tour_template_defaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_template_defaults (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    default_vehicle_id uuid,
    default_guide_language text DEFAULT 'English'::text,
    default_meal_plan text DEFAULT 'lunch_only'::text,
    include_transport boolean DEFAULT true,
    include_guide boolean DEFAULT true,
    include_entrances boolean DEFAULT true,
    include_meals boolean DEFAULT true,
    include_accommodation boolean DEFAULT false,
    include_tips boolean DEFAULT true,
    include_water boolean DEFAULT true,
    default_margin_percent numeric(5,2) DEFAULT 25.00,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tour_template_defaults_meal_plan_check CHECK ((default_meal_plan = ANY (ARRAY['none'::text, 'breakfast_only'::text, 'lunch_only'::text, 'dinner_only'::text, 'half_board'::text, 'full_board'::text])))
);


--
-- Name: tour_template_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_template_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    language character varying(2) NOT NULL,
    template_name text NOT NULL,
    short_description text,
    long_description text,
    highlights text[],
    main_attractions text[],
    best_for text[],
    inclusions text[],
    exclusions text[],
    itinerary jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tour_template_versions_language_check CHECK (((language)::text = ANY ((ARRAY['en'::character varying, 'ja'::character varying])::text[])))
);


--
-- Name: tour_templates_with_languages; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tour_templates_with_languages AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(100) AS template_code,
    NULL::character varying(200) AS template_name,
    NULL::uuid AS category_id,
    NULL::character varying(50) AS tour_type,
    NULL::integer AS duration_days,
    NULL::integer AS duration_nights,
    NULL::uuid AS primary_destination_id,
    NULL::uuid[] AS destinations_covered,
    NULL::character varying(100)[] AS cities_covered,
    NULL::text AS short_description,
    NULL::text AS long_description,
    NULL::text[] AS highlights,
    NULL::text[] AS main_attractions,
    NULL::character varying(50)[] AS best_for,
    NULL::character varying(20) AS physical_level,
    NULL::character varying(50) AS age_suitability,
    NULL::boolean AS pickup_required,
    NULL::integer AS accommodation_nights,
    NULL::character varying(20)[] AS meals_included,
    NULL::text AS image_url,
    NULL::text[] AS gallery_urls,
    NULL::boolean AS is_featured,
    NULL::boolean AS is_active,
    NULL::integer AS popularity_score,
    NULL::timestamp without time zone AS created_at,
    NULL::timestamp without time zone AS updated_at,
    NULL::character varying(50) AS default_transportation_service,
    NULL::character varying(50) AS transportation_city,
    NULL::text AS pricing_mode,
    NULL::boolean AS uses_day_builder,
    NULL::text[] AS inclusions,
    NULL::text[] AS exclusions,
    NULL::jsonb AS itinerary,
    NULL::character varying[] AS available_languages,
    NULL::bigint AS version_count;


--
-- Name: tour_variation_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_variation_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid NOT NULL,
    service_name character varying(255) NOT NULL,
    service_category character varying(50) NOT NULL,
    rate_type character varying(50),
    rate_id uuid,
    quantity_mode character varying(20) DEFAULT 'per_pax'::character varying,
    quantity_value numeric(5,2) DEFAULT 1,
    quantity_type character varying(50) DEFAULT 'per_person'::character varying,
    cost_per_unit numeric(10,2),
    day_number integer,
    sequence_order integer DEFAULT 0,
    is_optional boolean DEFAULT false,
    optional_price_override numeric(10,2),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tour_variation_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_variation_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid NOT NULL,
    language character varying(2) NOT NULL,
    variation_name text NOT NULL,
    inclusions text[],
    exclusions text[],
    optional_extras text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tour_variation_versions_language_check CHECK (((language)::text = ANY ((ARRAY['en'::character varying, 'ja'::character varying])::text[])))
);


--
-- Name: tours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tours (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tour_code character varying(50) NOT NULL,
    tour_name character varying(255) NOT NULL,
    duration_days integer NOT NULL,
    cities text[] NOT NULL,
    tour_type character varying(50) DEFAULT 'custom'::character varying,
    is_template boolean DEFAULT false,
    description text,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT tours_duration_days_check CHECK ((duration_days > 0))
);


--
-- Name: train_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    origin_city character varying(50),
    destination_city character varying(50),
    class_type character varying(20),
    rate_eur numeric(10,2),
    duration_hours numeric(4,1),
    rate_valid_from date,
    rate_valid_to date,
    operator_name character varying(100),
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    departure_times text,
    supplier_id uuid,
    rate_currency text,
    CONSTRAINT train_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text]))))
);


--
-- Name: transportation_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportation_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    service_type character varying(50),
    vehicle_type character varying(100),
    city character varying(100),
    contact_person character varying(255),
    email character varying(255),
    phone character varying(50),
    whatsapp character varying(50),
    capacity integer,
    daily_rate numeric(10,2),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone2 character varying(50),
    vehicle_types text[]
);


--
-- Name: transportation_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportation_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_code character varying(50) NOT NULL,
    service_type character varying(100) NOT NULL,
    vehicle_type character varying(100),
    capacity_min integer,
    capacity_max integer,
    city character varying(100),
    base_rate_eur numeric(10,2),
    base_rate_non_eur numeric(10,2),
    season character varying(50),
    rate_valid_from date NOT NULL,
    rate_valid_to date NOT NULL,
    supplier_name character varying(255),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    origin_city character varying(100),
    destination_city character varying(100),
    supplier_id uuid,
    duration character varying(20),
    area character varying(50),
    sedan_rate_eur numeric(10,2) DEFAULT NULL::numeric,
    sedan_rate_non_eur numeric(10,2) DEFAULT NULL::numeric,
    minivan_rate_eur numeric(10,2) DEFAULT NULL::numeric,
    minivan_rate_non_eur numeric(10,2) DEFAULT NULL::numeric,
    van_rate_eur numeric(10,2) DEFAULT NULL::numeric,
    van_rate_non_eur numeric(10,2) DEFAULT NULL::numeric,
    minibus_rate_eur numeric(10,2) DEFAULT NULL::numeric,
    minibus_rate_non_eur numeric(10,2) DEFAULT NULL::numeric,
    bus_rate_eur numeric(10,2) DEFAULT NULL::numeric,
    bus_rate_non_eur numeric(10,2) DEFAULT NULL::numeric,
    sedan_capacity_min integer DEFAULT 1,
    sedan_capacity_max integer DEFAULT 2,
    minivan_capacity_min integer DEFAULT 3,
    minivan_capacity_max integer DEFAULT 7,
    van_capacity_min integer DEFAULT 8,
    van_capacity_max integer DEFAULT 12,
    minibus_capacity_min integer DEFAULT 13,
    minibus_capacity_max integer DEFAULT 20,
    bus_capacity_min integer DEFAULT 21,
    bus_capacity_max integer DEFAULT 45,
    route_name text,
    includes text,
    rate_currency text,
    CONSTRAINT transportation_rates_rate_currency_check CHECK (((rate_currency IS NULL) OR (rate_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'EGP'::text, 'JPY'::text])))),
    CONSTRAINT transportation_rates_service_type_check CHECK (((service_type)::text = ANY ((ARRAY['airport_transfer'::character varying, 'airport_with_sightseeing'::character varying, 'city_transfer'::character varying, 'city_tour'::character varying, 'intercity'::character varying, 'intercity_with_sightseeing'::character varying, 'half_day'::character varying, 'day_tour'::character varying, 'extended_day_tour'::character varying, 'sound_light'::character varying, 'dinner_transfer'::character varying])::text[])))
);


--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number character varying(50) NOT NULL,
    client_id uuid,
    client_name character varying(255),
    last_message text,
    last_message_at timestamp with time zone,
    unread_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_hidden boolean DEFAULT false,
    hidden_at timestamp with time zone,
    hidden_by uuid,
    assigned_agent_id uuid,
    assigned_at timestamp with time zone,
    last_agent_reply_at timestamp with time zone,
    last_agent_id uuid,
    assigned_team_member_id uuid,
    ai_draft_reply text,
    ai_draft_confidence double precision,
    ai_draft_escalate boolean DEFAULT false NOT NULL,
    ai_draft_generated_at timestamp with time zone,
    CONSTRAINT whatsapp_conversations_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying, 'blocked'::character varying])::text[])))
);


--
-- Name: unified_conversations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.unified_conversations WITH (security_invoker='on') AS
 SELECT wc.id,
    'whatsapp'::text AS channel,
    wc.phone_number AS identifier,
    wc.client_id,
    wc.client_name,
    NULL::character varying AS client_email,
    wc.phone_number AS contact_info,
    NULL::character varying AS subject,
    wc.last_message AS last_message_snippet,
    wc.last_message_at,
    wc.unread_count,
    wc.status,
    wc.assigned_team_member_id,
    wc.assigned_at,
    wc.created_at,
    wc.updated_at,
    wc.is_hidden
   FROM public.whatsapp_conversations wc
  WHERE (wc.is_hidden IS NOT TRUE)
UNION ALL
 SELECT ec.id,
    'email'::text AS channel,
    ec.thread_id AS identifier,
    ec.client_id,
    ec.client_name,
    ec.client_email,
    ec.client_email AS contact_info,
    ec.subject,
    ec.last_message_snippet,
    ec.last_message_at,
    ec.unread_count,
    ec.status,
    ec.assigned_team_member_id,
    ec.assigned_at,
    ec.created_at,
    ec.updated_at,
    ec.is_hidden
   FROM public.email_conversations ec
  WHERE (ec.is_hidden IS NOT TRUE);


--
-- Name: user_activity_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_activity_summary WITH (security_invoker='on') AS
 SELECT user_id,
    user_email,
    count(*) AS total_actions,
    count(*) FILTER (WHERE ((action)::text = 'CREATE'::text)) AS creates,
    count(*) FILTER (WHERE ((action)::text = 'UPDATE'::text)) AS updates,
    count(*) FILTER (WHERE ((action)::text = 'DELETE'::text)) AS deletes,
    count(*) FILTER (WHERE ((status)::text = 'failed'::text)) AS failed_actions,
    max(created_at) AS last_activity
   FROM public.audit_logs
  WHERE (created_at > (now() - '30 days'::interval))
  GROUP BY user_id, user_email
  ORDER BY (count(*)) DESC;


--
-- Name: user_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'agent'::text NOT NULL,
    invited_by uuid,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    org_id uuid NOT NULL,
    CONSTRAINT valid_role CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])))
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    default_cost_mode character varying(10) DEFAULT 'auto'::character varying,
    default_tier character varying(20) DEFAULT 'standard'::character varying,
    default_margin_percent integer DEFAULT 25,
    default_currency character varying(3) DEFAULT 'EUR'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255),
    role character varying(50) DEFAULT 'agent'::character varying,
    company_name character varying(255),
    phone character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    avatar_url text,
    CONSTRAINT user_profiles_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying, 'agent'::character varying, 'viewer'::character varying])::text[])))
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    notification_preferences jsonb DEFAULT '{"task_overdue": true, "email_enabled": true, "task_assigned": true, "task_due_soon": true, "in_app_enabled": true, "task_completed": false}'::jsonb,
    email_settings jsonb DEFAULT '{"signature": "", "auto_reply_enabled": false, "auto_reply_message": ""}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_daily_services; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_daily_services WITH (security_invoker='on') AS
 SELECT id.id AS day_id,
    id.itinerary_id,
    id.day_number,
    id.date,
    id.city,
    id.title,
    isv.id AS service_id,
    isv.service_type,
    isv.service_name,
    isv.quantity,
    isv.total_cost
   FROM (public.itinerary_days id
     LEFT JOIN public.itinerary_services isv ON ((id.id = isv.itinerary_day_id)))
  ORDER BY id.day_number, isv.service_type;


--
-- Name: v_itineraries_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_itineraries_summary AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(50) AS itinerary_code,
    NULL::character varying(255) AS client_name,
    NULL::character varying(255) AS client_email,
    NULL::character varying(255) AS trip_name,
    NULL::date AS start_date,
    NULL::date AS end_date,
    NULL::integer AS total_days,
    NULL::integer AS num_adults,
    NULL::integer AS num_children,
    NULL::character varying(10) AS currency,
    NULL::numeric(10,2) AS total_cost,
    NULL::character varying(50) AS status,
    NULL::bigint AS days_planned,
    NULL::bigint AS services_count,
    NULL::timestamp without time zone AS created_at,
    NULL::timestamp without time zone AS updated_at;


--
-- Name: variation_daily_itinerary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variation_daily_itinerary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid,
    day_number integer NOT NULL,
    day_title character varying(200),
    day_description text,
    city character varying(100),
    overnight_city character varying(100),
    activities text[],
    attractions text[],
    breakfast_included boolean DEFAULT false,
    lunch_included boolean DEFAULT false,
    dinner_included boolean DEFAULT false,
    start_time time without time zone,
    end_time time without time zone,
    created_at timestamp without time zone DEFAULT now(),
    is_cruise_day boolean DEFAULT false
);


--
-- Name: variation_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variation_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid,
    service_category character varying(50) NOT NULL,
    service_code character varying(100),
    service_name character varying(200) NOT NULL,
    service_description text,
    applies_to_day integer,
    quantity_type character varying(20) NOT NULL,
    base_quantity integer DEFAULT 1,
    cost_per_unit numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    cost_calculation_notes text,
    is_mandatory boolean DEFAULT true,
    is_optional_extra boolean DEFAULT false,
    extra_cost numeric(10,2),
    provider_name character varying(200),
    provider_contact text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: vehicle_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_type character varying(50) NOT NULL,
    min_pax integer NOT NULL,
    max_pax integer NOT NULL,
    cost_per_day numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    supplier_id uuid
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    vehicle_type character varying(100) NOT NULL,
    make character varying(100),
    model character varying(100),
    year integer,
    license_plate character varying(50),
    registration_number character varying(100),
    passenger_capacity integer NOT NULL,
    has_ac boolean DEFAULT true,
    has_wifi boolean DEFAULT false,
    is_luxury boolean DEFAULT false,
    is_active boolean DEFAULT true,
    current_mileage integer,
    last_service_date date,
    next_service_date date,
    insurance_expiry date,
    daily_rate numeric(10,2),
    rate_per_km numeric(10,2),
    default_driver_name character varying(255),
    default_driver_phone character varying(50),
    notes text,
    photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tier character varying(20) DEFAULT 'standard'::character varying,
    is_preferred boolean DEFAULT false,
    city character varying(100) DEFAULT 'Cairo'::character varying,
    CONSTRAINT vehicles_current_mileage_check CHECK ((current_mileage >= 0)),
    CONSTRAINT vehicles_passenger_capacity_check CHECK ((passenger_capacity > 0)),
    CONSTRAINT vehicles_vehicle_type_check CHECK (((vehicle_type)::text = ANY ((ARRAY['car'::character varying, 'sedan'::character varying, 'suv'::character varying, 'van'::character varying, 'minivan'::character varying, 'minibus'::character varying, 'bus'::character varying])::text[]))),
    CONSTRAINT vehicles_year_check CHECK (((year >= 1900) AND (year <= 2100)))
);


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    message_sid character varying(255),
    direction character varying(10) NOT NULL,
    message_body text,
    media_url text,
    media_type character varying(50),
    status character varying(20) DEFAULT 'sent'::character varying,
    error_message text,
    sent_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT whatsapp_messages_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[]))),
    CONSTRAINT whatsapp_messages_status_check CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'sent'::character varying, 'delivered'::character varying, 'read'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: writing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.writing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(50) NOT NULL,
    rule_type character varying(20) NOT NULL,
    description text NOT NULL,
    examples jsonb DEFAULT '{}'::jsonb,
    priority integer DEFAULT 5,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    applies_to text[] DEFAULT '{}'::text[],
    destination_id uuid
);


--
-- Name: accommodation_rates accommodation_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodation_rates
    ADD CONSTRAINT accommodation_rates_pkey PRIMARY KEY (id);


--
-- Name: accommodation_rates accommodation_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodation_rates
    ADD CONSTRAINT accommodation_rates_service_code_key UNIQUE (service_code);


--
-- Name: accounting_sync_log accounting_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_sync_log
    ADD CONSTRAINT accounting_sync_log_pkey PRIMARY KEY (id);


--
-- Name: accounting_sync_log accounting_sync_log_provider_entity_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_sync_log
    ADD CONSTRAINT accounting_sync_log_provider_entity_type_entity_id_key UNIQUE (provider, entity_type, entity_id);


--
-- Name: accounting_tokens accounting_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_tokens
    ADD CONSTRAINT accounting_tokens_pkey PRIMARY KEY (id);


--
-- Name: accounting_tokens accounting_tokens_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_tokens
    ADD CONSTRAINT accounting_tokens_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: activity_rates activity_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_rates
    ADD CONSTRAINT activity_rates_pkey PRIMARY KEY (id);


--
-- Name: activity_rates activity_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_rates
    ADD CONSTRAINT activity_rates_service_code_key UNIQUE (service_code);


--
-- Name: agent_memory agent_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_pkey PRIMARY KEY (id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_team_member_mapping agent_team_member_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_team_member_mapping
    ADD CONSTRAINT agent_team_member_mapping_pkey PRIMARY KEY (sales_agent_id);


--
-- Name: airport_staff_rates airport_staff_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airport_staff_rates
    ADD CONSTRAINT airport_staff_rates_pkey PRIMARY KEY (id);


--
-- Name: airport_staff_rates airport_staff_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airport_staff_rates
    ADD CONSTRAINT airport_staff_rates_service_code_key UNIQUE (service_code);


--
-- Name: assignment_rules assignment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_rules
    ADD CONSTRAINT assignment_rules_pkey PRIMARY KEY (id);


--
-- Name: assistant_rates assistant_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_rates
    ADD CONSTRAINT assistant_rates_pkey PRIMARY KEY (id);


--
-- Name: attraction_aliases attraction_aliases_alias_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attraction_aliases
    ADD CONSTRAINT attraction_aliases_alias_key UNIQUE (alias);


--
-- Name: attraction_aliases attraction_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attraction_aliases
    ADD CONSTRAINT attraction_aliases_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: b2b_partner_pricing b2b_partner_pricing_partner_id_variation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_partner_pricing
    ADD CONSTRAINT b2b_partner_pricing_partner_id_variation_id_key UNIQUE (partner_id, variation_id);


--
-- Name: b2b_partner_pricing b2b_partner_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_partner_pricing
    ADD CONSTRAINT b2b_partner_pricing_pkey PRIMARY KEY (id);


--
-- Name: b2b_partners b2b_partners_partner_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_partners
    ADD CONSTRAINT b2b_partners_partner_code_key UNIQUE (partner_code);


--
-- Name: b2b_partners b2b_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_partners
    ADD CONSTRAINT b2b_partners_pkey PRIMARY KEY (id);


--
-- Name: b2b_pricing_rules b2b_pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_pricing_rules
    ADD CONSTRAINT b2b_pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: b2b_transport_packages b2b_transport_packages_package_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_transport_packages
    ADD CONSTRAINT b2b_transport_packages_package_code_key UNIQUE (package_code);


--
-- Name: b2b_transport_packages b2b_transport_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_transport_packages
    ADD CONSTRAINT b2b_transport_packages_pkey PRIMARY KEY (id);


--
-- Name: b2c_quotes b2c_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2c_quotes
    ADD CONSTRAINT b2c_quotes_pkey PRIMARY KEY (id);


--
-- Name: booking_change_requests booking_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_change_requests
    ADD CONSTRAINT booking_change_requests_pkey PRIMARY KEY (id);


--
-- Name: booking_extras booking_extras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_pkey PRIMARY KEY (id);


--
-- Name: booking_passenger_documents booking_passenger_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passenger_documents
    ADD CONSTRAINT booking_passenger_documents_pkey PRIMARY KEY (id);


--
-- Name: booking_passenger_documents booking_passenger_documents_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passenger_documents
    ADD CONSTRAINT booking_passenger_documents_storage_path_key UNIQUE (storage_path);


--
-- Name: booking_passengers booking_passengers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passengers
    ADD CONSTRAINT booking_passengers_pkey PRIMARY KEY (id);


--
-- Name: booking_payments booking_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_pkey PRIMARY KEY (id);


--
-- Name: booking_portal_links booking_portal_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_portal_links
    ADD CONSTRAINT booking_portal_links_pkey PRIMARY KEY (id);


--
-- Name: booking_portal_links booking_portal_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_portal_links
    ADD CONSTRAINT booking_portal_links_token_key UNIQUE (token);


--
-- Name: booking_rules booking_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_rules
    ADD CONSTRAINT booking_rules_pkey PRIMARY KEY (id);


--
-- Name: booking_supplier_status booking_supplier_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_supplier_status
    ADD CONSTRAINT booking_supplier_status_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_code_key UNIQUE (booking_code);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: client_contacts client_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_contacts
    ADD CONSTRAINT client_contacts_pkey PRIMARY KEY (id);


--
-- Name: client_documents client_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_pkey PRIMARY KEY (id);


--
-- Name: client_followups client_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_followups
    ADD CONSTRAINT client_followups_pkey PRIMARY KEY (id);


--
-- Name: client_notes client_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_notes
    ADD CONSTRAINT client_notes_pkey PRIMARY KEY (id);


--
-- Name: client_preferences client_preferences_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_preferences
    ADD CONSTRAINT client_preferences_client_id_key UNIQUE (client_id);


--
-- Name: client_preferences client_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_preferences
    ADD CONSTRAINT client_preferences_pkey PRIMARY KEY (id);


--
-- Name: clients clients_client_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_client_code_key UNIQUE (client_code);


--
-- Name: clients clients_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_email_key UNIQUE (email);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: communication_drafts communication_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_drafts
    ADD CONSTRAINT communication_drafts_pkey PRIMARY KEY (id);


--
-- Name: communication_history communication_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_history
    ADD CONSTRAINT communication_history_pkey PRIMARY KEY (id);


--
-- Name: communication_inbox communication_inbox_channel_source_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_inbox
    ADD CONSTRAINT communication_inbox_channel_source_message_id_key UNIQUE (channel, source_message_id);


--
-- Name: communication_inbox communication_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_inbox
    ADD CONSTRAINT communication_inbox_pkey PRIMARY KEY (id);


--
-- Name: communication_threads communication_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_threads
    ADD CONSTRAINT communication_threads_pkey PRIMARY KEY (id);


--
-- Name: concierge_brief_revisions concierge_brief_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_brief_revisions
    ADD CONSTRAINT concierge_brief_revisions_pkey PRIMARY KEY (id);


--
-- Name: concierge_briefs concierge_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_briefs
    ADD CONSTRAINT concierge_briefs_pkey PRIMARY KEY (id);


--
-- Name: content_categories content_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_categories
    ADD CONSTRAINT content_categories_pkey PRIMARY KEY (id);


--
-- Name: content_categories content_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_categories
    ADD CONSTRAINT content_categories_slug_key UNIQUE (slug);


--
-- Name: content_library content_library_category_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_category_id_slug_key UNIQUE (category_id, slug);


--
-- Name: content_library content_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_pkey PRIMARY KEY (id);


--
-- Name: content_library content_library_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_slug_key UNIQUE (slug);


--
-- Name: content_usage_log content_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_usage_log
    ADD CONSTRAINT content_usage_log_pkey PRIMARY KEY (id);


--
-- Name: content_variations content_variations_content_id_tier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variations
    ADD CONSTRAINT content_variations_content_id_tier_key UNIQUE (content_id, tier);


--
-- Name: content_variations content_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variations
    ADD CONSTRAINT content_variations_pkey PRIMARY KEY (id);


--
-- Name: conversation_activity conversation_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_activity
    ADD CONSTRAINT conversation_activity_pkey PRIMARY KEY (id);


--
-- Name: conversation_notes conversation_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_pkey PRIMARY KEY (id);


--
-- Name: copilot_settings copilot_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_settings
    ADD CONSTRAINT copilot_settings_pkey PRIMARY KEY (id);


--
-- Name: copilot_settings copilot_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_settings
    ADD CONSTRAINT copilot_settings_user_id_key UNIQUE (user_id);


--
-- Name: cron_locks cron_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_locks
    ADD CONSTRAINT cron_locks_pkey PRIMARY KEY (job);


--
-- Name: cron_watermarks cron_watermarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_watermarks
    ADD CONSTRAINT cron_watermarks_pkey PRIMARY KEY (job);


--
-- Name: cruise_contacts cruise_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cruise_contacts
    ADD CONSTRAINT cruise_contacts_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: departure_bookings departure_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departure_bookings
    ADD CONSTRAINT departure_bookings_pkey PRIMARY KEY (id);


--
-- Name: destination_cities destination_cities_destination_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destination_cities
    ADD CONSTRAINT destination_cities_destination_id_name_key UNIQUE (destination_id, name);


--
-- Name: destination_cities destination_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destination_cities
    ADD CONSTRAINT destination_cities_pkey PRIMARY KEY (id);


--
-- Name: destinations destinations_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destinations
    ADD CONSTRAINT destinations_country_code_key UNIQUE (country_code);


--
-- Name: destinations_legacy_2025 destinations_destination_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destinations_legacy_2025
    ADD CONSTRAINT destinations_destination_code_key UNIQUE (destination_code);


--
-- Name: destinations_legacy_2025 destinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destinations_legacy_2025
    ADD CONSTRAINT destinations_pkey PRIMARY KEY (id);


--
-- Name: destinations destinations_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destinations
    ADD CONSTRAINT destinations_pkey1 PRIMARY KEY (id);


--
-- Name: discount_rules discount_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rules
    ADD CONSTRAINT discount_rules_pkey PRIMARY KEY (id);


--
-- Name: email_activity_log email_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_activity_log
    ADD CONSTRAINT email_activity_log_pkey PRIMARY KEY (id);


--
-- Name: email_cache_metadata email_cache_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_cache_metadata
    ADD CONSTRAINT email_cache_metadata_pkey PRIMARY KEY (id);


--
-- Name: email_cache_metadata email_cache_metadata_user_id_folder_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_cache_metadata
    ADD CONSTRAINT email_cache_metadata_user_id_folder_key UNIQUE (user_id, folder);


--
-- Name: email_client_links email_client_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_client_links
    ADD CONSTRAINT email_client_links_pkey PRIMARY KEY (id);


--
-- Name: email_client_links email_client_links_user_id_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_client_links
    ADD CONSTRAINT email_client_links_user_id_message_id_key UNIQUE (user_id, message_id);


--
-- Name: email_conversations email_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_pkey PRIMARY KEY (id);


--
-- Name: email_conversations email_conversations_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_thread_id_key UNIQUE (thread_id);


--
-- Name: email_messages email_messages_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_message_id_key UNIQUE (message_id);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);


--
-- Name: email_signatures email_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_signatures
    ADD CONSTRAINT email_signatures_pkey PRIMARY KEY (id);


--
-- Name: email_sync_state email_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sync_state
    ADD CONSTRAINT email_sync_state_pkey PRIMARY KEY (id);


--
-- Name: email_sync_state email_sync_state_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sync_state
    ADD CONSTRAINT email_sync_state_user_id_key UNIQUE (user_id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: entrance_fee_versions entrance_fee_versions_entrance_fee_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrance_fee_versions
    ADD CONSTRAINT entrance_fee_versions_entrance_fee_id_language_key UNIQUE (entrance_fee_id, language);


--
-- Name: entrance_fee_versions entrance_fee_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrance_fee_versions
    ADD CONSTRAINT entrance_fee_versions_pkey PRIMARY KEY (id);


--
-- Name: entrance_fees entrance_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrance_fees
    ADD CONSTRAINT entrance_fees_pkey PRIMARY KEY (id);


--
-- Name: entrance_fees entrance_fees_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrance_fees
    ADD CONSTRAINT entrance_fees_service_code_key UNIQUE (service_code);


--
-- Name: exchange_rate_snapshots exchange_rate_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_snapshots
    ADD CONSTRAINT exchange_rate_snapshots_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_expense_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_expense_number_key UNIQUE (expense_number);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: fixed_daily_costs fixed_daily_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_daily_costs
    ADD CONSTRAINT fixed_daily_costs_pkey PRIMARY KEY (id);


--
-- Name: flight_rates flight_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_rates
    ADD CONSTRAINT flight_rates_pkey PRIMARY KEY (id);


--
-- Name: gmail_tokens gmail_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_tokens
    ADD CONSTRAINT gmail_tokens_pkey PRIMARY KEY (id);


--
-- Name: gmail_tokens gmail_tokens_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_tokens
    ADD CONSTRAINT gmail_tokens_user_id_key UNIQUE (user_id);


--
-- Name: guide_rates guide_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_rates
    ADD CONSTRAINT guide_rates_pkey PRIMARY KEY (id);


--
-- Name: guide_rates guide_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_rates
    ADD CONSTRAINT guide_rates_service_code_key UNIQUE (service_code);


--
-- Name: hotel_contacts hotel_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_contacts
    ADD CONSTRAINT hotel_contacts_pkey PRIMARY KEY (id);


--
-- Name: hotel_staff_rates hotel_staff_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_staff_rates
    ADD CONSTRAINT hotel_staff_rates_pkey PRIMARY KEY (id);


--
-- Name: hotel_staff_rates hotel_staff_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_staff_rates
    ADD CONSTRAINT hotel_staff_rates_service_code_key UNIQUE (service_code);


--
-- Name: insurance_plans insurance_plans_org_id_plan_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_plans
    ADD CONSTRAINT insurance_plans_org_id_plan_code_key UNIQUE (org_id, plan_code);


--
-- Name: insurance_plans insurance_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_plans
    ADD CONSTRAINT insurance_plans_pkey PRIMARY KEY (id);


--
-- Name: insurance_premiums insurance_premiums_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_premiums
    ADD CONSTRAINT insurance_premiums_pkey PRIMARY KEY (id);


--
-- Name: insurance_premiums insurance_premiums_plan_id_rate_year_max_days_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_premiums
    ADD CONSTRAINT insurance_premiums_plan_id_rate_year_max_days_key UNIQUE (plan_id, rate_year, max_days);


--
-- Name: integration_events integration_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_org_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_org_id_provider_key UNIQUE (org_id, provider);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: invoice_reminders invoice_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_reminders
    ADD CONSTRAINT invoice_reminders_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: itineraries itineraries_itinerary_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_itinerary_code_key UNIQUE (itinerary_code);


--
-- Name: itineraries itineraries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_pkey PRIMARY KEY (id);


--
-- Name: itinerary_day_versions itinerary_day_versions_itinerary_day_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_day_versions
    ADD CONSTRAINT itinerary_day_versions_itinerary_day_id_language_key UNIQUE (itinerary_day_id, language);


--
-- Name: itinerary_day_versions itinerary_day_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_day_versions
    ADD CONSTRAINT itinerary_day_versions_pkey PRIMARY KEY (id);


--
-- Name: itinerary_days itinerary_days_itinerary_id_day_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_days
    ADD CONSTRAINT itinerary_days_itinerary_id_day_number_key UNIQUE (itinerary_id, day_number);


--
-- Name: itinerary_days itinerary_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_days
    ADD CONSTRAINT itinerary_days_pkey PRIMARY KEY (id);


--
-- Name: itinerary_resources itinerary_resources_itinerary_id_resource_type_resource_id__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_resources
    ADD CONSTRAINT itinerary_resources_itinerary_id_resource_type_resource_id__key UNIQUE (itinerary_id, resource_type, resource_id, start_date);


--
-- Name: itinerary_resources itinerary_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_resources
    ADD CONSTRAINT itinerary_resources_pkey PRIMARY KEY (id);


--
-- Name: itinerary_service_versions itinerary_service_versions_itinerary_service_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_service_versions
    ADD CONSTRAINT itinerary_service_versions_itinerary_service_id_language_key UNIQUE (itinerary_service_id, language);


--
-- Name: itinerary_service_versions itinerary_service_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_service_versions
    ADD CONSTRAINT itinerary_service_versions_pkey PRIMARY KEY (id);


--
-- Name: itinerary_services itinerary_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_services
    ADD CONSTRAINT itinerary_services_pkey PRIMARY KEY (id);


--
-- Name: itinerary_shares itinerary_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_shares
    ADD CONSTRAINT itinerary_shares_pkey PRIMARY KEY (id);


--
-- Name: itinerary_shares itinerary_shares_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_shares
    ADD CONSTRAINT itinerary_shares_token_key UNIQUE (token);


--
-- Name: itinerary_versions itinerary_versions_itinerary_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_versions
    ADD CONSTRAINT itinerary_versions_itinerary_id_language_key UNIQUE (itinerary_id, language);


--
-- Name: itinerary_versions itinerary_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_versions
    ADD CONSTRAINT itinerary_versions_pkey PRIMARY KEY (id);


--
-- Name: meal_costs meal_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_costs
    ADD CONSTRAINT meal_costs_pkey PRIMARY KEY (id);


--
-- Name: meal_rates meal_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_rates
    ADD CONSTRAINT meal_rates_pkey PRIMARY KEY (id);


--
-- Name: meal_rates meal_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_rates
    ADD CONSTRAINT meal_rates_service_code_key UNIQUE (service_code);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: nile_cruises nile_cruises_cruise_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nile_cruises
    ADD CONSTRAINT nile_cruises_cruise_code_key UNIQUE (cruise_code);


--
-- Name: nile_cruises nile_cruises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nile_cruises
    ADD CONSTRAINT nile_cruises_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operator_capacity operator_capacity_org_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_capacity
    ADD CONSTRAINT operator_capacity_org_id_date_key UNIQUE (org_id, date);


--
-- Name: operator_capacity operator_capacity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_capacity
    ADD CONSTRAINT operator_capacity_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (org_id, user_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: outside_cairo_fees outside_cairo_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outside_cairo_fees
    ADD CONSTRAINT outside_cairo_fees_pkey PRIMARY KEY (id);


--
-- Name: package_type_definitions package_type_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_type_definitions
    ADD CONSTRAINT package_type_definitions_pkey PRIMARY KEY (slug);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: portal_message_threads portal_message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_message_threads
    ADD CONSTRAINT portal_message_threads_pkey PRIMARY KEY (id);


--
-- Name: portal_messages portal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_pkey PRIMARY KEY (id);


--
-- Name: pricing_season_dates pricing_season_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_season_dates
    ADD CONSTRAINT pricing_season_dates_pkey PRIMARY KEY (id);


--
-- Name: pricing_seasons pricing_seasons_org_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_seasons
    ADD CONSTRAINT pricing_seasons_org_id_name_key UNIQUE (org_id, name);


--
-- Name: pricing_seasons pricing_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_seasons
    ADD CONSTRAINT pricing_seasons_pkey PRIMARY KEY (id);


--
-- Name: profit_margins profit_margins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_margins
    ADD CONSTRAINT profit_margins_pkey PRIMARY KEY (id);


--
-- Name: prompt_templates prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);


--
-- Name: quote_revisions quote_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_revisions
    ADD CONSTRAINT quote_revisions_pkey PRIMARY KEY (id);


--
-- Name: quote_revisions quote_revisions_quote_type_quote_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_revisions
    ADD CONSTRAINT quote_revisions_quote_type_quote_id_version_number_key UNIQUE (quote_type, quote_id, version_number);


--
-- Name: quote_versions quote_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_versions
    ADD CONSTRAINT quote_versions_pkey PRIMARY KEY (id);


--
-- Name: quote_versions quote_versions_quote_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_versions
    ADD CONSTRAINT quote_versions_quote_id_language_key UNIQUE (quote_id, language);


--
-- Name: rate_audit_log rate_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_audit_log
    ADD CONSTRAINT rate_audit_log_pkey PRIMARY KEY (id);


--
-- Name: reminder_settings reminder_settings_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_settings
    ADD CONSTRAINT reminder_settings_name_key UNIQUE (name);


--
-- Name: reminder_settings reminder_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_settings
    ADD CONSTRAINT reminder_settings_pkey PRIMARY KEY (id);


--
-- Name: restaurant_contacts restaurant_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_contacts
    ADD CONSTRAINT restaurant_contacts_pkey PRIMARY KEY (id);


--
-- Name: sales_agents sales_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_agents
    ADD CONSTRAINT sales_agents_pkey PRIMARY KEY (id);




--
-- Name: seasonal_adjustments seasonal_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasonal_adjustments
    ADD CONSTRAINT seasonal_adjustments_pkey PRIMARY KEY (id);


--
-- Name: seasonal_rates seasonal_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasonal_rates
    ADD CONSTRAINT seasonal_rates_pkey PRIMARY KEY (id);


--
-- Name: service_fees service_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_fees
    ADD CONSTRAINT service_fees_pkey PRIMARY KEY (id);


--
-- Name: service_fees service_fees_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_fees
    ADD CONSTRAINT service_fees_service_code_key UNIQUE (service_code);


--
-- Name: sleeping_train_rates sleeping_train_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleeping_train_rates
    ADD CONSTRAINT sleeping_train_rates_pkey PRIMARY KEY (id);


--
-- Name: sleeping_train_rates sleeping_train_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleeping_train_rates
    ADD CONSTRAINT sleeping_train_rates_service_code_key UNIQUE (service_code);


--
-- Name: supplier_documents supplier_documents_document_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_documents
    ADD CONSTRAINT supplier_documents_document_number_key UNIQUE (document_number);


--
-- Name: supplier_documents supplier_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_documents
    ADD CONSTRAINT supplier_documents_pkey PRIMARY KEY (id);


--
-- Name: supplier_invoice_expenses supplier_invoice_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoice_expenses
    ADD CONSTRAINT supplier_invoice_expenses_pkey PRIMARY KEY (id);


--
-- Name: supplier_invoice_expenses supplier_invoice_expenses_supplier_invoice_id_expense_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoice_expenses
    ADD CONSTRAINT supplier_invoice_expenses_supplier_invoice_id_expense_id_key UNIQUE (supplier_invoice_id, expense_id);


--
-- Name: supplier_invoices supplier_invoices_internal_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_internal_reference_key UNIQUE (internal_reference);


--
-- Name: supplier_invoices supplier_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: template_placeholders template_placeholders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_placeholders
    ADD CONSTRAINT template_placeholders_pkey PRIMARY KEY (id);


--
-- Name: template_placeholders template_placeholders_placeholder_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_placeholders
    ADD CONSTRAINT template_placeholders_placeholder_key UNIQUE (placeholder);


--
-- Name: template_send_log template_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_send_log
    ADD CONSTRAINT template_send_log_pkey PRIMARY KEY (id);


--
-- Name: tipping_rates tipping_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipping_rates
    ADD CONSTRAINT tipping_rates_pkey PRIMARY KEY (id);


--
-- Name: tipping_rates tipping_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipping_rates
    ADD CONSTRAINT tipping_rates_service_code_key UNIQUE (service_code);


--
-- Name: tour_availability tour_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_availability
    ADD CONSTRAINT tour_availability_pkey PRIMARY KEY (id);


--
-- Name: tour_availability tour_availability_variation_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_availability
    ADD CONSTRAINT tour_availability_variation_id_date_key UNIQUE (variation_id, date);


--
-- Name: tour_categories tour_categories_category_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_categories
    ADD CONSTRAINT tour_categories_category_code_key UNIQUE (category_code);


--
-- Name: tour_categories tour_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_categories
    ADD CONSTRAINT tour_categories_pkey PRIMARY KEY (id);


--
-- Name: tour_day_activities tour_day_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_day_activities
    ADD CONSTRAINT tour_day_activities_pkey PRIMARY KEY (id);


--
-- Name: tour_days tour_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_pkey PRIMARY KEY (id);


--
-- Name: tour_days tour_days_tour_id_day_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_tour_id_day_number_key UNIQUE (tour_id, day_number);


--
-- Name: tour_departures tour_departures_org_id_template_id_start_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_org_id_template_id_start_date_key UNIQUE (org_id, template_id, start_date);


--
-- Name: tour_departures tour_departures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_pkey PRIMARY KEY (id);


--
-- Name: tour_pricing tour_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_pricing
    ADD CONSTRAINT tour_pricing_pkey PRIMARY KEY (id);


--
-- Name: tour_pricing tour_pricing_tour_id_pax_is_euro_passport_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_pricing
    ADD CONSTRAINT tour_pricing_tour_id_pax_is_euro_passport_key UNIQUE (tour_id, pax, is_euro_passport);


--
-- Name: tour_quotes tour_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_pkey PRIMARY KEY (id);


--
-- Name: tour_quotes tour_quotes_quote_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_quote_number_key UNIQUE (quote_number);


--
-- Name: tour_reviews tour_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_reviews
    ADD CONSTRAINT tour_reviews_pkey PRIMARY KEY (id);


--
-- Name: tour_template_defaults tour_template_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_template_defaults
    ADD CONSTRAINT tour_template_defaults_pkey PRIMARY KEY (id);


--
-- Name: tour_template_defaults tour_template_defaults_template_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_template_defaults
    ADD CONSTRAINT tour_template_defaults_template_id_key UNIQUE (template_id);


--
-- Name: tour_template_versions tour_template_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_template_versions
    ADD CONSTRAINT tour_template_versions_pkey PRIMARY KEY (id);


--
-- Name: tour_template_versions tour_template_versions_template_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_template_versions
    ADD CONSTRAINT tour_template_versions_template_id_language_key UNIQUE (template_id, language);


--
-- Name: tour_templates tour_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_templates
    ADD CONSTRAINT tour_templates_pkey PRIMARY KEY (id);


--
-- Name: tour_templates tour_templates_template_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_templates
    ADD CONSTRAINT tour_templates_template_code_key UNIQUE (template_code);


--
-- Name: tour_variation_services tour_variation_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variation_services
    ADD CONSTRAINT tour_variation_services_pkey PRIMARY KEY (id);


--
-- Name: tour_variation_versions tour_variation_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variation_versions
    ADD CONSTRAINT tour_variation_versions_pkey PRIMARY KEY (id);


--
-- Name: tour_variation_versions tour_variation_versions_variation_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variation_versions
    ADD CONSTRAINT tour_variation_versions_variation_id_language_key UNIQUE (variation_id, language);


--
-- Name: tour_variations tour_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variations
    ADD CONSTRAINT tour_variations_pkey PRIMARY KEY (id);


--
-- Name: tour_variations tour_variations_variation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variations
    ADD CONSTRAINT tour_variations_variation_code_key UNIQUE (variation_code);


--
-- Name: tours tours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_pkey PRIMARY KEY (id);


--
-- Name: tours tours_tour_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_tour_code_key UNIQUE (tour_code);


--
-- Name: train_rates train_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_rates
    ADD CONSTRAINT train_rates_pkey PRIMARY KEY (id);


--
-- Name: train_rates train_rates_service_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_rates
    ADD CONSTRAINT train_rates_service_code_key UNIQUE (service_code);


--
-- Name: transportation_contacts transportation_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportation_contacts
    ADD CONSTRAINT transportation_contacts_pkey PRIMARY KEY (id);


--
-- Name: transportation_rates transportation_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportation_rates
    ADD CONSTRAINT transportation_rates_pkey PRIMARY KEY (id);


--
-- Name: concierge_briefs uq_concierge_briefs_conversation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_briefs
    ADD CONSTRAINT uq_concierge_briefs_conversation UNIQUE (conversation_id);


--
-- Name: concierge_brief_revisions uq_concierge_revision; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_brief_revisions
    ADD CONSTRAINT uq_concierge_revision UNIQUE (conversation_id, brief_revision);


--
-- Name: user_invitations user_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_pkey PRIMARY KEY (id);


--
-- Name: user_invitations user_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_token_key UNIQUE (token);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id);


--
-- Name: variation_daily_itinerary variation_daily_itinerary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_daily_itinerary
    ADD CONSTRAINT variation_daily_itinerary_pkey PRIMARY KEY (id);


--
-- Name: variation_daily_itinerary variation_daily_itinerary_variation_id_day_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_daily_itinerary
    ADD CONSTRAINT variation_daily_itinerary_variation_id_day_number_key UNIQUE (variation_id, day_number);


--
-- Name: variation_pricing variation_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_pricing
    ADD CONSTRAINT variation_pricing_pkey PRIMARY KEY (id);


--
-- Name: variation_services variation_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_services
    ADD CONSTRAINT variation_services_pkey PRIMARY KEY (id);


--
-- Name: vehicle_rates vehicle_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_rates
    ADD CONSTRAINT vehicle_rates_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_license_plate_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_license_plate_key UNIQUE (license_plate);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversations whatsapp_conversations_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_phone_number_key UNIQUE (phone_number);


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_messages whatsapp_messages_message_sid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_message_sid_key UNIQUE (message_sid);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: writing_rules writing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_rules
    ADD CONSTRAINT writing_rules_pkey PRIMARY KEY (id);


--
-- Name: activity_log_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_entity_idx ON public.activity_log USING btree (entity_type, created_at DESC);


--
-- Name: activity_log_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_org_created_idx ON public.activity_log USING btree (org_id, created_at DESC);


--
-- Name: activity_log_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_user_idx ON public.activity_log USING btree (user_id, created_at DESC);


--
-- Name: b2b_partners_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX b2b_partners_org_id_idx ON public.b2b_partners USING btree (org_id);


--
-- Name: b2b_pricing_rules_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX b2b_pricing_rules_org_id_idx ON public.b2b_pricing_rules USING btree (org_id);


--
-- Name: b2b_transport_packages_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX b2b_transport_packages_org_id_idx ON public.b2b_transport_packages USING btree (org_id);


--
-- Name: clients_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_org_id_idx ON public.clients USING btree (org_id);


--
-- Name: clients_org_id_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_org_id_phone_idx ON public.clients USING btree (org_id, phone);


--
-- Name: idx_accommodation_city_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accommodation_city_season ON public.accommodation_rates USING btree (city, season, is_active);


--
-- Name: idx_accommodation_rates_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accommodation_rates_city ON public.accommodation_rates USING btree (city);


--
-- Name: idx_accommodation_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accommodation_rates_supplier ON public.accommodation_rates USING btree (supplier_id);


--
-- Name: idx_accommodation_rates_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accommodation_rates_supplier_id ON public.accommodation_rates USING btree (supplier_id);


--
-- Name: idx_accommodation_rates_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accommodation_rates_tier ON public.accommodation_rates USING btree (tier);


--
-- Name: idx_accommodation_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accommodation_season ON public.accommodation_rates USING btree (season);


--
-- Name: idx_accommodation_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accommodation_tier ON public.accommodation_rates USING btree (tier);


--
-- Name: idx_accounting_sync_log_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_sync_log_org_id ON public.accounting_sync_log USING btree (org_id);


--
-- Name: idx_accounting_tokens_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_tokens_org_id ON public.accounting_tokens USING btree (org_id);


--
-- Name: idx_accounting_tokens_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_tokens_provider ON public.accounting_tokens USING btree (provider);


--
-- Name: idx_accounting_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_tokens_user_id ON public.accounting_tokens USING btree (user_id);


--
-- Name: idx_activity_city_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_city_category ON public.activity_rates USING btree (city, activity_category, is_active);


--
-- Name: idx_activity_rates_is_addon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_rates_is_addon ON public.activity_rates USING btree (is_addon) WHERE (is_addon = true);


--
-- Name: idx_activity_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_rates_supplier ON public.activity_rates USING btree (supplier_id);


--
-- Name: idx_activity_rates_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_rates_supplier_id ON public.activity_rates USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_agent_memory_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_confidence ON public.agent_memory USING btree (org_id, confidence DESC);


--
-- Name: idx_agent_memory_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_expires ON public.agent_memory USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_agent_memory_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_org ON public.agent_memory USING btree (org_id);


--
-- Name: idx_agent_memory_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_subject ON public.agent_memory USING btree (org_id, subject_type, subject_id);


--
-- Name: idx_agent_memory_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_type ON public.agent_memory USING btree (org_id, memory_type);


--
-- Name: idx_agent_runs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_created ON public.agent_runs USING btree (org_id, created_at DESC);


--
-- Name: idx_agent_runs_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_itinerary ON public.agent_runs USING btree (itinerary_id);


--
-- Name: idx_agent_runs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_org ON public.agent_runs USING btree (org_id);


--
-- Name: idx_agent_runs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_type ON public.agent_runs USING btree (org_id, agent_type);


--
-- Name: idx_agent_runs_unprocessed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_unprocessed ON public.agent_runs USING btree (created_at) WHERE (processed_for_memory = false);


--
-- Name: idx_airport_staff_airport; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airport_staff_airport ON public.airport_staff_rates USING btree (airport_code, is_active);


--
-- Name: idx_airport_staff_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airport_staff_lookup ON public.airport_staff_rates USING btree (airport_code, service_type, is_active);


--
-- Name: idx_airport_staff_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airport_staff_rates_supplier ON public.airport_staff_rates USING btree (supplier_id);


--
-- Name: idx_airport_staff_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_airport_staff_service ON public.airport_staff_rates USING btree (service_type, is_active);


--
-- Name: idx_assistant_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_rates_supplier ON public.assistant_rates USING btree (supplier_id);


--
-- Name: idx_attraction_aliases_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attraction_aliases_alias ON public.attraction_aliases USING btree (lower(alias)) WHERE (is_active = true);


--
-- Name: idx_attraction_aliases_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attraction_aliases_canonical ON public.attraction_aliases USING btree (lower(canonical_name)) WHERE (is_active = true);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_record ON public.audit_logs USING btree (record_id);


--
-- Name: idx_audit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_status ON public.audit_logs USING btree (status);


--
-- Name: idx_audit_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_table ON public.audit_logs USING btree (table_name);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_audit_user_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user_action ON public.audit_logs USING btree (user_id, action, created_at DESC);


--
-- Name: idx_b2b_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2b_active ON public.b2b_partners USING btree (is_active);


--
-- Name: idx_b2b_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2b_code ON public.b2b_partners USING btree (partner_code);


--
-- Name: idx_b2b_pricing_rules_applies_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2b_pricing_rules_applies_to ON public.b2b_pricing_rules USING btree (applies_to, is_active);


--
-- Name: idx_b2b_pricing_rules_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2b_pricing_rules_category ON public.b2b_pricing_rules USING btree (service_category);


--
-- Name: idx_b2b_pricing_rules_rate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2b_pricing_rules_rate ON public.b2b_pricing_rules USING btree (rate_table, rate_id);


--
-- Name: idx_b2b_transport_packages_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2b_transport_packages_type ON public.b2b_transport_packages USING btree (package_type);


--
-- Name: idx_b2c_quotes_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2c_quotes_itinerary ON public.b2c_quotes USING btree (itinerary_id);


--
-- Name: idx_b2c_quotes_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2c_quotes_org ON public.b2c_quotes USING btree (org_id);


--
-- Name: idx_b2c_quotes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_b2c_quotes_status ON public.b2c_quotes USING btree (status);


--
-- Name: idx_booking_extras_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_extras_booking ON public.booking_extras USING btree (booking_id, status);


--
-- Name: idx_booking_extras_passenger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_extras_passenger ON public.booking_extras USING btree (passenger_id) WHERE (passenger_id IS NOT NULL);


--
-- Name: idx_booking_extras_unbilled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_extras_unbilled ON public.booking_extras USING btree (booking_id) WHERE ((status = 'confirmed'::text) AND (invoiced_at IS NULL));


--
-- Name: idx_booking_passengers_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_passengers_booking ON public.booking_passengers USING btree (booking_id);


--
-- Name: idx_booking_passengers_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_passengers_lead ON public.booking_passengers USING btree (is_lead_passenger) WHERE (is_lead_passenger = true);


--
-- Name: idx_booking_passengers_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_passengers_org ON public.booking_passengers USING btree (org_id);


--
-- Name: idx_booking_passengers_pending_details; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_passengers_pending_details ON public.booking_passengers USING btree (booking_id) WHERE (details_submitted_at IS NULL);


--
-- Name: idx_booking_payments_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_payments_booking_id ON public.booking_payments USING btree (booking_id);


--
-- Name: idx_booking_portal_links_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_portal_links_org ON public.booking_portal_links USING btree (org_id);


--
-- Name: idx_booking_portal_links_passenger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_portal_links_passenger ON public.booking_portal_links USING btree (passenger_id) WHERE (passenger_id IS NOT NULL);


--
-- Name: idx_booking_supplier_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_supplier_booking_id ON public.booking_supplier_status USING btree (booking_id);


--
-- Name: idx_booking_supplier_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_supplier_status ON public.booking_supplier_status USING btree (status);


--
-- Name: idx_booking_supplier_status_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_supplier_status_supplier_id ON public.booking_supplier_status USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_bookings_balance_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_balance_due_date ON public.bookings USING btree (balance_due_date) WHERE (balance_due_date IS NOT NULL);


--
-- Name: idx_bookings_booking_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_booking_code ON public.bookings USING btree (booking_code);


--
-- Name: idx_bookings_itinerary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_itinerary_id ON public.bookings USING btree (itinerary_id);


--
-- Name: idx_bookings_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_org_id ON public.bookings USING btree (org_id);


--
-- Name: idx_bookings_partner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_partner_id ON public.bookings USING btree (partner_id);


--
-- Name: idx_bookings_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_quote ON public.bookings USING btree (quote_id, quote_type);


--
-- Name: idx_bookings_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_start_date ON public.bookings USING btree (start_date);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_change_requests_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_booking ON public.booking_change_requests USING btree (booking_id, status);


--
-- Name: idx_client_contacts_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_contacts_client_id ON public.client_contacts USING btree (client_id);


--
-- Name: idx_client_documents_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_documents_client_id ON public.client_documents USING btree (client_id);


--
-- Name: idx_client_documents_document_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_documents_document_type ON public.client_documents USING btree (document_type);


--
-- Name: idx_client_notes_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_notes_client_id ON public.client_notes USING btree (client_id);


--
-- Name: idx_client_notes_is_important; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_notes_is_important ON public.client_notes USING btree (is_important);


--
-- Name: idx_clients_client_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_client_code ON public.clients USING btree (client_code);


--
-- Name: idx_clients_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_created_at ON public.clients USING btree (created_at);


--
-- Name: idx_clients_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_email ON public.clients USING btree (email);


--
-- Name: idx_clients_lead_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_lead_source ON public.clients USING btree (lead_source);


--
-- Name: idx_clients_nationality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_nationality ON public.clients USING btree (nationality);


--
-- Name: idx_clients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_status ON public.clients USING btree (status);


--
-- Name: idx_clients_vip_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_vip_status ON public.clients USING btree (vip_status);


--
-- Name: idx_comm_drafts_inbox_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_drafts_inbox_msg ON public.communication_drafts USING btree (inbox_message_id);


--
-- Name: idx_comm_drafts_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_drafts_parent ON public.communication_drafts USING btree (parent_draft_id);


--
-- Name: idx_comm_drafts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_drafts_status ON public.communication_drafts USING btree (status);


--
-- Name: idx_comm_drafts_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_drafts_thread_id ON public.communication_drafts USING btree (thread_id);


--
-- Name: idx_comm_inbox_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_inbox_received_at ON public.communication_inbox USING btree (received_at DESC);


--
-- Name: idx_comm_inbox_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_inbox_status ON public.communication_inbox USING btree (status);


--
-- Name: idx_comm_inbox_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_inbox_thread_id ON public.communication_inbox USING btree (thread_id);


--
-- Name: idx_comm_threads_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_threads_channel ON public.communication_threads USING btree (channel);


--
-- Name: idx_comm_threads_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_threads_client_id ON public.communication_threads USING btree (client_id);


--
-- Name: idx_comm_threads_email_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_threads_email_conv ON public.communication_threads USING btree (email_conversation_id);


--
-- Name: idx_comm_threads_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_threads_last_message_at ON public.communication_threads USING btree (last_message_at DESC);


--
-- Name: idx_comm_threads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_threads_status ON public.communication_threads USING btree (status);


--
-- Name: idx_comm_threads_wa_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_threads_wa_conv ON public.communication_threads USING btree (whatsapp_conversation_id);


--
-- Name: idx_commissions_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_category ON public.commissions USING btree (category);


--
-- Name: idx_commissions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_date ON public.commissions USING btree (transaction_date);


--
-- Name: idx_commissions_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_itinerary ON public.commissions USING btree (itinerary_id);


--
-- Name: idx_commissions_itinerary_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_itinerary_type ON public.commissions USING btree (itinerary_id, commission_type) WHERE (itinerary_id IS NOT NULL);


--
-- Name: idx_commissions_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_org_id ON public.commissions USING btree (org_id);


--
-- Name: idx_commissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_status ON public.commissions USING btree (status);


--
-- Name: idx_commissions_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_supplier ON public.commissions USING btree (supplier_id);


--
-- Name: idx_commissions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_type ON public.commissions USING btree (commission_type);


--
-- Name: idx_communication_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communication_client_id ON public.communication_history USING btree (client_id);


--
-- Name: idx_communication_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communication_date ON public.communication_history USING btree (communication_date);


--
-- Name: idx_communication_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communication_status ON public.communication_history USING btree (status);


--
-- Name: idx_communication_threads_brief_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_communication_threads_brief_id_unique ON public.communication_threads USING btree (brief_id) WHERE (brief_id IS NOT NULL);


--
-- Name: idx_communication_threads_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communication_threads_org_id ON public.communication_threads USING btree (org_id);


--
-- Name: idx_communication_threads_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communication_threads_origin ON public.communication_threads USING btree (origin);


--
-- Name: idx_communication_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communication_type ON public.communication_history USING btree (communication_type);


--
-- Name: idx_concierge_briefs_actionable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_briefs_actionable ON public.concierge_briefs USING btree (is_actionable);


--
-- Name: idx_concierge_briefs_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_briefs_client_id ON public.concierge_briefs USING btree (client_id);


--
-- Name: idx_concierge_briefs_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_briefs_org_id ON public.concierge_briefs USING btree (org_id);


--
-- Name: idx_concierge_briefs_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_briefs_received_at ON public.concierge_briefs USING btree (received_at DESC);


--
-- Name: idx_concierge_briefs_review_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_briefs_review_status ON public.concierge_briefs USING btree (review_status);


--
-- Name: idx_concierge_revisions_brief_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_revisions_brief_id ON public.concierge_brief_revisions USING btree (brief_id);


--
-- Name: idx_concierge_revisions_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_revisions_conversation ON public.concierge_brief_revisions USING btree (conversation_id);


--
-- Name: idx_content_library_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_active ON public.content_library USING btree (is_active);


--
-- Name: idx_content_library_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_category ON public.content_library USING btree (category_id);


--
-- Name: idx_content_library_is_cruise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_is_cruise ON public.content_library USING btree (is_cruise) WHERE (is_cruise = true);


--
-- Name: idx_content_library_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_route ON public.content_library USING btree (route);


--
-- Name: idx_content_library_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_slug ON public.content_library USING btree (slug);


--
-- Name: idx_content_library_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_tags ON public.content_library USING gin (tags);


--
-- Name: idx_content_library_tour_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_tour_type ON public.content_library USING btree (tour_type);


--
-- Name: idx_content_usage_log_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_usage_log_content ON public.content_usage_log USING btree (content_id);


--
-- Name: idx_content_variations_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_variations_content ON public.content_variations USING btree (content_id);


--
-- Name: idx_content_variations_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_variations_tier ON public.content_variations USING btree (tier);


--
-- Name: idx_conversation_activity_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_activity_agent ON public.conversation_activity USING btree (agent_id, created_at DESC);


--
-- Name: idx_conversation_activity_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_activity_conversation ON public.conversation_activity USING btree (conversation_id, created_at DESC);


--
-- Name: idx_conversation_notes_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_notes_conversation ON public.conversation_notes USING btree (conversation_id, created_at DESC);


--
-- Name: idx_cruise_contacts_preferred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cruise_contacts_preferred ON public.cruise_contacts USING btree (is_preferred) WHERE (is_preferred = true);


--
-- Name: idx_cruise_contacts_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cruise_contacts_tier ON public.cruise_contacts USING btree (tier);


--
-- Name: idx_cruise_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cruise_route ON public.nile_cruises USING btree (embark_city, disembark_city, is_active);


--
-- Name: idx_cruise_routes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cruise_routes ON public.cruise_contacts USING gin (routes);


--
-- Name: idx_cruise_ship; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cruise_ship ON public.nile_cruises USING btree (ship_name, cabin_type, is_active);


--
-- Name: idx_daily_itinerary_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_itinerary_day ON public.variation_daily_itinerary USING btree (day_number);


--
-- Name: idx_daily_itinerary_variation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_itinerary_variation ON public.variation_daily_itinerary USING btree (variation_id);


--
-- Name: idx_departure_bookings_departure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departure_bookings_departure ON public.departure_bookings USING btree (departure_id);


--
-- Name: idx_departure_bookings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departure_bookings_org ON public.departure_bookings USING btree (org_id);


--
-- Name: idx_destination_cities_destination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_destination_cities_destination ON public.destination_cities USING btree (destination_id) WHERE is_active;


--
-- Name: idx_email_activity_log_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_activity_log_client_id ON public.email_activity_log USING btree (client_id);


--
-- Name: idx_email_activity_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_activity_log_created_at ON public.email_activity_log USING btree (created_at DESC);


--
-- Name: idx_email_activity_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_activity_log_user_id ON public.email_activity_log USING btree (user_id);


--
-- Name: idx_email_cache_metadata_user_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_cache_metadata_user_folder ON public.email_cache_metadata USING btree (user_id, folder);


--
-- Name: idx_email_client_links_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_client_links_client_id ON public.email_client_links USING btree (client_id);


--
-- Name: idx_email_client_links_email_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_client_links_email_address ON public.email_client_links USING btree (email_address);


--
-- Name: idx_email_client_links_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_client_links_thread_id ON public.email_client_links USING btree (thread_id);


--
-- Name: idx_email_client_links_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_client_links_user_id ON public.email_client_links USING btree (user_id);


--
-- Name: idx_email_conversations_client_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_client_email ON public.email_conversations USING btree (client_email);


--
-- Name: idx_email_conversations_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_client_id ON public.email_conversations USING btree (client_id);


--
-- Name: idx_email_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_last_message ON public.email_conversations USING btree (last_message_at DESC);


--
-- Name: idx_email_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_status ON public.email_conversations USING btree (status);


--
-- Name: idx_email_conversations_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_thread_id ON public.email_conversations USING btree (thread_id);


--
-- Name: idx_email_conversations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_conversations_user_id ON public.email_conversations USING btree (user_id);


--
-- Name: idx_email_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_conversation ON public.email_messages USING btree (conversation_id);


--
-- Name: idx_email_messages_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_direction ON public.email_messages USING btree (direction);


--
-- Name: idx_email_messages_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_from ON public.email_messages USING btree (from_address);


--
-- Name: idx_email_messages_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_message_id ON public.email_messages USING btree (message_id);


--
-- Name: idx_email_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_sent_at ON public.email_messages USING btree (sent_at DESC);


--
-- Name: idx_email_messages_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_thread_id ON public.email_messages USING btree (thread_id);


--
-- Name: idx_email_signatures_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_signatures_user_id ON public.email_signatures USING btree (user_id);


--
-- Name: idx_email_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_category ON public.email_templates USING btree (category);


--
-- Name: idx_email_templates_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_user_id ON public.email_templates USING btree (user_id);


--
-- Name: idx_entrance_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entrance_city ON public.entrance_fees USING btree (city, is_active);


--
-- Name: idx_entrance_fee_versions_fee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entrance_fee_versions_fee_id ON public.entrance_fee_versions USING btree (entrance_fee_id);


--
-- Name: idx_entrance_fee_versions_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entrance_fee_versions_language ON public.entrance_fee_versions USING btree (language);


--
-- Name: idx_entrance_fees_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entrance_fees_active ON public.entrance_fees USING btree (is_active);


--
-- Name: idx_entrance_fees_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entrance_fees_category ON public.entrance_fees USING btree (category);


--
-- Name: idx_entrance_fees_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entrance_fees_city ON public.entrance_fees USING btree (city);


--
-- Name: idx_entrance_fees_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entrance_fees_supplier_id ON public.entrance_fees USING btree (supplier_id);


--
-- Name: idx_exchange_rates_currencies; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_currencies ON public.exchange_rate_snapshots USING btree (base_currency, target_currency, captured_at DESC);


--
-- Name: idx_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_category ON public.expenses USING btree (category);


--
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_date ON public.expenses USING btree (expense_date);


--
-- Name: idx_expenses_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_itinerary ON public.expenses USING btree (itinerary_id);


--
-- Name: idx_expenses_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_org_id ON public.expenses USING btree (org_id);


--
-- Name: idx_expenses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_status ON public.expenses USING btree (status);


--
-- Name: idx_expenses_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_supplier_id ON public.expenses USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_expenses_supplier_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_supplier_type ON public.expenses USING btree (supplier_type);


--
-- Name: idx_flight_rates_airline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_rates_airline ON public.flight_rates USING btree (airline);


--
-- Name: idx_flight_rates_cabin_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_rates_cabin_class ON public.flight_rates USING btree (cabin_class);


--
-- Name: idx_flight_rates_flight_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_rates_flight_type ON public.flight_rates USING btree (flight_type);


--
-- Name: idx_flight_rates_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_rates_is_active ON public.flight_rates USING btree (is_active);


--
-- Name: idx_flight_rates_route_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_rates_route_from ON public.flight_rates USING btree (route_from);


--
-- Name: idx_flight_rates_route_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_rates_route_to ON public.flight_rates USING btree (route_to);


--
-- Name: idx_flight_rates_service_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_flight_rates_service_code ON public.flight_rates USING btree (service_code);


--
-- Name: idx_flight_rates_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_rates_supplier_id ON public.flight_rates USING btree (supplier_id);


--
-- Name: idx_followups_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_assigned_to ON public.client_followups USING btree (assigned_to);


--
-- Name: idx_followups_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_client_id ON public.client_followups USING btree (client_id);


--
-- Name: idx_followups_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_due_date ON public.client_followups USING btree (due_date);


--
-- Name: idx_followups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_status ON public.client_followups USING btree (status);


--
-- Name: idx_gmail_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gmail_tokens_user_id ON public.gmail_tokens USING btree (user_id);


--
-- Name: idx_guide_city_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guide_city_lang ON public.guide_rates USING btree (city, guide_language, is_active);


--
-- Name: idx_guide_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guide_rates_supplier ON public.guide_rates USING btree (supplier_id);


--
-- Name: idx_guide_rates_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guide_rates_supplier_id ON public.guide_rates USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_hotel_contacts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_contacts_active ON public.hotel_contacts USING btree (is_active);


--
-- Name: idx_hotel_contacts_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_contacts_city ON public.hotel_contacts USING btree (city);


--
-- Name: idx_hotel_contacts_city_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_contacts_city_active ON public.hotel_contacts USING btree (city, is_active);


--
-- Name: idx_hotel_contacts_preferred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_contacts_preferred ON public.hotel_contacts USING btree (is_preferred) WHERE (is_preferred = true);


--
-- Name: idx_hotel_contacts_rate_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_contacts_rate_validity ON public.hotel_contacts USING btree (rate_valid_from, rate_valid_to);


--
-- Name: idx_hotel_contacts_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_contacts_tier ON public.hotel_contacts USING btree (tier);


--
-- Name: idx_hotel_staff_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_staff_lookup ON public.hotel_staff_rates USING btree (service_type, hotel_category, is_active);


--
-- Name: idx_hotel_staff_rates_destination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_staff_rates_destination ON public.hotel_staff_rates USING btree (destination);


--
-- Name: idx_hotel_staff_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_staff_rates_supplier ON public.hotel_staff_rates USING btree (supplier_id);


--
-- Name: idx_hotel_staff_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_staff_service ON public.hotel_staff_rates USING btree (service_type, hotel_category, is_active);


--
-- Name: idx_insurance_premiums_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_premiums_lookup ON public.insurance_premiums USING btree (org_id, rate_year, max_days);


--
-- Name: idx_integration_events_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_events_integration ON public.integration_events USING btree (integration_id, received_at DESC);


--
-- Name: idx_integration_events_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_events_org ON public.integration_events USING btree (org_id, received_at DESC);


--
-- Name: idx_integrations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_org ON public.integrations USING btree (org_id);


--
-- Name: idx_integrations_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_provider ON public.integrations USING btree (provider) WHERE is_active;


--
-- Name: idx_invoice_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments USING btree (invoice_id);


--
-- Name: idx_invoice_reminders_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_reminders_invoice_id ON public.invoice_reminders USING btree (invoice_id);


--
-- Name: idx_invoices_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_invoices_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_itinerary ON public.invoices USING btree (itinerary_id);


--
-- Name: idx_invoices_itinerary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_itinerary_id ON public.invoices USING btree (itinerary_id);


--
-- Name: idx_invoices_next_reminder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_next_reminder ON public.invoices USING btree (next_reminder_date) WHERE ((status)::text <> ALL ((ARRAY['paid'::character varying, 'cancelled'::character varying])::text[]));


--
-- Name: idx_invoices_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_org_created ON public.invoices USING btree (org_id, created_at DESC);


--
-- Name: idx_invoices_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_org_id ON public.invoices USING btree (org_id);


--
-- Name: idx_invoices_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_parent_id ON public.invoices USING btree (parent_invoice_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_invoices_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_type ON public.invoices USING btree (invoice_type);


--
-- Name: idx_itineraries_assigned_guide_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_assigned_guide_id ON public.itineraries USING btree (assigned_guide_id);


--
-- Name: idx_itineraries_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_assigned_to ON public.itineraries USING btree (assigned_to) WHERE (assigned_to IS NOT NULL);


--
-- Name: idx_itineraries_assigned_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_assigned_vehicle_id ON public.itineraries USING btree (assigned_vehicle_id);


--
-- Name: idx_itineraries_cancelled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_cancelled_at ON public.itineraries USING btree (cancelled_at) WHERE (cancelled_at IS NOT NULL);


--
-- Name: idx_itineraries_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_client_id ON public.itineraries USING btree (client_id);


--
-- Name: idx_itineraries_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_code ON public.itineraries USING btree (itinerary_code);


--
-- Name: idx_itineraries_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_created_at ON public.itineraries USING btree (created_at DESC);


--
-- Name: idx_itineraries_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_dates ON public.itineraries USING btree (start_date, end_date);


--
-- Name: idx_itineraries_guide; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_guide ON public.itineraries USING btree (assigned_guide_id);


--
-- Name: idx_itineraries_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_itineraries_idempotency_key ON public.itineraries USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_itineraries_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_org_id ON public.itineraries USING btree (org_id);


--
-- Name: idx_itineraries_partner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_partner_id ON public.itineraries USING btree (partner_id);


--
-- Name: idx_itineraries_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_source ON public.itineraries USING btree (source);


--
-- Name: idx_itineraries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_status ON public.itineraries USING btree (status);


--
-- Name: idx_itineraries_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_template ON public.itineraries USING btree (template_id);


--
-- Name: idx_itineraries_thread_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_itineraries_thread_id_unique ON public.itineraries USING btree (thread_id) WHERE (thread_id IS NOT NULL);


--
-- Name: idx_itineraries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_user_id ON public.itineraries USING btree (user_id);


--
-- Name: idx_itineraries_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itineraries_vehicle ON public.itineraries USING btree (assigned_vehicle_id);


--
-- Name: idx_itinerary_day_versions_day_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_day_versions_day_id ON public.itinerary_day_versions USING btree (itinerary_day_id);


--
-- Name: idx_itinerary_day_versions_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_day_versions_language ON public.itinerary_day_versions USING btree (language);


--
-- Name: idx_itinerary_days_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_days_itinerary ON public.itinerary_days USING btree (itinerary_id);


--
-- Name: idx_itinerary_days_itinerary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_days_itinerary_id ON public.itinerary_days USING btree (itinerary_id);


--
-- Name: idx_itinerary_days_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_days_number ON public.itinerary_days USING btree (day_number);


--
-- Name: idx_itinerary_resources_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_resources_dates ON public.itinerary_resources USING btree (start_date, end_date);


--
-- Name: idx_itinerary_resources_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_resources_day ON public.itinerary_resources USING btree (itinerary_day_id);


--
-- Name: idx_itinerary_resources_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_resources_itinerary ON public.itinerary_resources USING btree (itinerary_id);


--
-- Name: idx_itinerary_resources_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_resources_resource ON public.itinerary_resources USING btree (resource_type, resource_id);


--
-- Name: idx_itinerary_service_versions_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_service_versions_language ON public.itinerary_service_versions USING btree (language);


--
-- Name: idx_itinerary_service_versions_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_service_versions_service_id ON public.itinerary_service_versions USING btree (itinerary_service_id);


--
-- Name: idx_itinerary_services_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_services_day ON public.itinerary_services USING btree (itinerary_day_id);


--
-- Name: idx_itinerary_services_day_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_services_day_id ON public.itinerary_services USING btree (itinerary_day_id);


--
-- Name: idx_itinerary_services_sold_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_services_sold_by ON public.itinerary_services USING btree (sold_by_supplier_id) WHERE (sold_by_supplier_id IS NOT NULL);


--
-- Name: idx_itinerary_services_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_services_supplier ON public.itinerary_services USING btree (supplier_id);


--
-- Name: idx_itinerary_services_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_services_supplier_id ON public.itinerary_services USING btree (supplier_id);


--
-- Name: idx_itinerary_services_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_services_type ON public.itinerary_services USING btree (service_type);


--
-- Name: idx_itinerary_services_vehicle_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_services_vehicle_type ON public.itinerary_services USING btree (vehicle_type);


--
-- Name: idx_itinerary_shares_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_shares_org ON public.itinerary_shares USING btree (org_id);


--
-- Name: idx_itinerary_versions_itinerary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_versions_itinerary_id ON public.itinerary_versions USING btree (itinerary_id);


--
-- Name: idx_itinerary_versions_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_versions_language ON public.itinerary_versions USING btree (language);


--
-- Name: idx_meal_city_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_city_type ON public.meal_rates USING btree (city, meal_type, is_active);


--
-- Name: idx_meal_rates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_rates_category ON public.meal_rates USING btree (meal_category);


--
-- Name: idx_meal_rates_meal_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_rates_meal_type ON public.meal_rates USING btree (meal_type);


--
-- Name: idx_meal_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_rates_supplier ON public.meal_rates USING btree (supplier_id);


--
-- Name: idx_meal_rates_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_rates_supplier_id ON public.meal_rates USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_meal_rates_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meal_rates_tier ON public.meal_rates USING btree (tier);


--
-- Name: idx_message_templates_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_templates_language ON public.message_templates USING btree (language);


--
-- Name: idx_nile_cruises_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nile_cruises_supplier_id ON public.nile_cruises USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_member_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_member_unread ON public.notifications USING btree (team_member_id, is_read, created_at DESC);


--
-- Name: idx_notifications_related_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_related_itinerary ON public.notifications USING btree (related_itinerary_id) WHERE (related_itinerary_id IS NOT NULL);


--
-- Name: idx_notifications_team_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_team_member ON public.notifications USING btree (team_member_id);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: idx_operator_capacity_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_capacity_date ON public.operator_capacity USING btree (date);


--
-- Name: idx_operator_capacity_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_capacity_org ON public.operator_capacity USING btree (org_id);


--
-- Name: idx_operator_capacity_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_capacity_range ON public.operator_capacity USING btree (org_id, date, status);


--
-- Name: idx_operator_capacity_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_capacity_status ON public.operator_capacity USING btree (status);


--
-- Name: idx_organization_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_user_id ON public.organization_members USING btree (user_id);


--
-- Name: idx_passenger_documents_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passenger_documents_booking ON public.booking_passenger_documents USING btree (booking_id);


--
-- Name: idx_passenger_documents_one_passport; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_passenger_documents_one_passport ON public.booking_passenger_documents USING btree (passenger_id) WHERE ((kind = 'passport'::text) AND (purged_at IS NULL));


--
-- Name: idx_passenger_documents_passenger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passenger_documents_passenger ON public.booking_passenger_documents USING btree (passenger_id, uploaded_at DESC);


--
-- Name: idx_passenger_documents_purge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passenger_documents_purge ON public.booking_passenger_documents USING btree (purge_after) WHERE (purged_at IS NULL);


--
-- Name: idx_payments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at DESC);


--
-- Name: idx_payments_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_itinerary ON public.payments USING btree (itinerary_id);


--
-- Name: idx_payments_itinerary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_itinerary_id ON public.payments USING btree (itinerary_id);


--
-- Name: idx_payments_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_org_id ON public.payments USING btree (org_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (payment_status);


--
-- Name: idx_portal_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_messages_thread ON public.portal_messages USING btree (thread_id, created_at);


--
-- Name: idx_portal_threads_one_per_link; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_portal_threads_one_per_link ON public.portal_message_threads USING btree (booking_id, COALESCE(passenger_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: idx_portal_threads_org_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portal_threads_org_recent ON public.portal_message_threads USING btree (org_id, last_message_at DESC);


--
-- Name: idx_pricing_season_dates_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_season_dates_range ON public.pricing_season_dates USING btree (org_id, start_date, end_date);


--
-- Name: idx_pricing_season_dates_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_season_dates_season ON public.pricing_season_dates USING btree (season_id);


--
-- Name: idx_prompt_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_templates_active ON public.prompt_templates USING btree (is_active);


--
-- Name: idx_prompt_templates_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_templates_purpose ON public.prompt_templates USING btree (purpose);


--
-- Name: idx_quote_revisions_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_revisions_changed_at ON public.quote_revisions USING btree (changed_at DESC);


--
-- Name: idx_quote_revisions_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_revisions_current ON public.quote_revisions USING btree (is_current) WHERE (is_current = true);


--
-- Name: idx_quote_revisions_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_revisions_quote ON public.quote_revisions USING btree (quote_type, quote_id);


--
-- Name: idx_quote_versions_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_versions_language ON public.quote_versions USING btree (language);


--
-- Name: idx_quote_versions_quote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_versions_quote_id ON public.quote_versions USING btree (quote_id);


--
-- Name: idx_quotes_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_number ON public.tour_quotes USING btree (quote_number);


--
-- Name: idx_quotes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_status ON public.tour_quotes USING btree (status);


--
-- Name: idx_rate_audit_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_audit_changed_at ON public.rate_audit_log USING btree (changed_at DESC);


--
-- Name: idx_rate_audit_table_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_audit_table_name ON public.rate_audit_log USING btree (table_name);


--
-- Name: idx_rate_audit_table_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_audit_table_record ON public.rate_audit_log USING btree (table_name, record_id);


--
-- Name: idx_restaurant_contacts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_contacts_active ON public.restaurant_contacts USING btree (is_active);


--
-- Name: idx_restaurant_contacts_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_contacts_city ON public.restaurant_contacts USING btree (city);


--
-- Name: idx_restaurant_contacts_city_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_contacts_city_active ON public.restaurant_contacts USING btree (city, is_active);


--
-- Name: idx_restaurant_contacts_preferred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_contacts_preferred ON public.restaurant_contacts USING btree (is_preferred) WHERE (is_preferred = true);


--
-- Name: idx_restaurant_contacts_rate_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_contacts_rate_validity ON public.restaurant_contacts USING btree (rate_valid_from, rate_valid_to);


--
-- Name: idx_restaurant_contacts_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_contacts_tier ON public.restaurant_contacts USING btree (tier);


--
-- Name: idx_restaurant_cuisine_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_cuisine_types ON public.restaurant_contacts USING gin (cuisine_types);


--
-- Name: idx_sales_agents_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_agents_active ON public.sales_agents USING btree (is_active, is_available);


--
-- Name: idx_seasonal_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seasonal_dates ON public.seasonal_adjustments USING btree (start_date, end_date);


--
-- Name: idx_seasonal_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seasonal_rates_supplier ON public.seasonal_rates USING btree (supplier_id);


--
-- Name: idx_send_log_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_log_client ON public.template_send_log USING btree (client_id);


--
-- Name: idx_send_log_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_log_sent_at ON public.template_send_log USING btree (sent_at DESC);


--
-- Name: idx_send_log_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_log_template ON public.template_send_log USING btree (template_id);


--
-- Name: idx_service_fees_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_fees_active ON public.service_fees USING btree (is_active);


--
-- Name: idx_service_fees_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_fees_category ON public.service_fees USING btree (service_category, is_active);


--
-- Name: idx_sie_expense; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sie_expense ON public.supplier_invoice_expenses USING btree (expense_id);


--
-- Name: idx_sie_supplier_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sie_supplier_invoice ON public.supplier_invoice_expenses USING btree (supplier_invoice_id);


--
-- Name: idx_sleeping_train_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleeping_train_rates_supplier ON public.sleeping_train_rates USING btree (supplier_id);


--
-- Name: idx_sleeptrain_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleeptrain_route ON public.sleeping_train_rates USING btree (origin_city, destination_city, cabin_type, is_active);


--
-- Name: idx_supplier_documents_checkin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_documents_checkin ON public.supplier_documents USING btree (check_in);


--
-- Name: idx_supplier_documents_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_documents_date ON public.supplier_documents USING btree (service_date);


--
-- Name: idx_supplier_documents_itinerary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_documents_itinerary ON public.supplier_documents USING btree (itinerary_id);


--
-- Name: idx_supplier_documents_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_documents_number ON public.supplier_documents USING btree (document_number);


--
-- Name: idx_supplier_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_documents_status ON public.supplier_documents USING btree (status);


--
-- Name: idx_supplier_documents_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_documents_supplier ON public.supplier_documents USING btree (supplier_id);


--
-- Name: idx_supplier_documents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_documents_type ON public.supplier_documents USING btree (document_type);


--
-- Name: idx_supplier_invoices_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_date ON public.supplier_invoices USING btree (invoice_date);


--
-- Name: idx_supplier_invoices_itinerary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_itinerary_id ON public.supplier_invoices USING btree (itinerary_id) WHERE (itinerary_id IS NOT NULL);


--
-- Name: idx_supplier_invoices_match_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_match_status ON public.supplier_invoices USING btree (match_status);


--
-- Name: idx_supplier_invoices_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_org_id ON public.supplier_invoices USING btree (org_id);


--
-- Name: idx_supplier_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_status ON public.supplier_invoices USING btree (status);


--
-- Name: idx_supplier_invoices_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_supplier ON public.supplier_invoices USING btree (supplier_name);


--
-- Name: idx_supplier_invoices_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_supplier_id ON public.supplier_invoices USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_suppliers_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_city ON public.suppliers USING btree (city);


--
-- Name: idx_suppliers_guide_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_guide_lookup ON public.suppliers USING btree (type, tier) WHERE ((type)::text = 'guide'::text);


--
-- Name: idx_suppliers_is_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_is_property ON public.suppliers USING btree (is_property);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (name);


--
-- Name: idx_suppliers_name_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name_lower ON public.suppliers USING btree (lower((name)::text));


--
-- Name: idx_suppliers_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_parent ON public.suppliers USING btree (parent_supplier_id);


--
-- Name: idx_suppliers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_status ON public.suppliers USING btree (status);


--
-- Name: idx_suppliers_transport_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_transport_company ON public.suppliers USING btree (type) WHERE ((type)::text = 'transport_company'::text);


--
-- Name: idx_suppliers_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_type ON public.suppliers USING btree (type);


--
-- Name: idx_suppliers_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_types ON public.suppliers USING gin (types);


--
-- Name: idx_sync_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_entity ON public.accounting_sync_log USING btree (entity_type, entity_id);


--
-- Name: idx_sync_log_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_retry ON public.accounting_sync_log USING btree (sync_status, next_retry_at) WHERE (sync_status = 'failed'::text);


--
-- Name: idx_sync_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_status ON public.accounting_sync_log USING btree (sync_status);


--
-- Name: idx_tasks_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_archived ON public.tasks USING btree (archived);


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_department ON public.tasks USING btree (department_id) WHERE (department_id IS NOT NULL);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_tasks_linked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_linked ON public.tasks USING btree (linked_type, linked_id);


--
-- Name: idx_tasks_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_priority ON public.tasks USING btree (priority);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_team_members_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_active ON public.team_members USING btree (is_active);


--
-- Name: idx_team_members_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_department ON public.team_members USING btree (department_id) WHERE (department_id IS NOT NULL);


--
-- Name: idx_team_members_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_role ON public.team_members USING btree (role);


--
-- Name: idx_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_active ON public.message_templates USING btree (is_active);


--
-- Name: idx_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_category ON public.message_templates USING btree (category);


--
-- Name: idx_templates_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_channel ON public.message_templates USING btree (channel);


--
-- Name: idx_tipping_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tipping_lookup ON public.tipping_rates USING btree (role_type, context, is_active);


--
-- Name: idx_tipping_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tipping_role ON public.tipping_rates USING btree (role_type, context, is_active);


--
-- Name: idx_tour_day_activities_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_day_activities_day ON public.tour_day_activities USING btree (template_id, day_number);


--
-- Name: idx_tour_day_activities_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_day_activities_template ON public.tour_day_activities USING btree (template_id);


--
-- Name: idx_tour_days_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_days_city ON public.tour_days USING btree (city);


--
-- Name: idx_tour_days_tour_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_days_tour_id ON public.tour_days USING btree (tour_id);


--
-- Name: idx_tour_departures_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_departures_dates ON public.tour_departures USING btree (start_date, end_date);


--
-- Name: idx_tour_departures_externally_managed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_departures_externally_managed ON public.tour_departures USING btree (org_id, externally_managed) WHERE externally_managed;


--
-- Name: idx_tour_departures_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_departures_org ON public.tour_departures USING btree (org_id);


--
-- Name: idx_tour_departures_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_departures_status ON public.tour_departures USING btree (status);


--
-- Name: idx_tour_departures_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_departures_template ON public.tour_departures USING btree (template_id);


--
-- Name: idx_tour_departures_upcoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_departures_upcoming ON public.tour_departures USING btree (org_id, start_date, status) WHERE ((status)::text = ANY ((ARRAY['open'::character varying, 'limited'::character varying, 'guaranteed'::character varying])::text[]));


--
-- Name: idx_tour_pricing_tour_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_pricing_tour_id ON public.tour_pricing USING btree (tour_id);


--
-- Name: idx_tour_quotes_itinerary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_quotes_itinerary_id ON public.tour_quotes USING btree (itinerary_id);


--
-- Name: idx_tour_template_versions_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_template_versions_language ON public.tour_template_versions USING btree (language);


--
-- Name: idx_tour_template_versions_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_template_versions_template_id ON public.tour_template_versions USING btree (template_id);


--
-- Name: idx_tour_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_templates_active ON public.tour_templates USING btree (is_active);


--
-- Name: idx_tour_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_templates_category ON public.tour_templates USING btree (category_id);


--
-- Name: idx_tour_templates_destination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_templates_destination ON public.tour_templates USING btree (primary_destination_id);


--
-- Name: idx_tour_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_templates_type ON public.tour_templates USING btree (tour_type);


--
-- Name: idx_tour_variation_versions_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_variation_versions_language ON public.tour_variation_versions USING btree (language);


--
-- Name: idx_tour_variation_versions_variation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_variation_versions_variation_id ON public.tour_variation_versions USING btree (variation_id);


--
-- Name: idx_tours_is_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_is_template ON public.tours USING btree (is_template);


--
-- Name: idx_tours_tour_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_tour_type ON public.tours USING btree (tour_type);


--
-- Name: idx_train_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_rates_supplier ON public.train_rates USING btree (supplier_id);


--
-- Name: idx_train_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_route ON public.train_rates USING btree (origin_city, destination_city, class_type, is_active);


--
-- Name: idx_transport_city_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_city_season ON public.transportation_rates USING btree (city, season, is_active);


--
-- Name: idx_transport_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_route ON public.transportation_rates USING btree (origin_city, destination_city, is_active);


--
-- Name: idx_transport_service_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_service_city ON public.transportation_rates USING btree (service_type, city, is_active);


--
-- Name: idx_transportation_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_city ON public.transportation_contacts USING btree (city);


--
-- Name: idx_transportation_contacts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_contacts_active ON public.transportation_contacts USING btree (is_active);


--
-- Name: idx_transportation_contacts_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_contacts_city ON public.transportation_contacts USING btree (city);


--
-- Name: idx_transportation_contacts_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_contacts_service ON public.transportation_contacts USING btree (service_type);


--
-- Name: idx_transportation_rates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_rates_lookup ON public.transportation_rates USING btree (service_type, city, duration, area, vehicle_type, is_active);


--
-- Name: idx_transportation_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_rates_supplier ON public.transportation_rates USING btree (supplier_id);


--
-- Name: idx_transportation_rates_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_rates_supplier_id ON public.transportation_rates USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_transportation_vehicle_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transportation_vehicle_types ON public.transportation_contacts USING gin (vehicle_types);


--
-- Name: idx_tvs_rate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tvs_rate ON public.tour_variation_services USING btree (rate_type, rate_id);


--
-- Name: idx_tvs_variation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tvs_variation ON public.tour_variation_services USING btree (variation_id);


--
-- Name: idx_user_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invitations_email ON public.user_invitations USING btree (email);


--
-- Name: idx_user_invitations_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invitations_org_id ON public.user_invitations USING btree (org_id);


--
-- Name: idx_user_invitations_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invitations_pending ON public.user_invitations USING btree (accepted_at, expires_at) WHERE (accepted_at IS NULL);


--
-- Name: idx_user_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invitations_token ON public.user_invitations USING btree (token);


--
-- Name: idx_user_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences USING btree (user_id);


--
-- Name: idx_user_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_settings_user_id ON public.user_settings USING btree (user_id);


--
-- Name: idx_variation_daily_itinerary_cruise_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variation_daily_itinerary_cruise_day ON public.variation_daily_itinerary USING btree (variation_id, is_cruise_day) WHERE (is_cruise_day = true);


--
-- Name: idx_variation_pricing_pax; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variation_pricing_pax ON public.variation_pricing USING btree (min_pax, max_pax);


--
-- Name: idx_variation_pricing_variation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variation_pricing_variation ON public.variation_pricing USING btree (variation_id);


--
-- Name: idx_variation_services_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variation_services_category ON public.variation_services USING btree (service_category);


--
-- Name: idx_variation_services_variation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variation_services_variation ON public.variation_services USING btree (variation_id);


--
-- Name: idx_variations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variations_active ON public.tour_variations USING btree (is_active);


--
-- Name: idx_variations_group_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variations_group_type ON public.tour_variations USING btree (group_type);


--
-- Name: idx_variations_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variations_template ON public.tour_variations USING btree (template_id);


--
-- Name: idx_variations_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variations_tier ON public.tour_variations USING btree (tier);


--
-- Name: idx_vehicle_rates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_rates_supplier ON public.vehicle_rates USING btree (supplier_id);


--
-- Name: idx_vehicles_capacity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_capacity ON public.vehicles USING btree (passenger_capacity);


--
-- Name: idx_vehicles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_is_active ON public.vehicles USING btree (is_active);


--
-- Name: idx_vehicles_license_plate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_license_plate ON public.vehicles USING btree (license_plate) WHERE (license_plate IS NOT NULL);


--
-- Name: idx_vehicles_preferred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_preferred ON public.vehicles USING btree (is_preferred) WHERE (is_preferred = true);


--
-- Name: idx_vehicles_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_tier ON public.vehicles USING btree (tier);


--
-- Name: idx_vehicles_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_type ON public.vehicles USING btree (vehicle_type);


--
-- Name: idx_whatsapp_conversations_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_agent ON public.whatsapp_conversations USING btree (assigned_agent_id);


--
-- Name: idx_whatsapp_conversations_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_client ON public.whatsapp_conversations USING btree (client_id);


--
-- Name: idx_whatsapp_conversations_is_hidden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_is_hidden ON public.whatsapp_conversations USING btree (is_hidden) WHERE (is_hidden = false);


--
-- Name: idx_whatsapp_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_last_message ON public.whatsapp_conversations USING btree (last_message_at DESC);


--
-- Name: idx_whatsapp_conversations_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_conversations_phone ON public.whatsapp_conversations USING btree (phone_number);


--
-- Name: idx_whatsapp_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages USING btree (conversation_id);


--
-- Name: idx_whatsapp_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_sent_at ON public.whatsapp_messages USING btree (sent_at DESC);


--
-- Name: idx_writing_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_writing_rules_active ON public.writing_rules USING btree (is_active);


--
-- Name: idx_writing_rules_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_writing_rules_category ON public.writing_rules USING btree (category);


--
-- Name: tour_quotes_org_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tour_quotes_org_id_created_at_idx ON public.tour_quotes USING btree (org_id, created_at DESC);


--
-- Name: tour_quotes_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tour_quotes_org_id_idx ON public.tour_quotes USING btree (org_id);


--
-- Name: uq_booking_portal_links_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_booking_portal_links_active ON public.booking_portal_links USING btree (booking_id, COALESCE(passenger_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (revoked_at IS NULL);


--
-- Name: uq_bookings_one_per_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_bookings_one_per_quote ON public.bookings USING btree (quote_id, quote_type) WHERE (quote_id IS NOT NULL);


--
-- Name: uq_change_requests_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_change_requests_one_pending ON public.booking_change_requests USING btree (booking_id) WHERE (status = 'pending'::text);


--
-- Name: uq_exchange_rate_snapshots_observation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_exchange_rate_snapshots_observation ON public.exchange_rate_snapshots USING btree (base_currency, target_currency, captured_at);


--
-- Name: uq_exchange_rates_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_exchange_rates_pair ON public.exchange_rates USING btree (base_currency, target_currency);


--
-- Name: uq_guide_rates_natural_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_guide_rates_natural_key ON public.guide_rates USING btree (COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), guide_language, guide_type, tour_duration, COALESCE(city, ''::character varying));


--
-- Name: uq_integration_events_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_integration_events_external ON public.integration_events USING btree (integration_id, external_event_id) WHERE (external_event_id IS NOT NULL);


--
-- Name: uq_integrations_endpoint_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_integrations_endpoint_token ON public.integrations USING btree (endpoint_token) WHERE (endpoint_token IS NOT NULL);


--
-- Name: uq_integrations_outbound_key_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_integrations_outbound_key_hash ON public.integrations USING btree (outbound_key_hash) WHERE (outbound_key_hash IS NOT NULL);


--
-- Name: uq_itinerary_shares_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_itinerary_shares_active ON public.itinerary_shares USING btree (itinerary_id) WHERE (revoked_at IS NULL);


--
-- Name: uq_message_templates_name_channel_language; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_message_templates_name_channel_language ON public.message_templates USING btree (name, channel, language);


--
-- Name: uq_tour_departures_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tour_departures_external ON public.tour_departures USING btree (source_integration_id, external_id) WHERE ((source_integration_id IS NOT NULL) AND (external_id IS NOT NULL));


--
-- Name: itineraries_with_languages _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.itineraries_with_languages WITH (security_invoker='on') AS
 SELECT i.id,
    i.itinerary_code,
    i.client_name,
    i.client_email,
    i.client_phone,
    i.trip_name,
    i.start_date,
    i.end_date,
    i.total_days,
    i.num_adults,
    i.num_children,
    i.currency,
    i.total_cost,
    i.status,
    i.notes,
    i.created_at,
    i.updated_at,
    i.cancelled_at,
    i.cancellation_reason,
    i.user_id,
    i.client_id,
    i.payment_status,
    i.total_paid,
    i.deposit_amount,
    i.balance_due,
    i.assigned_guide_id,
    i.assigned_vehicle_id,
    i.guide_notes,
    i.vehicle_notes,
    i.pickup_location,
    i.pickup_time,
    i.destinations,
    i.num_travelers,
    i.assigned_hotel_id,
    i.assigned_restaurant_id,
    i.assigned_airport_staff_id,
    i.assigned_hotel_staff_id,
    i.hotel_notes,
    i.restaurant_notes,
    i.airport_staff_notes,
    i.hotel_staff_notes,
    i.total_revenue,
    i.margin_percent,
    i.tier,
    i.cost_mode,
    i.package_type,
    i.supplier_cost,
    i.profit,
    COALESCE(array_agg(DISTINCT iv.language) FILTER (WHERE (iv.language IS NOT NULL)), ARRAY[]::character varying[]) AS available_languages,
    count(DISTINCT iv.language) AS version_count
   FROM (public.itineraries i
     LEFT JOIN public.itinerary_versions iv ON ((i.id = iv.itinerary_id)))
  GROUP BY i.id;


--
-- Name: quotes_with_languages _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.quotes_with_languages WITH (security_invoker='on') AS
 SELECT q.id,
    q.quote_number,
    q.variation_id,
    q.partner_id,
    q.client_name,
    q.client_email,
    q.client_phone,
    q.client_nationality,
    q.travel_date,
    q.num_adults,
    q.num_children,
    q.services_snapshot,
    q.total_cost,
    q.margin_percent,
    q.margin_amount,
    q.selling_price,
    q.price_per_person,
    q.currency,
    q.status,
    q.valid_until,
    q.converted_to_itinerary_id,
    q.converted_at,
    q.notes,
    q.created_at,
    q.updated_at,
    q.created_by,
    q.tour_leader_included,
    q.tour_leader_cost,
    q.single_supplement,
    q.is_eur_passport,
    q.season,
    COALESCE(array_agg(DISTINCT qv.language) FILTER (WHERE (qv.language IS NOT NULL)), ARRAY[]::character varying[]) AS available_languages,
    count(DISTINCT qv.language) AS version_count
   FROM (public.tour_quotes q
     LEFT JOIN public.quote_versions qv ON ((q.id = qv.quote_id)))
  GROUP BY q.id;


--
-- Name: tour_templates_with_languages _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.tour_templates_with_languages WITH (security_invoker='on') AS
 SELECT t.id,
    t.template_code,
    t.template_name,
    t.category_id,
    t.tour_type,
    t.duration_days,
    t.duration_nights,
    t.primary_destination_id,
    t.destinations_covered,
    t.cities_covered,
    t.short_description,
    t.long_description,
    t.highlights,
    t.main_attractions,
    t.best_for,
    t.physical_level,
    t.age_suitability,
    t.pickup_required,
    t.accommodation_nights,
    t.meals_included,
    t.image_url,
    t.gallery_urls,
    t.is_featured,
    t.is_active,
    t.popularity_score,
    t.created_at,
    t.updated_at,
    t.default_transportation_service,
    t.transportation_city,
    t.pricing_mode,
    t.uses_day_builder,
    t.inclusions,
    t.exclusions,
    t.itinerary,
    COALESCE(array_agg(DISTINCT tv.language) FILTER (WHERE (tv.language IS NOT NULL)), ARRAY[]::character varying[]) AS available_languages,
    count(DISTINCT tv.language) AS version_count
   FROM (public.tour_templates t
     LEFT JOIN public.tour_template_versions tv ON ((t.id = tv.template_id)))
  GROUP BY t.id;


--
-- Name: v_itineraries_summary _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_itineraries_summary WITH (security_invoker='on') AS
 SELECT i.id,
    i.itinerary_code,
    i.client_name,
    i.client_email,
    i.trip_name,
    i.start_date,
    i.end_date,
    i.total_days,
    i.num_adults,
    i.num_children,
    i.currency,
    i.total_cost,
    i.status,
    count(DISTINCT id.id) AS days_planned,
    count(DISTINCT isv.id) AS services_count,
    i.created_at,
    i.updated_at
   FROM ((public.itineraries i
     LEFT JOIN public.itinerary_days id ON ((i.id = id.itinerary_id)))
     LEFT JOIN public.itinerary_services isv ON ((id.id = isv.itinerary_day_id)))
  GROUP BY i.id;


--
-- Name: activity_log activity_log_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_log_no_update BEFORE DELETE OR UPDATE ON public.activity_log FOR EACH ROW EXECUTE FUNCTION public.activity_log_immutable();


--
-- Name: airport_staff airport_staff_view_delete_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER airport_staff_view_delete_trg INSTEAD OF DELETE ON public.airport_staff FOR EACH ROW EXECUTE FUNCTION public.airport_staff_view_delete();


--
-- Name: airport_staff airport_staff_view_insert_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER airport_staff_view_insert_trg INSTEAD OF INSERT ON public.airport_staff FOR EACH ROW EXECUTE FUNCTION public.airport_staff_view_insert();


--
-- Name: airport_staff airport_staff_view_update_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER airport_staff_view_update_trg INSTEAD OF UPDATE ON public.airport_staff FOR EACH ROW EXECUTE FUNCTION public.airport_staff_view_update();


--
-- Name: itineraries auto_link_client_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_link_client_trigger BEFORE INSERT ON public.itineraries FOR EACH ROW EXECUTE FUNCTION public.auto_link_client_to_itinerary();


--
-- Name: email_templates extract_placeholders_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extract_placeholders_trigger BEFORE INSERT OR UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.extract_template_placeholders();


--
-- Name: guides guides_view_delete_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guides_view_delete_trg INSTEAD OF DELETE ON public.guides FOR EACH ROW EXECUTE FUNCTION public.guides_view_delete();


--
-- Name: guides guides_view_insert_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guides_view_insert_trg INSTEAD OF INSERT ON public.guides FOR EACH ROW EXECUTE FUNCTION public.guides_view_insert();


--
-- Name: guides guides_view_update_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guides_view_update_trg INSTEAD OF UPDATE ON public.guides FOR EACH ROW EXECUTE FUNCTION public.guides_view_update();


--
-- Name: invoices invoices_client_revenue_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoices_client_revenue_trg AFTER INSERT OR DELETE OR UPDATE OF client_id, total_amount, amount_paid, currency, status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoices_touch_client_revenue();


--
-- Name: itineraries itineraries_client_stats_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER itineraries_client_stats_trg AFTER INSERT OR DELETE OR UPDATE OF status, client_id ON public.itineraries FOR EACH ROW EXECUTE FUNCTION public.itineraries_touch_client_stats();


--
-- Name: clients set_client_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_client_code BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.generate_client_code();


--
-- Name: accommodation_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accommodation_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: accounting_sync_log set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounting_sync_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: accounting_tokens set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounting_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.activity_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agent_memory set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.agent_memory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: airport_staff_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.airport_staff_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: attraction_aliases set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.attraction_aliases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: b2b_partner_pricing set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.b2b_partner_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: b2b_partners set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.b2b_partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: b2b_pricing_rules set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.b2b_pricing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: b2b_transport_packages set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.b2b_transport_packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: b2c_quotes set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.b2c_quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_passengers set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.booking_passengers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_supplier_status set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.booking_supplier_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bookings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_documents set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_followups set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_followups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_notes set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_preferences set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: commissions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: communication_threads set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.communication_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: concierge_briefs set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.concierge_briefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: content_categories set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.content_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: content_library set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.content_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: content_variations set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.content_variations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversation_notes set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.conversation_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: copilot_settings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.copilot_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cruise_contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cruise_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: departments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: departure_bookings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.departure_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_client_links set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_client_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_conversations set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_signatures set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_signatures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_sync_state set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: entrance_fee_versions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.entrance_fee_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: entrance_fees set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.entrance_fees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: expenses set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: flight_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.flight_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gmail_tokens set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.gmail_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: guide_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.guide_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hotel_contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hotel_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hotel_staff_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hotel_staff_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: insurance_plans set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.insurance_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: integrations set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: invoices set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: itineraries set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.itineraries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: itinerary_day_versions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.itinerary_day_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: itinerary_resources set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.itinerary_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: itinerary_service_versions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.itinerary_service_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: itinerary_versions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.itinerary_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meal_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.meal_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: message_templates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: nile_cruises set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.nile_cruises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notifications set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: operator_capacity set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.operator_capacity FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organizations set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pricing_seasons set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pricing_seasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: prompt_templates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.prompt_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: quote_versions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.quote_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: reminder_settings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.reminder_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: restaurant_contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.restaurant_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_agents set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sales_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: service_fees set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_fees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sleeping_train_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sleeping_train_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: supplier_documents set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: supplier_invoices set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tasks set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_members set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tipping_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tipping_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_categories set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_day_activities set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_day_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_departures set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_departures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_quotes set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_template_defaults set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_template_defaults FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_template_versions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_template_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_templates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_variation_services set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_variation_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_variation_versions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_variation_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tour_variations set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tour_variations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tours set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: train_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.train_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transportation_contacts set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transportation_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transportation_rates set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transportation_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_preferences set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_settings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: variation_pricing set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.variation_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: variation_services set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.variation_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vehicles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_conversations set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: writing_rules set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.writing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: supplier_documents supplier_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supplier_documents_updated_at BEFORE UPDATE ON public.supplier_documents FOR EACH ROW EXECUTE FUNCTION public.update_supplier_documents_timestamp();


--
-- Name: message_templates templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_template_timestamp();


--
-- Name: accommodation_rates trg_audit_accommodation_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_accommodation_rates AFTER INSERT OR DELETE OR UPDATE ON public.accommodation_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: activity_rates trg_audit_activity_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_activity_rates AFTER INSERT OR DELETE OR UPDATE ON public.activity_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: airport_staff_rates trg_audit_airport_staff_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_airport_staff_rates AFTER INSERT OR DELETE OR UPDATE ON public.airport_staff_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: entrance_fees trg_audit_entrance_fees; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_entrance_fees AFTER INSERT OR DELETE OR UPDATE ON public.entrance_fees FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: flight_rates trg_audit_flight_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_flight_rates AFTER INSERT OR DELETE OR UPDATE ON public.flight_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: guide_rates trg_audit_guide_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_guide_rates AFTER INSERT OR DELETE OR UPDATE ON public.guide_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: hotel_staff_rates trg_audit_hotel_staff_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_hotel_staff_rates AFTER INSERT OR DELETE OR UPDATE ON public.hotel_staff_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: meal_rates trg_audit_meal_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_meal_rates AFTER INSERT OR DELETE OR UPDATE ON public.meal_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: nile_cruises trg_audit_nile_cruises; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_nile_cruises AFTER INSERT OR DELETE OR UPDATE ON public.nile_cruises FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: sleeping_train_rates trg_audit_sleeping_train_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_sleeping_train_rates AFTER INSERT OR DELETE OR UPDATE ON public.sleeping_train_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: tipping_rates trg_audit_tipping_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_tipping_rates AFTER INSERT OR DELETE OR UPDATE ON public.tipping_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: train_rates trg_audit_train_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_train_rates AFTER INSERT OR DELETE OR UPDATE ON public.train_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: transportation_rates trg_audit_transportation_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_transportation_rates AFTER INSERT OR DELETE OR UPDATE ON public.transportation_rates FOR EACH ROW EXECUTE FUNCTION public.fn_rate_audit_trigger();


--
-- Name: itinerary_services trg_recalc_on_service_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recalc_on_service_delete AFTER DELETE ON public.itinerary_services FOR EACH ROW EXECUTE FUNCTION public.recalculate_itinerary_totals();


--
-- Name: itinerary_services trg_recalc_on_service_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recalc_on_service_insert AFTER INSERT ON public.itinerary_services FOR EACH ROW EXECUTE FUNCTION public.recalculate_itinerary_totals();


--
-- Name: itinerary_services trg_recalc_on_service_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recalc_on_service_update AFTER UPDATE ON public.itinerary_services FOR EACH ROW EXECUTE FUNCTION public.recalculate_itinerary_totals();


--
-- Name: email_conversations trigger_auto_link_email_client; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_link_email_client BEFORE INSERT OR UPDATE ON public.email_conversations FOR EACH ROW EXECUTE FUNCTION public.auto_link_email_to_client();


--
-- Name: tour_quotes trigger_generate_quote_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_quote_number BEFORE INSERT ON public.tour_quotes FOR EACH ROW WHEN (((new.quote_number IS NULL) OR ((new.quote_number)::text = ''::text))) EXECUTE FUNCTION public.generate_quote_number();


--
-- Name: itineraries trigger_update_client_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_client_status AFTER INSERT OR UPDATE OF status, client_id ON public.itineraries FOR EACH ROW EXECUTE FUNCTION public.update_client_status_on_booking();


--
-- Name: whatsapp_messages trigger_update_conversation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_conversation AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();


--
-- Name: email_messages trigger_update_email_conversation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_email_conversation AFTER INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.update_email_conversation_on_message();


--
-- Name: invoice_payments trigger_update_invoice_on_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_invoice_on_payment AFTER INSERT OR DELETE OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.update_invoice_on_payment();


--
-- Name: whatsapp_messages trigger_update_whatsapp_conversation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_whatsapp_conversation AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_conversation_on_message();


--
-- Name: commissions update_commissions_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_commissions_timestamp BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.update_commission_timestamp();


--
-- Name: communication_history update_last_contact; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_last_contact AFTER INSERT ON public.communication_history FOR EACH ROW EXECUTE FUNCTION public.update_client_last_contact();


--
-- Name: suppliers update_suppliers_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_suppliers_timestamp BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_supplier_timestamp();


--
-- Name: accommodation_rates accommodation_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accommodation_rates
    ADD CONSTRAINT accommodation_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: accounting_sync_log accounting_sync_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_sync_log
    ADD CONSTRAINT accounting_sync_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: accounting_tokens accounting_tokens_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_tokens
    ADD CONSTRAINT accounting_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: accounting_tokens accounting_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_tokens
    ADD CONSTRAINT accounting_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: activity_rates activity_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_rates
    ADD CONSTRAINT activity_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: agent_memory agent_memory_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE SET NULL;


--
-- Name: agent_runs agent_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_runs agent_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_team_member_mapping agent_team_member_mapping_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_team_member_mapping
    ADD CONSTRAINT agent_team_member_mapping_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: airport_staff_rates airport_staff_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airport_staff_rates
    ADD CONSTRAINT airport_staff_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: assignment_rules assignment_rules_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_rules
    ADD CONSTRAINT assignment_rules_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.sales_agents(id) ON DELETE CASCADE;


--
-- Name: assistant_rates assistant_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_rates
    ADD CONSTRAINT assistant_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: attraction_aliases attraction_aliases_destination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attraction_aliases
    ADD CONSTRAINT attraction_aliases_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.destinations(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;


--
-- Name: b2b_partner_pricing b2b_partner_pricing_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_partner_pricing
    ADD CONSTRAINT b2b_partner_pricing_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.b2b_partners(id) ON DELETE CASCADE;


--
-- Name: b2b_partner_pricing b2b_partner_pricing_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_partner_pricing
    ADD CONSTRAINT b2b_partner_pricing_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id) ON DELETE CASCADE;


--
-- Name: b2b_partners b2b_partners_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_partners
    ADD CONSTRAINT b2b_partners_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: b2b_pricing_rules b2b_pricing_rules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_pricing_rules
    ADD CONSTRAINT b2b_pricing_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: b2b_transport_packages b2b_transport_packages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_transport_packages
    ADD CONSTRAINT b2b_transport_packages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: b2c_quotes b2c_quotes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2c_quotes
    ADD CONSTRAINT b2c_quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: b2c_quotes b2c_quotes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2c_quotes
    ADD CONSTRAINT b2c_quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: b2c_quotes b2c_quotes_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2c_quotes
    ADD CONSTRAINT b2c_quotes_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: b2c_quotes b2c_quotes_last_modified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2c_quotes
    ADD CONSTRAINT b2c_quotes_last_modified_by_fkey FOREIGN KEY (last_modified_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: b2c_quotes b2c_quotes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2c_quotes
    ADD CONSTRAINT b2c_quotes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: booking_change_requests booking_change_requests_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_change_requests
    ADD CONSTRAINT booking_change_requests_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_change_requests booking_change_requests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_change_requests
    ADD CONSTRAINT booking_change_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_change_requests booking_change_requests_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_change_requests
    ADD CONSTRAINT booking_change_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: booking_extras booking_extras_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_extras booking_extras_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: booking_extras booking_extras_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: booking_extras booking_extras_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: booking_extras booking_extras_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_extras booking_extras_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_passenger_id_fkey FOREIGN KEY (passenger_id) REFERENCES public.booking_passengers(id) ON DELETE CASCADE;


--
-- Name: booking_extras booking_extras_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_extras
    ADD CONSTRAINT booking_extras_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: booking_passenger_documents booking_passenger_documents_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passenger_documents
    ADD CONSTRAINT booking_passenger_documents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_passenger_documents booking_passenger_documents_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passenger_documents
    ADD CONSTRAINT booking_passenger_documents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_passenger_documents booking_passenger_documents_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passenger_documents
    ADD CONSTRAINT booking_passenger_documents_passenger_id_fkey FOREIGN KEY (passenger_id) REFERENCES public.booking_passengers(id) ON DELETE CASCADE;


--
-- Name: booking_passengers booking_passengers_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passengers
    ADD CONSTRAINT booking_passengers_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_passengers booking_passengers_insurance_premium_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passengers
    ADD CONSTRAINT booking_passengers_insurance_premium_id_fkey FOREIGN KEY (insurance_premium_id) REFERENCES public.insurance_premiums(id) ON DELETE SET NULL;


--
-- Name: booking_passengers booking_passengers_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passengers
    ADD CONSTRAINT booking_passengers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_passengers booking_passengers_roommate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_passengers
    ADD CONSTRAINT booking_passengers_roommate_id_fkey FOREIGN KEY (roommate_id) REFERENCES public.booking_passengers(id) ON DELETE SET NULL;


--
-- Name: booking_payments booking_payments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_portal_links booking_portal_links_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_portal_links
    ADD CONSTRAINT booking_portal_links_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_portal_links booking_portal_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_portal_links
    ADD CONSTRAINT booking_portal_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: booking_portal_links booking_portal_links_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_portal_links
    ADD CONSTRAINT booking_portal_links_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: booking_portal_links booking_portal_links_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_portal_links
    ADD CONSTRAINT booking_portal_links_passenger_id_fkey FOREIGN KEY (passenger_id) REFERENCES public.booking_passengers(id) ON DELETE CASCADE;


--
-- Name: booking_supplier_status booking_supplier_status_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_supplier_status
    ADD CONSTRAINT booking_supplier_status_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_supplier_status booking_supplier_status_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_supplier_status
    ADD CONSTRAINT booking_supplier_status_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: bookings bookings_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.b2b_partners(id) ON DELETE SET NULL;


--
-- Name: client_contacts client_contacts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_contacts
    ADD CONSTRAINT client_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_documents client_documents_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_documents client_documents_related_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_related_itinerary_id_fkey FOREIGN KEY (related_itinerary_id) REFERENCES public.itineraries(id);


--
-- Name: client_followups client_followups_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_followups
    ADD CONSTRAINT client_followups_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_followups client_followups_related_communication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_followups
    ADD CONSTRAINT client_followups_related_communication_id_fkey FOREIGN KEY (related_communication_id) REFERENCES public.communication_history(id);


--
-- Name: client_followups client_followups_related_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_followups
    ADD CONSTRAINT client_followups_related_itinerary_id_fkey FOREIGN KEY (related_itinerary_id) REFERENCES public.itineraries(id);


--
-- Name: client_notes client_notes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_notes
    ADD CONSTRAINT client_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_preferences client_preferences_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_preferences
    ADD CONSTRAINT client_preferences_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: clients clients_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: clients clients_referred_by_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_referred_by_client_id_fkey FOREIGN KEY (referred_by_client_id) REFERENCES public.clients(id);


--
-- Name: commissions commissions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE SET NULL;


--
-- Name: commissions commissions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: commissions commissions_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: communication_drafts communication_drafts_inbox_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_drafts
    ADD CONSTRAINT communication_drafts_inbox_message_id_fkey FOREIGN KEY (inbox_message_id) REFERENCES public.communication_inbox(id) ON DELETE CASCADE;


--
-- Name: communication_drafts communication_drafts_parent_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_drafts
    ADD CONSTRAINT communication_drafts_parent_draft_id_fkey FOREIGN KEY (parent_draft_id) REFERENCES public.communication_drafts(id) ON DELETE SET NULL;


--
-- Name: communication_drafts communication_drafts_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_drafts
    ADD CONSTRAINT communication_drafts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: communication_drafts communication_drafts_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_drafts
    ADD CONSTRAINT communication_drafts_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.communication_threads(id) ON DELETE CASCADE;


--
-- Name: communication_history communication_history_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_history
    ADD CONSTRAINT communication_history_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: communication_history communication_history_related_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_history
    ADD CONSTRAINT communication_history_related_itinerary_id_fkey FOREIGN KEY (related_itinerary_id) REFERENCES public.itineraries(id);


--
-- Name: communication_inbox communication_inbox_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_inbox
    ADD CONSTRAINT communication_inbox_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.communication_threads(id) ON DELETE CASCADE;


--
-- Name: communication_threads communication_threads_brief_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_threads
    ADD CONSTRAINT communication_threads_brief_id_fkey FOREIGN KEY (brief_id) REFERENCES public.concierge_briefs(id) ON DELETE SET NULL;


--
-- Name: communication_threads communication_threads_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_threads
    ADD CONSTRAINT communication_threads_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: communication_threads communication_threads_email_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_threads
    ADD CONSTRAINT communication_threads_email_conversation_id_fkey FOREIGN KEY (email_conversation_id) REFERENCES public.email_conversations(id) ON DELETE SET NULL;


--
-- Name: communication_threads communication_threads_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_threads
    ADD CONSTRAINT communication_threads_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: communication_threads communication_threads_whatsapp_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_threads
    ADD CONSTRAINT communication_threads_whatsapp_conversation_id_fkey FOREIGN KEY (whatsapp_conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL;


--
-- Name: concierge_brief_revisions concierge_brief_revisions_brief_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_brief_revisions
    ADD CONSTRAINT concierge_brief_revisions_brief_id_fkey FOREIGN KEY (brief_id) REFERENCES public.concierge_briefs(id) ON DELETE CASCADE;


--
-- Name: concierge_briefs concierge_briefs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_briefs
    ADD CONSTRAINT concierge_briefs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: concierge_briefs concierge_briefs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_briefs
    ADD CONSTRAINT concierge_briefs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: content_library content_library_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.content_categories(id) ON DELETE CASCADE;


--
-- Name: content_library content_library_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id);


--
-- Name: content_library content_library_destination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.destinations(id);


--
-- Name: content_library content_library_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id);


--
-- Name: content_usage_log content_usage_log_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_usage_log
    ADD CONSTRAINT content_usage_log_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.content_library(id) ON DELETE SET NULL;


--
-- Name: content_usage_log content_usage_log_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_usage_log
    ADD CONSTRAINT content_usage_log_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.content_variations(id) ON DELETE SET NULL;


--
-- Name: content_variations content_variations_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variations
    ADD CONSTRAINT content_variations_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.content_library(id) ON DELETE CASCADE;


--
-- Name: content_variations content_variations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variations
    ADD CONSTRAINT content_variations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id);


--
-- Name: content_variations content_variations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variations
    ADD CONSTRAINT content_variations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id);


--
-- Name: conversation_activity conversation_activity_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_activity
    ADD CONSTRAINT conversation_activity_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.sales_agents(id) ON DELETE SET NULL;


--
-- Name: conversation_activity conversation_activity_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_activity
    ADD CONSTRAINT conversation_activity_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_activity conversation_activity_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_activity
    ADD CONSTRAINT conversation_activity_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: conversation_notes conversation_notes_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.sales_agents(id) ON DELETE SET NULL;


--
-- Name: conversation_notes conversation_notes_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_notes conversation_notes_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_notes
    ADD CONSTRAINT conversation_notes_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: copilot_settings copilot_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copilot_settings
    ADD CONSTRAINT copilot_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: departure_bookings departure_bookings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departure_bookings
    ADD CONSTRAINT departure_bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: departure_bookings departure_bookings_departure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departure_bookings
    ADD CONSTRAINT departure_bookings_departure_id_fkey FOREIGN KEY (departure_id) REFERENCES public.tour_departures(id) ON DELETE CASCADE;


--
-- Name: departure_bookings departure_bookings_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departure_bookings
    ADD CONSTRAINT departure_bookings_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE SET NULL;


--
-- Name: departure_bookings departure_bookings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departure_bookings
    ADD CONSTRAINT departure_bookings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: destination_cities destination_cities_destination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destination_cities
    ADD CONSTRAINT destination_cities_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.destinations(id) ON DELETE CASCADE;


--
-- Name: email_activity_log email_activity_log_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_activity_log
    ADD CONSTRAINT email_activity_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: email_activity_log email_activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_activity_log
    ADD CONSTRAINT email_activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: email_cache_metadata email_cache_metadata_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_cache_metadata
    ADD CONSTRAINT email_cache_metadata_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: email_client_links email_client_links_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_client_links
    ADD CONSTRAINT email_client_links_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: email_client_links email_client_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_client_links
    ADD CONSTRAINT email_client_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: email_conversations email_conversations_assigned_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_assigned_team_member_id_fkey FOREIGN KEY (assigned_team_member_id) REFERENCES public.team_members(id);


--
-- Name: email_conversations email_conversations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: email_conversations email_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_conversations
    ADD CONSTRAINT email_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: email_messages email_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.email_conversations(id) ON DELETE CASCADE;


--
-- Name: email_signatures email_signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_signatures
    ADD CONSTRAINT email_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_sync_state email_sync_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sync_state
    ADD CONSTRAINT email_sync_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: email_templates email_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entrance_fee_versions entrance_fee_versions_entrance_fee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrance_fee_versions
    ADD CONSTRAINT entrance_fee_versions_entrance_fee_id_fkey FOREIGN KEY (entrance_fee_id) REFERENCES public.entrance_fees(id) ON DELETE CASCADE;


--
-- Name: entrance_fees entrance_fees_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrance_fees
    ADD CONSTRAINT entrance_fees_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: expenses expenses_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: expenses expenses_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: flight_rates flight_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_rates
    ADD CONSTRAINT flight_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: gmail_tokens gmail_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_tokens
    ADD CONSTRAINT gmail_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: guide_rates guide_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_rates
    ADD CONSTRAINT guide_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: hotel_staff_rates hotel_staff_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_staff_rates
    ADD CONSTRAINT hotel_staff_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: insurance_plans insurance_plans_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_plans
    ADD CONSTRAINT insurance_plans_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: insurance_premiums insurance_premiums_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_premiums
    ADD CONSTRAINT insurance_premiums_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: insurance_premiums insurance_premiums_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_premiums
    ADD CONSTRAINT insurance_premiums_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.insurance_plans(id) ON DELETE CASCADE;


--
-- Name: integration_events integration_events_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: integration_events integration_events_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: integrations integrations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invoice_payments invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_reminders invoice_reminders_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_reminders
    ADD CONSTRAINT invoice_reminders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: invoices invoices_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id);


--
-- Name: invoices invoices_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: invoices invoices_parent_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_parent_invoice_id_fkey FOREIGN KEY (parent_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_assigned_airport_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_assigned_airport_staff_id_fkey FOREIGN KEY (assigned_airport_staff_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_assigned_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_assigned_guide_id_fkey FOREIGN KEY (assigned_guide_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_assigned_hotel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_assigned_hotel_id_fkey FOREIGN KEY (assigned_hotel_id) REFERENCES public.hotel_contacts(id);


--
-- Name: itineraries itineraries_assigned_hotel_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_assigned_hotel_staff_id_fkey FOREIGN KEY (assigned_hotel_staff_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_assigned_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_assigned_restaurant_id_fkey FOREIGN KEY (assigned_restaurant_id) REFERENCES public.restaurant_contacts(id);


--
-- Name: itineraries itineraries_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.team_members(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_assigned_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_assigned_vehicle_id_fkey FOREIGN KEY (assigned_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_destination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.destinations(id);


--
-- Name: itineraries itineraries_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: itineraries itineraries_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.b2b_partners(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tour_templates(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.communication_threads(id) ON DELETE SET NULL;


--
-- Name: itineraries itineraries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: itinerary_day_versions itinerary_day_versions_itinerary_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_day_versions
    ADD CONSTRAINT itinerary_day_versions_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON DELETE CASCADE;


--
-- Name: itinerary_days itinerary_days_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_days
    ADD CONSTRAINT itinerary_days_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: itinerary_resources itinerary_resources_itinerary_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_resources
    ADD CONSTRAINT itinerary_resources_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON DELETE CASCADE;


--
-- Name: itinerary_resources itinerary_resources_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_resources
    ADD CONSTRAINT itinerary_resources_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: itinerary_service_versions itinerary_service_versions_itinerary_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_service_versions
    ADD CONSTRAINT itinerary_service_versions_itinerary_service_id_fkey FOREIGN KEY (itinerary_service_id) REFERENCES public.itinerary_services(id) ON DELETE CASCADE;


--
-- Name: itinerary_services itinerary_services_itinerary_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_services
    ADD CONSTRAINT itinerary_services_itinerary_day_id_fkey FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON DELETE CASCADE;


--
-- Name: itinerary_services itinerary_services_sold_by_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_services
    ADD CONSTRAINT itinerary_services_sold_by_supplier_id_fkey FOREIGN KEY (sold_by_supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: itinerary_services itinerary_services_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_services
    ADD CONSTRAINT itinerary_services_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: itinerary_shares itinerary_shares_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_shares
    ADD CONSTRAINT itinerary_shares_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: itinerary_shares itinerary_shares_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_shares
    ADD CONSTRAINT itinerary_shares_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: itinerary_shares itinerary_shares_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_shares
    ADD CONSTRAINT itinerary_shares_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: itinerary_versions itinerary_versions_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itinerary_versions
    ADD CONSTRAINT itinerary_versions_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: meal_rates meal_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_rates
    ADD CONSTRAINT meal_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: message_templates message_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id);


--
-- Name: nile_cruises nile_cruises_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nile_cruises
    ADD CONSTRAINT nile_cruises_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: notifications notifications_related_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_itinerary_id_fkey FOREIGN KEY (related_itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_related_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_task_id_fkey FOREIGN KEY (related_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: operator_capacity operator_capacity_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_capacity
    ADD CONSTRAINT operator_capacity_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: operator_capacity operator_capacity_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_capacity
    ADD CONSTRAINT operator_capacity_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: payments payments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: portal_message_threads portal_message_threads_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_message_threads
    ADD CONSTRAINT portal_message_threads_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: portal_message_threads portal_message_threads_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_message_threads
    ADD CONSTRAINT portal_message_threads_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: portal_message_threads portal_message_threads_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_message_threads
    ADD CONSTRAINT portal_message_threads_passenger_id_fkey FOREIGN KEY (passenger_id) REFERENCES public.booking_passengers(id) ON DELETE CASCADE;


--
-- Name: portal_messages portal_messages_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: portal_messages portal_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.portal_message_threads(id) ON DELETE CASCADE;


--
-- Name: pricing_season_dates pricing_season_dates_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_season_dates
    ADD CONSTRAINT pricing_season_dates_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pricing_season_dates pricing_season_dates_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_season_dates
    ADD CONSTRAINT pricing_season_dates_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.pricing_seasons(id) ON DELETE CASCADE;


--
-- Name: pricing_seasons pricing_seasons_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_seasons
    ADD CONSTRAINT pricing_seasons_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: prompt_templates prompt_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id);


--
-- Name: quote_revisions quote_revisions_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_revisions
    ADD CONSTRAINT quote_revisions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: quote_versions quote_versions_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_versions
    ADD CONSTRAINT quote_versions_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.tour_quotes(id) ON DELETE CASCADE;


--
-- Name: sales_agents sales_agents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_agents
    ADD CONSTRAINT sales_agents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: seasonal_rates seasonal_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasonal_rates
    ADD CONSTRAINT seasonal_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: sleeping_train_rates sleeping_train_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleeping_train_rates
    ADD CONSTRAINT sleeping_train_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: supplier_documents supplier_documents_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_documents
    ADD CONSTRAINT supplier_documents_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;


--
-- Name: supplier_documents supplier_documents_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_documents
    ADD CONSTRAINT supplier_documents_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: supplier_invoice_expenses supplier_invoice_expenses_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoice_expenses
    ADD CONSTRAINT supplier_invoice_expenses_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;


--
-- Name: supplier_invoice_expenses supplier_invoice_expenses_supplier_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoice_expenses
    ADD CONSTRAINT supplier_invoice_expenses_supplier_invoice_id_fkey FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE CASCADE;


--
-- Name: supplier_invoices supplier_invoices_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE SET NULL;


--
-- Name: supplier_invoices supplier_invoices_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: supplier_invoices supplier_invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: suppliers suppliers_parent_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_parent_supplier_id_fkey FOREIGN KEY (parent_supplier_id) REFERENCES public.suppliers(id);


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.team_members(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: team_members team_members_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: template_send_log template_send_log_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_send_log
    ADD CONSTRAINT template_send_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: template_send_log template_send_log_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_send_log
    ADD CONSTRAINT template_send_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.user_profiles(id);


--
-- Name: template_send_log template_send_log_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_send_log
    ADD CONSTRAINT template_send_log_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.message_templates(id);


--
-- Name: tour_availability tour_availability_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_availability
    ADD CONSTRAINT tour_availability_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id);


--
-- Name: tour_day_activities tour_day_activities_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_day_activities
    ADD CONSTRAINT tour_day_activities_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tour_templates(id) ON DELETE CASCADE;


--
-- Name: tour_days tour_days_accommodation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_accommodation_id_fkey FOREIGN KEY (accommodation_id) REFERENCES public.accommodation_rates(id);


--
-- Name: tour_days tour_days_dinner_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_dinner_meal_id_fkey FOREIGN KEY (dinner_meal_id) REFERENCES public.meal_rates(id);


--
-- Name: tour_days tour_days_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_rates(id);


--
-- Name: tour_days tour_days_lunch_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_lunch_meal_id_fkey FOREIGN KEY (lunch_meal_id) REFERENCES public.meal_rates(id);


--
-- Name: tour_days tour_days_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: tour_departures tour_departures_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tour_departures tour_departures_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tour_departures tour_departures_source_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_source_integration_id_fkey FOREIGN KEY (source_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: tour_departures tour_departures_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tour_templates(id) ON DELETE SET NULL;


--
-- Name: tour_departures tour_departures_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id) ON DELETE SET NULL;


--
-- Name: tour_pricing tour_pricing_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_pricing
    ADD CONSTRAINT tour_pricing_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id) ON DELETE CASCADE;


--
-- Name: tour_quotes tour_quotes_converted_to_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_converted_to_itinerary_id_fkey FOREIGN KEY (converted_to_itinerary_id) REFERENCES public.itineraries(id);


--
-- Name: tour_quotes tour_quotes_itinerary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_itinerary_id_fkey FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE SET NULL;


--
-- Name: tour_quotes tour_quotes_last_modified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_last_modified_by_fkey FOREIGN KEY (last_modified_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tour_quotes tour_quotes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tour_quotes tour_quotes_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.b2b_partners(id);


--
-- Name: tour_quotes tour_quotes_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_quotes
    ADD CONSTRAINT tour_quotes_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id);


--
-- Name: tour_reviews tour_reviews_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_reviews
    ADD CONSTRAINT tour_reviews_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tour_templates(id);


--
-- Name: tour_reviews tour_reviews_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_reviews
    ADD CONSTRAINT tour_reviews_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id);


--
-- Name: tour_template_defaults tour_template_defaults_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_template_defaults
    ADD CONSTRAINT tour_template_defaults_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tour_templates(id) ON DELETE CASCADE;


--
-- Name: tour_template_versions tour_template_versions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_template_versions
    ADD CONSTRAINT tour_template_versions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tour_templates(id) ON DELETE CASCADE;


--
-- Name: tour_templates tour_templates_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_templates
    ADD CONSTRAINT tour_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.tour_categories(id);


--
-- Name: tour_templates tour_templates_primary_destination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_templates
    ADD CONSTRAINT tour_templates_primary_destination_id_fkey FOREIGN KEY (primary_destination_id) REFERENCES public.destinations_legacy_2025(id);


--
-- Name: tour_variation_services tour_variation_services_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variation_services
    ADD CONSTRAINT tour_variation_services_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id) ON DELETE CASCADE;


--
-- Name: tour_variation_versions tour_variation_versions_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variation_versions
    ADD CONSTRAINT tour_variation_versions_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id) ON DELETE CASCADE;


--
-- Name: tour_variations tour_variations_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_variations
    ADD CONSTRAINT tour_variations_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tour_templates(id) ON DELETE CASCADE;


--
-- Name: train_rates train_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_rates
    ADD CONSTRAINT train_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: transportation_rates transportation_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportation_rates
    ADD CONSTRAINT transportation_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: user_invitations user_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;


--
-- Name: user_invitations user_invitations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: variation_daily_itinerary variation_daily_itinerary_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_daily_itinerary
    ADD CONSTRAINT variation_daily_itinerary_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id) ON DELETE CASCADE;


--
-- Name: variation_pricing variation_pricing_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_pricing
    ADD CONSTRAINT variation_pricing_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id) ON DELETE CASCADE;


--
-- Name: variation_services variation_services_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_services
    ADD CONSTRAINT variation_services_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.tour_variations(id) ON DELETE CASCADE;


--
-- Name: vehicle_rates vehicle_rates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_rates
    ADD CONSTRAINT vehicle_rates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: whatsapp_conversations whatsapp_conversations_assigned_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_assigned_team_member_id_fkey FOREIGN KEY (assigned_team_member_id) REFERENCES public.team_members(id);


--
-- Name: whatsapp_conversations whatsapp_conversations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_hidden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_hidden_by_fkey FOREIGN KEY (hidden_by) REFERENCES auth.users(id);


--
-- Name: whatsapp_messages whatsapp_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: writing_rules writing_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_rules
    ADD CONSTRAINT writing_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id);


--
-- Name: writing_rules writing_rules_destination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_rules
    ADD CONSTRAINT writing_rules_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.destinations(id);


--
-- Name: message_templates Active users can view templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can view templates" ON public.message_templates FOR SELECT USING (public.is_active_user());


--
-- Name: user_invitations Admins and managers can create invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can create invitations" ON public.user_invitations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying])::text[]))))));


--
-- Name: user_invitations Admins and managers can delete invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can delete invitations" ON public.user_invitations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying])::text[]))))));


--
-- Name: user_invitations Admins and managers can view invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can view invitations" ON public.user_invitations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying])::text[]))))));


--
-- Name: expenses Admins can delete expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete expenses" ON public.expenses FOR DELETE USING (public.is_admin());


--
-- Name: invoices Admins can delete invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE USING (public.is_admin());


--
-- Name: user_profiles Admins can delete profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete profiles" ON public.user_profiles FOR DELETE USING (public.is_admin());


--
-- Name: user_profiles Admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all profiles" ON public.user_profiles FOR UPDATE USING (public.is_admin());


--
-- Name: audit_logs Admins can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.is_admin());


--
-- Name: whatsapp_conversations Agents can access whatsapp conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can access whatsapp conversations" ON public.whatsapp_conversations USING (public.is_agent_or_above());


--
-- Name: whatsapp_messages Agents can access whatsapp messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can access whatsapp messages" ON public.whatsapp_messages USING (public.is_agent_or_above());


--
-- Name: clients Agents can create clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can create clients" ON public.clients FOR INSERT WITH CHECK (public.is_agent_or_above());


--
-- Name: expenses Agents can create expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can create expenses" ON public.expenses FOR INSERT WITH CHECK (public.is_agent_or_above());


--
-- Name: itineraries Agents can create itineraries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can create itineraries" ON public.itineraries FOR INSERT WITH CHECK ((public.is_agent_or_above() OR (auth.uid() IS NOT NULL)));


--
-- Name: tasks Agents can create tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can create tasks" ON public.tasks FOR INSERT WITH CHECK (public.is_agent_or_above());


--
-- Name: template_send_log Agents can insert send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert send log" ON public.template_send_log FOR INSERT WITH CHECK (public.is_agent_or_above());


--
-- Name: clients Agents can update clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can update clients" ON public.clients FOR UPDATE USING (public.is_agent_or_above());


--
-- Name: itineraries Agents can update itineraries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can update itineraries" ON public.itineraries FOR UPDATE USING ((public.is_agent_or_above() OR (auth.uid() IS NOT NULL)));


--
-- Name: clients Agents can view clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view clients" ON public.clients FOR SELECT USING (public.is_agent_or_above());


--
-- Name: itineraries Agents can view itineraries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view itineraries" ON public.itineraries FOR SELECT USING ((public.is_agent_or_above() OR (auth.uid() IS NOT NULL)));


--
-- Name: template_send_log Agents can view send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view send log" ON public.template_send_log FOR SELECT USING (public.is_agent_or_above());


--
-- Name: sleeping_train_rates Allow all for authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated" ON public.sleeping_train_rates USING (true);


--
-- Name: train_rates Allow all for authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated" ON public.train_rates USING (true);


--
-- Name: booking_payments Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.booking_payments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: booking_supplier_status Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.booking_supplier_status TO authenticated USING (true) WITH CHECK (true);


--
-- Name: bookings Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.bookings TO authenticated USING (true) WITH CHECK (true);


--
-- Name: email_conversations Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.email_conversations TO authenticated USING (true) WITH CHECK (true);


--
-- Name: email_messages Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.email_messages TO authenticated USING (true) WITH CHECK (true);


--
-- Name: email_sync_state Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.email_sync_state TO authenticated USING (true) WITH CHECK (true);


--
-- Name: user_invitations Allow all for service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for service role" ON public.user_invitations USING (true) WITH CHECK (true);


--
-- Name: whatsapp_conversations Allow all for whatsapp_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for whatsapp_conversations" ON public.whatsapp_conversations USING (true);


--
-- Name: whatsapp_messages Allow all for whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for whatsapp_messages" ON public.whatsapp_messages USING (true);


--
-- Name: attraction_aliases Allow authenticated delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated delete" ON public.attraction_aliases FOR DELETE TO authenticated USING (true);


--
-- Name: tour_day_activities Allow authenticated delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated delete" ON public.tour_day_activities FOR DELETE TO authenticated USING (true);


--
-- Name: tour_template_defaults Allow authenticated delete defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated delete defaults" ON public.tour_template_defaults FOR DELETE TO authenticated USING (true);


--
-- Name: attraction_aliases Allow authenticated insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated insert" ON public.attraction_aliases FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: tour_day_activities Allow authenticated insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated insert" ON public.tour_day_activities FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: tour_template_defaults Allow authenticated insert defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated insert defaults" ON public.tour_template_defaults FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: attraction_aliases Allow authenticated read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read" ON public.attraction_aliases FOR SELECT TO authenticated USING (true);


--
-- Name: tour_day_activities Allow authenticated read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read" ON public.tour_day_activities FOR SELECT TO authenticated USING (true);


--
-- Name: entrance_fees Allow authenticated read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read access" ON public.entrance_fees FOR SELECT TO authenticated USING (true);


--
-- Name: departments Allow authenticated read access to departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read access to departments" ON public.departments FOR SELECT TO authenticated USING (true);


--
-- Name: tour_template_defaults Allow authenticated read defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read defaults" ON public.tour_template_defaults FOR SELECT TO authenticated USING (true);


--
-- Name: attraction_aliases Allow authenticated update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated update" ON public.attraction_aliases FOR UPDATE TO authenticated USING (true);


--
-- Name: tour_day_activities Allow authenticated update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated update" ON public.tour_day_activities FOR UPDATE TO authenticated USING (true);


--
-- Name: tour_template_defaults Allow authenticated update defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated update defaults" ON public.tour_template_defaults FOR UPDATE TO authenticated USING (true);


--
-- Name: transportation_contacts Allow authenticated users full access to transportation_contact; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users full access to transportation_contact" ON public.transportation_contacts TO authenticated USING (true) WITH CHECK (true);


--
-- Name: flight_rates Allow delete for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow delete for authenticated users" ON public.flight_rates FOR DELETE USING (true);


--
-- Name: notifications Allow delete notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow delete notifications" ON public.notifications FOR DELETE USING (true);


--
-- Name: team_members Allow delete team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow delete team_members" ON public.team_members FOR DELETE USING (true);


--
-- Name: flight_rates Allow insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert for authenticated users" ON public.flight_rates FOR INSERT WITH CHECK (true);


--
-- Name: notifications Allow insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: team_members Allow insert team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert team_members" ON public.team_members FOR INSERT WITH CHECK (true);


--
-- Name: flight_rates Allow read access to flight_rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read access to flight_rates" ON public.flight_rates FOR SELECT USING (true);


--
-- Name: notifications Allow read notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read notifications" ON public.notifications FOR SELECT USING (true);


--
-- Name: team_members Allow read team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read team_members" ON public.team_members FOR SELECT USING (true);


--
-- Name: attraction_aliases Allow service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role full access" ON public.attraction_aliases TO service_role USING (true) WITH CHECK (true);


--
-- Name: departments Allow service role full access to departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow service role full access to departments" ON public.departments TO service_role USING (true) WITH CHECK (true);


--
-- Name: flight_rates Allow update for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow update for authenticated users" ON public.flight_rates FOR UPDATE USING (true);


--
-- Name: notifications Allow update notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow update notifications" ON public.notifications FOR UPDATE USING (true);


--
-- Name: team_members Allow update team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow update team_members" ON public.team_members FOR UPDATE USING (true);


--
-- Name: user_invitations Anyone can accept invitation with valid token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can accept invitation with valid token" ON public.user_invitations FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: rate_audit_log Authenticated users can read audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read audit log" ON public.rate_audit_log FOR SELECT TO authenticated USING (true);


--
-- Name: concierge_brief_revisions Authenticated users can view concierge brief revisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view concierge brief revisions" ON public.concierge_brief_revisions FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: concierge_briefs Authenticated users can view concierge briefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view concierge briefs" ON public.concierge_briefs FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: communication_drafts Authenticated users can view drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view drafts" ON public.communication_drafts FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: communication_inbox Authenticated users can view inbox messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view inbox messages" ON public.communication_inbox FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: communication_threads Authenticated users can view threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view threads" ON public.communication_threads FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: cruise_contacts Enable all access for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for authenticated users" ON public.cruise_contacts USING (true);


--
-- Name: itinerary_resources Enable all access for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for authenticated users" ON public.itinerary_resources USING (true) WITH CHECK (true);


--
-- Name: transportation_contacts Enable all access for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all access for authenticated users" ON public.transportation_contacts USING (true) WITH CHECK (true);


--
-- Name: tour_variations Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.tour_variations FOR SELECT TO authenticated, anon USING (true);


--
-- Name: invoices Managers can create invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can create invoices" ON public.invoices FOR INSERT WITH CHECK (public.is_manager_or_above());


--
-- Name: clients Managers can delete clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete clients" ON public.clients FOR DELETE USING (public.is_manager_or_above());


--
-- Name: itineraries Managers can delete itineraries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete itineraries" ON public.itineraries FOR DELETE USING (public.is_manager_or_above());


--
-- Name: tasks Managers can delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete tasks" ON public.tasks FOR DELETE USING (public.is_manager_or_above());


--
-- Name: team_members Managers can delete team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete team members" ON public.team_members FOR DELETE USING (public.is_manager_or_above());


--
-- Name: email_templates Managers can delete templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete templates" ON public.email_templates FOR DELETE USING (public.is_manager_or_above());


--
-- Name: team_members Managers can insert team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can insert team members" ON public.team_members FOR INSERT WITH CHECK (public.is_manager_or_above());


--
-- Name: email_templates Managers can insert templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can insert templates" ON public.email_templates FOR INSERT WITH CHECK (public.is_manager_or_above());


--
-- Name: message_templates Managers can manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can manage templates" ON public.message_templates USING (public.is_manager_or_above());


--
-- Name: expenses Managers can update expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can update expenses" ON public.expenses FOR UPDATE USING (public.is_manager_or_above());


--
-- Name: invoices Managers can update invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can update invoices" ON public.invoices FOR UPDATE USING (public.is_manager_or_above());


--
-- Name: team_members Managers can update team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can update team members" ON public.team_members FOR UPDATE USING (public.is_manager_or_above());


--
-- Name: email_templates Managers can update templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can update templates" ON public.email_templates FOR UPDATE USING (public.is_manager_or_above());


--
-- Name: user_profiles Managers can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view all profiles" ON public.user_profiles FOR SELECT USING (public.is_manager_or_above());


--
-- Name: expenses Managers can view expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view expenses" ON public.expenses FOR SELECT USING (public.is_manager_or_above());


--
-- Name: invoices Managers can view invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view invoices" ON public.invoices FOR SELECT USING (public.is_manager_or_above());


--
-- Name: rate_audit_log Only system can insert audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only system can insert audit log" ON public.rate_audit_log FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: notifications System can create notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: audit_logs System can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: notifications System can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: tasks Task update by role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Task update by role" ON public.tasks FOR UPDATE USING ((public.is_manager_or_above() OR ((assigned_to)::text = (auth.uid())::text)));


--
-- Name: tasks Task visibility by role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Task visibility by role" ON public.tasks FOR SELECT USING ((public.is_manager_or_above() OR (public.is_agent_or_above() AND ((assigned_to)::text = (auth.uid())::text))));


--
-- Name: gmail_tokens Users access own gmail tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users access own gmail tokens" ON public.gmail_tokens USING ((user_id = auth.uid()));


--
-- Name: email_client_links Users can delete own email links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own email links" ON public.email_client_links FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING (true);


--
-- Name: user_preferences Users can delete own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own preferences" ON public.user_preferences FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: copilot_settings Users can insert own copilot settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own copilot settings" ON public.copilot_settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_activity_log Users can insert own email activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own email activity" ON public.email_activity_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_client_links Users can insert own email links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own email links" ON public.email_client_links FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_preferences Users can insert own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_settings Users can insert own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (true);


--
-- Name: email_cache_metadata Users can manage own cache metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own cache metadata" ON public.email_cache_metadata USING ((auth.uid() = user_id));


--
-- Name: gmail_tokens Users can manage their own gmail tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own gmail tokens" ON public.gmail_tokens USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_signatures Users can manage their own signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own signatures" ON public.email_signatures USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_templates Users can manage their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own templates" ON public.email_templates USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: copilot_settings Users can update own copilot settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own copilot settings" ON public.copilot_settings FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_client_links Users can update own email links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own email links" ON public.email_client_links FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (true);


--
-- Name: user_preferences Users can update own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: user_settings Users can update own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (true);


--
-- Name: user_preferences Users can upsert own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can upsert own preferences" ON public.user_preferences USING ((auth.uid() = user_id));


--
-- Name: copilot_settings Users can view own copilot settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own copilot settings" ON public.copilot_settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: email_activity_log Users can view own email activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own email activity" ON public.email_activity_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: email_client_links Users can view own email links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own email links" ON public.email_client_links FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (true);


--
-- Name: user_preferences Users can view own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: user_settings Users can view own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (true);


--
-- Name: team_members Users can view team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view team members" ON public.team_members FOR SELECT USING (public.is_active_user());


--
-- Name: email_templates Users can view templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view templates" ON public.email_templates FOR SELECT USING (public.is_active_user());


--
-- Name: notifications Users see own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT USING (public.is_active_user());


--
-- Name: notifications Users update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (public.is_active_user());


--
-- Name: accommodation_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accommodation_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: accommodation_rates accommodation_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accommodation_rates_authenticated_all ON public.accommodation_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: accounting_sync_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_sync_log accounting_sync_log_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_sync_log_org_delete ON public.accounting_sync_log FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: accounting_sync_log accounting_sync_log_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_sync_log_org_insert ON public.accounting_sync_log FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: accounting_sync_log accounting_sync_log_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_sync_log_org_select ON public.accounting_sync_log FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: accounting_sync_log accounting_sync_log_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_sync_log_org_update ON public.accounting_sync_log FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: accounting_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_tokens accounting_tokens_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_tokens_org_delete ON public.accounting_tokens FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: accounting_tokens accounting_tokens_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_tokens_org_insert ON public.accounting_tokens FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: accounting_tokens accounting_tokens_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_tokens_org_select ON public.accounting_tokens FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: accounting_tokens accounting_tokens_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounting_tokens_org_update ON public.accounting_tokens FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log activity_log_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_log_authenticated ON public.activity_log TO authenticated USING (true) WITH CHECK (true);


--
-- Name: activity_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_rates activity_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_rates_authenticated_all ON public.activity_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: agent_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_memory agent_memory_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_memory_org_all ON public.agent_memory USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs agent_runs_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_runs_org_all ON public.agent_runs USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: agent_team_member_mapping; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_team_member_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_team_member_mapping agent_team_member_mapping_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_team_member_mapping_authenticated ON public.agent_team_member_mapping TO authenticated USING (true) WITH CHECK (true);


--
-- Name: airport_staff_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.airport_staff_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: airport_staff_rates airport_staff_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY airport_staff_rates_authenticated_all ON public.airport_staff_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: assignment_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: assignment_rules assignment_rules_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignment_rules_authenticated ON public.assignment_rules TO authenticated USING (true) WITH CHECK (true);


--
-- Name: assistant_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_rates assistant_rates_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assistant_rates_authenticated ON public.assistant_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: attraction_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attraction_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_partner_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.b2b_partner_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_partner_pricing b2b_partner_pricing_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY b2b_partner_pricing_authenticated ON public.b2b_partner_pricing TO authenticated USING (true) WITH CHECK (true);


--
-- Name: b2b_partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.b2b_partners ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_partners b2b_partners_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY b2b_partners_authenticated ON public.b2b_partners TO authenticated USING (true) WITH CHECK (true);


--
-- Name: b2b_pricing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.b2b_pricing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_pricing_rules b2b_pricing_rules_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY b2b_pricing_rules_authenticated ON public.b2b_pricing_rules TO authenticated USING (true) WITH CHECK (true);


--
-- Name: b2b_transport_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.b2b_transport_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_transport_packages b2b_transport_packages_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY b2b_transport_packages_authenticated ON public.b2b_transport_packages TO authenticated USING (true) WITH CHECK (true);


--
-- Name: b2c_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.b2c_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: b2c_quotes b2c_quotes_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY b2c_quotes_authenticated ON public.b2c_quotes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: booking_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_change_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_extras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_extras ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_passenger_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_passenger_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_passenger_documents booking_passenger_documents_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_passenger_documents_org_all ON public.booking_passenger_documents TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: booking_passengers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_passengers ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_passengers booking_passengers_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_passengers_org_all ON public.booking_passengers USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: booking_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_portal_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_portal_links ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_portal_links booking_portal_links_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_portal_links_org ON public.booking_portal_links TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: booking_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_rules booking_rules_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_rules_authenticated ON public.booking_rules TO authenticated USING (true) WITH CHECK (true);


--
-- Name: booking_supplier_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_supplier_status ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_org_delete ON public.bookings FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: bookings bookings_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_org_insert ON public.bookings FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: bookings bookings_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_org_select ON public.bookings FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: bookings bookings_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_org_update ON public.bookings FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: client_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: client_contacts client_contacts_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_contacts_authenticated ON public.client_contacts TO authenticated USING (true) WITH CHECK (true);


--
-- Name: client_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: client_documents client_documents_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_documents_authenticated ON public.client_documents TO authenticated USING (true) WITH CHECK (true);


--
-- Name: client_followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_followups ENABLE ROW LEVEL SECURITY;

--
-- Name: client_followups client_followups_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_followups_authenticated_all ON public.client_followups TO authenticated USING (true) WITH CHECK (true);


--
-- Name: client_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: client_notes client_notes_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_notes_authenticated_all ON public.client_notes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: client_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: client_preferences client_preferences_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_preferences_authenticated ON public.client_preferences TO authenticated USING (true) WITH CHECK (true);


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions commissions_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commissions_org_delete ON public.commissions FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: commissions commissions_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commissions_org_insert ON public.commissions FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: commissions commissions_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commissions_org_select ON public.commissions FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: commissions commissions_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commissions_org_update ON public.commissions FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: communication_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communication_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: communication_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communication_history ENABLE ROW LEVEL SECURITY;

--
-- Name: communication_history communication_history_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY communication_history_authenticated_all ON public.communication_history TO authenticated USING (true) WITH CHECK (true);


--
-- Name: communication_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communication_inbox ENABLE ROW LEVEL SECURITY;

--
-- Name: communication_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: concierge_brief_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concierge_brief_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: concierge_briefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concierge_briefs ENABLE ROW LEVEL SECURITY;

--
-- Name: content_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: content_categories content_categories_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY content_categories_authenticated ON public.content_categories TO authenticated USING (true) WITH CHECK (true);


--
-- Name: content_library; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_library ENABLE ROW LEVEL SECURITY;

--
-- Name: content_library content_library_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY content_library_authenticated ON public.content_library TO authenticated USING (true) WITH CHECK (true);


--
-- Name: content_usage_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_usage_log ENABLE ROW LEVEL SECURITY;

--
-- Name: content_usage_log content_usage_log_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY content_usage_log_authenticated ON public.content_usage_log TO authenticated USING (true) WITH CHECK (true);


--
-- Name: content_variations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_variations ENABLE ROW LEVEL SECURITY;

--
-- Name: content_variations content_variations_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY content_variations_authenticated ON public.content_variations TO authenticated USING (true) WITH CHECK (true);


--
-- Name: conversation_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_activity conversation_activity_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_activity_authenticated ON public.conversation_activity TO authenticated USING (true) WITH CHECK (true);


--
-- Name: conversation_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_notes conversation_notes_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_notes_authenticated ON public.conversation_notes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: copilot_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.copilot_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: cron_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cron_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: cron_watermarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cron_watermarks ENABLE ROW LEVEL SECURITY;

--
-- Name: cruise_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cruise_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departure_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departure_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: departure_bookings departure_bookings_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departure_bookings_org_all ON public.departure_bookings USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: destination_cities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.destination_cities ENABLE ROW LEVEL SECURITY;

--
-- Name: destination_cities destination_cities_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY destination_cities_read ON public.destination_cities FOR SELECT TO authenticated USING (true);


--
-- Name: destination_cities destination_cities_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY destination_cities_service ON public.destination_cities TO service_role USING (true) WITH CHECK (true);


--
-- Name: destinations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;

--
-- Name: destinations_legacy_2025 destinations_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY destinations_authenticated ON public.destinations_legacy_2025 TO authenticated USING (true) WITH CHECK (true);


--
-- Name: destinations_legacy_2025; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.destinations_legacy_2025 ENABLE ROW LEVEL SECURITY;

--
-- Name: destinations destinations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY destinations_read ON public.destinations FOR SELECT TO authenticated USING (true);


--
-- Name: destinations destinations_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY destinations_service ON public.destinations TO service_role USING (true) WITH CHECK (true);


--
-- Name: discount_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: discount_rules discount_rules_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discount_rules_authenticated ON public.discount_rules TO authenticated USING (true) WITH CHECK (true);


--
-- Name: email_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: email_cache_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_cache_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: email_client_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_client_links ENABLE ROW LEVEL SECURITY;

--
-- Name: email_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: email_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: email_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: email_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: entrance_fee_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entrance_fee_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: entrance_fee_versions entrance_fee_versions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entrance_fee_versions_authenticated ON public.entrance_fee_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: entrance_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entrance_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: entrance_fees entrance_fees_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entrance_fees_authenticated_all ON public.entrance_fees TO authenticated USING (true) WITH CHECK (true);


--
-- Name: exchange_rate_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rate_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rate_snapshots exchange_rate_snapshots_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rate_snapshots_read ON public.exchange_rate_snapshots FOR SELECT TO authenticated USING (true);


--
-- Name: exchange_rate_snapshots exchange_rate_snapshots_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rate_snapshots_service_role ON public.exchange_rate_snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates exchange_rates_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_read ON public.exchange_rates FOR SELECT TO authenticated USING (true);


--
-- Name: exchange_rates exchange_rates_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_service_role ON public.exchange_rates TO service_role USING (true) WITH CHECK (true);


--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_org_delete ON public.expenses FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: expenses expenses_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_org_insert ON public.expenses FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: expenses expenses_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_org_select ON public.expenses FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: expenses expenses_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_org_update ON public.expenses FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: fixed_daily_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fixed_daily_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: fixed_daily_costs fixed_daily_costs_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fixed_daily_costs_authenticated ON public.fixed_daily_costs TO authenticated USING (true) WITH CHECK (true);


--
-- Name: flight_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flight_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: gmail_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guide_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_rates guide_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guide_rates_authenticated_all ON public.guide_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: hotel_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotel_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: hotel_contacts hotel_contacts_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hotel_contacts_authenticated ON public.hotel_contacts TO authenticated USING (true) WITH CHECK (true);


--
-- Name: hotel_staff_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotel_staff_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: hotel_staff_rates hotel_staff_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hotel_staff_rates_authenticated_all ON public.hotel_staff_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: insurance_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: insurance_plans insurance_plans_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insurance_plans_org_all ON public.insurance_plans USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: insurance_premiums; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_premiums ENABLE ROW LEVEL SECURITY;

--
-- Name: insurance_premiums insurance_premiums_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insurance_premiums_org_all ON public.insurance_premiums USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: integration_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_events integration_events_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_events_org_all ON public.integration_events USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations integrations_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integrations_org_all ON public.integrations USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: invoice_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_payments invoice_payments_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_payments_authenticated ON public.invoice_payments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: invoice_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_reminders invoice_reminders_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_reminders_authenticated ON public.invoice_reminders TO authenticated USING (true) WITH CHECK (true);


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_org_delete ON public.invoices FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: invoices invoices_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_org_insert ON public.invoices FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: invoices invoices_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_org_select ON public.invoices FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: invoices invoices_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_org_update ON public.invoices FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: itineraries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

--
-- Name: itineraries itineraries_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itineraries_org_delete ON public.itineraries FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: itineraries itineraries_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itineraries_org_insert ON public.itineraries FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: itineraries itineraries_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itineraries_org_select ON public.itineraries FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: itineraries itineraries_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itineraries_org_update ON public.itineraries FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: itinerary_day_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itinerary_day_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: itinerary_day_versions itinerary_day_versions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itinerary_day_versions_authenticated ON public.itinerary_day_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: itinerary_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;

--
-- Name: itinerary_days itinerary_days_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itinerary_days_authenticated_all ON public.itinerary_days TO authenticated USING (true) WITH CHECK (true);


--
-- Name: itinerary_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itinerary_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: itinerary_service_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itinerary_service_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: itinerary_service_versions itinerary_service_versions_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itinerary_service_versions_authenticated_all ON public.itinerary_service_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: itinerary_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itinerary_services ENABLE ROW LEVEL SECURITY;

--
-- Name: itinerary_services itinerary_services_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itinerary_services_authenticated_all ON public.itinerary_services TO authenticated USING (true) WITH CHECK (true);


--
-- Name: itinerary_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itinerary_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: itinerary_shares itinerary_shares_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itinerary_shares_org ON public.itinerary_shares TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: itinerary_shares itinerary_shares_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itinerary_shares_service_role ON public.itinerary_shares TO service_role USING (true) WITH CHECK (true);


--
-- Name: itinerary_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itinerary_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: itinerary_versions itinerary_versions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itinerary_versions_authenticated ON public.itinerary_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: meal_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: meal_costs meal_costs_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meal_costs_authenticated ON public.meal_costs TO authenticated USING (true) WITH CHECK (true);


--
-- Name: meal_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: meal_rates meal_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meal_rates_authenticated_all ON public.meal_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: message_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: nile_cruises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nile_cruises ENABLE ROW LEVEL SECURITY;

--
-- Name: nile_cruises nile_cruises_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nile_cruises_authenticated_all ON public.nile_cruises TO authenticated USING (true) WITH CHECK (true);


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: operator_capacity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operator_capacity ENABLE ROW LEVEL SECURITY;

--
-- Name: operator_capacity operator_capacity_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY operator_capacity_org_all ON public.operator_capacity USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members organization_members_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_members_owner_write ON public.organization_members USING (public.user_is_org_owner(org_id)) WITH CHECK (public.user_is_org_owner(org_id));


--
-- Name: organization_members organization_members_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_members_self_select ON public.organization_members FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_owner_update ON public.organizations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.organization_members
  WHERE ((organization_members.org_id = organizations.id) AND (organization_members.user_id = auth.uid()) AND (organization_members.role = 'owner'::text)))));


--
-- Name: organizations organizations_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_self_select ON public.organizations FOR SELECT USING (public.user_is_in_org(id));


--
-- Name: outside_cairo_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outside_cairo_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: outside_cairo_fees outside_cairo_fees_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outside_cairo_fees_authenticated ON public.outside_cairo_fees TO authenticated USING (true) WITH CHECK (true);


--
-- Name: package_type_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_type_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: package_type_definitions package_type_definitions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_type_definitions_authenticated ON public.package_type_definitions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_org_delete ON public.payments FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: payments payments_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_org_insert ON public.payments FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: payments payments_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_org_select ON public.payments FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: payments payments_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_org_update ON public.payments FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: portal_message_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_message_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_message_threads portal_message_threads_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portal_message_threads_org_all ON public.portal_message_threads TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: portal_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: portal_messages portal_messages_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY portal_messages_org_all ON public.portal_messages TO authenticated USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: pricing_season_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_season_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_season_dates pricing_season_dates_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_season_dates_org_all ON public.pricing_season_dates USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: pricing_seasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_seasons pricing_seasons_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_seasons_org_all ON public.pricing_seasons USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: profit_margins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profit_margins ENABLE ROW LEVEL SECURITY;

--
-- Name: profit_margins profit_margins_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profit_margins_authenticated ON public.profit_margins TO authenticated USING (true) WITH CHECK (true);


--
-- Name: prompt_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_templates prompt_templates_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prompt_templates_authenticated ON public.prompt_templates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: quote_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quote_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: quote_revisions quote_revisions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_revisions_authenticated ON public.quote_revisions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: quote_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quote_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: quote_versions quote_versions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_versions_authenticated ON public.quote_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: rate_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_settings reminder_settings_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminder_settings_authenticated ON public.reminder_settings TO authenticated USING (true) WITH CHECK (true);


--
-- Name: restaurant_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurant_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_contacts restaurant_contacts_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY restaurant_contacts_authenticated ON public.restaurant_contacts TO authenticated USING (true) WITH CHECK (true);


--
-- Name: sales_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_agents sales_agents_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_agents_authenticated ON public.sales_agents TO authenticated USING (true) WITH CHECK (true);


--
-- Name: seasonal_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seasonal_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: seasonal_adjustments seasonal_adjustments_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seasonal_adjustments_authenticated ON public.seasonal_adjustments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: seasonal_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seasonal_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: seasonal_rates seasonal_rates_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seasonal_rates_authenticated ON public.seasonal_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: service_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: service_fees service_fees_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_fees_authenticated ON public.service_fees TO authenticated USING (true) WITH CHECK (true);


--
-- Name: sleeping_train_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sleeping_train_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_documents supplier_documents_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_documents_authenticated ON public.supplier_documents TO authenticated USING (true) WITH CHECK (true);


--
-- Name: supplier_invoice_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_invoice_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_invoice_expenses supplier_invoice_expenses_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoice_expenses_authenticated ON public.supplier_invoice_expenses TO authenticated USING (true) WITH CHECK (true);


--
-- Name: supplier_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_invoices supplier_invoices_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_org_delete ON public.supplier_invoices FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: supplier_invoices supplier_invoices_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_org_insert ON public.supplier_invoices FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: supplier_invoices supplier_invoices_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_org_select ON public.supplier_invoices FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: supplier_invoices supplier_invoices_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_org_update ON public.supplier_invoices FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_authenticated_all ON public.suppliers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: template_placeholders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_placeholders ENABLE ROW LEVEL SECURITY;

--
-- Name: template_placeholders template_placeholders_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY template_placeholders_authenticated ON public.template_placeholders TO authenticated USING (true) WITH CHECK (true);


--
-- Name: template_send_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_send_log ENABLE ROW LEVEL SECURITY;

--
-- Name: tipping_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipping_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: tipping_rates tipping_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tipping_rates_authenticated_all ON public.tipping_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_availability tour_availability_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_availability_authenticated ON public.tour_availability TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_categories tour_categories_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_categories_authenticated ON public.tour_categories TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_day_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_day_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_days ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_days tour_days_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_days_authenticated ON public.tour_days TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_departures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_departures ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_departures tour_departures_org_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_departures_org_all ON public.tour_departures USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: tour_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_pricing tour_pricing_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_pricing_authenticated ON public.tour_pricing TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_quotes tour_quotes_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_quotes_authenticated ON public.tour_quotes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_reviews tour_reviews_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_reviews_authenticated ON public.tour_reviews TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_template_defaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_template_defaults ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_template_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_template_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_template_versions tour_template_versions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_template_versions_authenticated ON public.tour_template_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_templates tour_templates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_templates_authenticated_all ON public.tour_templates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_variation_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_variation_services ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_variation_services tour_variation_services_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_variation_services_authenticated ON public.tour_variation_services TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_variation_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_variation_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_variation_versions tour_variation_versions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_variation_versions_authenticated ON public.tour_variation_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tour_variations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_variations ENABLE ROW LEVEL SECURITY;

--
-- Name: tours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;

--
-- Name: tours tours_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tours_authenticated ON public.tours TO authenticated USING (true) WITH CHECK (true);


--
-- Name: train_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.train_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: transportation_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transportation_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: transportation_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transportation_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: transportation_rates transportation_rates_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transportation_rates_authenticated_all ON public.transportation_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: user_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_invitations user_invitations_org_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_org_delete ON public.user_invitations FOR DELETE USING (public.user_is_in_org(org_id));


--
-- Name: user_invitations user_invitations_org_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_org_insert ON public.user_invitations FOR INSERT WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: user_invitations user_invitations_org_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_org_select ON public.user_invitations FOR SELECT USING (public.user_is_in_org(org_id));


--
-- Name: user_invitations user_invitations_org_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_org_update ON public.user_invitations FOR UPDATE USING (public.user_is_in_org(org_id)) WITH CHECK (public.user_is_in_org(org_id));


--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences user_preferences_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_preferences_authenticated_all ON public.user_preferences TO authenticated USING (true) WITH CHECK (true);


--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: variation_daily_itinerary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variation_daily_itinerary ENABLE ROW LEVEL SECURITY;

--
-- Name: variation_daily_itinerary variation_daily_itinerary_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variation_daily_itinerary_authenticated ON public.variation_daily_itinerary TO authenticated USING (true) WITH CHECK (true);


--
-- Name: variation_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variation_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: variation_pricing variation_pricing_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variation_pricing_authenticated ON public.variation_pricing TO authenticated USING (true) WITH CHECK (true);


--
-- Name: variation_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variation_services ENABLE ROW LEVEL SECURITY;

--
-- Name: variation_services variation_services_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY variation_services_authenticated ON public.variation_services TO authenticated USING (true) WITH CHECK (true);


--
-- Name: vehicle_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_rates vehicle_rates_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicle_rates_authenticated ON public.vehicle_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles vehicles_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_authenticated ON public.vehicles TO authenticated USING (true) WITH CHECK (true);


--
-- Name: whatsapp_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: writing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.writing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: writing_rules writing_rules_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY writing_rules_authenticated ON public.writing_rules TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

--
-- ============================================================
-- PRIVILEGES — not in the pg_dump, and the install fails without them
-- ============================================================
-- The dump is taken with --no-privileges, which strips every GRANT. On the
-- database it was taken from that is invisible: the grants are already there.
-- On a FRESH install it means service_role has no rights on anything, so the
-- app renders its pages perfectly and then cannot read a single row:
--
--     permission denied for table organizations
--
-- Found by standing up a second install. The PGlite replay could never catch
-- it, because that runs as a superuser where grants do not bite.
--
-- The posture below is the one archive/20260821_lock_public_schema.sql
-- established and this schema still has:
--
--   service_role   everything. It bypasses RLS and the app uses it server-side.
--   authenticated  everything at the GRANT layer; RLS is what actually decides.
--   anon           USAGE on the schema and NOTHING ELSE. That migration revoked
--                  every table privilege from anon after 47 resources turned
--                  out to be readable by the anonymous internet. A fresh
--                  install starts where that left off rather than repeating it.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;

-- Anything created later gets the same treatment, so a new table is not
-- silently unreachable until somebody notices.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated, service_role;

-- anon is granted nothing on tables, deliberately. Restoring a grant here
-- reopens what that lockdown closed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

COMMIT;
