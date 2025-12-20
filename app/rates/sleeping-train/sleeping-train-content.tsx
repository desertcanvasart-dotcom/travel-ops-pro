'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BedDouble,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  Download,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Table2,
  ArrowRight,
  Moon
} from 'lucide-react'

// Sleeping train routes (Cairo-Luxor-Aswan corridor)
const SLEEPER_CITIES = [
  'Cairo',
  'Giza',
  'Luxor',
  'Aswan'
]

const CABIN_TYPES = [
  'Single Cabin',
  'Double Cabin',
  'Suite Cabin',
  'Royal Suite'
]

const OPERATORS = [
  'Watania Sleeping Trains',
  'ENR Sleeper Service'
]

const SEASONS = [
  'Peak Season',
  'High Season',
  'Low Season',
  'Year Round'
]

interface SleepingTrainRate {
  id: string
  service_code: string
  origin_city: string
  destination_city: string
  cabin_type: string
  rate_oneway_eur: number
  rate_roundtrip_eur?: number
  departure_time?: string
  arrival_time?: string
  rate_valid_from?: string
  rate_valid_to?: string
  season?: string
  operator_name?: string
  supplier_id?: string
  description?: string
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function SleepingTrainRatesContent() {
  const searchParams = useSearchParams()

  const [rates, setRates] = useState<SleepingTrainRate[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrigin, setSelectedOrigin] = useState('')
  const [selectedDestination, setSelectedDestination] = useState('')
  const [selectedCabin, setSelectedCabin] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // UI State
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<SleepingTrainRate | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'compact'>('table')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null)

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  // Date helpers
  const today = new Date().toISOString().split('T')[0]
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Generate service code
  const generateServiceCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'SLP-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const [formData, setFormData] = useState({
    service_code: '',
    origin_city: '',
    destination_city: '',
    cabin_type: '',
    rate_oneway_eur: 0,
    rate_roundtrip_eur: 0,
    departure_time: '',
    arrival_time: '',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    season: '',
    operator_name: '',
    description: '',
    notes: '',
    is_active: true
  })

  // Fetch rates
  const fetchRates = async () => {
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.append('active_only', 'true')

      const response = await fetch(`/api/rates/sleeping-trains?${params}`)
      const data = await response.json()

      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching sleeping train rates:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchRates()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedOrigin, selectedDestination, selectedCabin, showInactive, itemsPerPage])

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: generateServiceCode(),
      origin_city: '',
      destination_city: '',
      cabin_type: '',
      rate_oneway_eur: 0,
      rate_roundtrip_eur: 0,
      departure_time: '',
      arrival_time: '',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      season: '',
      operator_name: '',
      description: '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: SleepingTrainRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code || '',
      origin_city: rate.origin_city || '',
      destination_city: rate.destination_city || '',
      cabin_type: rate.cabin_type || '',
      rate_oneway_eur: rate.rate_oneway_eur || 0,
      rate_roundtrip_eur: rate.rate_roundtrip_eur || 0,
      departure_time: rate.departure_time || '',
      arrival_time: rate.arrival_time || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      season: rate.season || '',
      operator_name: rate.operator_name || '',
      description: rate.description || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingRate
        ? `/api/rates/sleeping-trains/${editingRate.id}`
        : '/api/rates/sleeping-trains'

      const method = editingRate ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        showToast('error', data.error || 'Failed to save')
        return
      }

      showToast('success', editingRate ? 'Rate updated!' : 'Rate created!')
      setShowModal(false)
      fetchRates()
    } catch (error) {
      console.error('Error saving rate:', error)
      showToast('error', 'Failed to save rate')
    }
  }

  const handleDelete = async (id: string, route: string) => {
    if (!confirm(`Delete rate for "${route}"?`)) return

    try {
      const response = await fetch(`/api/rates/sleeping-trains/${id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        showToast('success', 'Rate deleted!')
        fetchRates()
      } else {
        showToast('error', data.error || 'Failed to delete')
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      showToast('error', 'Failed to delete')
    }
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' ||
      rate.origin_city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.destination_city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.cabin_type?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesOrigin = selectedOrigin === '' || rate.origin_city === selectedOrigin
    const matchesDestination = selectedDestination === '' || rate.destination_city === selectedDestination
    const matchesCabin = selectedCabin === '' || rate.cabin_type === selectedCabin
    const matchesActive = showInactive || rate.is_active

    return matchesSearch && matchesOrigin && matchesDestination && matchesCabin && matchesActive
  })

  // Pagination
  const totalPages = Math.ceil(filteredRates.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRates = filteredRates.slice(startIndex, startIndex + itemsPerPage)

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  const avgOneway = rates.length > 0
    ? (rates.reduce((sum, r) => sum + (r.rate_oneway_eur || 0), 0) / rates.filter(r => (r.rate_oneway_eur || 0) > 0).length || 0).toFixed(0)
    : '0'
  const uniqueRoutes = [...new Set(rates.map(r => `${r.origin_city}-${r.destination_city}`))].length

  // Prevent hydration mismatch
  if (!mounted) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading sleeping train rates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-gray-50 min-h-screen">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <BedDouble className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Sleeping Train Rates
              <Moon className="w-4 h-4 text-indigo-400" />
            </h1>
            <p className="text-sm text-gray-600">Overnight sleeper train cabin pricing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {/* Export CSV */}}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Rate
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <BedDouble className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rates.length}</p>
          <p className="text-xs text-gray-600">Total Rates</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{activeRates}</p>
          <p className="text-xs text-gray-600">Active</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 font-bold">€</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">€{avgOneway}</p>
          <p className="text-xs text-gray-600">Avg. One-way</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{uniqueRoutes}</p>
          <p className="text-xs text-gray-600">Routes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
              />
            </div>
          </div>

          {/* Origin Filter */}
          <select
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Origins</option>
            {SLEEPER_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          {/* Destination Filter */}
          <select
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Destinations</option>
            {SLEEPER_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          {/* Cabin Filter */}
          <select
            value={selectedCabin}
            onChange={(e) => setSelectedCabin(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Cabins</option>
            {CABIN_TYPES.map(cabin => (
              <option key={cabin} value={cabin}>{cabin}</option>
            ))}
          </select>

          {/* Active Only Toggle */}
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
              showInactive
                ? 'bg-gray-200 text-gray-700'
                : 'bg-green-100 text-green-700'
            }`}
          >
            {showInactive ? 'Show All' : 'Active Only'}
          </button>

          {/* View Mode */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 ${viewMode === 'table' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Table2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 ${viewMode === 'cards' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={`p-2 ${viewMode === 'compact' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Showing <span className="font-semibold">{paginatedRates.length}</span> of{' '}
            <span className="font-semibold">{filteredRates.length}</span> rates
          </p>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rates Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRates.length === 0 ? (
          <div className="p-12 text-center">
            <BedDouble className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rates Found</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm || selectedOrigin || selectedDestination || selectedCabin
                ? 'Try adjusting your filters'
                : 'Get started by adding your first sleeping train rate'}
            </p>
            <button
              onClick={handleAddNew}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              Add First Rate
            </button>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Route</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cabin</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Schedule</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">One-way</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Roundtrip</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <BedDouble className="w-4 h-4 text-indigo-500" />
                        <div>
                          <span className="text-sm font-semibold text-gray-900">
                            {rate.origin_city} <ArrowRight className="w-3 h-3 inline mx-1" /> {rate.destination_city}
                          </span>
                          <p className="text-xs text-gray-500">{rate.service_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                        {rate.cabin_type || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {rate.departure_time || rate.arrival_time ? (
                        <span className="text-sm text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {rate.departure_time || '—'} → {rate.arrival_time || '—'}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">€{rate.rate_oneway_eur}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rate.rate_roundtrip_eur ? (
                        <span className="text-sm text-gray-600">€{rate.rate_roundtrip_eur}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(rate)}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(rate.id, `${rate.origin_city} → ${rate.destination_city}`)}
                          className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedRates.map((rate) => (
              <div key={rate.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BedDouble className="w-5 h-5 text-indigo-500" />
                    <span className="font-semibold text-gray-900">
                      {rate.origin_city} → {rate.destination_city}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                    {rate.cabin_type}
                  </span>
                  {rate.season && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                      {rate.season}
                    </span>
                  )}
                </div>

                {(rate.departure_time || rate.arrival_time) && (
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    <Moon className="w-3 h-3" />
                    Dep: {rate.departure_time || '—'} • Arr: {rate.arrival_time || '—'}
                  </p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">One-way / Roundtrip</p>
                    <p className="text-lg font-bold text-green-600">
                      €{rate.rate_oneway_eur}
                      {rate.rate_roundtrip_eur && (
                        <span className="text-sm text-gray-500 font-normal"> / €{rate.rate_roundtrip_eur}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(rate)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rate.id, `${rate.origin_city} → ${rate.destination_city}`)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {paginatedRates.map((rate) => (
              <div key={rate.id} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <BedDouble className="w-4 h-4 text-indigo-500" />
                  <span className="font-medium text-gray-900">
                    {rate.origin_city} → {rate.destination_city}
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                    {rate.cabin_type}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-green-600">€{rate.rate_oneway_eur}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(rate)} className="p-1 text-gray-400 hover:text-primary-600">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(rate.id, `${rate.origin_city} → ${rate.destination_city}`)} className="p-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-600">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRate ? 'Edit Sleeping Train Rate' : 'Add Sleeping Train Rate'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Route Info */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">1</span>
                  Route & Cabin Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service Code</label>
                    <input
                      type="text"
                      name="service_code"
                      value={formData.service_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Operator</label>
                    <select
                      name="operator_name"
                      value={formData.operator_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Operator</option>
                      {OPERATORS.map(op => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Origin City *</label>
                    <select
                      name="origin_city"
                      value={formData.origin_city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Origin</option>
                      {SLEEPER_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Destination City *</label>
                    <select
                      name="destination_city"
                      value={formData.destination_city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Destination</option>
                      {SLEEPER_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cabin Type *</label>
                    <select
                      name="cabin_type"
                      value={formData.cabin_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Cabin</option>
                      {CABIN_TYPES.map(cabin => (
                        <option key={cabin} value={cabin}>{cabin}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Season</label>
                    <select
                      name="season"
                      value={formData.season}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Season</option>
                      {SEASONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  Schedule
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Departure Time</label>
                    <input
                      type="text"
                      name="departure_time"
                      value={formData.departure_time}
                      onChange={handleChange}
                      placeholder="e.g., 20:00"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Arrival Time</label>
                    <input
                      type="text"
                      name="arrival_time"
                      value={formData.arrival_time}
                      onChange={handleChange}
                      placeholder="e.g., 06:00"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">3</span>
                  Pricing
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">One-way Rate (€) *</label>
                    <input
                      type="number"
                      name="rate_oneway_eur"
                      value={formData.rate_oneway_eur}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Roundtrip Rate (€)</label>
                    <input
                      type="number"
                      name="rate_roundtrip_eur"
                      value={formData.rate_roundtrip_eur}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Validity */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">4</span>
                  Validity Period
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
                    <input
                      type="date"
                      name="rate_valid_from"
                      value={formData.rate_valid_from}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid To</label>
                    <input
                      type="date"
                      name="rate_valid_to"
                      value={formData.rate_valid_to}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Notes & Status */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-900">Active (available for bookings)</span>
                </label>
              </div>
            </form>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingRate ? 'Update Rate' : 'Create Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}