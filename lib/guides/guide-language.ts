// ============================================
// A guide language, as ONE thing across the app
// ============================================
// Settings → Vocabulary → Guide languages is the list (operator, 2026-09-17:
// the vocabulary, the guide rate form and the calculator showed three
// different lists — the form kept its own eleven with no Arabic, the
// calculator offered whatever the rate rows happened to say).
//
// Stored values vary with history: rate rows written before the vocabulary
// hold the WORD ("Japanese"), rows written since hold the KEY ("japanese"),
// and callers ask by either. They are the same language when their keys
// match — never by substring, which let a request find a row for any
// language whose name merely contained it.

import { slugifyKey } from '@/lib/vocabulary'

export const guideLanguageKey = (value: string | null | undefined): string => slugifyKey(String(value ?? ''))

export const sameGuideLanguage = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const ka = guideLanguageKey(a)
  return ka !== '' && ka === guideLanguageKey(b)
}

/** "japanese" → "Japanese", "brazilian_portuguese" → "Brazilian Portuguese":
 *  how a language asked for by key reads on a price line. A word is kept. */
export function guideLanguageWord(value: string): string {
  const v = String(value ?? '').trim()
  if (!v || /[A-Z\s]/.test(v)) return v
  return v.split('_').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

/** The built-in list when the agency has no vocabulary yet — the words the
 *  form used to hard-code, plus Arabic, which the vocabulary preset carries. */
export const BUILT_IN_GUIDE_LANGUAGES = [
  'English', 'Arabic', 'French', 'German', 'Spanish', 'Italian',
  'Russian', 'Chinese', 'Japanese', 'Portuguese', 'Dutch', 'Polish',
] as const
