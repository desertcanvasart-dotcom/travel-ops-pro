'use client'

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { GridDay, GridConfig, AllRates, SlotValue, DayCalc, SelectedItem } from '../types'
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

  // Helper: read current slot state from the slots array
  const getSlotItems = (slotId: string): SelectedItem[] => {
    const slot = day.slots.find(s => s.slotId === slotId)
    return slot?.selectedItems || []
  }

  // Count filled slots for collapsed summary
  const filledSlots = day.slots.filter(s => s.selectedItems.length > 0 || s.customAmount > 0).length
  const totalSlots = day.slots.length

  // Filter options by day city/context — show only relevant items
  const getFilteredOptions = (slotId: string) => {
    const allOptions = getSlotOptions(slotId)
    const city = day.city?.toLowerCase().trim()
    const isCruiseDay = /cruise|sailing|on board/i.test(day.title || day.city || '')
    const isArrival = day.dayNumber === 1
    const overnightCity = ((day as any).overnight_city || day.city || '').toLowerCase().trim()

    const cityToAirport: Record<string, string> = {
      cairo: 'CAI', luxor: 'LXR', aswan: 'ASW', hurghada: 'HRG',
      'sharm el sheikh': 'SSH', sharm: 'SSH', giza: 'CAI',
    }

    if (slotId === 'airport_services') {
      const code = city ? cityToAirport[city] : null
      if (code) return allOptions.filter(o => o.city === code)
      return []
    }

    if (slotId === 'entrance_fees') {
      if (isCruiseDay || !city) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === city)
    }

    if (slotId === 'meals') {
      if (isCruiseDay) return []
      const mealCity = overnightCity || city
      if (!mealCity) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === mealCity)
    }

    if (['experiences', 'boat_rides'].includes(slotId)) {
      if (!city || isCruiseDay) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === city)
    }

    if (slotId === 'accommodation') {
      if (isCruiseDay) return []
      const accCity = overnightCity || city
      if (!accCity) return []
      return allOptions.filter(o => o.city?.toLowerCase().trim() === accCity)
    }

    // Transport (route): all transport types — day tours, airport, intercity, cruise packages
    if (slotId === 'route') {
      const selectedIds = new Set(getSlotItems('route').map(i => i.rateId))
      return allOptions.filter(o => {
        // Always show currently selected items
        if (selectedIds.has(o.id)) return true
        // Always show cruise transport packages on cruise days
        if ((o as any).service_type === 'cruise_transport_package') return isCruiseDay
        // On cruise days, hide individual transport (package covers it)
        if (isCruiseDay) return false
        if (!city && !overnightCity) return false
        const originCity = (o as any).origin_city?.toLowerCase().trim() || ''
        const destCity = (o as any).destination_city?.toLowerCase().trim() || ''
        // Day tours: match by origin_city or city
        if ((o as any).service_type === 'day_tour') {
          return !originCity || (city && (originCity === city || destCity === city))
        }
        // Airport/intercity transfers: match by origin or destination
        return (city && (originCity === city || destCity === city)) ||
               (overnightCity && (originCity === overnightCity || destCity === overnightCity))
      })
    }

    if (slotId === 'hotel_services') {
      if (isCruiseDay) return []
      return allOptions.filter(o => {
        const tierOk = (o as any).category === config.tier || (o as any).category === 'all'
        if (!tierOk) return false
        const dest = o.city?.toLowerCase().trim()
        if (!dest || !city) return tierOk
        return dest === city || dest === overnightCity
      })
    }

    if (slotId === 'tipping') {
      if (isCruiseDay) {
        return allOptions.filter(o => /cruise/i.test(o.name || ''))
      }
      const hasGuide = getSlotItems('guide').length > 0 || config.withGuide
      const hasAirport = getSlotItems('airport_services').length > 0 || isArrival
      const hasRoute = getSlotItems('route').length > 0
      const hasMeals = getSlotItems('meals').length > 0
      return allOptions.filter(o => {
        const name = o.name?.toLowerCase() || ''
        if (/driver.*day|TIP-DRIVER-DAY/i.test(name)) return true
        if (/driver.*half|TIP-DRIVER-HALF/i.test(name)) return hasRoute
        if (/driver.*transfer|TIP-DRIVER-TRANSFER/i.test(name)) return hasRoute
        if (/guide/i.test(name)) return hasGuide
        if (/porter.*hotel|TIP-PORTER-HOTEL/i.test(name)) return true
        if (/porter.*airport|TIP-PORTER-AIRPORT/i.test(name)) return hasAirport
        if (/restaurant/i.test(name)) return hasMeals
        if (/cruise|felucca|motor/i.test(name)) return false
        return false
      })
    }

    if (slotId === 'flights') {
      if (!/flight|fly|domestic/i.test(day.title || day.description || '')) return []
      if (!city) return allOptions
      const matched = allOptions.filter(o => {
        const from = ((o as any).route_from || '').toLowerCase().trim()
        const to = ((o as any).route_to || '').toLowerCase().trim()
        return from === city || to === city
      })
      return matched.length > 0 ? matched : allOptions
    }

    if (slotId === 'cruise') return allOptions

    return allOptions
  }

  const getAllOptions = (slotId: string) => getSlotOptions(slotId)

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-shadow ${
      day.isExpanded ? 'shadow-md ring-1 ring-gray-200' : 'hover:shadow-md'
    }`}>
      {/* Day Header — always visible, acts as collapsed summary card */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
          day.isExpanded ? 'bg-white border-b border-gray-100' : 'hover:bg-gray-50/80'
        }`}
        onClick={onToggleExpand}
      >
        {/* Day Number Badge */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: '#556B2F' }}
        >
          {day.dayNumber}
        </div>

        {/* Title + City + Collapsed Mini Summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={day.title}
              onChange={(e) => onUpdateDay({ title: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 w-full max-w-md"
              placeholder={`Day ${day.dayNumber}`}
            />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <input
              type="text"
              value={day.city}
              onChange={(e) => onUpdateDay({ city: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-gray-500 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 w-24"
              placeholder="City"
            />
            {/* Collapsed mini summary: show key cost breakdown */}
            {!day.isExpanded && calc.dailyPerPerson > 0 && (
              <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-400">
                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded font-medium">
                  Grp €{calc.groupPerPerson.toFixed(0)}
                </span>
                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded font-medium">
                  PP €{calc.perPersonTotal.toFixed(0)}
                </span>
                <span className="text-gray-300">{filledSlots}/{totalSlots} slots</span>
              </div>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="text-right shrink-0 mr-2">
          <div className={`text-sm font-bold ${calc.dailyPerPerson > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
            €{calc.dailyPerPerson.toFixed(2)}/pp
          </div>
          <div className="text-[11px] text-gray-400">
            €{calc.dailyTotal.toFixed(2)} total
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveDay() }}
            className="p-1.5 text-gray-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
            title="Remove day"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <div className="p-1">
            {day.isExpanded
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />
            }
          </div>
        </div>
      </div>

      {/* Expanded Grid */}
      {day.isExpanded && (
        <div>
          {/* Description */}
          {(day.description || day.isExpanded) && (
            <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100">
              <textarea
                value={day.description}
                onChange={(e) => onUpdateDay({ description: e.target.value })}
                rows={1}
                className="w-full text-xs text-gray-500 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 resize-none"
                placeholder="Day description / activities..."
              />
            </div>
          )}

          {/* GROUP SERVICES */}
          <div className="border-b border-gray-100">
            <div className="px-4 py-1.5 bg-amber-50/70 border-b border-amber-100/50 flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Group Services</span>
              <span className="text-[11px] text-amber-600 font-medium">
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
            <div className="px-4 py-1.5 bg-emerald-50/70 border-b border-emerald-100/50 flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Per-Person Services</span>
              <span className="text-[11px] text-emerald-600 font-medium">
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
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Day {day.dayNumber} Total</span>
            <div className="text-right flex items-center gap-4">
              <span className="text-xs text-gray-400">× {config.pax} pax = €{calc.dailyTotal.toFixed(2)}</span>
              <span className="text-sm font-bold text-gray-900">€{calc.dailyPerPerson.toFixed(2)}/pp</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
