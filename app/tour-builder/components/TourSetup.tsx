'use client'

import { useState } from 'react'
import { Tour } from '../types'

interface TourSetupProps {
  tour: Tour
  pax: number
  isEuroPassport: boolean
  onComplete: (tourData: Partial<Tour>) => void
  onPaxChange: (pax: number) => void
  onPassportTypeChange: (isEuro: boolean) => void
}

export default function TourSetup({
  tour,
  pax,
  isEuroPassport,
  onComplete,
  onPaxChange,
  onPassportTypeChange
}: TourSetupProps) {
  const [formData, setFormData] = useState({
    tour_name: tour.tour_name || '',
    duration_days: tour.duration_days || 1,
    cities: tour.cities.join(', ') || '',
    tour_type: tour.tour_type || 'custom',
    description: tour.description || ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.tour_name.trim()) {
      newErrors.tour_name = 'Tour name is required'
    }

    if (formData.duration_days < 1) {
      newErrors.duration_days = 'Duration must be at least 1 day'
    }

    if (formData.duration_days > 30) {
      newErrors.duration_days = 'Duration cannot exceed 30 days'
    }

    if (!formData.cities.trim()) {
      newErrors.cities = 'At least one city is required'
    }

    if (pax < 1) {
      newErrors.pax = 'At least 1 passenger is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    const citiesArray = formData.cities
      .split(',')
      .map(city => city.trim())
      .filter(city => city.length > 0)

    onComplete({
      tour_name: formData.tour_name,
      duration_days: formData.duration_days,
      cities: citiesArray,
      tour_type: formData.tour_type as Tour['tour_type'],
      description: formData.description,
      tour_code: `TOUR-${formData.tour_name.substring(0, 6).toUpperCase()}-${formData.duration_days}D-${Date.now().toString().slice(-4)}`
    })
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        🎯 Tour Setup
      </h2>
      <p className="text-gray-600 mb-6">
        Let's start by setting up the basic information for your tour
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tour Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tour Name *
          </label>
          <input
            type="text"
            value={formData.tour_name}
            onChange={(e) => setFormData({ ...formData, tour_name: e.target.value })}
            placeholder="e.g., Classic Egypt 8 Days"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.tour_name ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.tour_name && (
            <p className="mt-1 text-sm text-red-600">{errors.tour_name}</p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Duration (Days) *
          </label>
          <input
            type="number"
            min="1"
            max="30"
            value={formData.duration_days}
            onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) || 1 })}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.duration_days ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.duration_days && (
            <p className="mt-1 text-sm text-red-600">{errors.duration_days}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            Enter the number of days (1-30)
          </p>
        </div>

        {/* Cities */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cities *
          </label>
          <div className="space-y-2">
            <select
              multiple
              size={6}
              value={formData.cities.split(',').map(c => c.trim()).filter(c => c)}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value)
                setFormData({ ...formData, cities: selected.join(', ') })
              }}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.cities ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="Cairo">Cairo</option>
              <option value="Alexandria">Alexandria</option>
              <option value="Luxor">Luxor</option>
              <option value="Aswan">Aswan</option>
              <option value="Hurghada">Hurghada</option>
              <option value="Sharm El Sheikh">Sharm El Sheikh</option>
              <option value="Dahab">Dahab</option>
              <option value="Fayoum">Fayoum</option>
              <option value="Luxor-Aswan">Luxor-Aswan</option>
            </select>
            <p className="text-xs text-gray-500">
              Hold Ctrl (Cmd on Mac) to select multiple cities
            </p>
            <input
              type="text"
              value={formData.cities}
              onChange={(e) => setFormData({ ...formData, cities: e.target.value })}
              placeholder="Or type custom cities (comma-separated)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
          {errors.cities && (
            <p className="mt-1 text-sm text-red-600">{errors.cities}</p>
          )}
        </div>

        {/* Tour Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tour Type
          </label>
          <div className="grid grid-cols-4 gap-3">
            {[
              { value: 'budget', label: '💰 Budget', color: 'blue' },
              { value: 'standard', label: '⭐ Standard', color: 'green' },
              { value: 'premium', label: '💎 Premium', color: 'purple' },
              { value: 'luxury', label: '👑 Luxury', color: 'amber' }
            ].map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData({ ...formData, tour_type: type.value as Tour['tour_type'] })}
                className={`px-4 py-3 border-2 rounded-lg font-medium text-sm transition-all ${
                  formData.tour_type === type.value
                    ? `border-${type.color}-500 bg-${type.color}-50 text-${type.color}-700`
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description (Optional)
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of the tour..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Passengers & Passport (Display Only) */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-3">Pricing Parameters</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-blue-800 mb-1">
                Number of Passengers
              </label>
              <div className="text-2xl font-bold text-blue-900">{pax}</div>
              <p className="text-xs text-blue-700 mt-1">
                Adjust in the header above
              </p>
            </div>
            <div>
              <label className="block text-sm text-blue-800 mb-1">
                Passport Type
              </label>
              <div className="text-2xl font-bold text-blue-900">
                {isEuroPassport ? '🇪🇺 Euro' : '🌍 Non-Euro'}
              </div>
              <p className="text-xs text-blue-700 mt-1">
                Toggle in the header above
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={() => window.location.href = '/rates'}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Continue to Daily Planning →
          </button>
        </div>
      </form>
    </div>
  )
}