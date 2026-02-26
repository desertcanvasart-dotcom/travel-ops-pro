// ============================================
// LANGUAGE VERSION CREATION
// Extracted from generate-itinerary/route.ts
// ============================================
// Auto-creates itinerary_version and itinerary_day_versions
// after generation so the language tab is populated immediately.

// ============================================
// LANGUAGE CODE MAPPING
// ============================================

type VersionLanguage = 'en' | 'ja'

export function getVersionLanguageCode(language: string): VersionLanguage {
  const lower = (language || '').toLowerCase()
  if (lower.includes('japanese') || lower === 'ja' || lower === '\u65E5\u672C\u8A9E') return 'ja'
  // Default to English for all other languages
  return 'en'
}

// ============================================
// CREATE LANGUAGE VERSIONS
// ============================================

/**
 * Auto-create itinerary_version and itinerary_day_versions after generation.
 * This ensures the language tab is populated immediately.
 */
export async function createLanguageVersions(
  supabase: any,
  itineraryId: string,
  tripName: string,
  language: string,
  dayIds: { id: string; title: string; description: string; city: string; overnight_city: string | null }[]
) {
  const langCode = getVersionLanguageCode(language)

  try {
    // Create itinerary_version
    const { error: versionError } = await supabase
      .from('itinerary_versions')
      .insert({
        itinerary_id: itineraryId,
        language: langCode,
        trip_name: tripName
      })

    if (versionError) {
      // Unique constraint violation = version already exists, skip
      if (!versionError.message?.includes('duplicate') && !versionError.message?.includes('unique')) {
        console.error('Error creating itinerary version:', versionError)
      }
    } else {
      console.log(`\u2705 Auto-created ${langCode} itinerary version`)
    }

    // Create itinerary_day_versions for each day
    if (dayIds.length > 0) {
      const dayVersions = dayIds.map(day => ({
        itinerary_day_id: day.id,
        language: langCode,
        title: day.title,
        description: day.description,
        city: day.city,
        overnight_city: day.overnight_city
      }))

      const { error: dayVersionError } = await supabase
        .from('itinerary_day_versions')
        .insert(dayVersions)

      if (dayVersionError) {
        if (!dayVersionError.message?.includes('duplicate') && !dayVersionError.message?.includes('unique')) {
          console.error('Error creating day versions:', dayVersionError)
        }
      } else {
        console.log(`\u2705 Auto-created ${langCode} day versions for ${dayIds.length} days`)
      }
    }
  } catch (err) {
    // Non-critical - don't fail the whole generation
    console.error('Error in createLanguageVersions:', err)
  }
}
