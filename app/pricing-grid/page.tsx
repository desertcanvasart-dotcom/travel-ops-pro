'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GridConfig, GridDay, AllRates, SlotValue, GridTotals } from './types'
import { SLOT_DEFINITIONS } from './types'
import { calculateGrandTotals } from './lib/calculator'
import GridHeader from './components/GridHeader'
import InputPanel from './components/InputPanel'
import DayRow from './components/DayRow'
import GridSummary from './components/GridSummary'

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
  startDate: new Date().toISOString().split('T')[0],  // Today's date
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
    isExpanded: true,
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
  const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG)
  const [days, setDays] = useState<GridDay[]>([])
  const [rates, setRates] = useState<AllRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [isParsing, setIsParsing] = useState(false)

  // --- Fetch rates when tier changes ---
  const fetchRates = useCallback(async (tier: string) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/pricing-grid/rates?tier=${tier}`)
      const data = await res.json()
      if (data.success) {
        setRates(data.data)
      } else {
        console.error('Failed to fetch rates:', data.error)
      }
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

  const addDay = () => {
    setDays(prev => [...prev, createEmptyDay(prev.length + 1)])
  }

  const removeDay = (dayId: string) => {
    setDays(prev => {
      const filtered = prev.filter(d => d.id !== dayId)
      // Re-number days
      return filtered.map((d, i) => ({ ...d, dayNumber: i + 1 }))
    })
  }

  const toggleExpand = (dayId: string) => {
    setDays(prev => prev.map(d =>
      d.id === dayId ? { ...d, isExpanded: !d.isExpanded } : d
    ))
  }

  const updateDay = (dayId: string, partial: Partial<GridDay>) => {
    setDays(prev => prev.map(d =>
      d.id === dayId ? { ...d, ...partial } : d
    ))
  }

  const updateSlot = (dayId: string, slotId: string, value: SlotValue) => {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d
      return {
        ...d,
        slots: d.slots.map(s => s.slotId === slotId ? value : s)
      }
    }))
  }

  // --- Parse Text via AI ---

  const handleParseDays = async (text: string) => {
    try {
      setIsParsing(true)
      const res = await fetch('/api/pricing-grid/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tier: config.tier, pax: config.pax })
      })
      const data = await res.json()
      if (data.success && data.days) {
        // The API returns days with slots already enriched (real rate IDs, names, prices)
        const parsedDays: GridDay[] = data.days.map((pd: any, idx: number) => ({
          id: crypto.randomUUID(),
          dayNumber: pd.dayNumber || idx + 1,
          title: pd.title || `Day ${idx + 1}`,
          city: pd.city || '',
          description: pd.description || '',
          isExpanded: idx === 0,
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

  // --- Load from Existing Itinerary ---

  const handleLoadItinerary = async (itineraryId: string) => {
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/days?language=en`)
      const data = await res.json()
      if (data.success && data.data) {
        const loadedDays: GridDay[] = data.data.map((dayData: any, idx: number) => ({
          id: crypto.randomUUID(),
          dayNumber: dayData.day_number || idx + 1,
          title: dayData.title || `Day ${idx + 1}`,
          city: dayData.city || '',
          description: dayData.description || '',
          isExpanded: idx === 0,
          slots: SLOT_DEFINITIONS.map(def => ({
            slotId: def.slotId,
            selectedItems: [],
            customAmount: 0,
          })),
        }))
        setDays(loadedDays)
      } else {
        alert('Failed to load itinerary')
      }
    } catch (err) {
      console.error('Load error:', err)
      alert('Failed to load itinerary')
    }
  }

  // --- Calculate Totals ---

  const totals: GridTotals = days.length > 0
    ? calculateGrandTotals(days, config)
    : { costPerPerson: 0, totalCost: 0, marginAmount: 0, sellingPricePerPerson: 0, sellingPriceTotal: 0 }

  // --- Render ---

  if (loading && !rates) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="text-center py-20 text-gray-500">Loading rates...</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Page Title */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Pricing Grid</h1>
        <p className="text-sm text-gray-500">Fixed-slot pricing calculator — select services per day</p>
      </div>

      {/* Header Controls */}
      <GridHeader config={config} onChange={setConfig} />

      {/* Input Panel */}
      <InputPanel
        onParseDays={handleParseDays}
        onAddDay={addDay}
        onLoadItinerary={handleLoadItinerary}
        isParsing={isParsing}
      />

      {/* Days Grid */}
      {days.length === 0 ? (
        <div className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-lg mb-2">No days yet</p>
          <p className="text-sm">Paste text, load an itinerary, or add days manually</p>
        </div>
      ) : (
        <>
          {days.map(day => (
            <DayRow
              key={day.id}
              day={day}
              config={config}
              rates={rates || {} as AllRates}
              onToggleExpand={() => toggleExpand(day.id)}
              onUpdateSlot={(slotId, value) => updateSlot(day.id, slotId, value)}
              onUpdateDay={(partial) => updateDay(day.id, partial)}
              onRemoveDay={() => removeDay(day.id)}
            />
          ))}

          {/* Grand Summary */}
          <GridSummary totals={totals} config={config} dayCount={days.length} />
        </>
      )}
    </div>
  )
}
