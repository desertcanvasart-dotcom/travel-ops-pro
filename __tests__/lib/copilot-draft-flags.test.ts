// The analytics page reported RAG hit rate, tone breakdown and pre-generated
// rate by reading keys nothing ever wrote, so all three were permanently
// 0%/unknown. These pin the writers that make those numbers real.
import { describe, it, expect } from 'vitest'
import { draftFlags } from '@/lib/ai/draft-generator'

describe('draftFlags', () => {
  it('keeps the model\'s own flags and adds the two the caller knows', () => {
    const flags = draftFlags(
      { escalate: true, escalation_reason: 'refund', message_type: 'complaint', urgency: 'high' },
      { tone: 'friendly', pregenerated: true }
    )
    expect(flags).toEqual({
      escalate: true, escalation_reason: 'refund', message_type: 'complaint', urgency: 'high',
      tone: 'friendly', pregenerated: true,
    })
  })

  it('still records tone and pregenerated when the model returned no flags', () => {
    expect(draftFlags(null, { tone: 'formal', pregenerated: false })).toEqual({ tone: 'formal', pregenerated: false })
    expect(draftFlags(undefined, { tone: 'professional', pregenerated: false }).tone).toBe('professional')
  })

  it('never lets a model-returned tone override the tone actually used', () => {
    // @ts-expect-error — the model cannot supply a tone; if it ever does, ours wins
    expect(draftFlags({ tone: 'casual' }, { tone: 'formal', pregenerated: false }).tone).toBe('formal')
  })
})
