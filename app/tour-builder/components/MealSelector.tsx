'use client'

import { useState, useEffect } from 'react'
import { MealRate } from '../types'

interface MealSelectorProps {
  city: string
  mealType: 'Lunch' | 'Dinner'
  selectedMeal?: MealRate
  pax: number
  isEuroPassport: boolean
  onSelect: (meal: MealRate | undefined) => void
}

export default function MealSelector({
  city,
  mealType,
  selectedMeal,
  pax,
  isEuroPassport,
  onSelect
}: MealSelectorProps) {
  const [meals, setMeals] = useState<MealRate[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    tier: 'all',
    cuisine: 'all'
  })

  // Fetch meals when city changes
  useEffect(() => {
    if (!city) {
      setMeals([])
      return
    }

    fetchMeals()
  }, [city, mealType])

  const fetchMeals = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/rates?type=meal&city=${city}&meal_type=${mealType}`)
      const data = await response.json()
      
      if (data.success) {
        // Ensure data.data is an array
        const mealsData = Array.isArray(data.data) ? data.data : []
        setMeals(mealsData)
      } else {
        setMeals([])
      }
    } catch (error) {
      console.error('Failed to fetch meals:', error)
      setMeals([])
    } finally {
      setLoading(false)
    }
  }

  // Filter meals
  const filteredMeals = meals.filter(meal => {
    if (filter.tier !== 'all' && meal.tier !== filter.tier) return false
    if (filter.cuisine !== 'all' && meal.cuisine_type !== filter.cuisine) return false
    return true
  })

  // Get unique cuisines
  const cuisines = Array.from(new Set(meals.map(m => m.cuisine_type)))

  // Calculate total price
  const getPrice = (meal: MealRate) => {
    const ratePerPerson = isEuroPassport ? meal.base_rate_eur : meal.base_rate_non_eur
    return pax * ratePerPerson
  }

  if (!city) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          Please select a city first
        </p>
      </div>
    )
  }

  const icon = mealType === 'Lunch' ? '🥗' : '🍽️'

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {icon} {mealType}
      </label>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <select
          value={filter.tier}
          onChange={(e) => setFilter({ ...filter, tier: e.target.value })}
          className="text-xs px-2 py-1 border border-gray-300 rounded flex-1"
        >
          <option value="all">All Tiers</option>
          <option value="budget">Budget</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>

        <select
          value={filter.cuisine}
          onChange={(e) => setFilter({ ...filter, cuisine: e.target.value })}
          className="text-xs px-2 py-1 border border-gray-300 rounded flex-1"
        >
          <option value="all">All Cuisines</option>
          {cuisines.map(cuisine => (
            <option key={cuisine} value={cuisine}>{cuisine}</option>
          ))}
        </select>
      </div>

      {/* Selection Box */}
      <div className="border border-gray-300 rounded-lg bg-white">
        {loading ? (
          <div className="p-4 text-center text-gray-600">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
            <p className="text-sm">Loading {mealType.toLowerCase()} options...</p>
          </div>
        ) : filteredMeals.length === 0 ? (
          <div className="p-4 text-center text-gray-600">
            <p className="text-sm">No {mealType.toLowerCase()} options found for {city}</p>
            <button
              onClick={() => setFilter({ tier: 'all', cuisine: 'all' })}
              className="text-xs text-blue-600 hover:text-blue-700 mt-2"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            {/* No Selection Option */}
            <button
              onClick={() => onSelect(undefined)}
              className={`w-full text-left px-4 py-2.5 border-b hover:bg-gray-50 transition-colors ${
                !selectedMeal ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
              }`}
            >
              <div className="font-medium text-gray-900 text-sm">No {mealType.toLowerCase()}</div>
              <div className="text-xs text-gray-500">Skip {mealType.toLowerCase()} for this day</div>
            </button>

            {/* Meal Options */}
            {filteredMeals.map((meal) => (
              <button
                key={meal.id}
                onClick={() => onSelect(meal)}
                className={`w-full text-left px-4 py-2.5 border-b hover:bg-gray-50 transition-colors ${
                  selectedMeal?.id === meal.id
                    ? 'bg-blue-50 border-l-4 border-l-blue-600'
                    : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 text-sm">
                      {meal.restaurant_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        meal.tier === 'premium' ? 'bg-blue-100 text-blue-700' :
                        meal.tier === 'standard' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {meal.tier}
                      </span>
                      <span className="text-xs text-gray-600">
                        {meal.cuisine_type}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {meal.restaurant_type}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-bold text-gray-900 text-sm">
                      €{getPrice(meal).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {pax} pax
                    </div>
                    <div className="text-xs text-gray-400">
                      €{(isEuroPassport ? meal.base_rate_eur : meal.base_rate_non_eur).toFixed(2)}/person
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Meal Info */}
      {selectedMeal && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex justify-between items-start text-sm">
            <div>
              <div className="font-semibold text-green-900">
                {selectedMeal.restaurant_name}
              </div>
              <div className="text-green-700 text-xs mt-1">
                {selectedMeal.cuisine_type} • {selectedMeal.restaurant_type}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-green-900">
                €{getPrice(selectedMeal).toFixed(2)}
              </div>
              <div className="text-xs text-green-700">
                {pax} pax × €{(isEuroPassport ? selectedMeal.base_rate_eur : selectedMeal.base_rate_non_eur).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-2 text-xs text-gray-500">
        {filteredMeals.length} {mealType.toLowerCase()} option{filteredMeals.length !== 1 ? 's' : ''} in {city}
      </div>
    </div>
  )
}