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

  // Filter options by day city where relevant
  const getFilteredOptions = (slotId: string) => {
    const allOptions = getSlotOptions(slotId)
    const city = day.city?.toLowerCase()
    if (!city) return allOptions

    // For city-specific slots, show matching city first, then others
    if (['accommodation', 'meals', 'entrance_fees'].includes(slotId)) {
      const cityMatch = allOptions.filter(o => o.city?.toLowerCase() === city)
      const others = allOptions.filter(o => o.city?.toLowerCase() !== city)
      return [...cityMatch, ...others]
    }
    return allOptions
  }

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
