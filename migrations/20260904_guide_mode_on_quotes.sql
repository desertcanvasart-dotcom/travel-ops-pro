-- The quote remembers WHICH guide model priced it (operator, 2026-09-04).
--
-- PR #359 added guide grades (egyptologist/senior) and the throughout "+1"
-- mode to the calculator — but the saved quote recorded tour_leader_included
-- and not this choice, so a quote could not say how its guide was priced and
-- any later re-derivation would silently assume spot.
--
-- NULL = the defaults (egyptologist, spot) — every existing row is already
-- correct under that reading, and the writer only stores non-default values.

ALTER TABLE public.tour_quotes
  ADD COLUMN IF NOT EXISTS guide_grade text,
  ADD COLUMN IF NOT EXISTS guide_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tour_quotes_guide_grade_check'
  ) THEN
    ALTER TABLE public.tour_quotes
      ADD CONSTRAINT tour_quotes_guide_grade_check
      CHECK (guide_grade IS NULL OR guide_grade IN ('egyptologist', 'senior'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tour_quotes_guide_mode_check'
  ) THEN
    ALTER TABLE public.tour_quotes
      ADD CONSTRAINT tour_quotes_guide_mode_check
      CHECK (guide_mode IS NULL OR guide_mode IN ('spot', 'throughout'));
  END IF;
END $$;
