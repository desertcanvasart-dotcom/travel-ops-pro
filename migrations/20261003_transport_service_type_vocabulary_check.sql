-- 20261003_transport_service_type_vocabulary_check.sql
-- A transport rate's service_type is whatever Settings → Vocabulary →
-- Transport service types says it can be.
--
-- WHY: the transportation form now offers the agency's own service-type
-- list (it used to carry a frozen copy of the eleven presets), but
-- transportation_rates carried a CHECK freezing service_type to those same
-- eleven — so a type added in Settings was offered by the form and then
-- refused by the database with a constraint error the form could not
-- explain. The same trap the tier CHECKs were (20261001).
--
-- What stays in the schema is the SHAPE: a service type is a vocabulary KEY
-- (lib/vocabulary KEY_PATTERN — a lowercase slug), never a free-text label.
-- Which key means "needs an origin and a destination" is the vocabulary's
-- needs_destination meta, read by the route.
--
-- Loosening only: every existing row holds one of the eleven preset keys,
-- all of which satisfy the pattern, so ADD CONSTRAINT validates without a
-- rewrite. Idempotent: DROP IF EXISTS before every ADD.

BEGIN;

ALTER TABLE public.transportation_rates DROP CONSTRAINT IF EXISTS transportation_rates_service_type_check;

ALTER TABLE public.transportation_rates DROP CONSTRAINT IF EXISTS transportation_rates_service_type_key_check;
ALTER TABLE public.transportation_rates
  ADD CONSTRAINT transportation_rates_service_type_key_check
  CHECK (service_type IS NULL OR service_type ~ '^[a-z0-9][a-z0-9_]{0,59}$');

COMMIT;
