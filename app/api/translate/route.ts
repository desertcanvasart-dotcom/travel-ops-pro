// app/api/translate/route.ts
//
// Thin HTTP wrapper for the BROWSER over lib/translate-core.ts. Server code
// must import the core directly — a server-side fetch to this route arrives
// without a session cookie and the API auth gate 401s it, which is exactly how
// all three copy-translate features silently died in June.
import { NextRequest, NextResponse } from 'next/server'
import { OPENAI_TRANSLATION_MODEL } from '@/lib/ai/openai-models'
import { translateBatch, translateSingle } from '@/lib/translate-core'
import { getServerLocale, lookupServerMessage } from '@/lib/i18n/server-messages'

export async function POST(request: NextRequest) {
  const locale = await getServerLocale()
  const tErr = (key: string, params?: Record<string, string | number>) =>
    lookupServerMessage(locale, `translate.errors.${key}`, params)
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return NextResponse.json({ success: false, error: tErr('notConfigured') }, { status: 500 })
    }

    const body = await request.json()
    const { text, texts, targetLanguage, action, context } = body

    if (action === 'batchTranslate' && texts && Array.isArray(texts)) {
      if (!targetLanguage) {
        return NextResponse.json(
          { success: false, error: 'Target language is required' },
          { status: 400 }
        )
      }
      const translatedTexts = await translateBatch({ texts, targetLanguage, context })
      return NextResponse.json({
        success: true,
        data: { translatedTexts, originalTexts: texts, action: 'batchTranslate', targetLanguage },
      })
    }

    if (!text) {
      return NextResponse.json({ success: false, error: 'Text is required' }, { status: 400 })
    }
    if (action !== 'toEnglish' && !targetLanguage) {
      return NextResponse.json(
        { success: false, error: 'Target language is required' },
        { status: 400 }
      )
    }

    const translatedText = await translateSingle({ text, action, targetLanguage })
    return NextResponse.json({
      success: true,
      data: {
        translatedText,
        originalText: text,
        action,
        targetLanguage: action === 'toEnglish' ? 'en' : targetLanguage,
      },
    })
  } catch (error: any) {
    console.error('Translation API error:', error)

    if (error?.code === 'empty') {
      return NextResponse.json({ success: false, error: tErr('empty') }, { status: 500 })
    }
    if (error?.message === 'Failed to parse batch translation') {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (error?.status === 401 || error?.code === 'invalid_api_key') {
      return NextResponse.json({ success: false, error: tErr('invalidKey') }, { status: 401 })
    }
    if (error?.status === 429) {
      return NextResponse.json({ success: false, error: tErr('rateLimit') }, { status: 429 })
    }
    // Retired/typo'd model — the silent-outage class. OpenAI returns 404
    // model_not_found. Surface it explicitly (and name the model) so a
    // retirement is diagnosable, not a generic "translation failed".
    if (error?.status === 404 || error?.code === 'model_not_found') {
      return NextResponse.json(
        { success: false, error: tErr('modelNotFound', { model: OPENAI_TRANSLATION_MODEL }) },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { success: false, error: tErr('failed', { reason: error?.message || 'unknown' }) },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Translation API is running',
    configured: !!process.env.OPENAI_API_KEY,
    supportedActions: ['toEnglish', 'fromEnglish', 'translate']
  })
}
