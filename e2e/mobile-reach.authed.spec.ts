import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

// A control that sits past the right edge of a phone, with nothing that can
// scroll to it, cannot be used at all — and this is invisible on the desktop
// the operator develops on. "Add Rate" on /rates/hotels was at x=638 on a
// 375px screen: you could not add a hotel rate from a phone.
//
// Only genuinely unreachable controls fail. A button inside a horizontally
// scrollable strip is fine — the user swipes to it — and the suppliers and
// templates filter chips are deliberately built that way.

test.setTimeout(180_000)
test.use({ storageState: STORAGE_STATE, viewport: { width: 375, height: 812 } })

const ROUTES = [
  '/dashboard', '/bookings', '/clients', '/itineraries', '/suppliers',
  '/payments', '/invoices', '/rates/hotels', '/rates/cruises', '/templates',
]

test('no header control is stranded off-screen at 375px', async ({ page }) => {
  const stranded: string[] = []

  for (const route of ROUTES) {
    await page.goto(route)
    await page.waitForTimeout(1200)

    const offscreen = await page.evaluate(() => {
      const de = document.documentElement
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('button, a[href]'))) {
        if (el.closest('aside, nav, [class*="Sidebar"]')) continue
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        if (b.top > 400) continue                    // the header area
        if (b.right <= de.clientWidth + 2) continue

        let scrollable = false
        let anc: Element | null = el.parentElement
        while (anc) {
          const ox = getComputedStyle(anc).overflowX
          if ((ox === 'auto' || ox === 'scroll') && anc.scrollWidth > anc.clientWidth + 2) {
            scrollable = true
            break
          }
          anc = anc.parentElement
        }
        if (!scrollable) {
          out.push(`"${(el.textContent || '').trim().slice(0, 24)}" ends at ${Math.round(b.right)}px`)
        }
      }
      return [...new Set(out)]
    })

    for (const item of offscreen) stranded.push(`${route}: ${item}`)
  }

  expect(stranded, 'controls unreachable on a 375px screen').toEqual([])
})
