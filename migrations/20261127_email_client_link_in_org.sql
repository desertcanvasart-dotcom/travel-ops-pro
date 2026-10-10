-- ============================================================================
-- 20261127 — an email conversation links only to its own organisation's client
-- ============================================================================
--
-- auto_link_email_to_client() (BEFORE INSERT OR UPDATE on email_conversations)
-- matched the sender's address against every client on the platform. A
-- customer who is a client of two agencies, or one agency's client who wrote
-- to another, had the conversation linked to the other organisation's client
-- record — its name copied onto the conversation, and the conversation shown
-- on that organisation's client page.
--
-- email_conversations carries no org_id yet (deferred G1); its owner is the
-- mailbox user (user_id). A client now matches only when its org_id is an
-- organisation that user is a member of. No user, no match.
--
-- Existing links to a client outside the mailbox user's organisations are
-- cleared (conversations without a user are left as they are); the UPDATE
-- runs the trigger again, which links the conversation to the user's own
-- client with that address when there is one.
--
-- Same signature and trigger. Replay-safe (CREATE OR REPLACE; the cleanup
-- touches only rows that are still wrong). Safe before the matching app
-- deploy: nothing in the app relies on a cross-organisation link.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_link_email_to_client() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    matched_client RECORD;
BEGIN
    -- Only if client_id is null and client_email is provided
    IF NEW.client_id IS NULL AND NEW.client_email IS NOT NULL AND NEW.user_id IS NOT NULL THEN
        SELECT c.id, CONCAT(c.first_name, ' ', c.last_name) AS full_name
        INTO matched_client
        FROM clients c
        WHERE LOWER(c.email) = LOWER(NEW.client_email)
          AND c.org_id IN (
            SELECT om.org_id FROM organization_members om WHERE om.user_id = NEW.user_id
          )
        ORDER BY c.created_at
        LIMIT 1;

        IF matched_client.id IS NOT NULL THEN
            NEW.client_id := matched_client.id;
            NEW.client_name := matched_client.full_name;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

UPDATE public.email_conversations ec
SET client_id = NULL
WHERE ec.client_id IS NOT NULL
  AND ec.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.organization_members om ON om.org_id = c.org_id
    WHERE c.id = ec.client_id
      AND om.user_id = ec.user_id
  );

COMMIT;
