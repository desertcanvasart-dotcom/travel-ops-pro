import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { statusesBelow } from '@/lib/whatsapp-status'
import { toWhatsAppE164 } from '@/lib/whatsapp-phone'
import { outputBudget, assertNotCutOff } from '@/lib/translate-core'
import { tripClientTotal, seasonSupplementOf } from '@/lib/itinerary-client-price'
import { contractPrice, contractAmount } from '@/lib/contract-facts'
import { effectiveDueDate, tripCostBreakdown } from '@/lib/invoice-pdf-generator'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('WhatsApp', () => {
  it('a status only moves forward; failures never undo "read"', () => {
    expect(statusesBelow('read')).toEqual(expect.arrayContaining(['queued', 'sent', 'delivered']))
    expect(statusesBelow('sent')).not.toContain('read')
    expect(statusesBelow('sent')).not.toContain('delivered')
    expect(statusesBelow('undelivered')).toEqual(expect.arrayContaining(['sent', 'delivered']))
    expect(statusesBelow('undelivered')).not.toContain('read')
    expect(statusesBelow('receiving')).toEqual([])
  })

  it('phones are E.164; a 0-prefixed number needs its country code', () => {
    expect(toWhatsAppE164('81 90 1234 5678')).toBe('+819012345678')
    expect(toWhatsAppE164('+81 90-1234-5678')).toBe('+819012345678')
    expect(toWhatsAppE164('0081 90 1234 5678')).toBe('+819012345678')
    expect(toWhatsAppE164('whatsapp:+201001234567')).toBe('+201001234567')
    expect(toWhatsAppE164('090-1234-5678')).toBeNull()
    expect(toWhatsAppE164('123')).toBeNull()
  })

  it('the migration closes the open policies, the duplicate unread trigger, and admits every status', () => {
    const m = src('migrations/20261123_whatsapp_rls_unread_status.sql')
    expect(m).toContain('DROP POLICY IF EXISTS "Allow all for whatsapp_conversations"')
    expect(m).toContain('DROP POLICY IF EXISTS "Allow all for whatsapp_messages"')
    expect(m).toContain('DROP TRIGGER IF EXISTS trigger_update_conversation')
    expect(m).not.toMatch(/unread_count\s*=\s*CASE/)
    expect(m).toContain("'undelivered'")
  })

  it('routes: status forward-only, agents gated, conversation update allow-listed, client matched in the org', () => {
    expect(src('app/api/whatsapp/status-callback/route.ts')).toContain('.or(`status.is.null,status.in.(${replaceable.join(\',\')})`)')
    const agents = src('app/api/whatsapp/agents/route.ts')
    expect(agents.match(/requireRole\(MANAGERS\)/g)).toHaveLength(2)
    expect(agents).toContain("query = query.eq('user_id', userId)")
    expect(agents).not.toContain('...updates,\n        updated_at: new Date().toISOString()\n      })\n      .eq(\'id\', id)\n      .select()')
    const conv = src('app/api/whatsapp/conversations/route.ts')
    expect(conv).not.toContain('updateData = { ...updateData, ...updates }')
    expect(conv).toContain('toWhatsAppE164(phone_number)')
    expect(src('app/api/whatsapp/messages/route.ts')).toContain('toWhatsAppE164(phone_number)')
    const hook = src('app/api/whatsapp/webhook/route.ts')
    expect(hook).toContain(".eq('org_id', inboxOrgId)")
    expect(hook).not.toMatch(/\.eq\('phone', phoneNumber\)\s*\n\s*\.maybeSingle\(\)/)
  })

  it('the AI draft reads only the caller org', () => {
    const a = src('lib/ai/whatsapp-ai-agent.ts')
    expect(a.match(/\.eq\('org_id', this\.orgId\)/g)?.length).toBe(4)
    expect(a.match(/\.eq\('org_id', orgId\)/g)?.length).toBe(2)
    expect(a).not.toContain("select('full_name")
    expect(src('app/api/whatsapp/ai-agent/draft/route.ts')).toMatch(/phone_number \?\? '',\s*\n\s*orgId/)
  })
})

