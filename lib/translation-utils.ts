// lib/translation-utils.ts
// Utility functions for translating content between languages

import type { Language } from '@/types/multilingual'

/**
 * Translate a single text string from one language to another
 * Uses the /api/translate endpoint internally
 */
export async function translateText(
  text: string | null | undefined,
  fromLang: Language,
  toLang: Language
): Promise<string | null> {
  // Return null for empty/null values
  if (!text || text.trim() === '') {
    return null
  }

  try {
    // Determine action based on languages
    let action: 'toEnglish' | 'fromEnglish'
    let targetLanguage: string | undefined

    if (toLang === 'en') {
      action = 'toEnglish'
    } else {
      action = 'fromEnglish'
      targetLanguage = toLang === 'ja' ? 'Japanese' : toLang
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        action,
        targetLanguage
      })
    })

    const data = await response.json().catch(() => null)

    if (response.ok && data?.success && data.data?.translatedText) {
      return data.data.translatedText
    }

    // Systemic failure (retired model, outage, bad key, rate limit). DO NOT
    // silently return the English original — that's the silent-failure class
    // that produced "Japanese" versions that were actually still English with
    // a SUCCESS response. Throw so the caller (copy-translate routes) surfaces
    // a clear error instead of writing untranslated content. The route already
    // localized data.error via the cookie pattern.
    const reason = data?.error || `translate API returned ${response.status}`
    throw new Error(reason)
  } catch (error) {
    // Re-throw so the failure is visible to the operator. (Empty input is
    // handled by the early `return null` above and never reaches here.)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * Translate an array of strings
 */
export async function translateArray(
  items: string[] | null | undefined,
  fromLang: Language,
  toLang: Language
): Promise<string[] | null> {
  if (!items || items.length === 0) {
    return null
  }

  const results = await Promise.all(
    items.map(item => translateText(item, fromLang, toLang))
  )

  return results.filter((item): item is string => item !== null)
}

/**
 * Configuration for a field to translate
 */
export interface TranslationFieldConfig {
  key: string
  type: 'string' | 'string[]'
}

/**
 * Translate multiple fields in an object based on configuration
 * Returns a new object with translated values
 */
export async function translateFields<T extends Record<string, unknown>>(
  content: T,
  fieldConfigs: TranslationFieldConfig[],
  fromLang: Language,
  toLang: Language
): Promise<Partial<T>> {
  const result: Partial<T> = {}

  for (const config of fieldConfigs) {
    const value = content[config.key]

    if (config.type === 'string') {
      const translated = await translateText(value as string | null, fromLang, toLang)
      if (translated !== null) {
        (result as Record<string, unknown>)[config.key] = translated
      }
    } else if (config.type === 'string[]') {
      const translated = await translateArray(value as string[] | null, fromLang, toLang)
      if (translated !== null) {
        (result as Record<string, unknown>)[config.key] = translated
      }
    }
  }

  return result
}

/**
 * Field configurations for itinerary versions
 */
export const ITINERARY_TRANSLATION_FIELDS: TranslationFieldConfig[] = [
  { key: 'trip_name', type: 'string' },
  { key: 'notes', type: 'string' },
  { key: 'pickup_location', type: 'string' },
  { key: 'guide_notes', type: 'string' },
  { key: 'vehicle_notes', type: 'string' },
  { key: 'inclusions', type: 'string[]' },
  { key: 'exclusions', type: 'string[]' }
]

/**
 * Field configurations for itinerary day versions
 */
export const ITINERARY_DAY_TRANSLATION_FIELDS: TranslationFieldConfig[] = [
  { key: 'title', type: 'string' },
  { key: 'description', type: 'string' },
  { key: 'city', type: 'string' },
  { key: 'overnight_city', type: 'string' }
]

/**
 * Field configurations for quote versions
 */
export const QUOTE_TRANSLATION_FIELDS: TranslationFieldConfig[] = [
  { key: 'title', type: 'string' },
  { key: 'notes', type: 'string' },
  { key: 'terms_conditions', type: 'string' },
  { key: 'special_requests', type: 'string' }
]

/**
 * Field configurations for tour template versions
 */
export const TOUR_TEMPLATE_TRANSLATION_FIELDS: TranslationFieldConfig[] = [
  { key: 'template_name', type: 'string' },
  { key: 'short_description', type: 'string' },
  { key: 'long_description', type: 'string' },
  { key: 'highlights', type: 'string[]' },
  { key: 'main_attractions', type: 'string[]' },
  { key: 'best_for', type: 'string[]' },
  { key: 'inclusions', type: 'string[]' },
  { key: 'exclusions', type: 'string[]' }
]

/**
 * Field configurations for tour variation versions
 */
export const TOUR_VARIATION_TRANSLATION_FIELDS: TranslationFieldConfig[] = [
  { key: 'variation_name', type: 'string' },
  { key: 'inclusions', type: 'string[]' },
  { key: 'exclusions', type: 'string[]' },
  { key: 'optional_extras', type: 'string[]' }
]

/**
 * Field configurations for variation daily itinerary
 */
export const VARIATION_DAILY_ITINERARY_TRANSLATION_FIELDS: TranslationFieldConfig[] = [
  { key: 'day_title', type: 'string' },
  { key: 'day_description', type: 'string' },
  { key: 'city', type: 'string' },
  { key: 'overnight_city', type: 'string' }
]

/**
 * Field configurations for itinerary service versions
 */
export const SERVICE_TRANSLATION_FIELDS: TranslationFieldConfig[] = [
  { key: 'service_name', type: 'string' },
  { key: 'notes', type: 'string' }
]
