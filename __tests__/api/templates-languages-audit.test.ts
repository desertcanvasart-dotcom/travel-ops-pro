// Communicate › Message Templates and the copy-translate routes (audit T1,
// T4, T5, T6, L1, L3). Behaviour that lives in pure helpers is tested there
// (template-send, whatsapp-outbound); these pin the wiring a unit test cannot
// reach — the middleware gates, the page's error handling, the removed dead
// code, and the order of operations in the translate routes.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { replaceableDayVersionIds } from '@/lib/itineraries/content-language'

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const middleware = src('middleware.ts')

describe('who reaches Message Templates (T1)', () => {
  it('the templates page (/settings/message-templates) is agent-and-above, as the menu shows it', () => {
    expect(middleware).toContain("'/settings/message-templates': ['admin', 'manager', 'agent'],")
  })
  it('/api/templates reads are staff-only', () => {
    const block = middleware.match(/const STAFF_ONLY_API_PREFIXES = \[([\s\S]*?)\n\]/)
    expect(block).toBeTruthy()
    expect(block![1]).toContain("'/api/templates',")
  })
})

describe('saving and deleting templates (T4)', () => {
  it('both create and update answer a duplicate through templateSaveFailure', () => {
    expect(src('app/api/templates/route.ts')).toContain("templateSaveFailure(error, 'Failed to create template')")
    expect(src('app/api/templates/[id]/route.ts')).toContain("templateSaveFailure(error, 'Failed to update template')")
  })
  it('the page tells the operator when a save or delete fails', () => {
    const page = src('app/settings/message-templates/page.tsx')
    expect(page).toContain("dialog.alert(t('errors.saveFailed')")
    expect(page).toContain("dialog.alert(t('errors.deleteFailed')")
  })
})

describe('dead code removed (T5, T6)', () => {
  it('the /use route that called a non-existent RPC is gone, and nothing calls it', () => {
    expect(existsSync(join(ROOT, 'app/api/templates/[id]/use/route.ts'))).toBe(false)
    expect(src('app/settings/message-templates/page.tsx')).not.toContain('/use`')
  })
  it('the send route no longer bumps usage_count on a (possibly shared) template row', () => {
    expect(src('app/api/templates/send/route.ts')).not.toMatch(/usage_count:/)
  })
  it('the unused QuickSendButton is gone', () => {
    expect(existsSync(join(ROOT, 'components/QuickSendButton.tsx'))).toBe(false)
  })
})

describe('itinerary copy-translate with forceRetranslate (L1)', () => {
  it('replaces only machine-made day text', () => {
    expect(replaceableDayVersionIds([
      { id: 'a', status: 'machine' },
      { id: 'b', status: 'reviewed' },
      { id: 'c', status: null },
    ])).toEqual(['a'])
  })
  it('clears the old translation only after the new text is translated', () => {
    const route = src('app/api/itineraries/[id]/versions/copy-translate/route.ts')
    const post = route.slice(route.indexOf('export async function POST'))
    // No delete runs in the request before translation...
    const firstTranslate = post.indexOf('await translateFields(')
    const firstClear = post.indexOf('await clearOldTranslation()')
    expect(firstTranslate).toBeGreaterThan(0)
    expect(firstClear).toBeGreaterThan(firstTranslate)
    expect(post).not.toMatch(/\.from\('itinerary_day_versions'\)\s*\.delete\(\)/)
    // ...and every new version row is written right after the clear.
    expect(post.match(/await clearOldTranslation\(\)\s*const \{ data: newVersion/g)).toHaveLength(2)
  })
})

describe('B2B quote copy-translate (L3)', () => {
  const route = src('app/api/b2b/quotes/[id]/versions/copy-translate/route.ts')
  it('detects the source language instead of assuming English', () => {
    expect(route).toContain('detectContentLanguage([quote.notes])')
    expect(route).not.toContain("'en' as Language")
    expect(route).toContain('sourceLanguage: baseLanguage')
  })
  it('the quote page shows a failed translation', () => {
    expect(src('app/b2b/quotes/[id]/page.tsx')).toMatch(/dialog\.alert\(t\('versionFailed'\), data\.error/)
  })
})
