import { describe, it, expect } from 'vitest'
import { formatRetrievalContext, type RetrievedItem } from '@/lib/copilot-retrieval'

// formatRetrievalContext builds the RAG block that draft-generator injects into
// the system prompt. Pure — no embeddings/RPC. Separates past-reply exemplars
// (whatsapp_pair) from authoritative business knowledge (kb_*).

const pair: RetrievedItem = {
  id: '1', source_type: 'whatsapp_pair', title: null,
  query_text: 'Do you offer airport pickup?',
  answer_text: 'Yes — we include a private airport transfer on arrival.',
  metadata: {}, similarity: 0.9,
}
const policy: RetrievedItem = {
  id: '2', source_type: 'kb_policy', title: 'Cancellation policy',
  query_text: 'Cancellation policy', answer_text: 'Free cancellation up to 14 days before departure.',
  metadata: {}, similarity: 0.8,
}

describe('formatRetrievalContext', () => {
  it('returns an empty string when there are no items', () => {
    expect(formatRetrievalContext([])).toBe('')
  })

  it('renders a past-conversation exemplar section for whatsapp_pair items', () => {
    const out = formatRetrievalContext([pair])
    expect(out).toContain('Similar past conversations')
    expect(out).toContain('Do you offer airport pickup?')
    expect(out).toContain('private airport transfer')
    expect(out).not.toContain('business knowledge')
  })

  it('renders an authoritative business-knowledge section for kb_* items, labelled by type/title', () => {
    const out = formatRetrievalContext([policy])
    expect(out).toContain('Relevant business knowledge')
    expect(out).toContain('[POLICY — Cancellation policy]')
    expect(out).toContain('Free cancellation up to 14 days')
  })

  it('keeps the two families in separate sections when both are present', () => {
    const out = formatRetrievalContext([pair, policy])
    const convIdx = out.indexOf('Similar past conversations')
    const kbIdx = out.indexOf('Relevant business knowledge')
    expect(convIdx).toBeGreaterThanOrEqual(0)
    expect(kbIdx).toBeGreaterThan(convIdx)
  })
})
