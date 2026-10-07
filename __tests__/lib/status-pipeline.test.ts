// The itinerary page's status line. Each step is read off its own record, so
// a trip invoiced before it was booked (ITN-26-009) shows the gap.
import { describe, it, expect } from 'vitest'
import { pipelineSteps } from '@/components/itineraries/StatusPipeline'

describe('pipelineSteps', () => {
  it('a draft is only a quote', () => {
    expect(pipelineSteps({ status: 'draft', hasBooking: false, hasInvoice: false, invoicePaid: false }))
      .toEqual({ quote: true, sent: false, confirmed: false, booked: false, invoiced: false, paid: false })
  })

  it('confirmed implies sent', () => {
    const s = pipelineSteps({ status: 'confirmed', hasBooking: false, hasInvoice: false, invoicePaid: false })
    expect(s.sent && s.confirmed).toBe(true)
  })

  it('invoiced without a booking shows booked undone', () => {
    const s = pipelineSteps({ status: 'confirmed', hasBooking: false, hasInvoice: true, invoicePaid: false })
    expect(s.invoiced).toBe(true)
    expect(s.booked).toBe(false)
  })

  it('a paid invoice is paid', () => {
    expect(pipelineSteps({ status: 'completed', hasBooking: true, hasInvoice: true, invoicePaid: true }).paid).toBe(true)
  })
})
