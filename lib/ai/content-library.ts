// ============================================
// CONTENT LIBRARY INTEGRATION
// Extracted from generate-itinerary/route.ts
// ============================================

import { type CruiseDetectionResult } from './cruise-detection'
import { type ServiceTier } from './parsing-utils'

// ============================================
// CRUISE CONTENT LOOKUP
// ============================================

export interface CruiseContentMatch {
  found: boolean
  content: any
  variation: any
  dayByDay: any[]
  recommendedSuppliers: string[]
}

export async function findCruiseContent(
  supabaseAdmin: any,
  cruiseDetection: CruiseDetectionResult,
  tier: ServiceTier,
  requestedDuration: number | null
): Promise<CruiseContentMatch> {
  const noMatch: CruiseContentMatch = {
    found: false,
    content: null,
    variation: null,
    dayByDay: [],
    recommendedSuppliers: []
  }

  if (!cruiseDetection.isCruise) {
    return noMatch
  }

  try {
    // Build query based on detected cruise parameters
    let query = supabaseAdmin
      .from('content_library')
      .select(`
        *,
        content_variations!inner (
          id,
          tier,
          title,
          description,
          highlights,
          inclusions,
          day_by_day,
          recommended_suppliers,
          is_active
        )
      `)
      .eq('is_cruise', true)
      .eq('is_active', true)
      .eq('content_variations.is_active', true)
      .eq('content_variations.tier', tier)

    // Filter by route if detected
    if (cruiseDetection.route) {
      query = query.eq('route', cruiseDetection.route)
    }

    // Filter by cruise type
    if (cruiseDetection.cruiseType) {
      query = query.eq('tour_type', cruiseDetection.cruiseType)
    }

    const { data: cruises, error } = await query

    if (error || !cruises || cruises.length === 0) {
      console.log('⚠️ No cruise content found in Content Library for route:', cruiseDetection.route)

      // Try without route filter as fallback
      const { data: fallbackCruises } = await supabaseAdmin
        .from('content_library')
        .select(`
          *,
          content_variations!inner (
            id,
            tier,
            title,
            description,
            highlights,
            inclusions,
            day_by_day,
            recommended_suppliers,
            is_active
          )
        `)
        .eq('is_cruise', true)
        .eq('is_active', true)
        .eq('content_variations.is_active', true)
        .eq('content_variations.tier', tier)
        .limit(1)

      if (!fallbackCruises || fallbackCruises.length === 0) {
        console.log('⚠️ No cruise content found at all in Content Library')
        return noMatch
      }

      const content = fallbackCruises[0]
      const variation = content.content_variations[0]

      console.log(`📚 Found fallback cruise: ${content.name} (${variation.tier} tier)`)

      return {
        found: true,
        content,
        variation,
        dayByDay: variation.day_by_day || [],
        recommendedSuppliers: variation.recommended_suppliers || []
      }
    }

    // Find best match based on duration if specified
    let bestMatch = cruises[0]
    if (requestedDuration) {
      const durationMatch = cruises.find((c: any) => c.duration_days === requestedDuration)
      if (durationMatch) {
        bestMatch = durationMatch
      }
    }

    const variation = bestMatch.content_variations[0]

    console.log(`📚 Found cruise content: ${bestMatch.name} (${variation.tier} tier, ${bestMatch.duration_days} days)`)

    return {
      found: true,
      content: bestMatch,
      variation,
      dayByDay: variation.day_by_day || [],
      recommendedSuppliers: variation.recommended_suppliers || []
    }

  } catch (err) {
    console.error('⚠️ Error querying cruise content:', err)
    return noMatch
  }
}

// ============================================
// CONTENT LIBRARY (non-cruise)
// ============================================

export interface ContentItem {
  id: string
  name: string
  category_name: string
  category_slug: string
  tier: string
  title: string
  description: string
  highlights: string[]
  inclusions: string[]
}

export interface WritingRule {
  rule_type: string
  rule_text: string
  category: string
  priority: number
}

