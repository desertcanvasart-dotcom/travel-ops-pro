-- ============================================
-- The currency an operator bills in
-- ============================================
-- Currency was a per-USER preference and nothing else, so "what does this
-- company invoice in?" had no answer anywhere. A user with no preferences row
-- fell through to a hardcoded 'USD' — not the operator's currency, and not even
-- the engine's EUR. That is how an A.T.S agent came to be quoting in dollars
-- for a company that bills exclusively in yen.
--
-- This is an ORG fact, not a personal one. A colleague joining tomorrow should
-- inherit the company's currency, not a constant in a React file.
--
-- NULLABLE on purpose: "not configured yet" is a real state and must stay
-- distinguishable from a deliberate choice. The resolution order is
--   user preference → org default → 'USD'
-- and the last step only survives for an org that has never set one.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_default_currency_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_default_currency_check
      CHECK (default_currency IS NULL OR default_currency IN ('USD','EUR','GBP','EGP','JPY'));
  END IF;
END $$;

-- ---------- backfill ----------
-- From what the org's own members already use, rather than a value typed here:
-- the members are the evidence of what the company bills in, and this way every
-- operator on the system gets a sensible answer instead of only the one whose
-- currency somebody happened to know. Most common wins; ties break toward the
-- currency the OWNER uses, since it is their company.
--
-- An org whose members have no preferences at all is left NULL — there is
-- nothing to infer from, and inventing one would be worse than admitting it.
WITH member_currency AS (
  SELECT
    m.org_id,
    p.default_currency AS currency,
    COUNT(*) AS votes,
    BOOL_OR(m.role = 'owner') AS has_owner
  FROM organization_members m
  JOIN user_preferences p ON p.user_id = m.user_id
  WHERE p.default_currency IS NOT NULL
  GROUP BY m.org_id, p.default_currency
),
winner AS (
  SELECT DISTINCT ON (org_id) org_id, currency
  FROM member_currency
  ORDER BY org_id, votes DESC, has_owner DESC, currency
)
UPDATE organizations o
SET default_currency = w.currency
FROM winner w
WHERE w.org_id = o.id
  AND o.default_currency IS NULL;

COMMENT ON COLUMN organizations.default_currency IS
  'What this operator bills in. Inherited by users who have set no preference of their own; NULL means never configured. Resolution order: user preference → this → USD.';
