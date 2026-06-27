// Canonical EU/EUR-passport detection from a free-text nationality string.
//
// This list was previously copy-pasted into 3 AI routes (parse-whatsapp,
// generate-itinerary, build-quote) and had DRIFTED — build-quote only matched
// country names, missing demonyms ("French") and abbreviations ("EU"), so the
// same nationality resolved to different passport types (and thus different
// pricing) depending on the code path. One helper, one list.
//
// Matches EU/EEA/Schengen country names, nationality demonyms, and common
// abbreviations, via case-insensitive substring (preserving the prior behavior).
const EU_TERMS = [
  // Country names
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark',
  'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland',
  'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands',
  'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden',
  'norway', 'iceland', 'liechtenstein', 'switzerland',
  // Demonyms (nationality adjectives)
  'austrian', 'belgian', 'bulgarian', 'croatian', 'cypriot', 'danish',
  'estonian', 'finnish', 'french', 'german', 'greek', 'hungarian', 'irish',
  'italian', 'latvian', 'lithuanian', 'luxembourgish', 'maltese', 'dutch',
  'polish', 'portuguese', 'romanian', 'slovak', 'slovenian', 'spanish', 'swedish',
  'norwegian', 'icelandic', 'swiss',
  // Common abbreviations
  'eu', 'eur', 'euro', 'european', 'schengen',
]

/** True when the nationality string indicates an EU/EUR passport. Empty/unknown → false. */
export function isEuroPassport(nationality: string | null | undefined): boolean {
  if (!nationality) return false
  const n = nationality.toLowerCase()
  return EU_TERMS.some(t => n.includes(t))
}
