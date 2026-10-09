// ============================================
// Who a template message is from
// ============================================
// The inbox template-data routes filled {company_phone} with "+20 123 456 7890"
// or "+20 115 801 1600" and {agent_name} with "Islam" for every organisation,
// and the company name/email from the platform's environment. The organisation
// is its own row (Settings → Organization); the agent is whoever is sending.

import { orgIdentity } from '@/lib/org-identity'

type ProfileDb = {
  from: (table: 'user_profiles') => {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        maybeSingle: () => PromiseLike<{ data: { full_name?: string | null } | null }>
      }
    }
  }
}

export interface TemplateSender {
  company_name: string
  company_email: string
  company_phone: string
  agent_name: string
}

export function senderPlaceholders(
  identity: { name: string; email: string; phone: string },
  agentName: string | null | undefined
): TemplateSender {
  return {
    company_name: identity.name || '',
    company_email: identity.email || '',
    company_phone: identity.phone || '',
    agent_name: (agentName || '').trim(),
  }
}

export async function templateSender(db: unknown, orgId: string, userId: string | null): Promise<TemplateSender> {
  const identity = await orgIdentity(orgId)
  let agentName: string | null = null
  if (userId) {
    try {
      const { data } = await (db as ProfileDb).from('user_profiles').select('full_name').eq('id', userId).maybeSingle()
      agentName = data?.full_name ?? null
    } catch { /* no name: the placeholder stays blank */ }
  }
  return senderPlaceholders(identity, agentName)
}
