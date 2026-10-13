'use client'

import { readHandoffText, decodeTextParam } from '@/lib/text-handoff'

import { todayLocal } from '@/lib/today'
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { GridConfig, GridDay, AllRates, SlotValue, GridTotals, GridFixedCosts } from './types'
import { SLOT_DEFINITIONS } from './types'
import { calculateGrandTotals, calculateDay, countMissingGuideBeds, convertAmount } from './lib/calculator'
import { gridCompleteness } from './lib/grid-completeness'
import type { SeasonWindow } from '@/lib/pricing/season-uplift'
import { mapServicesToSlots } from './lib/slot-mapping'
import { hydrateDays } from './lib/hydrate-items'
import { dropLegacyFixedCostPicks } from './lib/fixed-cost-lines'
import { displayFx, shownSymbol } from './lib/display-fx'
import type { ExchangeRates } from '@/lib/currency-service'
import { alignGuideLanguage, guideLanguages, majorityGuideLanguage } from './lib/guide-language'
import GridHeader from './components/GridHeader'
import ClientInfoBar from './components/ClientInfoBar'
import InputPanel from './components/InputPanel'
import DayRow from './components/DayRow'
import GridSummary from './components/GridSummary'

// ============================================
// LOCAL STORAGE PERSISTENCE
// ============================================

const STORAGE_KEY_CONFIG = 'pricing-grid-config'
const STORAGE_KEY_DAYS = 'pricing-grid-days'

function saveToStorage(key: string, data: any) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch (e) { /* ignore */ }
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) return JSON.parse(stored) as T
  } catch (e) { /* ignore */ }
  return fallback
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY_CONFIG)
    localStorage.removeItem(STORAGE_KEY_DAYS)
  } catch (e) { /* ignore */ }
}

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: GridConfig = {
  pax: 2,
  passport: 'non_eu',
  tier: 'standard',
  guideMode: 'spot',
  clientType: 'b2c',
  packageType: 'full-package',
  withGuide: true,
  currency: 'EUR',
  marginPercent: 25,
  exchangeRate: null,
  startDate: todayLocal(),
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  tourName: '',
  nationality: '',
  itineraryId: null,
  itineraryCode: null,
  partnerId: null,
  partnerName: '',
}

// ============================================
// HELPERS
// ============================================

function createEmptyDay(dayNumber: number): GridDay {
  return {
    id: crypto.randomUUID(),
    dayNumber,
    title: `Day ${dayNumber}`,
    city: '',
    description: '',
    isExpanded: false,
    slots: SLOT_DEFINITIONS.map(def => ({
      slotId: def.slotId,
      selectedItems: [],
      customAmount: 0,
    })),
  }
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function PricingGridPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6 text-center text-gray-500">Loading...</div>}>
      <PricingGridContent />
    </Suspense>
  )
}

