-- ============================================
-- G3: suppliers.entity_kind classification sweep
-- ============================================
-- Phase 3 added suppliers.entity_kind (nullable, CHECK individual/company) and
-- classified only the 7 rows that mattered then. This sweep classifies the
-- remaining ~101 NULL rows. entity_kind stays NULLABLE (no NOT NULL) — this is
-- a backfill, not a constraint tightening.
--
-- Rules (decided 2026-06-27 with the operator):
--  - restaurant / cruise / hotel / shop / activity_provider / attraction → company
--    (legal entities, incl. the antiquities/sound-&-light authorities)
--  - guide → individual (named guides are people)
--  - transport → name-based: bare personal names are individual drivers
--    (Ayman, Emad, Mohamed, Yosri); everything else is a company.
--
-- Idempotent: every statement is guarded by entity_kind IS NULL.
-- ============================================

UPDATE public.suppliers
   SET entity_kind = 'company', updated_at = now()
 WHERE entity_kind IS NULL
   AND type IN ('restaurant', 'cruise', 'hotel', 'shop', 'activity_provider', 'attraction');

UPDATE public.suppliers
   SET entity_kind = 'individual', updated_at = now()
 WHERE entity_kind IS NULL
   AND type = 'guide';

-- Transport: the 4 bare personal names are individual drivers.
UPDATE public.suppliers
   SET entity_kind = 'individual', updated_at = now()
 WHERE entity_kind IS NULL
   AND type = 'transport'
   AND name IN ('Ayman', 'Emad', 'Mohamed', 'Yosri');

-- Any remaining transport rows are business-named → company.
UPDATE public.suppliers
   SET entity_kind = 'company', updated_at = now()
 WHERE entity_kind IS NULL
   AND type = 'transport';

-- ============================================
-- MIGRATION COMPLETE. entity_kind remains nullable by design (new ambiguous
-- suppliers may legitimately be unclassified until an operator sets them).
-- ============================================
