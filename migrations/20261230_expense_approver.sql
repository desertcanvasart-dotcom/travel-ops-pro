-- ============================================
-- Expenses: who created one, and who approved it
-- ============================================
-- An expense moved from Pending to Approved (or straight to Paid) with nothing
-- recording who did it, and nothing stopping the person who entered it from
-- approving it themselves.
--
--   created_by   the signed-in user who entered the expense (NULL for those
--                entered before this column, and for ones the system makes,
--                such as an expense raised from a supplier confirmation)
--   approved_by  the signed-in user who moved it out of Pending to Approved or
--                Paid
--   approved_at  when
--
-- The app sets all three from the session, never from the request, and refuses
-- an approval by the person who created the expense unless they are an owner or
-- admin. No existing row changes: an expense approved before this migration has
-- no approver on record, which the screens show as blank, not guessed.
--
-- No foreign keys to auth.users: an approver who later leaves must not block
-- or erase the record, and this table is already written by the service role.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS behind a to_regclass check.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.expenses') IS NOT NULL THEN
    ALTER TABLE public.expenses
      ADD COLUMN IF NOT EXISTS created_by uuid,
      ADD COLUMN IF NOT EXISTS approved_by uuid,
      ADD COLUMN IF NOT EXISTS approved_at timestamptz;
  END IF;
END
$$;

COMMIT;
