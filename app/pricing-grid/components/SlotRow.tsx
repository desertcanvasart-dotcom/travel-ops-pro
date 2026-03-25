'use client'

import { useState } from 'react'
import type { SlotDefinition, SlotValue, RateOption, SelectedItem, PassportType } from '../types'

interface SlotRowProps {
  definition: SlotDefinition
  value: SlotValue
  options: RateOption[]        // Filtered options (city-relevant)
  allOptions?: RateOption[]    // All available options (for search fallback)
  passport: PassportType
  onChange: (value: SlotValue) => void
  hidden?: boolean
}

export default function SlotRow({ definition, value, options, allOptions, passport, onChange, hidden }: SlotRowProps) {
  const [search, setSearch] = useState('')

  if (hidden) return null

  const rateKey = passport === 'eu' ? 'rateEur' : 'rateNonEur'

  // Calculate slot total
  const slotCost = definition.selectionMode === 'custom'
    ? value.customAmount
    : value.selectedItems.reduce((sum, item) => sum + item[rateKey], 0)

  // When searching, search across ALL options (not just filtered/city-relevant ones)
  // When not searching, show only the filtered (city-relevant) options
  const searchPool = search ? (allOptions || options) : options
  const filteredOptions = search
    ? searchPool.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : options

  // Toggle an item in multi-select
  const toggleItem = (opt: RateOption) => {
    const existing = value.selectedItems.find(i => i.rateId === opt.id)
    if (existing) {
      onChange({ ...value, selectedItems: value.selectedItems.filter(i => i.rateId !== opt.id) })
    } else {
      onChange({
        ...value,
        selectedItems: [...value.selectedItems, {
          rateId: opt.id,
          name: opt.name,
          rateEur: opt.rateEur,
          rateNonEur: opt.rateNonEur,
        }]
      })
    }
  }

  // Single select
  const selectSingle = (opt: RateOption | null) => {
    if (!opt) {
      onChange({ ...value, selectedItems: [] })
      return
    }
    const item: SelectedItem = {
      rateId: opt.id,
      name: opt.name,
      rateEur: opt.rateEur,
      rateNonEur: opt.rateNonEur,
    }
    // For accommodation, also store single supplement as second item
    const items: SelectedItem[] = [item]
    if (definition.slotId === 'accommodation' && (opt as any).single_supp_eur) {
      items.push({
        rateId: `${opt.id}_supp`,
        name: 'Single Supplement',
        rateEur: (opt as any).single_supp_eur || 0,
        rateNonEur: (opt as any).single_supp_non_eur || 0,
      })
    }
    onChange({ ...value, selectedItems: items })
  }

  return (
    <div className="flex items-stretch border-b border-gray-100 min-h-[44px] hover:bg-gray-50/50 transition-colors">
      {/* Label */}
      <div className="w-[160px] min-w-[160px] flex items-center gap-2 px-3 py-2 border-r border-gray-100">
        <span className="text-base">{definition.icon}</span>
        <span className="text-xs font-medium text-gray-700">{definition.label}</span>
      </div>

      {/* Selection Area */}
      <div className="flex-1 px-3 py-1.5 border-r border-gray-100">
        {definition.selectionMode === 'custom' ? (
          <input
            type="number"
            min={0}
            step={0.01}
            value={value.customAmount || ''}
            onChange={(e) => onChange({ ...value, customAmount: parseFloat(e.target.value) || 0 })}
            placeholder="Enter amount..."
            className="w-full px-2 py-1 text-sm border rounded"
          />
        ) : definition.selectionMode === 'single' || definition.selectionMode === 'auto' ? (
          <select
            value={value.selectedItems[0]?.rateId || ''}
            onChange={(e) => {
              const opt = options.find(o => o.id === e.target.value) || null
              selectSingle(opt)
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-white"
          >
            <option value="">— Select —</option>
            {filteredOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.name} — €{opt[rateKey].toFixed(2)}
                {opt.details ? ` (${opt.details})` : ''}
              </option>
            ))}
          </select>
        ) : (
          /* Multi-select: chips + dropdown */
          <div className="space-y-1">
            {/* Selected chips */}
            {value.selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {value.selectedItems.map(item => (
                  <span
                    key={item.rateId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full cursor-pointer hover:bg-red-50 hover:text-red-600 transition-colors"
                    onClick={() => onChange({ ...value, selectedItems: value.selectedItems.filter(i => i.rateId !== item.rateId) })}
                    title="Click to remove"
                  >
                    {item.name.length > 30 ? item.name.substring(0, 30) + '...' : item.name}
                    <span className="font-bold">×</span>
                  </span>
                ))}
              </div>
            )}
            {/* Search + dropdown */}
            {options.length > 5 && (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-0.5 text-xs border rounded"
              />
            )}
            <div className="max-h-[120px] overflow-y-auto">
              {filteredOptions.slice(0, 20).map(opt => {
                const isSelected = value.selectedItems.some(i => i.rateId === opt.id)
                return (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-2 px-1 py-0.5 text-xs cursor-pointer rounded hover:bg-blue-50 ${
                      isSelected ? 'bg-blue-50 font-medium' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItem(opt)}
                      className="w-3 h-3 text-blue-600 rounded"
                    />
                    <span className="flex-1 truncate">
                      {opt.name}
                      {opt.city ? ` (${opt.city})` : ''}
                    </span>
                    <span className="text-gray-500 whitespace-nowrap">€{opt[rateKey].toFixed(2)}</span>
                  </label>
                )
              })}
              {filteredOptions.length > 20 && (
                <div className="text-xs text-gray-400 px-1 py-0.5">
                  +{filteredOptions.length - 20} more — use search to filter
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cost */}
      <div className="w-[100px] min-w-[100px] flex items-center justify-end px-3 py-2">
        <span className={`text-sm font-bold ${slotCost > 0 ? 'text-green-600' : 'text-gray-300'}`}>
          €{slotCost.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
