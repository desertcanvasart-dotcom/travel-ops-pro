-- 20261007_supplier_type_vocabulary_check.sql
-- A supplier's type is whatever Settings → Vocabulary → Supplier types says it can be.
--
-- WHY: the vocabulary screen promises "add your own" supplier type, with a
-- behaviour ("behaves like a hotel"), and the operator added "Lodge" on
-- 13 Sep 2026. It appeared in no role picker (the suppliers screen offered
-- its own seventeen), and had it been sent by hand the database would have
-- refused it: suppliers carried TWO CHECKs freezing `type` and `types` to
-- those same seventeen words — the tier bug (20261001) in another table.
--
-- The LIST now lives in the vocabulary (kind = 'supplier_type') and the app
-- validates against it (lib/supplier-types allowedSupplierTypeKeys, in the
-- suppliers routes and the CSV importer). What stays in the schema is the
-- SHAPE: a type is a vocabulary KEY (lib/vocabulary KEY_PATTERN — a lowercase
-- slug), never a free-text label; and the primary type is one of the roles
-- (suppliers_type_in_types_check, untouched).
--
-- Loosening only: every existing row holds one of the seventeen preset keys,
-- all of which satisfy the pattern, so ADD CONSTRAINT validates without a
-- rewrite. Idempotent: DROP IF EXISTS before every ADD.

BEGIN;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_type_check;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_types_vocab_check;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_type_key_check;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_type_key_check
  CHECK (type IS NULL OR type ~ '^[a-z0-9][a-z0-9_]{0,59}$');

-- Every role in the set is a key too. Checked on the array's TEXT form
-- ('{lodge,hotel}') so one regex covers the whole array (a CHECK cannot
-- subquery unnest): Postgres double-quotes any element holding a space,
-- comma or quote, and a quote fails the pattern — so "eco lodge" cannot
-- hide inside a joined string the way a separator-based check would allow.
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_types_keys_check;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_types_keys_check
  CHECK (
    types IS NULL
    OR cardinality(types) = 0
    OR types::text ~ '^\{[a-z0-9][a-z0-9_]{0,59}(,[a-z0-9][a-z0-9_]{0,59})*\}$'
  );

COMMIT;