function PricingGridContent() {
  const router = useRouter()
  const [config, setConfig] = useState<GridConfig>(() =>
    loadFromStorage(STORAGE_KEY_CONFIG, DEFAULT_CONFIG)
  )
  // A draft from before the grid charged Rates › Fixed Costs itself may hold
  // the old Water pick: dropped, the automatic lines replace it.
  const [days, setDays] = useState<GridDay[]>(() =>
    dropLegacyFixedCostPicks(loadFromStorage<GridDay[]>(STORAGE_KEY_DAYS, []))
  )
  const [rates, setRates] = useState<AllRates | null>(null)
  // The Rates › Fixed Costs the grid charges on every sightseeing day, from
  // the same request as the rates, with the warnings to show.
  const [fixedCosts, setFixedCosts] = useState<GridFixedCosts>({ items: [], warnings: [] })
  const guideLanguageList = useMemo(() => guideLanguages(rates?.guide ?? []), [rates])
  // The operator's own high dates, loaded once. The grid is the other screen
  // that quotes a departure, so it reads the same calendar the B2B engine does.
  const [seasonWindows, setSeasonWindows] = useState<SeasonWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null)
  const [savedQuoteNumber, setSavedQuoteNumber] = useState<string | null>(null)

  // The company's default margin (the user's own, else the company's — the
  // figure the grid opens with): where the grid resets a margin, it resets
  // to this, not to a hard-coded 25 / 10.
  const [defaultMargin, setDefaultMargin] = useState<number>(DEFAULT_CONFIG.marginPercent)

  const isInitialLoad = useRef(true)

  // Persist to localStorage
  useEffect(() => {
    if (isInitialLoad.current) return
    saveToStorage(STORAGE_KEY_CONFIG, config)
  }, [config])

  useEffect(() => {
    if (isInitialLoad.current) return
    saveToStorage(STORAGE_KEY_DAYS, days)
  }, [days])

  useEffect(() => {
    isInitialLoad.current = false
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/pricing/seasons')
        const data = await res.json()
        if (cancelled || !data.success) return
        setSeasonWindows(
          (data.data || []).flatMap((season: any) =>
            (season.pricing_season_dates || []).map((w: any) => ({
              seasonId: season.id,
              name: season.name,
              upliftPercent: Number(season.uplift_percent) || 0,
              startDate: w.start_date,
              endDate: w.end_date,
            }))
          )
        )
      } catch {
        // A calendar we cannot read is an ordinary date, never a guessed premium.
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Load user preferences as defaults (tier, margin, currency) on first load
  const hasLoadedPrefs = useRef(false)
  useEffect(() => {
    if (hasLoadedPrefs.current) return
    hasLoadedPrefs.current = true
    // Only apply preferences if config is at defaults (no localStorage override)
    const isDefault = config.tier === DEFAULT_CONFIG.tier &&
      config.marginPercent === DEFAULT_CONFIG.marginPercent &&
      config.currency === DEFAULT_CONFIG.currency

    const loadPrefs = async () => {
      try {
        const res = await fetch('/api/user-preferences')
        const data = await res.json()
        if (data.success && data.data) {
          const prefs = data.data
          if (typeof prefs.default_margin_percent === 'number') setDefaultMargin(prefs.default_margin_percent)
          if (!isDefault) return
          setConfig(prev => ({
            ...prev,
            tier: prefs.default_tier || prev.tier,
            marginPercent: prefs.default_margin_percent ?? prev.marginPercent,
            currency: prefs.default_currency || prev.currency,
          }))
        }
      } catch (err) {
        console.error('Failed to load user preferences:', err)
      }
    }
    loadPrefs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch rates
  // The header's guide language changed: every day's guide moves to it.
  const changeConfig = (next: GridConfig) => {
    if (rates && next.guideLanguage && next.guideLanguage !== config.guideLanguage) {
      const { days: aligned, changed, unmatched } = alignGuideLanguage(days, rates.guide, next.guideLanguage)
      if (changed.length) setDays(aligned)
      if (unmatched.length) {
        setSaveMessage(`No ${next.guideLanguage} guide in the city of day ${unmatched.join(', ')} — those days keep their guide.`)
      } else if (changed.length) {
        setSaveMessage(`${next.guideLanguage} guide on day ${changed.join(', ')}`)
      }
    }
    setConfig(next)
  }

  // A tier change starts a new request while an older one may still be in
  // flight; only the latest may land — a late answer for the old tier put
  // that tier's hotels in the list (autoura-saas, 2026-10-10: a budget hotel
  // missing on one device). The tier travels with the rates, so the hotel
  // swap below never reads another tier's list.
  const ratesRequestRef = useRef(0)
  const [ratesTier, setRatesTier] = useState<string | null>(null)
  const fetchRates = useCallback(async (tier: string) => {
    const requestId = ++ratesRequestRef.current
    try {
      setLoading(true)
      const res = await fetch(`/api/pricing-grid/rates?tier=${encodeURIComponent(tier)}`)
      const data = await res.json()
      if (requestId !== ratesRequestRef.current) return
      if (data.success) {
        setRates(data.data)
        setFixedCosts({
          items: Array.isArray(data.fixedCosts?.items) ? data.fixedCosts.items : [],
          warnings: Array.isArray(data.fixedCosts?.warnings) ? data.fixedCosts.warnings : [],
        })
        setRatesTier(tier)
        // A draft restored from this browser is re-priced from these rates
        // by the effect below (hydrate-items.ts).
      }
    } catch (err) {
      console.error('Failed to fetch rates:', err)
    } finally {
      if (requestId === ratesRequestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRates(config.tier)
  }, [config.tier, fetchRates])

  // Auto-swap accommodation and cruise when tier changes — on the rates OF
  // the new tier (ratesTier), never a list still held from the old one. A
  // tier set by opening a saved itinerary is not a change: its hotels are
  // its own (the load sets the ref).
  const prevTierRef = useRef(config.tier)
  useEffect(() => {
    if (!rates || !ratesTier || ratesTier !== config.tier) return
    // Only run when tier actually changed (not on initial load)
    if (prevTierRef.current === ratesTier) return
    prevTierRef.current = ratesTier
    if (days.length === 0) return

    setDays(prevDays => prevDays.map(day => ({
      ...day,
      slots: day.slots.map(slot => {
        // Swap accommodation: match by city
        if (slot.slotId === 'accommodation' && slot.selectedItems.length > 0) {
          const dayCity = day.city?.toLowerCase()?.trim()
          const newHotel = (rates as AllRates).accommodation.find(
            (r: any) => r.city?.toLowerCase()?.trim() === dayCity
          )
          if (newHotel) {
            return {
              ...slot,
              selectedItems: [{
                rateId: newHotel.id,
                name: newHotel.name,
                rateEur: newHotel.rateEur,
                rateNonEur: newHotel.rateNonEur,
              }],
            }
          }
          // No hotel in new tier for this city — clear selection
          return { ...slot, selectedItems: [] }
        }

        // Swap cruise: pick the first cruise in the new tier
        if (slot.slotId === 'cruise' && slot.selectedItems.length > 0) {
          const newCruise = (rates as AllRates).cruise[0]
          if (newCruise) {
            return {
              ...slot,
              selectedItems: [{
                rateId: newCruise.id,
                name: newCruise.name,
                rateEur: newCruise.rateEur,
                rateNonEur: newCruise.rateNonEur,
              }],
            }
          }
          return { ...slot, selectedItems: [] }
        }

        return slot
      }),
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, ratesTier])

  // Every pick re-priced from the rate it names, at the group's size
  // (hydrate-items.ts): a parsed or reloaded item arrives without its dated
  // periods or guide bed, a swapped hotel without its supplements, a vehicle
  // picked for 2 stays a sedan for 8 — and a draft restored from this browser
  // carries whatever prices it was saved with. Only on the rates OF the
  // current tier: a hotel of the trip's tier is not "missing" from another
  // tier's list while that list is still loading. Declared after the tier
  // swap, so a swapped hotel is filled in the same pass.
  useEffect(() => {
    if (!rates || ratesTier !== config.tier) return
    // On the latest days (an update queued in the same pass — the swap —
    // is not overwritten); the same array back when nothing changed.
    setDays(prev => hydrateDays(prev, rates, config.pax).days)
  }, [days, rates, ratesTier, config.tier, config.pax])

  // What the figures are in, and the rates to show them in the chosen
  // currency (display-fx.ts). Every amount is in the company's RATE currency;
  // the grid applied EUR→X factors to it, and kept a stale one when the
  // chosen currency had none.
  const [fx, setFx] = useState<{ rateCurrency: string | null; rates: ExchangeRates | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/pricing-grid/fx')
        const data = await res.json()
        if (cancelled) return
        setFx(data.success && data.data
          ? { rateCurrency: data.data.rateCurrency ?? null, rates: data.data.rates ?? null }
          : { rateCurrency: null, rates: null })
      } catch (err) {
        console.error('Failed to load exchange rates:', err)
        if (!cancelled) setFx({ rateCurrency: null, rates: null })
      }
    })()
    return () => { cancelled = true }
  }, [])

  // --- URL Params: Auto-load conversation from inbox redirect ---
  const searchParams = useSearchParams()
  const hasProcessedParams = useRef(false)
  const pendingParseText = useRef<string | null>(null)

  // Effect 1: Decode URL params and store text for parsing
  useEffect(() => {
    if (hasProcessedParams.current) return
    // The conversation is parked in sessionStorage and only its key travels in
    // the URL — a long thread in the query string is an HTTP 431 the app never
    // sees. `conversation` is the legacy shape, kept for older links.
    const conversationKeyParam = searchParams?.get('conversationKey')
    const conversationParam = searchParams?.get('conversation')
    if (!conversationKeyParam && !conversationParam) return
    hasProcessedParams.current = true

    let decodedText = ''

    if (conversationKeyParam) {
      const stashed = readHandoffText(conversationKeyParam)
      if (stashed === null) {
        // The key outlived its text (URL copied to another tab, or reopened
        // later). Nothing to price; leave the grid as it was.
        console.warn('Conversation handover expired:', conversationKeyParam)
        return
      }
      decodedText = stashed
    } else if (conversationParam) {
      const isBase64 = searchParams?.get('encoded') === 'base64'
      decodedText = conversationParam
      if (isBase64) {
        try {
          decodedText = decodeTextParam(conversationParam)
        } catch (e) {
          console.error('Failed to decode base64 conversation:', e)
          try { decodedText = decodeURIComponent(conversationParam) } catch { /* use raw */ }
        }
      }
    }

    // Clear existing state — start fresh for this new conversation
    setDays([])
    setSaveMessage(null)
    setSavedQuoteId(null)
    setSavedQuoteNumber(null)

    // Pre-fill client info from URL params and reset itinerary link
    const emailParam = searchParams?.get('email')
    const phoneParam = searchParams?.get('phone')
    const clientNameParam = searchParams?.get('clientName')
    // The client record the conversation is with (the inbox matched it): the
    // save links the trip to it.
    const clientIdParam = searchParams?.get('clientId')
    setConfig(prev => ({
      ...prev,
      clientEmail: emailParam || '',
      clientPhone: phoneParam || '',
      clientName: clientNameParam || '',
      clientId: clientIdParam || null,
      itineraryId: null,
      itineraryCode: null,
    }))

    // Clear localStorage so reload doesn't bring back old data
    clearStorage()

    // Clean URL (remove params without page reload)
    window.history.replaceState({}, '', '/pricing-grid')

    // Store decoded text — the rates effect will trigger parsing when ready
    if (decodedText.trim()) {
      pendingParseText.current = decodedText
    }
   
  }, [searchParams])

  // Effect 2: Auto-parse once rates are loaded (fires immediately if rates already exist)
  useEffect(() => {
    if (!rates || !pendingParseText.current) return
    const text = pendingParseText.current
    pendingParseText.current = null // Clear to prevent re-firing
    handleParseDays(text)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates])

  // --- Day Management ---
  const addDay = () => setDays(prev => [...prev, createEmptyDay(prev.length + 1)])

  const removeDay = (dayId: string) => {
    setDays(prev => prev.filter(d => d.id !== dayId).map((d, i) => ({ ...d, dayNumber: i + 1 })))
  }

  const toggleExpand = (dayId: string) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, isExpanded: !d.isExpanded } : d))
  }

  const expandAll = () => setDays(prev => prev.map(d => ({ ...d, isExpanded: true })))
  const collapseAll = () => setDays(prev => prev.map(d => ({ ...d, isExpanded: false })))

  // Jump to a day from the day bar: open it and bring it into view.
  const jumpToDay = (dayId: string) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, isExpanded: true } : d))
    requestAnimationFrame(() =>
      document.getElementById(`grid-day-${dayId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const updateDay = (dayId: string, partial: Partial<GridDay>) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, ...partial } : d))
  }

  const updateSlot = (dayId: string, slotId: string, value: SlotValue) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d
      let updatedSlots = d.slots.map(s => s.slotId === slotId ? value : s)

      // Reactive meal adjustment: when accommodation changes, update meals based on board basis
      if (slotId === 'accommodation' && rates) {
        const hotelId = value.selectedItems[0]?.rateId
        const hotelRate = (rates as AllRates).accommodation.find((r: any) => r.id === hotelId)
        const boardBasis = ((hotelRate as any)?.board_basis || 'BB').toUpperCase()
        const cityLower = d.city?.toLowerCase()?.trim()

        // Determine which outside meals are needed
        let needsLunch = false
        let needsDinner = false
        switch (boardBasis) {
          case 'FB': case 'AI': break // All meals included
          case 'HB': needsLunch = true; break // Dinner included, need lunch
          case 'BB': case 'RO': default: needsLunch = true; needsDinner = true; break
        }

        // Find meal rates for this city
        const cityMeals = (rates as AllRates).meals.filter(
          (m: any) => m.city?.toLowerCase()?.trim() === cityLower
        )
        const lunch = cityMeals.find((m: any) => /lunch/i.test(m.category || m.name || ''))
        const dinner = cityMeals.find((m: any) => /dinner/i.test(m.category || m.name || ''))

        const mealItems: typeof value.selectedItems = []
        if (needsLunch && lunch) {
          mealItems.push({ rateId: lunch.id, name: lunch.name, rateEur: lunch.rateEur, rateNonEur: lunch.rateNonEur })
        }
        if (needsDinner && dinner) {
          mealItems.push({ rateId: dinner.id, name: dinner.name, rateEur: dinner.rateEur, rateNonEur: dinner.rateNonEur })
        }

        updatedSlots = updatedSlots.map(s =>
          s.slotId === 'meals' ? { ...s, selectedItems: mealItems } : s
        )
      }

      return { ...d, slots: updatedSlots }
    }))
  }

  // --- Clear All ---
  const handleClearAll = () => {
    setDays([])
    setConfig({ ...DEFAULT_CONFIG, marginPercent: defaultMargin })
    clearStorage()
    setSaveMessage(null)
  }

  // --- Parse Text via AI ---
  const handleParseDays = async (text: string) => {
    try {
      setIsParsing(true)
      setSaveMessage(null)
      // Clear old data immediately so the loading indicator shows
      // and the user knows a fresh parse is starting
      setDays([])
      setConfig(prev => ({ ...prev, itineraryId: null, itineraryCode: null }))
      const res = await fetch('/api/pricing-grid/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tier: config.tier, pax: config.pax, package_type: config.packageType })
      })
      const data = await res.json()
      if (data.success && data.days) {
        const parsedDays: GridDay[] = data.days.map((pd: any, idx: number) => ({
          id: crypto.randomUUID(),
          dayNumber: pd.dayNumber || idx + 1,
          title: pd.title || `Day ${idx + 1}`,
          city: pd.city || '',
          description: pd.description || '',
          isExpanded: false,
          slots: SLOT_DEFINITIONS.map(def => {
            const slotData = pd.slots?.[def.slotId]
            if (!slotData) return { slotId: def.slotId, selectedItems: [], customAmount: 0 }
            return {
              slotId: def.slotId,
              selectedItems: (slotData.selectedItems || []).map((item: any) => ({
                rateId: item.rateId,
                name: item.name,
                rateEur: item.rateEur || 0,
                rateNonEur: item.rateNonEur || 0,
              })),
              customAmount: slotData.customAmount || 0,
            }
          }),
        }))
        // Every pick takes its rate as the rates list has it — periods, guide
        // bed, the non-EU price — and the vehicle for the group the text
        // names (hydrate-items.ts). The parse's own prices are not used.
        const groupSize = Number(data.metadata?.pax) > 0 ? Number(data.metadata.pax) : config.pax
        let ready = rates ? hydrateDays(parsedDays, rates, groupSize).days : parsedDays
        // One guide language for the trip: the one set in the header, else
        // the one most days came back with (guide-language.ts).
        const guideLanguage = rates ? (config.guideLanguage || majorityGuideLanguage(ready, rates.guide)) : null
        if (rates && guideLanguage) {
          ready = alignGuideLanguage(ready, rates.guide, guideLanguage).days
          if (!config.guideLanguage) setConfig(prev => ({ ...prev, guideLanguage }))
        }
        setDays(ready)
        // Show indicator if itinerary was AI-generated (not parsed from detailed text)
        if (data.generationMode === 'generated') {
          setSaveMessage('✨ AI-suggested itinerary based on inquiry — review and adjust as needed')
        }
        // Apply AI-extracted metadata to config (URL params take precedence)
        const meta = data.metadata
        setConfig(prev => ({
          ...prev,
          itineraryId: null,
          itineraryCode: null,
          // Only apply metadata fields if they exist and the field isn't already set
          ...(meta?.pax != null && { pax: meta.pax }),
          ...(meta?.startDate && { startDate: meta.startDate }),
          ...(meta?.passport && { passport: meta.passport as 'eu' | 'non_eu' }),
          ...(meta?.tourName && { tourName: meta.tourName }),
          ...(meta?.nationality && { nationality: meta.nationality }),
          // Client name: URL param takes precedence, then AI-extracted
          ...(meta?.clientName && !prev.clientName && { clientName: meta.clientName }),
        }))
      } else {
        alert(data.error || 'Failed to parse text')
      }
    } catch (err) {
      console.error('Parse error:', err)
      alert('Failed to parse text')
    } finally {
      setIsParsing(false)
    }
  }

  // --- Load from Existing Itinerary (full restore) ---
  const handleLoadItinerary = async (itineraryId: string) => {
    try {
      // Fetch itinerary header
      const headerRes = await fetch(`/api/itineraries/${itineraryId}`)
      const headerData = await headerRes.json()

      if (!headerData.success || !headerData.data) {
        alert('Failed to load itinerary')
        return
      }

      const itn = headerData.data
      // The itinerary's tier comes with its own hotels: not a change to swap for.
      prevTierRef.current = itn.tier || 'standard'
      // A saved trip's guides are its own; the language follows them
      // (guide-language.ts), not the last trip's choice.
      setConfig(prev => ({ ...prev, guideLanguage: '' }))

      // Update config from itinerary
      setConfig(prev => ({
        ...prev,
        clientName: itn.client_name || '',
        clientEmail: itn.client_email || '',
        clientPhone: itn.client_phone || '',
        tourName: itn.trip_name || '',
        pax: itn.num_adults || 2,
        tier: itn.tier || 'standard',
        currency: itn.currency || 'EUR',
        startDate: itn.start_date || prev.startDate,
        clientType: itn.source?.startsWith('b2b') ? 'b2b' : 'b2c',
        // The itinerary's declared product decides what the gate requires.
        // NULL (older grid saves never wrote one) = full-package, the shape
        // the grid always assumed.
        packageType: (itn.package_type as GridConfig['packageType']) || 'full-package',
        partnerId: itn.partner_id || null,
        clientId: itn.client_id || null,
        itineraryId: itn.id,
        itineraryCode: itn.itinerary_code,
      }))

      // Fetch days with services
      // The trip's own text: the grid saves these days back, and loading the
      // English translation of a Japanese trip wrote English over the
      // original 日程表 on the next save.
      const daysRes = await fetch(`/api/itineraries/${itineraryId}/days?language=source`)
      const daysData = await daysRes.json()
      // A line with no current rate keeps the price it was saved with
      // (saved-price.ts), put in the rate currency the grid works in — so the
      // rate currency and today's rates are needed now, not when fx loads.
      let loadFx: { rateCurrency: string | null; rates: ExchangeRates | null } = { rateCurrency: null, rates: null }
      try {
        const fxData = await (await fetch('/api/pricing-grid/fx')).json()
        if (fxData.success && fxData.data) loadFx = { rateCurrency: fxData.data.rateCurrency ?? null, rates: fxData.data.rates ?? null }
      } catch (err) {
        console.error('Failed to load exchange rates:', err)
      }
      const savedPrices = { itineraryCurrency: itn.currency || null, rateCurrency: loadFx.rateCurrency, fxRates: loadFx.rates }

      if (daysData.success && daysData.data) {
        const loadedDays: GridDay[] = daysData.data.map((dayData: any, idx: number) => {
          // Reverse-map services to slots
          const services = dayData.services || []
          const slots = services.length > 0
            ? mapServicesToSlots(services, itn.num_adults || 2, savedPrices)
            : SLOT_DEFINITIONS.map(def => ({ slotId: def.slotId, selectedItems: [], customAmount: 0 }))

          return {
            id: crypto.randomUUID(),
            dayNumber: dayData.day_number || idx + 1,
            title: dayData.title || `Day ${idx + 1}`,
            city: dayData.city || '',
            description: dayData.description || '',
            isExpanded: false,
            slots,
            // Consolidation Phase B: restore the day-type preset + component
            // overrides so the rich gridCompleteness gate has its inputs.
            // Columns may be undefined for pre-migration rows — that's fine,
            // resolveComponents() falls back to DAY_TYPE_DEFAULTS[DEFAULT_DAY_TYPE].
            dayType: dayData.day_type ?? undefined,
            overnight: dayData.overnight ?? undefined,
            hasSightseeing: dayData.has_sightseeing ?? undefined,
            airportArrival: dayData.airport_arrival ?? undefined,
            airportDeparture: dayData.airport_departure ?? undefined,
            hotelCheckIn: dayData.hotel_check_in ?? undefined,
            hotelCheckOut: dayData.hotel_check_out ?? undefined,
            intercity: dayData.intercity ?? undefined,
          }
        })
        // Re-priced from the rates by the hydration effect once the trip's
        // tier's rates are in (its saved lines carry no periods or guide bed).
        setDays(loadedDays)
        setSaveMessage(`Loaded ${itn.itinerary_code}`)
      }
    } catch (err) {
      console.error('Load error:', err)
      alert('Failed to load itinerary')
    }
  }

  // Auto-load an itinerary passed via ?itinerary=<id> (e.g. from the itinerary
  // editor's "Price in Grid"). The grid is the single pricing surface, so the
  // editor redirects here instead of calling the retired calculate-pricing route.
  const hasLoadedItineraryParam = useRef(false)
  useEffect(() => {
    if (hasLoadedItineraryParam.current) return
    const itineraryParam = searchParams?.get('itinerary')
    if (!itineraryParam) return
    hasLoadedItineraryParam.current = true
    handleLoadItinerary(itineraryParam)
    // Clean the URL so a reload doesn't reload-by-param.
    window.history.replaceState({}, '', '/pricing-grid')
   
  }, [searchParams])

  // --- Save to Database ---
  const handleSave = async () => {
    if (days.length === 0) {
      alert('No days to save. Parse or add days first.')
      return
    }

    try {
      setIsSaving(true)
      setSaveMessage(null)

      const res = await fetch('/api/pricing-grid/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The save prices every line from the stored rates itself; it is
        // sent the picks, not the figures.
        body: JSON.stringify({ config, days })
      })

      const data = await res.json()

      if (data.success) {
        // An office address offered as the client's was dropped by the save
        // (lib/email/own-address.ts): say so, and clear it here too.
        const warnings: string[] = Array.isArray(data.warnings) ? [...data.warnings] : []
        const ownAddressDropped = warnings.some(w => w.includes('one of your own addresses'))
        // The trip is stored in the company's rate currency; say so when the
        // grid was showing another.
        if (data.currency && data.currency !== viewConfig.shownCurrency) {
          warnings.push(`Amounts are stored in ${data.currency}, the currency your rates are in.`)
        }
        const note = warnings.length > 0 ? ` — ${warnings.join(' ')}` : ''
        setConfig(prev => ({
          ...prev,
          itineraryId: data.itineraryId,
          itineraryCode: data.itineraryCode,
          ...(ownAddressDropped ? { clientEmail: '' } : {}),
        }))

        // For B2B: create quote + template, then redirect to /tours/manage
        if (config.clientType === 'b2b') {
          try {
            // Step 1: Create B2B quote
            const quoteRes = await fetch('/api/b2b/quote-from-itinerary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itinerary_id: data.itineraryId,
                partner_id: config.partnerId || undefined,
                margin_percent: config.marginPercent,
                is_eur_passport: config.passport === 'eu',
                language: 'English',
                guide_mode: config.guideMode ?? 'spot',
              })
            })
            const quoteData = await quoteRes.json()
            const quoteId = quoteData.data?.id || quoteData.id
            const quoteNum = quoteData.data?.quote_number || quoteData.quote_number
            if (quoteId) {
              setSavedQuoteId(quoteId)
              setSavedQuoteNumber(quoteNum || null)
            }

            // Step 2: Create tour template from itinerary
            const templateRes = await fetch('/api/b2b/create-template-from-itinerary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itinerary_id: data.itineraryId,
                tier: config.tier || 'standard',
              })
            })
            const templateData = await templateRes.json()

            if (templateData.success && templateData.data?.variation_id) {
              setSaveMessage(`Saved as ${data.itineraryCode} + B2B Quote ${quoteNum || ''} — Redirecting to B2B Calculator...${note}`)
              // Redirect to B2B calculator which has full Plus 0/Plus 1 pricing table
              setTimeout(() => {
                router.push(`/b2b/calculator/${templateData.data.variation_id}`)
              }, 1000)
            } else {
              setSaveMessage(`Saved as ${data.itineraryCode} + B2B Quote ${quoteNum || ''} (template creation: ${templateData.error || 'failed'})${note}`)
            }
          } catch (quoteErr) {
            console.error('B2B quote/template creation error:', quoteErr)
            setSaveMessage(`Saved as ${data.itineraryCode} (B2B processing failed)${note}`)
          }
        } else {
          setSavedQuoteId(null)
          setSavedQuoteNumber(null)
          setSaveMessage(`Saved as ${data.itineraryCode}${note}`)
        }
      } else {
        alert(`Save failed: ${data.error}`)
      }
    } catch (err: any) {
      console.error('Save error:', err)
      alert(`Failed to save itinerary: ${err?.message || 'Network error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  // --- What the figures are shown in (display-fx.ts) ---
  // Derived every render and never stored or trusted: rate currency → the
  // chosen currency, or the rate currency itself when no rate converts it.
  const fxView = displayFx(fx?.rateCurrency, config.currency, fx?.rates)
  const viewConfig: GridConfig = {
    ...config,
    exchangeRate: fxView.factor,
    rateCurrency: fx?.rateCurrency ?? null,
    shownCurrency: fxView.shown,
    // Derived like the rest: the server's list, never saved (the save reads
    // the table itself).
    fixedCosts: fixedCosts.items,
  }
  // The picks with no rate behind them — priced as nothing, and named.
  const unpricedItems = rates && ratesTier === config.tier ? hydrateDays(days, rates, config.pax).unpriced : []

  // --- Calculate Totals ---
  const totals: GridTotals = days.length > 0
    ? calculateGrandTotals(days, viewConfig, seasonWindows)
    : {
        costPerPerson: 0, totalCost: 0, marginAmount: 0,
        sellingPricePerPerson: 0, sellingPriceTotal: 0, baseSellingPriceTotal: 0,
        seasonName: null, seasonPercent: 0, seasonUplift: 0,
      }

  // The picked rates whose own dates do not match the trip's. Warnings only:
  // the grid prices what the operator picked, and the whole point is that the
  // mismatch stops being invisible. gridCompleteness owns the rules so the
  // save path and this banner cannot drift apart.
  const dateIssues = days.length > 0
    ? gridCompleteness(days, config).issues.filter(i => i.code.startsWith('rate-'))
    : []

  // --- Render ---
  if ((loading && !rates) || !fx) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-20 text-gray-500">Loading rates...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 bg-gray-50 min-h-screen">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-2 bg-gray-50">
        <GridHeader config={viewConfig} onChange={changeConfig} totals={totals} guideLanguages={guideLanguageList} defaultMargin={defaultMargin} />
      </div>

      {/* The chosen currency cannot be shown: say so, and show the figures in
          the currency they are in — never under another currency's sign. */}
      {fxView.missing && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          {fxView.shown
            ? `No exchange rate from ${fxView.shown} to ${config.currency} — figures are shown in ${fxView.shown}, the currency your rates are in.`
            : 'Could not load the currency your rates are in — figures are shown without a currency. Reload the page.'}
        </div>
      )}

      {/* Client Info */}
      <ClientInfoBar config={config} onChange={setConfig} />

      {/* Input Panel */}
      <InputPanel
        onParseDays={handleParseDays}
        onAddDay={addDay}
        onLoadItinerary={handleLoadItinerary}
        onClearAll={handleClearAll}
        isParsing={isParsing}
        hasDays={days.length > 0}
        packageType={config.packageType ?? 'full-package'}
        onPackageTypeChange={(p) => setConfig(prev => ({ ...prev, packageType: p }))}
      />

      {/* Days Grid */}
      {days.length === 0 ? (
        isParsing ? (
          <div className="text-center py-24 border-2 border-dashed border-green-200 rounded-xl bg-white">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-green-50">
              <svg className="w-8 h-8 text-green-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">Building your itinerary...</p>
            <p className="text-sm text-gray-500 mb-4">Matching services to rates and filling in details</p>
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : (
          <div className="text-center py-24 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white">
            <div className="text-3xl mb-3 opacity-50">+</div>
            <p className="text-base mb-1 font-medium">No days yet</p>
            <p className="text-sm text-gray-400">Paste text, load an itinerary, or add days manually</p>
          </div>
        )
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{days.length}</span> days
              {' · '}
              <span className="font-semibold text-gray-700">{config.pax}</span> pax
              {' · '}
              <span className="font-semibold text-gray-700 capitalize">{config.tier}</span>
              {config.itineraryCode && (
                <>
                  {' · '}
                  <span className="font-semibold text-green-700">{config.itineraryCode}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={expandAll} className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                Expand All
              </button>
              <span className="text-gray-300">|</span>
              <button onClick={collapseAll} className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                Collapse All
              </button>
            </div>
          </div>

          {/* Day bar: every day at a glance, one click to jump to it */}
          <div className="sticky top-0 z-20 -mx-1 mb-2 px-1 py-1.5 bg-gray-50/95 backdrop-blur border-b border-gray-200">
            <div className="flex gap-1.5 overflow-x-auto">
              {days.map(day => {
                const perPerson = calculateDay(day, viewConfig).dailyPerPerson
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => jumpToDay(day.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                      day.isExpanded
                        ? 'bg-[#556B2F] text-white border-[#556B2F]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#556B2F]'
                    }`}
                    title={day.title || `Day ${day.dayNumber}`}
                  >
                    <span className="font-semibold">Day {day.dayNumber}</span>
                    {day.city && <span className="opacity-80">{day.city}</span>}
                    <span className="tabular-nums opacity-80">
                      {shownSymbol(viewConfig)}{convertAmount(perPerson, viewConfig.exchangeRate).toFixed(0)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Day Cards */}
          <div className="space-y-3">
            {days.map(day => (
              <DayRow
                key={day.id}
                day={day}
                allDays={days}
                config={viewConfig}
                rates={rates || {} as AllRates}
                onToggleExpand={() => toggleExpand(day.id)}
                onUpdateSlot={(slotId, value) => updateSlot(day.id, slotId, value)}
                onUpdateDay={(partial) => updateDay(day.id, partial)}
                onRemoveDay={() => removeDay(day.id)}
              />
            ))}
          </div>

          {/* The dates a picked rate belongs to. The grid prices what was
              picked on any date — it does not switch rate periods the way the
              auto engine does — so the one honest thing it can do is stop the
              mismatch being invisible. Nothing here fires for an agency that
              has not entered seasons. */}
          {dateIssues.length > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
              {dateIssues.map(issue => (
                <div key={`${issue.code}-${issue.dayNumber}-${issue.message}`}>{issue.message}</div>
              ))}
            </div>
          )}

          {/* Picks whose rate is no longer in Rates (deleted, switched off, or
              a line saved without one): no price, said here, never the price
              they came with. The save says the same. A line of the loaded
              itinerary keeps its stored price instead, marked in its row
              (saved-price.ts), and is not listed here. */}
          {unpricedItems.length > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
              No current rate, so no price: {unpricedItems.map(u => `day ${u.dayNumber} ${u.name || u.rateId}`).join('; ')}. Pick a rate or type an amount.
            </div>
          )}

          {/* Rates › Fixed Costs the grid could not charge as entered: the
              built-in water default in use, or a cost whose currency has no
              exchange rate (left out of the price). Same text the save returns. */}
          {fixedCosts.warnings.length > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1" data-testid="fixed-cost-warnings">
              {fixedCosts.warnings.map(w => <div key={w}>{w}</div>)}
            </div>
          )}

          {/* A throughout quote with nights whose hotel has no guide rate is
              missing the guide's bed — say so, never price it silently at 0. */}
          {countMissingGuideBeds(days, config) > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
              Throughout guide: {countMissingGuideBeds(days, config)} night(s) have no guide bed rate on the chosen hotel/cruise — fill "Guide bed / night" on its rate periods, or this quote is missing his bed.
            </div>
          )}

          {/* Grand Summary + Save */}
          <GridSummary
            totals={totals}
            config={viewConfig}
            dayCount={days.length}
            onSave={handleSave}
            isSaving={isSaving}
            savedItineraryId={config.itineraryId}
            savedItineraryCode={config.itineraryCode}
            savedQuoteId={savedQuoteId}
            savedQuoteNumber={savedQuoteNumber}
            saveMessage={saveMessage}
          />
        </>
      )}
    </div>
  )
}