describe('itinerary content across orgs', () => {
  it("a service translation is only this trip's service", () => {
    const r = src('app/api/itineraries/[id]/days/[dayId]/services/[serviceId]/versions/[lang]/route.ts')
    expect(r).toContain(".eq('itinerary_days.itinerary_id', id)")
    expect(r.match(/assertItineraryInOrg\(id, orgId, dayId, serviceId\)/g)).toHaveLength(2)
  })
  it("the pricing grid updates only the caller org's trip", () => {
    const g = src('app/api/pricing-grid/save/route.ts')
    expect(g).toContain(".eq('org_id', callerOrgId)\n        .maybeSingle()")
    expect(g).toMatch(/\.update\(itineraryData\)\s*\n\s*\.eq\('id', config\.itineraryId\)\s*\n\s*\.eq\('org_id', callerOrgId\)/)
  })
})

describe('translation', () => {
  it('the token budget grows with the text, and a cut-off answer is an error', () => {
    expect(outputBudget(100, 1000)).toBe(1000)
    expect(outputBudget(2000, 1000)).toBe(6000)
    expect(outputBudget(1e7, 1000)).toBe(16000)
    expect(() => assertNotCutOff('length')).toThrow(/cut off/)
    expect(() => assertNotCutOff('stop')).not.toThrow()
  })
})

describe('numbers on documents', () => {
  const days = [{ services: [{ client_price: 500000 }, { client_price: 500000 }] }]

  it('the client total carries the season premium', () => {
    expect(tripClientTotal({ total_cost: 1150000, season_uplift_amount: 150000 }, days)).toBe(1150000)
    expect(tripClientTotal({ total_cost: 1150000 }, days)).toBe(1000000)
    expect(tripClientTotal({ total_cost: 777 }, [])).toBe(777)
    expect(seasonSupplementOf({ season_uplift_amount: -5 })).toBe(0)
  })

  it('the quote PDF prints the premium as a row and labels in its language', () => {
    const pdf = src('lib/pdf-generator.ts')
    expect(pdf).toContain('serviceRows.push([labels.seasonSupplement')
    for (const k of ["'TOTAL PRICE', pageWidth", "'No services calculated yet', margin", '`Page ${i} of ${totalPages}`, pageWidth']) {
      expect(pdf).not.toContain(`doc.text(${k}`)
    }
    for (const lang of ['en', 'ja']) {
      const m = JSON.parse(src(`messages/${lang}.json`)).pdf
      for (const key of ['totalPrice', 'perPersonParen', 'seasonSupplement', 'packageIncludes', 'noServicesYet', 'pageOf']) {
        expect(m[key], `${lang}.pdf.${key}`).toBeTruthy()
      }
    }
    expect(src('migrations/20261124_itinerary_season_supplement.sql')).toContain('ADD COLUMN IF NOT EXISTS season_uplift_amount')
    expect(src('app/api/pricing-grid/save/route.ts')).toContain('season_uplift_amount: actualClientTotal > 0')
  })

  it('contracts print the currency’s own decimals', () => {
    expect(contractPrice(1150001.25, 'JPY')).toBe('JPY 1,150,001')
    expect(contractAmount(383333.75, 'JPY')).toBe('JPY 383,334')
    expect(contractAmount(937.5, 'EUR')).toBe('EUR 937.50')
  })

  it('a final invoice is due on the booking balance date, not "On Arrival"', () => {
    expect(effectiveDueDate({ due_date: null, balance_due_date: '2026-09-04' }, 'final')).toBe('2026-09-04')
    expect(effectiveDueDate({ due_date: '2026-08-01', balance_due_date: '2026-09-04' }, 'final')).toBe('2026-08-01')
    expect(effectiveDueDate({ due_date: null, balance_due_date: '2026-09-04' }, 'deposit')).toBeNull()
    expect(src('lib/invoice-pdf-generator.ts')).not.toContain("'On Arrival'")
    expect(src('app/api/whatsapp/send-invoice/route.ts')).not.toContain("'On Arrival'")
  })

  it('the office page and the PDF compute one breakdown', () => {
    const b = tripCostBreakdown({ total_amount: 370873, deposit_percent: 20, full_trip_cost: 1866567 }, 'deposit')
    expect(b).toEqual({ fullTripCost: 1866567, depositAmount: 370873, balanceAmount: 1495694 })
    expect(src('app/invoices/[id]/page.tsx')).toContain('tripCostBreakdown(invoice, invoice.invoice_type)')
    expect(src('app/invoices/[id]/page.tsx')).not.toContain('.toFixed(2)')
  })

  it("dates are the business's, not UTC's", () => {
    expect(src('lib/booking-creation.ts')).toContain('booked_on: input.bookedOn ?? businessToday()')
    expect(src('app/api/whatsapp/send-contract/route.ts')).toContain('contractDate: `${businessToday()}T12:00:00Z`')
    for (const p of ['app/itineraries/[id]/page.tsx', 'app/itineraries/[id]/edit/page.tsx', 'app/invoices/invoices-content.tsx']) {
      expect(src(p), p).toContain('addDays(todayLocal(), 14)')
    }
  })

  it('the inline cost edit keeps client prices and the premium', () => {
    const page = src('app/itineraries/[id]/page.tsx')
    expect(page).toContain('const newTotalCost = tripClientTotal(itinerary as never, updatedDays as never)')
    expect(page).not.toContain("Number((itinerary as any)?.margin_percent) || 25")
  })
})

