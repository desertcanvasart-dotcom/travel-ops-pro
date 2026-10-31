// K1/K2: editing a Copilot Knowledge entry.
//
// K1: a long entry is stored as chunks (parent = chunk 0, children by
// chunk_index). The list returned only chunk 0 as the text, so the edit modal
// opened on it and saving re-embedded just that: the rest of the entry was
// deleted. The list now returns full_text (every chunk) and the modal edits it.
// K2: a re-embed only rewrote metadata when the request carried `metadata`
// (the page never sends it), so an edited FAQ question was not saved and
// total_chunks went stale.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-a',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/embeddings', async (orig) => ({
  ...(await orig<typeof import('@/lib/embeddings')>()),
  embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2]),
}))

import * as list from '@/app/api/copilot/knowledge/route'
import * as one from '@/app/api/copilot/knowledge/[id]/route'
import { chunkText } from '@/lib/embeddings'
import { joinKnowledgeChunks } from '@/lib/copilot/knowledge-text'

const json = (method: string, body: unknown) =>
  new NextRequest('http://x/api/copilot/knowledge', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

// ~3000 characters in paragraphs, plus one paragraph longer than a chunk
// (hard-split into overlapping windows).
const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: ` + 'Our cancellation terms apply. '.repeat(7).trim())
const longPara = Array.from({ length: 1700 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('')
const ENTRY = [...paragraphs, longPara].join('\n\n')

beforeEach(() => setMockTables({ copilot_knowledge: [] }))

describe('joinKnowledgeChunks', () => {
  it('rebuilds the original text from chunkText output, overlapping windows included', () => {
    expect(ENTRY.length).toBeGreaterThan(3000)
    const chunks = chunkText(ENTRY)
    expect(chunks.length).toBeGreaterThan(2)
    expect(joinKnowledgeChunks(chunks)).toBe(ENTRY)
  })

  it('a short entry is its single chunk', () => {
    expect(joinKnowledgeChunks(['Just one.'])).toBe('Just one.')
  })
})

describe('edit a 3000-character FAQ', () => {
  it('GET gives the full text, and saving an edit keeps every part and the new question', async () => {
    const created = await (await list.POST(json('POST', { source_type: 'kb_faq', question: 'Cancel?', content: ENTRY }))).json()
    expect(created.success).toBe(true)
    expect(created.chunks).toBeGreaterThan(2)

    const got = await (await list.GET(new NextRequest('http://x/api/copilot/knowledge'))).json()
    const entry = got.entries.find((e: { id: string }) => e.id === created.id)
    expect(entry.answer_text.length).toBeLessThan(ENTRY.length) // chunk 0 only
    expect(entry.full_text).toBe(ENTRY)

    // What the modal sends: the full text (edited) and the question, no metadata.
    const edited = entry.full_text + '\n\nNew closing paragraph.'
    const res = await one.PATCH(json('PATCH', { content: edited, title: null, question: 'How do I cancel?' }), params(created.id))
    expect((await res.json()).success).toBe(true)

    const again = await (await list.GET(new NextRequest('http://x/api/copilot/knowledge'))).json()
    const after = again.entries.find((e: { id: string }) => e.id === created.id)
    expect(after.full_text).toBe(edited)
    expect(after.metadata.question).toBe('How do I cancel?')
    expect(after.metadata.total_chunks).toBe(chunkText(edited).length)
  })

  it('a re-embed without a question keeps the one stored', async () => {
    const created = await (await list.POST(json('POST', { source_type: 'kb_faq', question: 'Cancel?', content: 'Short answer.' }))).json()
    await one.PATCH(json('PATCH', { content: 'Shorter.' }), params(created.id))
    const got = await (await list.GET(new NextRequest('http://x/api/copilot/knowledge'))).json()
    expect(got.entries[0].metadata).toMatchObject({ question: 'Cancel?', total_chunks: 1 })
  })
})

describe('the Knowledge page', () => {
  const page = readFileSync(join(process.cwd(), 'app/settings/copilot-knowledge/page.tsx'), 'utf8')
  it('edits full_text, not chunk 0', () => {
    expect(page).toContain("useState(entry?.full_text ?? entry?.answer_text ?? '')")
  })
  // K4: toggle and delete used to update the list whatever the server said.
  it('changes the list only after the server confirms a toggle or delete', () => {
    expect(page).toMatch(/if \(res\.ok && data\.success\) return true/)
    expect(page).toMatch(/if \(ok\) setEntries\(\(prev\) => prev\.map/)
    expect(page).toMatch(/if \(ok\) setEntries\(\(prev\) => prev\.filter/)
  })
})
