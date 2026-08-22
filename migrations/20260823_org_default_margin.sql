-- ============================================
-- The margin an operator sells at, as a company fact
-- ============================================
-- Margin was a per-USER preference (user_preferences.default_margin_percent)
-- and nothing else; a user with no preferences row fell through to a hard
-- coded 25. Two offices of the same company could quote the same trip at
-- different margins without either noticing. Like default_currency
-- (20260820) and rate_currency (20260822), this is an ORG fact: a colleague
-- joining tomorrow inherits the company's margin, not a constant in a file.
--
-- NULLABLE on purpose: "not configured" stays distinguishable from a
-- deliberate 0. Resolution order everywhere: request → user preference →
-- org default → 25 (the engine's historical default, which only survives
-- for an org that has never set one).
-- ============================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_margin_percent NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_default_margin_percent_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_default_margin_percent_check
      CHECK (default_margin_percent IS NULL OR (default_margin_percent >= 0 AND default_margin_percent <= 100));
  END IF;
END $$;

-- Backfill from what the members already use — most common margin wins,
-- ties break toward the OWNER's. An org whose members have no preferences
-- is left NULL; inventing one would be worse than admitting it.
WITH member_margin AS (
  SELECT m.org_id, p.default_margin_percent AS margin,
         COUNT(*) AS votes, BOOL_OR(m.role = 'owner') AS has_owner
  FROM organization_members m
  JOIN user_preferences p ON p.user_id = m.user_id
  WHERE p.default_margin_percent IS NOT NULL
  GROUP BY m.org_id, p.default_margin_percent
),
winner AS (
  SELECT DISTINCT ON (org_id) org_id, margin
  FROM member_margin
  ORDER BY org_id, votes DESC, has_owner DESC, margin
)
UPDATE public.organizations o
SET default_margin_percent = w.margin
FROM winner w
WHERE w.org_id = o.id AND o.default_margin_percent IS NULL;

COMMENT ON COLUMN public.organizations.default_margin_percent IS
  'Margin (%) the company sells at by default. Inherited by users who have set no preference of their own; NULL means never configured. Resolution: request → user preference → this → 25.';
