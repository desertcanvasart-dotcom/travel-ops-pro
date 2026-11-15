import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OPTIONAL_PAGE, TOUR_PAGE, WITHDRAWN_PAGE } from '../fixtures/website-pages'
import {
  cleanPageId, clearWebsitePageCache, fetchWebsitePage, jstDateFromUnix, parseOptionalPage, parseTourPage, websiteOrigin, websitePageUrl,
} from '@/lib/intake/website-page'

// The website's buttons open our /order carrying a page id (and a date);
// the server reads the page itself for code, title and the fare the
// customer saw. These pin what is read and what may be fetched.

describe('website page reader', () => {
  beforeEach(() => clearWebsitePageCache())

  it('reads a programme: code, title, every dated adult fare (dt = JST midnight)', () => {
    const p = parseTourPage(TOUR_PAGE, '2297504', 'u')
    expect(p.code).toBe('NEK502')
    expect(p.title).toBe('★国内線で楽々★エジプト5日間 ギザ＆ルクソール')
    expect(p.withdrawn).toBe(false)
    expect(p.fares).toEqual({ '2026-11-22': 364000, '2026-11-23': 364000, '2027-08-30': 366000 })
  })

  it('reads an optional tour: flat adult and child fares', () => {
    const p = parseOptionalPage(OPTIONAL_PAGE, '104', 'u')
    expect(p).toMatchObject({ code: 'CAI-10046-MUS', title: '【プライベートツアー】3大博物館めぐり（日本語ガイド・昼食付）', adultJpy: 38500, childJpy: 29000, withdrawn: false })
  })

  it('knows a withdrawn page', () => {
    expect(parseTourPage(WITHDRAWN_PAGE, '1', 'u')).toMatchObject({ withdrawn: true, code: 'NEK803', fares: {} })
  })

  it('a dt is the Japan date, not the UTC one', () => {
    expect(jstDateFromUnix('1795273200')).toBe('2026-11-22') // 2026-11-21T15:00Z
    expect(jstDateFromUnix('abc')).toBeNull()
    expect(jstDateFromUnix(undefined)).toBeNull()
  })

  it('only digits make a page id; only https makes an origin', () => {
    expect(cleanPageId('2297504')).toBe('2297504')
    expect(cleanPageId('1&x=../evil')).toBeNull()
    expect(cleanPageId('https://evil.example/')).toBeNull()
    expect(websiteOrigin({ ORDER_WEBSITE_ORIGIN: 'https://tour.example.jp/path' })).toBe('https://tour.example.jp')
    expect(websiteOrigin({ ORDER_WEBSITE_ORIGIN: 'http://tour.example.jp' })).toBeNull()
    expect(websiteOrigin({})).toBeNull()
    expect(websitePageUrl('https://t.example', 'optional', '67')).toBe('https://t.example/opt_detail.php?id=67')
  })

  it('fetches the configured website only, reads the whole calendar, caches, never throws', async () => {
    const fetchImpl = vi.fn(async () => new Response(TOUR_PAGE, { status: 200 }))
    const p = await fetchWebsitePage('tour', '2297504', { origin: 'https://t.example', fetchImpl: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledWith('https://t.example/detail.php?id=2297504&d=ALL&hf=1', expect.anything())
    expect(p?.url).toBe('https://t.example/detail.php?id=2297504')
    await fetchWebsitePage('tour', '2297504', { origin: 'https://t.example', fetchImpl: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    expect(await fetchWebsitePage('tour', 'x/../1', { origin: 'https://t.example', fetchImpl: fetchImpl as never })).toBeNull()
    expect(await fetchWebsitePage('tour', '5', { origin: null, fetchImpl: fetchImpl as never })).toBeNull()
    const down = vi.fn(async () => { throw new Error('timeout') })
    expect(await fetchWebsitePage('optional', '9', { origin: 'https://t.example', fetchImpl: down as never })).toBeNull()
    const missing = vi.fn(async () => new Response('nope', { status: 404 }))
    expect(await fetchWebsitePage('optional', '8', { origin: 'https://t.example', fetchImpl: missing as never })).toBeNull()
  })
})