export async function fetchContentLibrary(
  supabaseAdmin: any,
  tier: string,
  cities: string[],
  interests: string[]
): Promise<ContentItem[]> {
  try {
    const searchTags = [
      ...cities.map(c => c.toLowerCase()),
      ...interests.map(i => i.toLowerCase())
    ]

    const { data: variations, error } = await supabaseAdmin
      .from('content_variations')
      .select(`
        id,
        content_id,
        tier,
        title,
        description,
        highlights,
        inclusions,
        content_library!inner (
          id,
          name,
          slug,
          short_description,
          location,
          tags,
          is_cruise,
          content_categories!inner (
            name,
            slug
          )
        )
      `)
      .eq('tier', tier)
      .eq('is_active', true)

    if (error || !variations) {
      console.log('⚠️ No content library items found:', error?.message)
      return []
    }

    // Filter and transform content - exclude cruises for land tours
    const content: ContentItem[] = variations
      .filter((v: any) => {
        const item = v.content_library
        if (!item) return false
        if (item.is_cruise) return false // Exclude cruise content

        const itemTags = (item.tags || []).map((t: string) => t.toLowerCase())
        const itemLocation = (item.location || '').toLowerCase()
        const itemName = (item.name || '').toLowerCase()

        const matchesSearch = searchTags.length === 0 || searchTags.some(tag =>
          itemTags.includes(tag) ||
          itemLocation.includes(tag) ||
          itemName.includes(tag) ||
          tag.includes(itemLocation)
        )

        return matchesSearch
      })
      .map((v: any) => ({
        id: v.content_id,
        name: v.content_library.name,
        category_name: v.content_library.content_categories?.name || 'General',
        category_slug: v.content_library.content_categories?.slug || 'general',
        tier: v.tier,
        title: v.title || v.content_library.name,
        description: v.description || v.content_library.short_description || '',
        highlights: v.highlights || [],
        inclusions: v.inclusions || []
      }))

    console.log(`📚 Found ${content.length} content items for tier ${tier}`)
    return content
  } catch (err) {
    console.error('⚠️ Error fetching content library:', err)
    return []
  }
}

export async function fetchWritingRules(supabaseAdmin: any): Promise<WritingRule[]> {
  try {
    const { data: rules, error } = await supabaseAdmin
      .from('writing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error || !rules) {
      return []
    }

    return rules
  } catch (err) {
    console.error('⚠️ Error fetching writing rules:', err)
    return []
  }
}

export function buildContentContext(content: ContentItem[]): string {
  if (content.length === 0) return ''

  const grouped: Record<string, ContentItem[]> = {}
  content.forEach(item => {
    if (!grouped[item.category_slug]) {
      grouped[item.category_slug] = []
    }
    grouped[item.category_slug].push(item)
  })

  let context = '\n\nCONTENT LIBRARY:\n'

  for (const [category, items] of Object.entries(grouped)) {
    context += `\n[${items[0]?.category_name || category}]\n`
    items.slice(0, 5).forEach(item => {
      context += `• ${item.name}: ${item.description?.substring(0, 200) || ''}...\n`
    })
  }

  return context
}

export function buildWritingRulesContext(rules: WritingRule[]): string {
  if (rules.length === 0) return ''

  let context = '\n\nWRITING STYLE:\n'

  const enforceRules = rules.filter(r => r.rule_type === 'enforce').slice(0, 5)
  const avoidRules = rules.filter(r => r.rule_type === 'avoid').slice(0, 5)

  if (enforceRules.length > 0) {
    context += 'MUST follow:\n'
    enforceRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  if (avoidRules.length > 0) {
    context += 'AVOID:\n'
    avoidRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  return context
}

// ============================================
// FETCH ATTRACTION NAMES LIST
// ============================================

/**
 * Fetch active attraction names from the entrance_fees table.
 * Filters out non-Latin names (e.g., Japanese, Arabic) to prevent
 * the AI from outputting attraction names in wrong languages.
 * Only pass English/Latin-script names to the AI prompt.
 */
export async function fetchAttractionsList(supabase: any): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('entrance_fees')
      .select('attraction_name')
      .eq('is_active', true)
      .eq('is_addon', false) // Exclude add-ons

    if (!data) return []

    return data
      .map((a: any) => a.attraction_name)
      .filter((name: string) => {
        // Keep names that are primarily Latin characters (English, French, etc.)
        // Reject names that are primarily non-Latin (Japanese, Arabic, etc.)
        const latinChars = (name.match(/[a-zA-Z]/g) || []).length
        return latinChars > name.length * 0.3 // At least 30% Latin characters
      })
  } catch {
    return []
  }
}

