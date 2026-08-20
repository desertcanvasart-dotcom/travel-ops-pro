// Client-side fetch of the organization's Company Profile, shaped for the
// invoice generator. Returns undefined on any failure — the generator's
// fallback is blank, never a placeholder company.

import type { CompanyInfo } from '@/lib/invoice-pdf-generator'
import { customerFacingOrgName } from '@/lib/org-name'

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
    name: customerFacingOrgName(org.name as string | undefined),
    address: (org.company_address as string) ?? '',
    city: '',
    country: '',
    email: (org.contact_email as string) ?? '',
    phone: (org.company_phone as string) ?? '',
    website: (org.company_website as string) ?? '',
    offices: Array.isArray(org.offices) ? (org.offices as CompanyInfo['offices']) : [],
    // Callers that can inline the logo pass it here; those that cannot leave it
    // out and the letterhead is simply the name.
    logoDataUrl: (org.logo_data_url as string) ?? null,
  }
}

/** The logo as bytes the PDF can draw. In the browser that means fetching it
 *  and re-encoding — jsPDF never fetches anything itself. A logo that will not
 *  load is not worth failing an invoice over, so it returns null. */
async function logoAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size > 4_000_000) return null
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function fetchCompanyInfo(): Promise<CompanyInfo | undefined> {
  try {
    const res = await fetch('/api/organization/branding')
    if (!res.ok) return undefined
    const { data } = await res.json()
    if (!data) return undefined
    return toCompanyInfo({ ...data, logo_data_url: await logoAsDataUrl(data.logo_url) })
  } catch {
    return undefined
  }
}
