'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Ship, Plus, Search, Edit, Trash2, X, Check, ChevronDown, AlertCircle, CheckCircle2, Crown, Star } from 'lucide-react'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

const CITIES = ['Luxor', 'Aswan', 'Cairo']
const SHIP_CATEGORIES = ['standard', 'deluxe', 'luxury']
const CABIN_TYPES = ['standard', 'deluxe', 'suite']

// ============================================
// INTERFACES
// ============================================

interface Cruise {
  id: string
  cruise_code: string
  ship_name: string
  ship_category: 'standard' | 'deluxe' | 'luxury'
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number
  cabin_type: 'standard' | 'deluxe' | 'suite'
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number | null
  meals_included: string
  sightseeing_included: boolean
  description: string | null
  notes: string | null
  is_active: boolean
  tier: string | null
  is_preferred: boolean
  created_at: string
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

// ============================================
// COMPONENTS
// ============================================

function TierBadge({ tier }: { tier: string | null }) {
  const tierConfig = TIER_OPTIONS.find(t => t.value === tier) || TIER_OPTIONS[1]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig.color}`}>
      {tierConfig.label}
    </span>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function CruisesPage() {
  const [cruises, setCruises] = useState<Cruise[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedCabin, setSelectedCabin] = useState('all')
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCruise, setEditingCruise] = useState<Cruise | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [formData, setFormData] = useState({
    cruise_code: '',
    ship_name: '',
    ship_category: 'deluxe' as 'standard' | 'deluxe' | 'luxury',
    route_name: '',
    embark_city: 'Luxor',
    disembark_city: 'Aswan',
    duration_nights: 4,
    cabin_type: 'standard' as 'standard' | 'deluxe' | 'suite',
    rate_single_eur: 0,
    rate_double_eur: 0,
    rate_triple_eur: 0,
    meals_included: 'full_board',
    sightseeing_included: false,
    description: '',
    notes: '',
    is_active: true,
    tier: 'standard',
    is_preferred: false
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchCruises = async () => {
    try {
      const response = await fetch('/api/rates/cruises')
      const data = await response.json()
      if (data.success) {
        setCruises(data.data)
      }
    } catch (error) {
      console.error('Error fetching cruises:', error)
      showToast('error', 'Failed to load cruises')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCruises()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }

  const generateCode = () => {
    const ship = formData.ship_name.substring(0, 8).toUpperCase().replace(/\s+/g, '')
    const nights = formData.duration_nights
    const cabin = formData.cabin_type.substring(0, 3).toUpperCase()
    return `CRUISE-${ship}-${nights}N-${cabin}`
  }

  const handleAddNew = () => {
    setEditingCruise(null)
    setFormData({
      cruise_code: '',
      ship_name: '',
      ship_category: 'deluxe',
      route_name: '',
      embark_city: 'Luxor',
      disembark_city: 'Aswan',
      duration_nights: 4,
      cabin_type: 'standard',
      rate_single_eur: 0,
      rate_double_eur: 0,
      rate_triple_eur: 0,
      meals_included: 'full_board',
      sightseeing_included: false,
      description: '',
      notes: '',
      is_active: true,
      tier: 'standard',
      is_preferred: false
    })
    setShowModal(true)
  }

  const handleEdit = (cruise: Cruise) => {
    setEditingCruise(cruise)
    setFormData({
      cruise_code: cruise.cruise_code,
      ship_name: cruise.ship_name,
      ship_category: cruise.ship_category,
      route_name: cruise.route_name,
      embark_city: cruise.embark_city,
      disembark_city: cruise.disembark_city,
      duration_nights: cruise.duration_nights,
      cabin_type: cruise.cabin_type,
      rate_single_eur: cruise.rate_single_eur,
      rate_double_eur: cruise.rate_double_eur,
      rate_triple_eur: cruise.rate_triple_eur || 0,
      meals_included: cruise.meals_included || 'full_board',
      sightseeing_included: cruise.sightseeing_included,
      description: cruise.description || '',
      notes: cruise.notes || '',
      is_active: cruise.is_active,
      tier: cruise.tier || 'standard',
      is_preferred: cruise.is_preferred || false
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const submitData = {
      ...formData,
      cruise_code: formData.cruise_code || generateCode(),
      route_name: formData.route_name || `${formData.embark_city} to ${formData.disembark_city}`,
      rate_triple_eur: formData.rate_triple_eur || null
    }

    try {
      const url = editingCruise 
        ? `/api/rates/cruises/${editingCruise.id}`
        : '/api/rates/cruises'
      
      const response = await fetch(url, {
        method: editingCruise ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingCruise ? 'Cruise updated!' : 'Cruise created!')
        setShowModal(false)
        fetchCruises()
      } else {
        showToast('error', data.error || 'Failed to save')
      }
    } catch (error) {
      showToast('error', 'Failed to save cruise')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete cruise "${name}"?`)) return

    try {
      const response = await fetch(`/api/rates/cruises/${id}`, { method: 'DELETE' })
      const data = await response.json()
      
      if (data.success) {
        showToast('success', 'Cruise deleted!')
        fetchCruises()
      } else {
        showToast('error', data.error || 'Failed to delete')
      }
    } catch (error) {
      showToast('error', 'Failed to delete cruise')
    }
  }

  const filteredCruises = cruises.filter(cruise => {
    const matchesSearch = searchTerm === '' ||
      cruise.ship_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cruise.cruise_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cruise.embark_city.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || cruise.ship_category === selectedCategory
    const matchesCabin = selectedCabin === 'all' || cruise.cabin_type === selectedCabin
    const matchesActive = showInactive || cruise.is_active
    const matchesTier = filterTier === null || cruise.tier === filterTier

    return matchesSearch && matchesCategory && matchesCabin && matchesActive && matchesTier
  })

  const stats = {
    total: cruises.length,
    active: cruises.filter(c => c.is_active).length,
    preferred: cruises.filter(c => c.is_preferred).length,
    ships: new Set(cruises.map(c => c.ship_name)).size,
    avgRate: cruises.length > 0 
      ? Math.round(cruises.reduce((sum, c) => sum + c.rate_double_eur, 0) / cruises.length)
      : 0
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading cruises...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ship className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">Nile Cruises</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Cruise
              </button>
              <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                ← Rates Hub
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Total Rates</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <div className="flex items-center gap-1 mb-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <p className="text-xs text-gray-600">Preferred</p>
            <p className="text-2xl font-bold text-amber-600">{stats.preferred}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Ships</p>
            <p className="text-2xl font-bold text-blue-600">{stats.ships}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Avg. Double Rate</p>
            <p className="text-2xl font-bold text-purple-600">€{stats.avgRate}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ship, code, or city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Categories</option>
              {SHIP_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
            <select
              value={selectedCabin}
              onChange={(e) => setSelectedCabin(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Cabins</option>
              {CABIN_TYPES.map(type => (
                <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
              ))}
            </select>
            <select
              value={filterTier || 'all'}
              onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Tiers</option>
              <option value="budget">Budget</option>
              <option value="standard">Standard</option>
              <option value="deluxe">Deluxe</option>
              <option value="luxury">Luxury</option>
            </select>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium ${
                showInactive ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-700 border border-green-200'
              }`}
            >
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Showing {filteredCruises.length} of {cruises.length} cruise rates
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <table className="w-full">
            <thead className="bg-blue-50 border-b border-blue-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">Ship / Code</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Category</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">Route</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Nights</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Cabin</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Tier</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Single</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Double</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Triple</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Status</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCruises.map((cruise, idx) => (
                <tr key={cruise.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {cruise.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{cruise.ship_name}</p>
                        <p className="text-xs text-gray-500 font-mono">{cruise.cruise_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      cruise.ship_category === 'luxury' ? 'bg-amber-100 text-amber-800' :
                      cruise.ship_category === 'deluxe' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {cruise.ship_category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {cruise.embark_city} → {cruise.disembark_city}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      {cruise.duration_nights}N
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      cruise.cabin_type === 'suite' ? 'bg-purple-100 text-purple-800' :
                      cruise.cabin_type === 'deluxe' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {cruise.cabin_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TierBadge tier={cruise.tier} />
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                    €{cruise.rate_single_eur}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">
                    €{cruise.rate_double_eur}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">
                    {cruise.rate_triple_eur ? `€${cruise.rate_triple_eur}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      cruise.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {cruise.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(cruise)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(cruise.id, cruise.ship_name)} className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCruises.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    <Ship className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No cruises found</p>
                    <button onClick={handleAddNew} className="mt-2 text-sm text-blue-600 hover:underline">
                      Add your first cruise
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingCruise ? 'Edit Cruise' : 'Add New Cruise'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Ship Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ship Name *</label>
                  <input
                    type="text"
                    name="ship_name"
                    value={formData.ship_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    placeholder="MS Sonesta St. George"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ship Category *</label>
                  <select
                    name="ship_category"
                    value={formData.ship_category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {SHIP_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Route */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Embark City *</label>
                  <select
                    name="embark_city"
                    value={formData.embark_city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {CITIES.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Disembark City *</label>
                  <select
                    name="disembark_city"
                    value={formData.disembark_city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {CITIES.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Duration (Nights) *</label>
                  <input
                    type="number"
                    name="duration_nights"
                    value={formData.duration_nights}
                    onChange={handleChange}
                    min="1"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Cabin & Rates */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cabin Type *</label>
                  <select
                    name="cabin_type"
                    value={formData.cabin_type}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {CABIN_TYPES.map(type => (
                      <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Single Rate (€) *</label>
                  <input
                    type="number"
                    name="rate_single_eur"
                    value={formData.rate_single_eur}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Double Rate (€) *</label>
                  <input
                    type="number"
                    name="rate_double_eur"
                    value={formData.rate_double_eur}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Triple Rate (€)</label>
                  <input
                    type="number"
                    name="rate_triple_eur"
                    value={formData.rate_triple_eur}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Service Tier & Preference */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Service Tier & Preference</h3>
                
                {/* Tier Selection */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    Service Tier
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TIER_OPTIONS.map((tier) => (
                      <button
                        key={tier.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, tier: tier.value })}
                        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                          formData.tier === tier.value
                            ? tier.value === 'luxury' 
                              ? 'bg-amber-600 text-white'
                              : tier.value === 'deluxe'
                              ? 'bg-purple-600 text-white'
                              : tier.value === 'standard'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {tier.value === 'luxury' && <Crown className="w-3.5 h-3.5" />}
                        {tier.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preferred Toggle */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_preferred}
                      onChange={(e) => setFormData({ ...formData, is_preferred: e.target.checked })}
                      className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-600" />
                        Preferred Cruise
                      </span>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Preferred cruises are prioritized when AI generates itineraries within the same tier.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cruise Code</label>
                  <input
                    type="text"
                    name="cruise_code"
                    value={formData.cruise_code}
                    onChange={handleChange}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="sightseeing_included"
                      checked={formData.sightseeing_included}
                      onChange={handleCheckbox}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Sightseeing Included</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleCheckbox}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description / Notes</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  placeholder="Additional details..."
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
                  Cancel
                </button>
                <button type="submit" className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {editingCruise ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}