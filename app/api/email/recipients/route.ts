// ============================================
// API: /api/email/recipients?q= — address suggestions for To / Cc / Bcc
// ============================================
// Typing in a compose address field suggests the people the system already
// knows (operator, 2026-10-15): the caller's organisation's clients, B2B
// partners, suppliers and team members, and anyone its mailboxes have
// corresponded with — each its own company's (org_id, 20261203–05).
// Staff only (the /api/email middleware gate, and in-route).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { rankRecipients, type RecipientSuggestion } from '@/lib/email/recipient-suggestions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PER_SOURCE = 8

export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const q = sanitizeSearchTerm(request.nextUrl.searchParams.get('q'))
    if (q.length < 2) return NextResponse.json({ suggestions: [] })
    const like = `%${q}%`

    const [clients, partners, suppliers, team, correspondents] = await Promise.all([
      supabase.from('clients').select('first_name, last_name, email')
        .eq('org_id', orgId).not('email', 'is', null)
        .or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`).limit(PER_SOURCE),
      supabase.from('b2b_partners').select('company_name, contact_name, email')
        .eq('org_id', orgId).not('email', 'is', null)
        .or(`email.ilike.${like},company_name.ilike.${like},contact_name.ilike.${like}`).limit(PER_SOURCE),
      supabase.from('suppliers').select('name, contact_name, contact_email')
        .eq('org_id', orgId).not('contact_email', 'is', null)
        .or(`contact_email.ilike.${like},name.ilike.${like},contact_name.ilike.${like}`).limit(PER_SOURCE),
      supabase.from('team_members').select('name, email')
        .eq('org_id', orgId).not('email', 'is', null)
        .or(`email.ilike.${like},name.ilike.${like}`).limit(PER_SOURCE),
      supabase.from('email_conversations').select('client_name, client_email, last_message_at')
        .eq('org_id', orgId).not('client_email', 'is', null)
        .or(`client_email.ilike.${like},client_name.ilike.${like}`)
        .order('last_message_at', { ascending: false }).limit(PER_SOURCE),
    ])

    const found: RecipientSuggestion[] = [
      ...(clients.data ?? []).map((c: { first_name: string | null; last_name: string | null; email: string }) =>
        ({ email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(' '), source: 'client' as const })),
      ...(partners.data ?? []).map((p: { company_name: string | null; contact_name: string | null; email: string }) =>
        ({ email: p.email, name: p.contact_name ? `${p.contact_name} (${p.company_name ?? ''})`.replace(' ()', '') : (p.company_name ?? ''), source: 'partner' as const })),
      ...(suppliers.data ?? []).map((s: { name: string | null; contact_name: string | null; contact_email: string }) =>
        ({ email: s.contact_email, name: s.contact_name ? `${s.contact_name} (${s.name ?? ''})`.replace(' ()', '') : (s.name ?? ''), source: 'supplier' as const })),
      ...(team.data ?? []).map((t: { name: string | null; email: string }) =>
        ({ email: t.email, name: t.name ?? '', source: 'team' as const })),
      ...((correspondents.data ?? []) as Array<{ client_name: string | null; client_email: string }>).map(c =>
        ({ email: c.client_email, name: c.client_name ?? '', source: 'email' as const })),
    ]

    return NextResponse.json({ suggestions: rankRecipients(found, q, 10) })
  } catch (err) {
    console.error('Recipient suggestions error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
