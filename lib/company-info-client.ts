// Client-side fetch of the organization's Company Profile, shaped for the
// invoice generator. Returns undefined on any failure — the generator's
// fallback is blank, never a placeholder company.

import type { CompanyInfo } from '@/lib/invoice-pdf-generator'

export async function fetchCompanyInfo(): Promise<CompanyInfo | undefined> {
  try {
    const res = await fetch('/api/organization/branding')
    if (!res.ok) return undefined
    const { data } = await res.json()
    if (!data) return undefined
    return {
      name: data.name ?? '',
      address: data.company_address ?? '',
      city: '',
      country: '',
      email: data.contact_email ?? '',
      phone: data.company_phone ?? '',
      website: data.company_website ?? '',
    }
  } catch {
    return undefined
  }
}
