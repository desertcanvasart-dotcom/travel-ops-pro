// ============================================
// Translation core — in-process, no HTTP
// ============================================
// Extracted from app/api/translate/route.ts for the same reason
// lib/email-send.ts exists: server code kept calling its own /api/* over HTTP,
// and the API auth gate (2026-06-23) rightly 401s a cookie-less request. Every
// consumer of lib/translation-utils.ts is a server route, so ALL THREE
// copy-translate features (itineraries, tours, B2B quotes) had been failing
// with "Unauthorized" on their own internal fetch — proven live before this
// fix, not inferred.
//
// The /api/translate route still exists for the browser and now delegates
// here. Server code imports these functions directly and never fetches.
//
// NEVER fetch our own /api/* from server code.

import OpenAI from 'openai'
import { OPENAI_TRANSLATION_MODEL } from '@/lib/ai/openai-models'

// Lazy: constructing at import time with a missing key turns "translation is
// not configured" into a crash at module load for every importer.
let client: OpenAI | null = null
function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('Translation is not configured (OPENAI_API_KEY missing)')
    ;(err as { code?: string }).code = 'not_configured'
    throw err
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

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

export function getTravelSystemPrompt(targetLanguage: string): string {
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

export type TranslateAction = 'toEnglish' | 'fromEnglish' | 'translate'

/**
 * Translate one text. Throws on failure — OpenAI errors propagate with their
 * .status/.code intact so the route can keep its localized error mapping and
 * server callers get a diagnosable reason instead of a silent original.
 */
export async function translateSingle(input: {
  text: string
  action?: TranslateAction | string
  targetLanguage?: string
}): Promise<string> {
  const { text, action, targetLanguage } = input

  let prompt: string
  let systemPrompt: string

  if (action === 'toEnglish') {
    systemPrompt = 'You are a professional translator. Detect the language of the input and translate it to English. Respond only with the translation, nothing else.'
    prompt = `Translate the following text to English. Only respond with the translation, no explanations:\n\n${text}`
  } else if (action === 'fromEnglish') {
    if (!targetLanguage) throw new Error('Target language is required')
    systemPrompt = getTravelSystemPrompt(targetLanguage)
    prompt = `Translate the following English text to ${targetLanguage}. Only respond with the translation, no explanations:\n\n${text}`
  } else {
    if (!targetLanguage) throw new Error('Target language is required')
    systemPrompt = 'You are a professional translator. Respond only with the translation, nothing else.'
    prompt = `Translate the following text to ${targetLanguage}. Only respond with the translation, no explanations:\n\n${text}`
  }

  const response = await openai().chat.completions.create({
    model: OPENAI_TRANSLATION_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 1000
  })

  const translatedText = response.choices[0]?.message?.content?.trim()
  if (!translatedText) {
    const err = new Error('Translation returned empty')
    ;(err as { code?: string }).code = 'empty'
    throw err
  }
  return translatedText
}

/**
 * Translate a list in one model call, order-preserving. Throws when the model's
 * answer cannot be matched back to the inputs — a mismatched list silently
 * shifted by one would put day 3's text on day 4.
 */
export async function translateBatch(input: {
  texts: string[]
  targetLanguage: string
  context?: string
}): Promise<string[]> {
  const { texts, targetLanguage, context } = input

  const systemPrompt = getTravelSystemPrompt(targetLanguage)
  const numberedItems = texts.map((item, i) => `${i + 1}. ${item}`).join('\n')
  const contextHint = context ? `\nContext: These are ${context} for an Egypt tour package.\n` : ''

  const prompt = `Translate the following numbered list from English to ${targetLanguage}. ${contextHint}
Return ONLY the translated items as a JSON array of strings, preserving the same order. Do not include numbers or explanations.

${numberedItems}`

  const response = await openai().chat.completions.create({
    model: OPENAI_TRANSLATION_MODEL,
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
    const err = new Error('Translation returned empty')
    ;(err as { code?: string }).code = 'empty'
    throw err
  }

  let translatedTexts: string[]
  try {
    const parsed = JSON.parse(content)
    translatedTexts =
      parsed.items || parsed.translations || parsed.results || parsed.translated || Object.values(parsed)[0]
    if (!Array.isArray(translatedTexts) || translatedTexts.length !== texts.length) {
      throw new Error('Mismatch in translated items count')
    }
  } catch {
    translatedTexts = content
      .split('\n')
      .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((line: string) => line.length > 0)
      .slice(0, texts.length)
    if (translatedTexts.length !== texts.length) {
      throw new Error('Failed to parse batch translation')
    }
  }
  return translatedTexts
}
