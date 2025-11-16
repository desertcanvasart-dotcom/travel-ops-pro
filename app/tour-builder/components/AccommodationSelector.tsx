'use client'

import { useState, useEffect } from 'react'
import { AccommodationRate } from '../types'

interface AccommodationSelectorProps {
  city: string
  selectedAccommodation?: AccommodationRate
  pax: number
  isEuroPassport: boolean
  onSelect: (accommodation: AccommodationRate | undefined) => void
}

export default function AccommodationSelector({
  city,
  selectedAccommodation,
  pax,
  isEuroPassport,
  onSelect
}: AccommodationSelectorProps) {
  const [accommodations, setAccommodations] = useState<AccommodationRate[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    tier: 'all',
    board_basis: 'all',
    min_stars: 0
  })

  // Fetch accommodations when city changes
  useEffect(() => {
    if (!city) {
      setAccommodations([])
      return
    }

    fetchAccommodations()
  }, [city])

  const fetchAccommodations = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/rates?type=accommodation&city=${city}`)
      const data = await response.json()
      
      if (data.success) {
        // Ensure data.data is an array
        const accommodationsData = Array.isArray(data.data) ? data.data : []
        setAccommodations(accommodationsData)
      } else {
        setAccommodations([])
      }
    } catch (error) {
      console.error('Failed to fetch accommodations:', error)
      setAccommodations([])
    } finally {
      setLoading(false)
    }
  }

  // Filter accommodations
  const filteredAccommodations = accommodations.filter(acc => {
    if (filter.tier !== 'all' && acc.tier !== filter.tier) return false
    if (filter.board_basis !== 'all' && acc.board_basis !== filter.board_basis) return false
    if (acc.star_rating < filter.min_stars) return false
    return true
  })

  // Calculate rooms needed and price
  const roomsNeeded = Math.ceil(pax / 2)
  const getPrice = (acc: AccommodationRate) => {
    const ratePerRoom = isEuroPassport ? acc.base_rate_eur : acc.base_rate_non_eur
    return roomsNeeded * ratePerRoom
  }

  if (!city) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          Please select a city first to see available accommodations
        </p>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        🏨 Accommodation
      </label>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <select
          value={filter.tier}
          onChange={(e) => setFilter({ ...filter, tier: e.target.value })}
          className="text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="all">All Tiers</option>
          <option value="budget">Budget</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="luxury">Luxury</option>
        </select>

        <select
          value={filter.board_basis}
          onChange={(e) => setFilter({ ...filter, board_basis: e.target.value })}
          className="text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="all">All Board Basis</option>
          <option value="BB">BB (Bed & Breakfast)</option>
          <option value="HB">HB (Half Board)</option>
          <option value="FB">FB (Full Board)</option>
          <option value="AI">AI (All Inclusive)</option>
        </select>

        <select
          value={filter.min_stars}
          onChange={(e) => setFilter({ ...filter, min_stars: parseInt(e.target.value) })}
          className="text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="0">All Stars</option>
          <option value="3">3+ Stars</option>
          <option value="4">4+ Stars</option>
          <option value="5">5 Stars</option>
        </select>
      </div>

      {/* Selection Box */}
      <div className="border border-gray-300 rounded-lg bg-white">
        {loading ? (
          <div className="p-4 text-center text-gray-600">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
            <p className="text-sm">Loading accommodations...</p>
          </div>
        ) : filteredAccommodations.length === 0 ? (
          <div className="p-4 text-center text-gray-600">
            <p className="text-sm">No accommodations found for {city}</p>
            <button
              onClick={() => setFilter({ tier: 'all', board_basis: 'all', min_stars: 0 })}
              className="text-xs text-blue-600 hover:text-blue-700 mt-2"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {/* No Selection Option */}
            <button
              onClick={() => onSelect(undefined)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                !selectedAccommodation ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
              }`}
            >
              <div className="font-medium text-gray-900">No accommodation</div>
              <div className="text-xs text-gray-500">Skip accommodation for this day</div>
            </button>

            {/* Accommodation Options */}
            {filteredAccommodations.map((acc) => (
              <button
                key={acc.id}
                onClick={() => onSelect(acc)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                  selectedAccommodation?.id === acc.id
                    ? 'bg-blue-50 border-l-4 border-l-blue-600'
                    : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {acc.property_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-yellow-600">
                        {'⭐'.repeat(acc.star_rating)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        acc.tier === 'luxury' ? 'bg-purple-100 text-purple-700' :
                        acc.tier === 'premium' ? 'bg-blue-100 text-blue-700' :
                        acc.tier === 'standard' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {acc.tier}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        {acc.board_basis}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {acc.room_type} • {acc.property_type}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-bold text-gray-900">
                      €{getPrice(acc).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {roomsNeeded} room{roomsNeeded > 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-gray-400">
                      €{(isEuroPassport ? acc.base_rate_eur : acc.base_rate_non_eur).toFixed(2)}/room
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      {selectedAccommodation && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex justify-between items-start text-sm">
            <div>
              <div className="font-semibold text-blue-900">
                {selectedAccommodation.property_name}
              </div>
              <div className="text-blue-700 text-xs mt-1">
                {roomsNeeded} {selectedAccommodation.room_type} room{roomsNeeded > 1 ? 's' : ''}
              </div>
              <div className="text-blue-600 text-xs mt-1">
                Board: {selectedAccommodation.board_basis}
                {selectedAccommodation.board_basis === 'BB' && ' (Breakfast only)'}
                {selectedAccommodation.board_basis === 'HB' && ' (Breakfast + Dinner)'}
                {selectedAccommodation.board_basis === 'FB' && ' (All meals)'}
                {selectedAccommodation.board_basis === 'AI' && ' (All inclusive)'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-900">
                €{getPrice(selectedAccommodation).toFixed(2)}
              </div>
              <div className="text-xs text-blue-700">
                Total for {pax} pax
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-2 text-xs text-gray-500">
        Showing {filteredAccommodations.length} of {accommodations.length} properties in {city}
      </div>
    </div>
  )
}