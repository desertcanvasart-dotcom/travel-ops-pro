// lib/translate.ts
// OpenAI-powered translation service for WhatsApp messages

import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Supported languages with their codes and names
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
] as const

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code']

export interface TranslationResult {
  originalText: string
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
  confidence: number
}

export interface DetectionResult {
  detectedLanguage: string
  languageCode: LanguageCode | string
  confidence: number
}

/**
 * Detect the language of a given text
 */
export async function detectLanguage(text: string): Promise<DetectionResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a language detection assistant. Detect the language of the given text and respond with ONLY a JSON object in this exact format:
{
  "language": "Language Name",
  "code": "ISO 639-1 code (2 letters)",
  "confidence": 0.95
}
Do not include any other text or explanation.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0,
      max_tokens: 100
    })

    const content = response.choices[0]?.message?.content || ''
    
    // Parse the JSON response
    const result = JSON.parse(content.trim())
    
    return {
      detectedLanguage: result.language,
      languageCode: result.code.toLowerCase(),
      confidence: result.confidence
    }
  } catch (error) {
    console.error('Language detection error:', error)
    // Default to English if detection fails
    return {
      detectedLanguage: 'English',
      languageCode: 'en',
      confidence: 0.5
    }
  }
}

/**
 * Translate text from one language to another
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string,
  context?: string
): Promise<TranslationResult> {
  try {
    // If source language not provided, detect it
    let sourceLang = sourceLanguage
    if (!sourceLang) {
      const detection = await detectLanguage(text)
      sourceLang = detection.detectedLanguage
    }

    // Get full language name if code was provided
    const targetLangName = getLanguageName(targetLanguage) || targetLanguage
    const sourceLangName = getLanguageName(sourceLang) || sourceLang

    // If source and target are the same, return original
    if (sourceLangName.toLowerCase() === targetLangName.toLowerCase()) {
      return {
        originalText: text,
        translatedText: text,
        sourceLanguage: sourceLangName,
        targetLanguage: targetLangName,
        confidence: 1.0
      }
    }

    const systemPrompt = `You are a professional translator specializing in travel industry communications. 
Translate the following text from ${sourceLangName} to ${targetLangName}.

Guidelines:
- Maintain a friendly, professional tone appropriate for travel customer service
- Keep the message natural and conversational
- Preserve any specific names, dates, locations, and numbers exactly as they appear
- If there are currency amounts, keep them in their original format
- Maintain any formatting (like line breaks) from the original
${context ? `- Context: This is a ${context}` : ''}

Respond with ONLY the translated text, no explanations or additional commentary.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })

    const translatedText = response.choices[0]?.message?.content || text

    return {
      originalText: text,
      translatedText: translatedText.trim(),
      sourceLanguage: sourceLangName,
      targetLanguage: targetLangName,
      confidence: 0.95
    }
  } catch (error) {
    console.error('Translation error:', error)
    throw new Error('Failed to translate text')
  }
}

/**
 * Translate incoming message to English (for agent to read)
 */
export async function translateToEnglish(text: string): Promise<TranslationResult> {
  return translateText(text, 'English', undefined, 'incoming customer message')
}

/**
 * Translate outgoing message from English to target language (for customer)
 */
export async function translateFromEnglish(
  text: string,
  targetLanguage: string
): Promise<TranslationResult> {
  return translateText(text, targetLanguage, 'English', 'outgoing message to customer')
}

/**
 * Get language name from code
 */
export function getLanguageName(codeOrName: string): string | undefined {
  const lang = SUPPORTED_LANGUAGES.find(
    l => l.code.toLowerCase() === codeOrName.toLowerCase() ||
         l.name.toLowerCase() === codeOrName.toLowerCase()
  )
  return lang?.name
}

/**
 * Get language code from name
 */
export function getLanguageCode(nameOrCode: string): LanguageCode | undefined {
  const lang = SUPPORTED_LANGUAGES.find(
    l => l.code.toLowerCase() === nameOrCode.toLowerCase() ||
         l.name.toLowerCase() === nameOrCode.toLowerCase()
  )
  return lang?.code as LanguageCode | undefined
}

/**
 * Get language info (name, code, flag)
 */
export function getLanguageInfo(codeOrName: string) {
  return SUPPORTED_LANGUAGES.find(
    l => l.code.toLowerCase() === codeOrName.toLowerCase() ||
         l.name.toLowerCase() === codeOrName.toLowerCase()
  )
}

/**
 * Batch translate multiple messages
 */
export async function batchTranslate(
  messages: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult[]> {
  const results = await Promise.all(
    messages.map(msg => translateText(msg, targetLanguage, sourceLanguage))
  )
  return results
}