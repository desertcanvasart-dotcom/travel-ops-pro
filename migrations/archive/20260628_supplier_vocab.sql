-- ============================================
-- Phase 3 backfill: supplier vocabulary migration
-- ============================================
-- Three things in one transaction:
--   1. Replace 'transport_company' with 'transport' across all suppliers rows
--      (19 transport_company + 3 transport → 22 transport, table-wide rename).
--   2. Replace the CHECK constraint with one whose allowed set drops
--      'transport_company' and adds 'local_operator' (and 'transport', though
--      that value was already present despite not being in the prior allowed
--      set — see "Note on the pre-existing transport rows" below).
--   3. Add suppliers.entity_kind TEXT NULL with CHECK ('individual','company',NULL).
--
-- All three are wrapped in BEGIN/COMMIT so a single failure rolls back the
-- whole thing — no half-state where the rename succeeded but the new CHECK
-- didn't, or vice versa.
--
-- Note on the pre-existing transport rows:
--   The DB has 3 rows already carrying type='transport' despite the value
--   not being in TYPE_CONFIG. They were almost certainly created by direct
--   SQL or a legacy import path that bypassed the CHECK (or the CHECK was
--   relaxed at some point). They get unioned into the renamed bucket — no
--   conflict, since the target value is identical for both.
--
-- entity_kind:
--   Nullable, with CHECK that allows 'individual'/'company'/NULL.
--   Most existing suppliers stay NULL until a future classification sweep
--   (recorded as a follow-up). NOT NULL is premature — would block creation
--   of new suppliers until a default was picked, and we have no business
--   default to pick.
-- ============================================

BEGIN;

-- 1. Drop the old CHECK so we can rename without violating it
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_type_check;

-- 2. Rename data
UPDATE suppliers SET type = 'transport' WHERE type = 'transport_company';

-- 3. Add new CHECK with new vocabulary.
-- Allowed set: all currently-used types in TYPE_CONFIG (minus transport_company,
-- plus local_operator). Kept 'driver' and 'tour_operator'/'ground_handler'/'other'
-- even though zero rows currently use them, since TYPE_CONFIG lists them and the
-- UI must remain able to create suppliers of those types.
ALTER TABLE suppliers ADD CONSTRAINT suppliers_type_check
  CHECK (type IN (
    'hotel',
    'transport',
    'local_operator',
    'driver',
    'guide',
    'cruise',
    'activity_provider',
    'attraction',
    'tour_operator',
    'ground_handler',
    'restaurant',
    'shop',
    'other'
  ));

-- 4. Add entity_kind
ALTER TABLE suppliers ADD COLUMN entity_kind TEXT;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_entity_kind_check
  CHECK (entity_kind IS NULL OR entity_kind IN ('individual', 'company'));

COMMIT;
