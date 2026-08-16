-- ============================================================
-- Passenger details, as a Japanese travel agency collects them
-- ============================================================
-- booking_passengers was ported from the sibling app and models a passenger the
-- way an English-speaking operator does: one name, one phone, one address that
-- is not there at all. A.T.S's 海外旅行参加申込書 collects considerably more,
-- and every field below appears on that form because their process needs it.
--
-- This is the schema the customer portal's form writes into. Nothing here is
-- speculative: each column is a box on a sheet of paper they post today.
--
-- Nothing is backfilled — the table is empty.
-- ============================================================

-- ---------- the name, in three scripts ----------
-- A Japanese traveller has one name written three ways and they are not
-- interchangeable:
--
--   ローマ字   must match the passport EXACTLY. Their own invoice warns that
--              one character wrong and the traveller does not board.
--   氏名       kanji — what appears on Japanese-language documents.
--   フリガナ   kana — how it is read, and how a list of travellers sorts.
--
-- first_name / last_name are the ROMANISED name and keep that meaning, because
-- full_name (a generated column) and the existing document templates already
-- read them. The other two scripts are added alongside rather than replacing
-- anything.
ALTER TABLE public.booking_passengers
  ADD COLUMN IF NOT EXISTS family_name_kanji VARCHAR(100),
  ADD COLUMN IF NOT EXISTS given_name_kanji VARCHAR(100),
  ADD COLUMN IF NOT EXISTS family_name_kana VARCHAR(100),
  ADD COLUMN IF NOT EXISTS given_name_kana VARCHAR(100);

COMMENT ON COLUMN public.booking_passengers.first_name IS
  'ROMANISED given name — must match the passport exactly. See family_name_kanji / family_name_kana for the other two scripts.';
COMMENT ON COLUMN public.booking_passengers.family_name_kana IS
  'フリガナ. Drives how a traveller list sorts and how they are addressed.';

-- ---------- passport ----------
-- Their form has a box for a passport the traveller does not have yet:
-- "＊現在申請中⇒ 月 日 取得予定" — applied for, expected on a date. That is a
-- real state their process handles, so it is a state here rather than a blank
-- number nobody can distinguish from an unanswered question.
ALTER TABLE public.booking_passengers
  ADD COLUMN IF NOT EXISTS passport_issued_date DATE,
  ADD COLUMN IF NOT EXISTS passport_status VARCHAR(20) NOT NULL DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS passport_expected_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_passengers_passport_status') THEN
    ALTER TABLE public.booking_passengers
      ADD CONSTRAINT booking_passengers_passport_status
      CHECK (passport_status IN ('held', 'applying'));
  END IF;
END $$;

COMMENT ON COLUMN public.booking_passengers.passport_status IS
  'held = the traveller has it. applying = applied for, passport_expected_date says when. Egypt needs six months residual validity at visa application, so an expiry cannot be checked until one exists.';

-- ---------- the emergency contact left behind in Japan ----------
-- 渡航中の国内緊急連絡先 is marked 必須 on their form. 続柄 (the relationship)
-- is part of it: "Tanaka, 090-…" is not enough to know whether you are calling
-- a spouse or an employer.
ALTER TABLE public.booking_passengers
  ADD COLUMN IF NOT EXISTS emergency_contact_kana VARCHAR(255),
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50);

-- ---------- addresses ----------
-- Two of them, deliberately. 現住所 is where the traveller lives; 書類送付先 is
-- where the final documents are POSTED, and their form exists partly because
-- those differ often enough to have their own box. The final itinerary is
-- physically mailed about a week before departure, so sending it to the wrong
-- one is a trip that starts badly.
ALTER TABLE public.booking_passengers
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(16),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS address_kana TEXT,
  ADD COLUMN IF NOT EXISTS documents_postal_code VARCHAR(16),
  ADD COLUMN IF NOT EXISTS documents_address TEXT,
  ADD COLUMN IF NOT EXISTS documents_address_kana TEXT;

COMMENT ON COLUMN public.booking_passengers.documents_address IS
  '書類送付先 — where the final documents are posted, when that is not the home address. NULL means post to `address`.';

-- ---------- the rest of the contact block ----------
-- `phone` predates this and is the mobile; the others are the remaining boxes.
-- Fax is not vestigial here: their application forms still come back by it.
ALTER TABLE public.booking_passengers
  ADD COLUMN IF NOT EXISTS home_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fax VARCHAR(50),
  ADD COLUMN IF NOT EXISTS employer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS employer_phone VARCHAR(50);

COMMENT ON COLUMN public.booking_passengers.phone IS
  '携帯電話番号 — the mobile. home_phone and employer_phone are separate boxes on the application form.';

-- ---------- insurance ----------
-- The travel-safety plan is a separate product with its own application and its
-- own health declarations, which stay outside this system. Only the traveller's
-- ANSWER is recorded, because the operator has to know whether to send the
-- insurance form at all.
ALTER TABLE public.booking_passengers
  ADD COLUMN IF NOT EXISTS insurance_requested BOOLEAN,
  ADD COLUMN IF NOT EXISTS insurance_plan_code VARCHAR(10);

COMMENT ON COLUMN public.booking_passengers.insurance_requested IS
  'NULL = not answered yet, which is different from false. The operator chases a NULL and does not chase a false.';

-- ---------- has this traveller's form come back? ----------
-- The single question their pipeline gates on: no final documents are released
-- until every application form has returned. Today that is a person checking a
-- pile of faxes.
ALTER TABLE public.booking_passengers
  ADD COLUMN IF NOT EXISTS details_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS details_source VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_passengers_details_source') THEN
    ALTER TABLE public.booking_passengers
      ADD CONSTRAINT booking_passengers_details_source
      CHECK (details_source IS NULL OR details_source IN ('customer', 'staff'));
  END IF;
END $$;

COMMENT ON COLUMN public.booking_passengers.details_source IS
  'customer = the traveller filled it in themselves through the portal. staff = keyed in from a returned form. Worth distinguishing: a value somebody typed from a fax can carry a transcription error the customer never saw.';

-- Finding the travellers still to return their details is the chase query.
CREATE INDEX IF NOT EXISTS idx_booking_passengers_pending_details
  ON public.booking_passengers (booking_id)
  WHERE details_submitted_at IS NULL;
