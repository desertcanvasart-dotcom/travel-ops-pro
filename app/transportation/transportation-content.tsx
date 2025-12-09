'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  X,
  Car,
  ChevronDown
} from 'lucide-react'

interface TransportationRate {
  id: string
  service_code: string
  service_type: string
  vehicle_type: string
  capacity_min: number
  capacity_max: number
  city: string
  base_rate_eur: number
  base_rate_non: number        // Mapped from base_rate_non_eur by API
  base_rate_non_eur?: number   // Actual database column
  season: string | null
  rate_valid_from: string
  rate_valid_to: string
  supplier_name: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface FormData {
  service_code: string
  service_type: string
  vehicle_type: string
  capacity_min: number
  capacity_max: number
  city: string
  base_rate_eur: number
  base_rate_non: number
  season: string
  rate_valid_from: string
  rate_valid_to: string
  supplier_name: string
  notes: string
  is_active: boolean
}

const initialFormData: FormData = {
  service_code: '',
  service_type: 'airport_transfer',
  vehicle_type: 'Sedan',
  capacity_min: 1,
  capacity_max: 2,
  city: '',
  base_rate_eur: 0,
  base_rate_non: 0,
  season: '',
  rate_valid_from: new Date().toISOString().split('T')[0],
  rate_valid_to: '2099-12-31',
  supplier_name: '',
  notes: '',
  is_active: true
}

const SERVICE_TYPES = [
  { value: 'airport_transfer', label: 'Airport Transfer' },
  { value: 'day_tour', label: 'Day Tour' },
  { value: 'multi_day', label: 'Multi-Day' },
  { value: 'city_transfer', label: 'City Transfer' },
  { value: 'intercity', label: 'Intercity' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'sound_light', label: 'Sound & Light Transfer' },
]

const VEHICLE_TYPES = [
  { value: 'Sedan', label: 'Sedan', minPax: 1, maxPax: 2 },
  { value: 'Minivan', label: 'Minivan', minPax: 3, maxPax: 8 },
  { value: 'Van', label: 'Van', minPax: 9, maxPax: 14 },
  { value: 'Minibus', label: 'Minibus', minPax: 15, maxPax: 24 },
  { value: 'Bus', label: 'Bus', minPax: 25, maxPax: 50 },
  { value: 'SUV', label: 'SUV', minPax: 1, maxPax: 4 },
  { value: '4x4', label: '4x4', minPax: 1, maxPax: 6 },
]

const CITIES = ['Cairo', 'Giza', 'Luxor', 'Aswan', 'Alexandria', 'Hurghada', 'Sharm El Sheikh', 'Dahab', 'Siwa', 'Marsa Alam']

export default function TransportationContent() {
  const [rates, setRates] = useState<TransportationRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<TransportationRate | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRates = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (cityFilter) params.append('city', cityFilter)
      if (serviceTypeFilter) params.append('serviceType', serviceTypeFilter)
      if (vehicleTypeFilter) params.append('vehicleType', vehicleTypeFilter)
      if (!showInactive) params.append('activeOnly', 'true')
      
      const response = await fetch(`/api/resources/transportation?${params}`)
      if (response.ok) {
        const data = await response.json()
        setRates(data)
      }
    } catch (error) {
      console.error('Error fetching transportation rates:', error)
    } finally {
      setLoading(false)
    }
  }, [cityFilter, serviceTypeFilter, vehicleTypeFilter, showInactive])

  useEffect(() => {
    fetchRates()
  }, [fetchRates])

  const generateServiceCode = (city: string, serviceType: string, vehicleType: string) => {
    if (!city) return ''
    const cityCode = city.toUpperCase().replace(/\s+/g, '-')
    const typeCode = serviceType.toUpperCase().replace(/_/g, '-')
    const vehicleCode = vehicleType.toUpperCase()
    return `${cityCode}-${typeCode}-${vehicleCode}`
  }

  const handleVehicleTypeChange = (vehicleType: string) => {
    const vehicle = VEHICLE_TYPES.find(v => v.value === vehicleType)
    setFormData(prev => ({
      ...prev,
      vehicle_type: vehicleType,
      capacity_min: vehicle?.minPax || 1,
      capacity_max: vehicle?.maxPax || 2,
      service_code: generateServiceCode(prev.city, prev.service_type, vehicleType)
    }))
  }

  const handleCityChange = (city: string) => {
    setFormData(prev => ({
      ...prev,
      city,
      service_code: generateServiceCode(city, prev.service_type, prev.vehicle_type)
    }))
  }

  const handleServiceTypeChange = (serviceType: string) => {
    setFormData(prev => ({
      ...prev,
      service_type: serviceType,
      service_code: generateServiceCode(prev.city, serviceType, prev.vehicle_type)
    }))
  }

  const openAddModal = () => {
    setEditingRate(null)
    setFormData(initialFormData)
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (rate: TransportationRate) => {
    setEditingRate(rate)
    setError(null)
    setFormData({
      service_code: rate.service_code,
      service_type: rate.service_type,
      vehicle_type: rate.vehicle_type,
      capacity_min: rate.capacity_min,
      capacity_max: rate.capacity_max,
      city: rate.city,
      base_rate_eur: rate.base_rate_eur,
      base_rate_non: rate.base_rate_non || rate.base_rate_non_eur || 0,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from,
      rate_valid_to: rate.rate_valid_to,
      supplier_name: rate.supplier_name || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Validation
    if (!formData.city) {
      setError('Please select a city')
      setSaving(false)
      return
    }

    if (!formData.base_rate_eur || formData.base_rate_eur <= 0) {
      setError('Please enter a valid EUR rate')
      setSaving(false)
      return
    }

    try {
      const url = editingRate 
        ? `/api/resources/transportation/${editingRate.id}`
        : '/api/resources/transportation'
      
      const response = await fetch(url, {
        method: editingRate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const result = await response.json()

      if (response.ok) {
        setIsModalOpen(false)
        fetchRates()
      } else {
        setError(result.error || 'Failed to save transportation rate')
      }
    } catch (error) {
      console.error('Error saving transportation rate:', error)
      setError('Failed to save transportation rate. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transportation rate?')) return

    try {
      const response = await fetch(`/api/resources/transportation/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchRates()
      } else {
        alert('Failed to delete transportation rate')
      }
    } catch (error) {
      console.error('Error deleting transportation rate:', error)
      alert('Failed to delete transportation rate')
    }
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = 
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.vehicle_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rate.supplier_name && rate.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesSearch
  })

  // Stats
  const totalRates = rates.length
  const activeRates = rates.filter(r => r.is_active).length
  const inactiveRates = totalRates - activeRates
  const uniqueCities = [...new Set(rates.map(r => r.city))].length
  const uniqueVehicleTypes = [...new Set(rates.map(r => r.vehicle_type))].length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header - Fixed with proper spacing */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-900">Transportation Rates</h1>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Rate
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-500">Total Rates</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totalRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-500">Active</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{activeRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <span className="text-xs text-gray-500">Inactive</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{inactiveRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            <span className="text-xs text-gray-500">Cities</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{uniqueCities}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-xs text-gray-500">Vehicle Types</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{uniqueVehicleTypes}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search rates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="relative">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Cities</option>
            {CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Service Types</option>
            {SERVICE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={vehicleTypeFilter}
            onChange={(e) => setVehicleTypeFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Vehicles</option>
            {VEHICLE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
            showInactive 
              ? 'bg-gray-100 border-gray-300 text-gray-700' 
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {showInactive ? 'Hide Inactive' : 'Show Inactive'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Service Code</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Service Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Vehicle</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Capacity</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">City</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">EUR Rate</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRates.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  No transportation rates found
                </td>
              </tr>
            ) : (
              filteredRates.map((rate) => (
                <tr key={rate.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className="text-sm font-mono text-gray-900">{rate.service_code}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-600">
                      {SERVICE_TYPES.find(t => t.value === rate.service_type)?.label || rate.service_type}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm font-medium text-gray-900">{rate.vehicle_type}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-600">{rate.capacity_min || 1}-{rate.capacity_max} pax</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-600">{rate.city}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm font-medium text-gray-900">€{Number(rate.base_rate_eur).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      rate.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {rate.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(rate)}
                        className="p-1 text-gray-400 hover:text-[#647C47] transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rate.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal - Fixed layout with better padding */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRate ? 'Edit Transportation Rate' : 'Add Transportation Rate'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Basic Information</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      City <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">Select City</option>
                      {CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Service Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.service_type}
                      onChange={(e) => handleServiceTypeChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {SERVICE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Vehicle Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.vehicle_type}
                      onChange={(e) => handleVehicleTypeChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {VEHICLE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Service Code
                    </label>
                    <input
                      type="text"
                      value={formData.service_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, service_code: e.target.value }))}
                      placeholder="Auto-generated"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-gray-50 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Min Passengers
                    </label>
                    <input
                      type="number"
                      value={formData.capacity_min}
                      onChange={(e) => setFormData(prev => ({ ...prev, capacity_min: parseInt(e.target.value) || 1 }))}
                      min="1"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Max Passengers
                    </label>
                    <input
                      type="number"
                      value={formData.capacity_max}
                      onChange={(e) => setFormData(prev => ({ ...prev, capacity_max: parseInt(e.target.value) || 2 }))}
                      min="1"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Pricing</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      EUR Rate <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">€</span>
                      <input
                        type="number"
                        value={formData.base_rate_eur}
                        onChange={(e) => setFormData(prev => ({ ...prev, base_rate_eur: parseFloat(e.target.value) || 0 }))}
                        step="0.01"
                        min="0"
                        required
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Non-EUR Rate
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        value={formData.base_rate_non}
                        onChange={(e) => setFormData(prev => ({ ...prev, base_rate_non: parseFloat(e.target.value) || 0 }))}
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Validity */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Validity Period</h3>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Season
                    </label>
                    <select
                      value={formData.season}
                      onChange={(e) => setFormData(prev => ({ ...prev, season: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">All Year</option>
                      <option value="high_season">High Season</option>
                      <option value="low_season">Low Season</option>
                      <option value="peak">Peak</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Valid From
                    </label>
                    <input
                      type="date"
                      value={formData.rate_valid_from}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate_valid_from: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Valid To
                    </label>
                    <input
                      type="date"
                      value={formData.rate_valid_to}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate_valid_to: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Additional Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    value={formData.supplier_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                    placeholder="e.g., Cairo Cars Co."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Any additional notes..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-600">
                    Active (available for booking)
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[#647C47] text-white rounded-md hover:bg-[#4f6238] transition-colors disabled:opacity-50 min-w-[100px]"
                >
                  {saving ? 'Saving...' : editingRate ? 'Update Rate' : 'Add Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}