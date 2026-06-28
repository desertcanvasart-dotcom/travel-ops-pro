import { describe, it, expect } from 'vitest'
import { chunkText, toPgVector } from '@/lib/embeddings'

// Pure helpers only — no OpenAI calls. The RAG knowledge base relies on these
// to split docs for per-chunk embedding and to serialize vectors for pgvector.

describe('chunkText', () => {
  it('returns a single chunk when text is short', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  it('returns [] for empty/whitespace input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })

  it('splits long text into multiple chunks bounded by maxChars', () => {
    const para = 'A'.repeat(1000)
    const text = `${para}\n\n${para}\n\n${para}`
    const chunks = chunkText(text, { maxChars: 1200, overlap: 100 })
    expect(chunks.length).toBeGreaterThan(1)
    // No chunk exceeds maxChars
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1200)
  })

  it('hard-splits a single oversized paragraph', () => {
    const huge = 'B'.repeat(5000)
    const chunks = chunkText(huge, { maxChars: 1200, overlap: 200 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toContain('B')
  })
})

describe('toPgVector', () => {
  it('serializes a number[] to a pgvector literal', () => {
    expect(toPgVector([0.1, 0.2, -0.3])).toBe('[0.1,0.2,-0.3]')
  })

  it('handles an empty vector', () => {
    expect(toPgVector([])).toBe('[]')
  })
})
