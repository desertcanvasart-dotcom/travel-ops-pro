-- ============================================================================
-- get_org_agent_memories: keep the company-wide memories when a client is known
-- ============================================================================
-- lib/agent-memory.ts calls this with p_subject_id = the client and
-- p_subject_type = 'client' whenever the request names a client. The old
-- WHERE then required am.subject_id = p_subject_id AND
-- am.subject_type = 'client', so every company-wide memory (inquiry patterns,
-- supplier notes: subject_id NULL, subject_type NULL) was dropped exactly when
-- a client was known — the AI got the client's memories but lost the
-- company's. Now a memory with no subject always qualifies; one about another
-- subject still does not. The ORDER BY already puts the client's own first.
--
-- And the function never returned anything at all: its closing UPDATE named
-- `confidence` unqualified, which in plpgsql is ambiguous with the RETURNS
-- TABLE column of the same name, so every call raised "column reference
-- \"confidence\" is ambiguous" and lib/agent-memory.ts (which swallows the
-- error) injected no memories. The UPDATE's columns are qualified now.
--
-- Body otherwise unchanged from the baseline. CREATE OR REPLACE keeps the
-- privileges, but the REVOKE/GRANT from 20261129 is re-applied explicitly so
-- this file states them too: service_role only — the function is SECURITY
-- DEFINER and takes any org id.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_org_agent_memories(p_org_id uuid, p_subject_id uuid DEFAULT NULL::uuid, p_subject_type text DEFAULT NULL::text, p_min_confidence double precision DEFAULT 0.3, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, memory_type text, subject_name text, content text, confidence double precision, observation_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT am.id, am.memory_type, am.subject_name, am.content, am.confidence, am.observation_count
  FROM agent_memory am
  WHERE am.org_id = p_org_id AND am.confidence >= p_min_confidence
    AND (am.expires_at IS NULL OR am.expires_at > NOW())
    AND (p_subject_id IS NULL OR am.subject_id = p_subject_id OR am.subject_id IS NULL)
    AND (p_subject_type IS NULL OR am.subject_type = p_subject_type OR am.subject_id IS NULL)
  ORDER BY
    CASE WHEN am.subject_type = 'client' AND am.subject_id = p_subject_id THEN 0 ELSE 1 END,
    am.confidence DESC, am.observation_count DESC
  LIMIT p_limit;

  UPDATE agent_memory u SET last_accessed_at = NOW()
  WHERE u.org_id = p_org_id AND u.confidence >= p_min_confidence
    AND (u.expires_at IS NULL OR u.expires_at > NOW());
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_org_agent_memories(uuid, uuid, text, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_agent_memories(uuid, uuid, text, double precision, integer) TO service_role;

COMMIT;
