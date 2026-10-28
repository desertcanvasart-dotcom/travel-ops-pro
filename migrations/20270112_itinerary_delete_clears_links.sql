-- ============================================
-- 20270112: deleting a trip clears the links that only point at it
-- ============================================
-- Four foreign keys to itineraries had no ON DELETE action, so a trip a quote
-- had been converted into could never be deleted: the database refused, and
-- the API answered with its generic "linked records (invoices, payments,
-- etc.)" — on a trip with no invoices and no payments (ATS, 2026-10-27).
--
-- Each of these is a pointer FROM a record that stands on its own (the quote,
-- a client document, a follow-up, a logged message) TO the trip. Deleting the
-- trip keeps the record and clears the pointer:
--   tour_quotes.converted_to_itinerary_id
--   client_documents.related_itinerary_id
--   client_followups.related_itinerary_id
--   communication_history.related_itinerary_id
--
-- invoices.itinerary_id is left as it is: an invoice still blocks the delete
-- on purpose (lib/itineraries/trip-delete.ts says so by name first).
--
-- Each key is found by what it IS — this column referencing itineraries —
-- never by its name, and re-created under the canonical name so PostgREST
-- embed hints keep resolving. Running it twice changes nothing.
-- ============================================

DO $$
DECLARE
  link record;
  con  record;
BEGIN
  IF to_regclass('public.itineraries') IS NULL THEN RETURN; END IF;

  FOR link IN
    SELECT * FROM (VALUES
      ('tour_quotes',           'converted_to_itinerary_id'),
      ('client_documents',      'related_itinerary_id'),
      ('client_followups',      'related_itinerary_id'),
      ('communication_history', 'related_itinerary_id')
    ) AS v(tbl, col)
  LOOP
    CONTINUE WHEN to_regclass('public.' || link.tbl) IS NULL;

    FOR con IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND c.conrelid = ('public.' || link.tbl)::regclass
         AND c.confrelid = 'public.itineraries'::regclass
         AND array_length(c.conkey, 1) = 1
         AND a.attname = link.col
         AND c.confdeltype <> 'n'          -- not already ON DELETE SET NULL
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', link.tbl, con.conname);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.itineraries(id) ON DELETE SET NULL',
        link.tbl, link.tbl || '_' || link.col || '_fkey', link.col);
    END LOOP;
  END LOOP;
END $$;