describe('grid save keeps what hangs off the days', () => {
  const m = src('migrations/20261126_pricing_grid_save_in_place.sql')
  it('days and services are updated in place, only the removed ones deleted', () => {
    expect(m).toContain('CREATE OR REPLACE FUNCTION public.save_pricing_grid_days(p_itinerary_id uuid, p_days jsonb)')
    expect(m).toContain('update public.itinerary_days set')
    expect(m).toContain('update public.itinerary_services set')
    expect(m).toContain('and not (id = any(v_keep_svcs))')
    expect(m).toContain('and not (id = any(v_keep_days))')
    // never the old blanket wipe
    expect(m).not.toMatch(/delete from public\.itinerary_days where itinerary_id = p_itinerary_id;/)
  })
  it('the grid loads and saves the trip’s own text, never a translation', () => {
    expect(src('app/pricing-grid/page.tsx')).toContain('/days?language=source')
    expect(src('app/pricing-grid/page.tsx')).not.toContain('/days?language=en')
    expect(src('app/api/itineraries/[id]/days/route.ts')).toContain("const sourceOnly = language === 'source'")
  })
})

describe('the ops sheet’s English follows the Japanese', () => {
  it('reads status and fingerprint, and the source-language rows', () => {
    const r = src('app/api/documents/operations-sheet/route.ts')
    expect(r).toContain("status, source_hash')")
    expect(r).toContain('ensureEnglishDayVersions(supabase, days ?? [], versions, sourceVersions)')
    expect(src('lib/itineraries/english-day-text.ts')).toContain("source_hash: hashOf.get(row.itinerary_day_id)")
  })
})

describe('services added after a language exists', () => {
  it('Translate all translates them; copy-translate leaves no half-made language', () => {
    expect(src('app/api/itineraries/[id]/day-translations/route.ts')).toContain('translateMissingServiceVersions(supabase, id, sourceLanguage, language, dayIds)')
    const ct = src('app/api/itineraries/[id]/versions/copy-translate/route.ts')
    expect(ct.match(/withVersionRollback\(newVersion\.id/g)).toHaveLength(2)
    expect(ct).toContain(".from('itinerary_versions').delete().eq('id', versionId)")
  })
})
