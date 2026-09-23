// /api/translate took an unbounded `texts` array — a free translation proxy on
// the operator's OpenAI key.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

const translateBatch = vi.fn(async ({ texts }: { texts: string[] }) => texts)
vi.mock('@/lib/translate-core', () => ({ translateBatch: (a: { texts: string[] }) => translateBatch(a), translateSingle: vi.fn(async () => 'x') }))
vi.mock('@/lib/i18n/server-messages', () => ({ getServerLocale: async () => 'en', lookupServerMessage: (_l: string, k: string) => k }))
vi.mock('@/lib/ai/openai-models', () => ({ OPENAI_TRANSLATION_MODEL: 'm' }))

import { POST } from '@/app/api/translate/route'
beforeAll(() => { process.env.OPENAI_API_KEY = 'k' })
const post = (body: unknown) => POST(new NextRequest('http://x/api/translate', { method: 'POST', body: JSON.stringify(body) }))

describe('translate limits', () => {
  it('refuses more than 200 texts', async () => {
    expect((await post({ action: 'batchTranslate', texts: Array(201).fill('a'), targetLanguage: 'ja' })).status).toBe(413)
    expect(translateBatch).not.toHaveBeenCalled()
  })
  it('refuses more than 50,000 characters', async () => {
    expect((await post({ action: 'batchTranslate', texts: ['x'.repeat(50_001)], targetLanguage: 'ja' })).status).toBe(413)
  })
  it('a normal batch still translates', async () => {
    expect((await post({ action: 'batchTranslate', texts: ['hello'], targetLanguage: 'ja' })).status).toBe(200)
  })
})
