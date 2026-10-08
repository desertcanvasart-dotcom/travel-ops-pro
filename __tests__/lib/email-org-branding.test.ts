// Customer emails were signed with the platform's identity (BUSINESS_NAME and
// friends) whichever organization sent them. They now carry the sending
// organization's own Settings profile, HTML-escaped because its admins type it.
import { describe, it, expect } from 'vitest'
import { EMPTY_IDENTITY, htmlIdentity, type OrgIdentity } from '@/lib/org-identity'
import { companyInfo, generateEmailTemplate } from '@/lib/communication-utils'

const nile: OrgIdentity = {
  ...EMPTY_IDENTITY,
  name: 'Nile & Sons <Tours>',
  email: 'office@nile.example',
  phone: '+20 100 000 0000',
  website: 'https://nile.example',
}

describe('htmlIdentity', () => {
  it('escapes every field', () => {
    expect(htmlIdentity(nile).name).toBe('Nile &amp; Sons &lt;Tours&gt;')
    expect(htmlIdentity({ ...EMPTY_IDENTITY, tagline: '"best"' }).tagline).toBe('&quot;best&quot;')
  })
})

describe('the itinerary email', () => {
  it('is signed by the organization it is sent for', () => {
    const html = generateEmailTemplate('Aiko', 'ITN-1', 'Cairo & Luxor', '1000', 'EUR', 'en', nile)
    expect(html).toContain('Nile &amp; Sons &lt;Tours&gt;')
    expect(html).toContain('office@nile.example')
    expect(html).not.toContain('<Tours>')
  })

  it('takes the company block from the identity it is given', () => {
    expect(companyInfo(nile)).toMatchObject({ company: nile.name, email: nile.email, website: nile.website })
  })
})