// ============================================
// RICH CONTENT MAP (for deep AI integration)
// ============================================

export interface AttractionContent {
  contentId: string
  name: string
  title: string
  description: string
  highlights: string[]
  inclusions: string[]
  category: string
}

/**
 * Build a lookup map of content items indexed by lowercase name.
 * Preserves full tier-specific descriptions without truncation.
 */
export function buildAttractionContentMap(
  content: ContentItem[]
): Map<string, AttractionContent> {
  const map = new Map<string, AttractionContent>()
  for (const item of content) {
    if (!item.name) continue
    map.set(item.name.toLowerCase(), {
      contentId: item.id,
      name: item.name,
      title: item.title,
      description: item.description,
      highlights: item.highlights || [],
      inclusions: item.inclusions || [],
      category: item.category_name,
    })
  }
  return map
}

/**
 * Build a rich, prompt-friendly content context from the content map.
 * Prioritizes attractions that match the canonical entrance_fees names
 * (since those are the ones that actually appear in itineraries).
 *
 * @param contentMap   Attraction content indexed by name
 * @param attractionNames  Canonical attraction names from entrance_fees
 * @param maxCharBudget  Max characters for the content section (~750 tokens at 3000 chars)
 * @returns  { context: prompt string, matchedContentIds: IDs for usage logging }
 */
export function buildRichContentContext(
  contentMap: Map<string, AttractionContent>,
  attractionNames: string[],
  maxCharBudget: number = 3000
): { context: string; matchedContentIds: string[] } {
  const matchedContentIds: string[] = []
  const sections: string[] = []
  let charCount = 0

  // First pass: match canonical attraction names to content items (highest priority)
  for (const attrName of attractionNames) {
    const key = attrName.toLowerCase()
    const content = contentMap.get(key)
    if (!content || !content.description) continue

    const highlightsStr = content.highlights.length > 0
      ? `\n  Highlights: ${content.highlights.join(' | ')}`
      : ''
    const section = `\n[${content.name}] (${content.category}):\n  ${content.description}${highlightsStr}`

    if (charCount + section.length > maxCharBudget) break

    sections.push(section)
    matchedContentIds.push(content.contentId)
    charCount += section.length
  }

  // Second pass: add remaining content items not yet matched
  for (const [, content] of contentMap) {
    if (matchedContentIds.includes(content.contentId)) continue
    if (!content.description) continue

    const highlightsStr = content.highlights.length > 0
      ? `\n  Highlights: ${content.highlights.join(' | ')}`
      : ''
    const section = `\n[${content.name}] (${content.category}):\n  ${content.description}${highlightsStr}`

    if (charCount + section.length > maxCharBudget) break

    sections.push(section)
    matchedContentIds.push(content.contentId)
    charCount += section.length
  }

  if (sections.length === 0) {
    return { context: '', matchedContentIds: [] }
  }

  const context = `\n\nCURATED CONTENT LIBRARY (use these descriptions when writing about these sites):\n${sections.join('\n')}`

  console.log(`📚 Rich content context: ${sections.length} items, ${charCount} chars, ${matchedContentIds.length} content IDs`)

  return { context, matchedContentIds }
}

// ============================================
// CONTENT USAGE LOGGING (server-side)
// ============================================

/**
 * Log which content library items were used during itinerary generation.
 * Server-side version that accepts a supabase client parameter.
 */
export async function logContentUsage(
  supabase: any,
  contentIds: string[],
  tier: string,
  itineraryId: string,
  context: string = 'itinerary_generation'
): Promise<void> {
  if (contentIds.length === 0) return
  try {
    const { data: variations } = await supabase
      .from('content_variations')
      .select('id, content_id')
      .in('content_id', contentIds)
      .eq('tier', tier)

    if (!variations || variations.length === 0) return

    const logs = variations.map((v: any) => ({
      content_id: v.content_id,
      variation_id: v.id,
      itinerary_id: itineraryId,
      context,
    }))

    await supabase.from('content_usage_log').insert(logs)
    console.log(`📊 Logged content usage: ${logs.length} items for itinerary ${itineraryId}`)
  } catch (err) {
    console.warn('⚠️ Failed to log content usage:', err)
  }
}
