'use client'

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { GridDay, GridConfig, AllRates, SlotValue, DayCalc } from '../types'
import { GROUP_SLOTS, PP_SLOTS } from '../types'
import { calculateDay } from '../lib/calculator'
import SlotRow from './SlotRow'

interface DayRowProps {
  day: GridDay
  config: GridConfig
  rates: AllRates
  onToggleExpand: () => void
  onUpdateSlot: (slotId: string, value: SlotValue) => void
  onUpdateDay: (partial: Partial<GridDay>) => void
  onRemoveDay: () => void
}

export default function DayRow({ day, config, rates, onToggleExpand, onUpdateSlot, onUpdateDay, onRemoveDay }: DayRowProps) {
  const calc: DayCalc = calculateDay(day, config)

  const getSlotValue = (slotId: string): SlotValue => {
    return day.slots.find(s => s.slotId === slotId) || { slotId, selectedItems: [], customAmount: 0 }
  }

  const getSlotOptions = (slotId: string) => {
    const key = slotId as keyof AllRates
    return rates[key] || []
  }

  // Filter options by day city/context — show only relevant items
  // Users can still find others via search (allOptions) in SlotRow
  const getFilteredOptions = (slotId: string) => {
    const allOptions = getSlotOptions(slotId)
    const city = day.city?.toLowerCase()
    const isCruiseDay = /cruise|sailing|on board/i.test(day.title || day.city || '')
    const isArrival = day.dayNumber === 1
    const overnightCity = (day.overnight_city || day.city || '').toLowerCase()

    // City-to-airport code mapping
    const cityToAirport: Record<string, string> = {
      cairo: 'CAI', luxor: 'LXR', aswan: 'ASW', hurghada: 'HRG',
      'sharm el sheikh': 'SSH', sharm: 'SSH', giza: 'CAI',
    }

    // Airport services: only this city's airport
    if (slotId === 'airport_services') {
      const code = city ? cityToAirport[city] : null
      if (code) return allOptions.filter(o => o.city === code)
      return [] // No airport for cruise/unknown city
    }

    // Entrance fees: only this city's attractions (empty if cruise/no match)
    if (slotId === 'entrance_fees') {
      if (isCruiseDay || !city) return []
      return allOptions.filter(o => o.city?.toLowerCase() === city)
    }

    // Meals: only this city's restaurants (empty on cruise days — meals included)
    if (slotId === 'meals') {
      if (isCruiseDay) return []
      // Use overnight city for meals (that's where dinner happens)
      const mealCity = overnightCity || city
      if (!mealCity) return []
      return allOptions.filter(o => o.city?.toLowerCase() === mealCity)
    }

    // Experiences & Boat rides: filter by city
    if (['experiences', 'boat_rides'].includes(slotId)) {
      if (!city || isCruiseDay) return []
      return allOptions.filter(o => o.city?.toLowerCase() === city)
    }

    // Accommodation: filter by overnight city (already tier-filtered at API level)
    if (slotId === 'accommodation') {
      if (isCruiseDay) return [] // Sleeping on cruise
      const accCity = overnightCity || city
      if (!accCity) return allOptions
      const match = allOptions.filter(o => o.city?.toLowerCase() === accCity)
      return match.length > 0 ? match : allOptions
    }

    // Vehicle: filter by city
    if (slotId === 'vehicle') {
      if (isCruiseDay) return [] // Transport included in cruise
      if (!city) return allOptions
      const match = allOptions.filter(o => !o.city || o.city?.toLowerCase() === city)
      return match.length > 0 ? match : allOptions
    }

    // Route: filter to relevant transfers (airport + intercity for this city)
    if (slotId === 'route') {
      if (isCruiseDay) return []
      return allOptions.filter(o => {
        const details = (o.details || o.name || '').toLowerCase()
        const originCity = (o as any).origin_city?.toLowerCase() || ''
        const destCity = (o as any).destination_city?.toLowerCase() || ''
        // Show if origin or destination matches day city or overnight city
        return (city && (originCity === city || destCity === city)) ||
               (overnightCity && (originCity === overnightCity || destCity === overnightCity))
      })
    }

    // Hotel services: filter by tier only
    if (slotId === 'hotel_services') {
      if (isCruiseDay) return []
      const tierMatch = allOptions.filter(o =>
        (o as any).category === config.tier || (o as any).category === 'all'
      )
      return tierMatch.length > 0 ? tierMatch : allOptions
    }

    // Tipping: show only contextually relevant tips for this day type
    if (slotId === 'tipping') {
      if (isCruiseDay) {
        // Cruise days: only cruise-related tips
        return allOptions.filter(o => /cruise/i.test(o.name || ''))
      }
      const hasGuide = !!(day.slots?.guide?.length > 0) || config.withGuide
      const hasAirport = !!(day.slots?.airport_services?.length > 0) || isArrival
      const hasRoute = !!(day.slots?.route?.length > 0)
      return allOptions.filter(o => {
        const name = o.name?.toLowerCase() || ''
        if (/driver.*day|TIP-DRIVER-DAY/i.test(name)) return true // Standard day driver tip
        if (/driver.*half|TIP-DRIVER-HALF/i.test(name)) return hasRoute // Half-day driver for transfers
        if (/driver.*transfer|TIP-DRIVER-TRANSFER/i.test(name)) return hasRoute
        if (/guide/i.test(name)) return hasGuide
        if (/porter.*hotel|TIP-PORTER-HOTEL/i.test(name)) return true
        if (/porter.*airport|TIP-PORTER-AIRPORT/i.test(name)) return hasAirport
        if (/restaurant/i.test(name)) return true // Restaurant tip for meal days
        if (/cruise|felucca|motor/i.test(name)) return false
        return false // Hide anything not explicitly matched
      })
    }

    // Flights: empty by default (user adds manually), unless description mentions flight
    if (slotId === 'flights') {
      if (!/flight|fly|domestic/i.test(day.title || day.description || '')) return []
      return allOptions
    }

    // Cruise: show all (already tier-filtered by API)
    if (slotId === 'cruise') {
      return allOptions
    }

    return allOptions
  }

  // All options (unfiltered) for search fallback in SlotRow
  const getAllOptions = (slotId: string) => getSlotOptions(slotId)

  return (
    <div className="bg-white border rounded-lg shadow-sm overflow-hidden mb-3">
      {/* Day Header — always visible */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="w-8 h-8 rounded-full bg-olive-700 flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: '#556B2F' }}
        >
          {day.dayNumber}
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={day.title}
            onChange={(e) => onUpdateDay({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 w-full"
            placeholder={`Day ${day.dayNumber}`}
          />
          <div className="flex items-center gap-2 mt-0.5">
            <input
              type="text"
              value={day.city}
              onChange={(e) => onUpdateDay({ city: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-gray-500 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1"
              placeholder="City"
            />
          </div>
        </div>
        <div className="text-right mr-4">
          <div className="text-sm font-bold text-gray-900">€{calc.dailyPerPerson.toFixed(2)}/pp</div>
          <div className="text-xs text-gray-500">€{calc.dailyTotal.toFixed(2)} total</div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemoveDay() }}
          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
          title="Remove day"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        {day.isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Expanded Grid */}
      {day.isExpanded && (
        <div className="border-t">
          {/* Description */}
          <div className="px-4 py-2 bg-gray-50 border-b">
            <textarea
              value={day.description}
              onChange={(e) => onUpdateDay({ description: e.target.value })}
              rows={2}
              className="w-full text-xs text-gray-600 bg-transparent border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
              placeholder="Day description / activities..."
            />
          </div>

          {/* GROUP SERVICES */}
          <div className="border-b-2 border-amber-200">
            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Group Services</span>
              <span className="text-xs text-amber-600">
                €{calc.groupTotal.toFixed(2)} ÷ {config.pax} pax = <strong>€{calc.groupPerPerson.toFixed(2)}/pp</strong>
              </span>
            </div>
            {GROUP_SLOTS.map(def => (
              <SlotRow
                key={def.slotId}
                definition={def}
                value={getSlotValue(def.slotId)}
                options={getFilteredOptions(def.slotId)}
                allOptions={getAllOptions(def.slotId)}
                passport={config.passport}
                onChange={(val) => onUpdateSlot(def.slotId, val)}
                hidden={def.slotId === 'guide' && !config.withGuide}
              />
            ))}
          </div>

          {/* PER-PERSON SERVICES */}
          <div>
            <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Per-Person Services</span>
              <span className="text-xs text-emerald-600">
                <strong>€{calc.perPersonTotal.toFixed(2)}/pp</strong>
              </span>
            </div>
            {PP_SLOTS.map(def => (
              <SlotRow
                key={def.slotId}
                definition={def}
                value={getSlotValue(def.slotId)}
                options={getFilteredOptions(def.slotId)}
                allOptions={getAllOptions(def.slotId)}
                passport={config.passport}
                onChange={(val) => onUpdateSlot(def.slotId, val)}
              />
            ))}
          </div>

          {/* DAY TOTAL */}
          <div className="px-4 py-2 bg-gray-100 border-t flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 uppercase">Day {day.dayNumber} Total</span>
            <div className="text-right">
              <span className="text-sm font-bold text-gray-900">€{calc.dailyPerPerson.toFixed(2)}/pp</span>
              <span className="text-xs text-gray-500 ml-3">× {config.pax} pax = €{calc.dailyTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
