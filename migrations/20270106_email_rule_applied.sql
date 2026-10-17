-- ============================================
-- 20270106: which inbox rule moved an email
-- ============================================
-- Inbox rules (20261202) take mail out of the Inbox after each sync, and
-- nothing said so: an email showed, then vanished on the next refresh,
-- while Communicate still listed it (operator, 2026-10-16). The rule run
-- now records what it did on the message, and Communicate shows it.
--
-- { "rules": [{ "id": "…", "name": "…" }], "actions": { … }, "at": "…" }

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS rule_applied JSONB;
