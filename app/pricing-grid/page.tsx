'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { GridConfig, GridDay, AllRates, SlotValue, GridTotals } from './types'
import { SLOT_DEFINITIONS } from './types'
import { calculateGrandTotals, calculateDay } from './lib/calculator'
import { mapServicesToSlots } from './lib/slot-mapping'
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
  clientType: 'b2c',
  withGuide: true,
  currency: 'EUR',
  marginPercent: 25,
  exchangeRate: null,
  startDate: new Date().toISOString().split('T')[0],
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
  const [config, setConfig] = useState<GridConfig>(() =>
    loadFromStorage(STORAGE_KEY_CONFIG, DEFAULT_CONFIG)
  )
  const [days, setDays] = useState<GridDay[]>(() =>
    loadFromStorage(STORAGE_KEY_DAYS, [])
  )
  const [rates, setRates] = useState<AllRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null)
  const [savedQuoteNumber, setSavedQuoteNumber] = useState<string | null>(null)

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

  // Fetch rates
  const fetchRates = useCallback(async (tier: string) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/pricing-grid/rates?tier=${tier}`)
      const data = await res.json()
      if (data.success) setRates(data.data)
    } catch (err) {
      console.error('Failed to fetch rates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRates(config.tier)
  }, [config.tier, fetchRates])

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

  const updateDay = (dayId: string, partial: Partial<GridDay>) => {
    setDays(prev => prev.map(d => d.id === dayId ? { ...d, ...partial } : d))
  }

  const updateSlot = (dayId: string, slotId: string, value: SlotValue) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d
      return { ...d, slots: d.slots.map(s => s.slotId === slotId ? value : s) }
    }))
  }

  // --- Clear All ---
  const handleClearAll = () => {
    setDays([])
    setConfig(DEFAULT_CONFIG)
    clearStorage()
    setSaveMessage(null)
  }

  // --- Parse Text via AI ---
  const handleParseDays = async (text: string) => {
    try {
      setIsParsing(true)
      setSaveMessage(null)
      const res = await fetch('/api/pricing-grid/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tier: config.tier, pax: config.pax })
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
        setDays(parsedDays)
        // Reset itinerary link (new parse = new quote)
        setConfig(prev => ({ ...prev, itineraryId: null, itineraryCode: null }))
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
        partnerId: itn.partner_id || null,
        itineraryId: itn.id,
        itineraryCode: itn.itinerary_code,
      }))

      // Fetch days with services
      const daysRes = await fetch(`/api/itineraries/${itineraryId}/days?language=en`)
      const daysData = await daysRes.json()

      if (daysData.success && daysData.data) {
        const loadedDays: GridDay[] = daysData.data.map((dayData: any, idx: number) => {
          // Reverse-map services to slots
          const services = dayData.services || []
          const slots = services.length > 0
            ? mapServicesToSlots(services, itn.num_adults || 2)
            : SLOT_DEFINITIONS.map(def => ({ slotId: def.slotId, selectedItems: [], customAmount: 0 }))

          return {
            id: crypto.randomUUID(),
            dayNumber: dayData.day_number || idx + 1,
            title: dayData.title || `Day ${idx + 1}`,
            city: dayData.city || '',
            description: dayData.description || '',
            isExpanded: false,
            slots,
          }
        })
        setDays(loadedDays)
        setSaveMessage(`Loaded ${itn.itinerary_code}`)
      }
    } catch (err) {
      console.error('Load error:', err)
      alert('Failed to load itinerary')
    }
  }

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
        body: JSON.stringify({ config, days, totals })
      })

      const data = await res.json()

      if (data.success) {
        setConfig(prev => ({
          ...prev,
          itineraryId: data.itineraryId,
          itineraryCode: data.itineraryCode,
        }))

        // For B2B: automatically create a B2B quote from the saved itinerary
        if (config.clientType === 'b2b') {
          try {
            const quoteRes = await fetch('/api/b2b/quote-from-itinerary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itinerary_id: data.itineraryId,
                partner_id: config.partnerId || undefined,
                margin_percent: config.marginPercent,
                is_eur_passport: config.passport === 'eu',
                language: 'English',
              })
            })
            const quoteData = await quoteRes.json()
            if (quoteData.id) {
              setSavedQuoteId(quoteData.id)
              setSavedQuoteNumber(quoteData.quote_number || null)
              setSaveMessage(`Saved as ${data.itineraryCode} + B2B Quote ${quoteData.quote_number || ''}`)
            } else {
              // Quote creation failed, but itinerary saved
              setSaveMessage(`Saved as ${data.itineraryCode} (B2B quote creation failed: ${quoteData.error || 'unknown error'})`)
            }
          } catch (quoteErr) {
            console.error('B2B quote creation error:', quoteErr)
            setSaveMessage(`Saved as ${data.itineraryCode} (B2B quote creation failed)`)
          }
        } else {
          setSavedQuoteId(null)
          setSavedQuoteNumber(null)
          setSaveMessage(`Saved as ${data.itineraryCode}`)
        }
      } else {
        alert(`Save failed: ${data.error}`)
      }
    } catch (err) {
      console.error('Save error:', err)
      alert('Failed to save itinerary')
    } finally {
      setIsSaving(false)
    }
  }

  // --- Calculate Totals ---
  const totals: GridTotals = days.length > 0
    ? calculateGrandTotals(days, config)
    : { costPerPerson: 0, totalCost: 0, marginAmount: 0, sellingPricePerPerson: 0, sellingPriceTotal: 0 }

  // --- Render ---
  if (loading && !rates) {
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
        <GridHeader config={config} onChange={setConfig} totals={totals} />
      </div>

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
      />

      {/* Days Grid */}
      {days.length === 0 ? (
        <div className="text-center py-24 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white">
          <div className="text-3xl mb-3 opacity-50">+</div>
          <p className="text-base mb-1 font-medium">No days yet</p>
          <p className="text-sm text-gray-400">Paste text, load an itinerary, or add days manually</p>
        </div>
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

          {/* Day Cards */}
          <div className="space-y-2">
            {days.map(day => (
              <DayRow
                key={day.id}
                day={day}
                allDays={days}
                config={config}
                rates={rates || {} as AllRates}
                onToggleExpand={() => toggleExpand(day.id)}
                onUpdateSlot={(slotId, value) => updateSlot(day.id, slotId, value)}
                onUpdateDay={(partial) => updateDay(day.id, partial)}
                onRemoveDay={() => removeDay(day.id)}
              />
            ))}
          </div>

          {/* Grand Summary + Save */}
          <GridSummary
            totals={totals}
            config={config}
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
