// app/api/translate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Travel industry glossary for accurate translations
const TRAVEL_GLOSSARY: Record<string, Record<string, string>> = {
  ja: {
    'tips': 'チップ',
    'gratuities': 'チップ',
    'Egyptologist': 'エジプト学専門ガイド',
    'naturalist': 'ネイチャーガイド',
    'Egyptologist-naturalist': 'エジプト学専門ガイド',
    'board basis': '食事プラン',
    'entrance fees': '入場料',
    'service charges': 'サービス料',
    'travel insurance': '旅行保険',
    'visa fees': 'ビザ費用',
    'personal expenses': '個人的な費用',
    'airport transfers': '空港送迎',
    'private transportation': '専用車',
    'sightseeing': '観光',
    'porters': 'ポーター',
    'concierge': 'コンシェルジュ',
    'hotel concierge': 'ホテルコンシェルジュ',
  }
}

function getTravelSystemPrompt(targetLanguage: string): string {
  const glossary = TRAVEL_GLOSSARY[targetLanguage]
  const glossarySection = glossary
    ? '\n\nKey terminology (use these exact translations):\n' +
      Object.entries(glossary).map(([en, tl]) => `- "${en}" → "${tl}"`).join('\n')
    : ''

  return `You are a professional translator specializing in the travel and tourism industry. You translate tour package descriptions, inclusions, and exclusions for a travel operations company in Egypt.

Guidelines:
- Use natural, professional language appropriate for tour brochures and contracts
- Maintain the meaning precisely — these are contractual terms for tour packages
- "Tips" and "gratuities" in tour context always mean monetary tips (チップ), never hints (ヒント)
- "Licensed private guiding" means a licensed professional tour guide, not a guidebook
- Keep the tone formal but friendly, suitable for client-facing documents
- Do not add or remove information from the original text${glossarySection}`
}

export async function POST(request: NextRequest) {
  try {
    // Check API key first
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return NextResponse.json(
        { success: false, error: 'Translation service not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { text, texts, targetLanguage, action, context } = body

    // Batch translation mode: translate multiple items at once with context
    if (action === 'batchTranslate' && texts && Array.isArray(texts)) {
      if (!targetLanguage) {
        return NextResponse.json(
          { success: false, error: 'Target language is required' },
          { status: 400 }
        )
      }

      const systemPrompt = getTravelSystemPrompt(targetLanguage)
      const numberedItems = texts.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n')
      const contextHint = context ? `\nContext: These are ${context} for an Egypt tour package.\n` : ''

      const prompt = `Translate the following numbered list from English to ${targetLanguage}. ${contextHint}
Return ONLY the translated items as a JSON array of strings, preserving the same order. Do not include numbers or explanations.

${numberedItems}`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content?.trim()
      if (!content) {
        return NextResponse.json(
          { success: false, error: 'Translation returned empty' },
          { status: 500 }
        )
      }

      // Parse the JSON response
      let translatedTexts: string[]
      try {
        const parsed = JSON.parse(content)
        // Handle both { items: [...] } and { translations: [...] } and direct array formats
        translatedTexts = parsed.items || parsed.translations || parsed.results || parsed.translated || Object.values(parsed)[0]
        if (!Array.isArray(translatedTexts) || translatedTexts.length !== texts.length) {
          throw new Error('Mismatch in translated items count')
        }
      } catch {
        // Fallback: try to extract lines from the response
        translatedTexts = content
          .split('\n')
          .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
          .filter((line: string) => line.length > 0)
          .slice(0, texts.length)

        // If still wrong count, return error
        if (translatedTexts.length !== texts.length) {
          return NextResponse.json(
            { success: false, error: 'Failed to parse batch translation' },
            { status: 500 }
          )
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          translatedTexts,
          originalTexts: texts,
          action: 'batchTranslate',
          targetLanguage
        }
      })
    }

    // Single text translation (existing behavior)
    if (!text) {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      )
    }

    let prompt: string
    let systemPrompt: string

    if (action === 'toEnglish') {
      // Translate incoming message TO English
      systemPrompt = 'You are a professional translator. Detect the language of the input and translate it to English. Respond only with the translation, nothing else.'
      prompt = `Translate the following text to English. Only respond with the translation, no explanations:\n\n${text}`
    } else if (action === 'fromEnglish') {
      // Translate outgoing message FROM English
      if (!targetLanguage) {
        return NextResponse.json(
          { success: false, error: 'Target language is required' },
          { status: 400 }
        )
      }
      systemPrompt = getTravelSystemPrompt(targetLanguage)
      prompt = `Translate the following English text to ${targetLanguage}. Only respond with the translation, no explanations:\n\n${text}`
    } else {
      // Default: auto-detect and translate to target
      if (!targetLanguage) {
        return NextResponse.json(
          { success: false, error: 'Target language is required' },
          { status: 400 }
        )
      }
      systemPrompt = 'You are a professional translator. Respond only with the translation, nothing else.'
      prompt = `Translate the following text to ${targetLanguage}. Only respond with the translation, no explanations:\n\n${text}`
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })

    const translatedText = response.choices[0]?.message?.content?.trim()

    if (!translatedText) {
      return NextResponse.json(
        { success: false, error: 'Translation returned empty' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        translatedText,
        originalText: text,
        action,
        targetLanguage: action === 'toEnglish' ? 'en' : targetLanguage
      }
    })

  } catch (error: any) {
    console.error('Translation API error:', error)

    if (error?.status === 401 || error?.code === 'invalid_api_key') {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401 }
      )
    }

    if (error?.status === 429) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Translation failed' },
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