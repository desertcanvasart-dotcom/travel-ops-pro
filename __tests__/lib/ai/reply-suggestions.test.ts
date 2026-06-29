import { describe, it, expect } from 'vitest'
import {
  parseDraftOptions,
  buildMultiDraftSystemPrompt,
} from '@/lib/ai/reply-suggestions'

// Pure helpers behind the multi-variant reply-suggestions generator.
// parseDraftOptions tolerates the JSON shapes Claude actually returns;
// buildMultiDraftSystemPrompt encodes the tone/language/channel rules.

describe('parseDraftOptions', () => {
  const ok = JSON.stringify({
    drafts: [
      { draft_body: 'Option A', rationale: 'concise', confidence: 'high', flags: { escalate: false } },
      { draft_body: 'Option B', rationale: 'detailed', confidence: 'medium' },
    ],
  })

  it('parses a clean drafts array', () => {
    const out = parseDraftOptions(ok, 2)
    expect(out).toHaveLength(2)
    expect(out[0].draft_body).toBe('Option A')
    expect(out[0].confidence).toBe('high')
    expect(out[0].flags).toEqual({ escalate: false })
    expect(out[1].confidence).toBe('medium')
    expect(out[1].flags).toBeNull()
  })

  it('strips ```json code fences', () => {
    const out = parseDraftOptions('```json\n' + ok + '\n```', 2)
    expect(out).toHaveLength(2)
  })

  it('extracts the JSON object when wrapped in prose', () => {
    const out = parseDraftOptions(`Sure! Here you go:\n${ok}\nHope that helps.`, 2)
    expect(out).toHaveLength(2)
  })

  it('slices to the requested count', () => {
    const out = parseDraftOptions(ok, 1)
    expect(out).toHaveLength(1)
    expect(out[0].draft_body).toBe('Option A')
  })

  it('drops entries with empty bodies and defaults bad confidence to medium', () => {
    const text = JSON.stringify({
      drafts: [
        { draft_body: '', confidence: 'high' },
        { draft_body: 'Real', confidence: 'bogus' },
      ],
    })
    const out = parseDraftOptions(text, 4)
    expect(out).toHaveLength(1)
    expect(out[0].draft_body).toBe('Real')
    expect(out[0].confidence).toBe('medium')
  })

  it('returns [] on unparseable input', () => {
    expect(parseDraftOptions('not json at all', 2)).toEqual([])
    expect(parseDraftOptions('', 2)).toEqual([])
  })
})

describe('buildMultiDraftSystemPrompt', () => {
  it('asks for the requested number of distinct options', () => {
    const sys = buildMultiDraftSystemPrompt('whatsapp', 'professional', null, 3, '')
    expect(sys).toContain('Produce 3 DISTINCT reply options')
    expect(sys).toContain('Return exactly 3 entries')
  })

  it('forces Japanese when the client locale is ja', () => {
    const sys = buildMultiDraftSystemPrompt('email', 'formal', 'ja', 2, '')
    expect(sys).toContain('Japanese')
  })

  it('mirrors the customer language when locale is unknown', () => {
    const sys = buildMultiDraftSystemPrompt('whatsapp', 'friendly', null, 2, '')
    expect(sys).toContain('same language as the customer')
  })

  it('applies channel-specific length guidance', () => {
    expect(buildMultiDraftSystemPrompt('whatsapp', 'professional', 'en', 2, '')).toContain('WhatsApp')
    expect(buildMultiDraftSystemPrompt('email', 'professional', 'en', 2, '')).toContain('Email')
  })

  it('injects the RAG block only when present', () => {
    const withRag = buildMultiDraftSystemPrompt('email', 'professional', 'en', 2, 'KB-CONTENT-HERE')
    expect(withRag).toContain('RETRIEVED KNOWLEDGE BASE')
    expect(withRag).toContain('KB-CONTENT-HERE')
    const noRag = buildMultiDraftSystemPrompt('email', 'professional', 'en', 2, '')
    expect(noRag).not.toContain('RETRIEVED KNOWLEDGE BASE')
  })
})
