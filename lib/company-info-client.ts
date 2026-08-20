// Client-side fetch of the organization's Company Profile, shaped for the
// invoice generator. Returns undefined on any failure — the generator's
// fallback is blank, never a placeholder company.

import type { CompanyInfo } from '@/lib/invoice-pdf-generator'

/**
 * An organizations row → the letterhead an invoice prints.
 *
 * Shared because three paths generate invoices — the invoice page, the
 * documents page, and the customer portal — and a customer's copy showing a
 * different company block from the office's copy is the kind of drift nobody
 * notices until a customer asks about it.
 */
export function toCompanyInfo(org: Record<string, unknown> | null | undefined): CompanyInfo | undefined {
  if (!org) return undefined
  return {
    name: (org.name as string) ?? '',
    address: (org.company_address as string) ?? '',
    city: '',
    country: '',
    email: (org.contact_email as string) ?? '',
    phone: (org.company_phone as string) ?? '',
    website: (org.company_website as string) ?? '',
    offices: Array.isArray(org.offices) ? (org.offices as CompanyInfo['offices']) : [],
  }
}

export async function fetchCompanyInfo(): Promise<CompanyInfo | undefined> {
  try {
    const res = await fetch('/api/organization/branding')
    if (!res.ok) return undefined
    const { data } = await res.json()
    if (!data) return undefined
    return toCompanyInfo(data)
  } catch {
    return undefined
  }
}
