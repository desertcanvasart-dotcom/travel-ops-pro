'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Truck,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Phone,
  Calendar,
  DollarSign,
  AlertCircle,
  X,
  Check,
  Eye,
  Wifi,
  Wind,
  Star,
  Users,
  Crown,
  MapPin
} from 'lucide-react'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

const VEHICLE_TYPES = [
  { value: 'car', label: 'Car', icon: '🚗' },
  { value: 'sedan', label: 'Sedan', icon: '🚗' },
  { value: 'van', label: 'Van', icon: '🚐' },
  { value: 'minivan', label: 'Minivan', icon: '🚐' },
  { value: 'minibus', label: 'Minibus', icon: '🚌' },
  { value: 'bus', label: 'Bus', icon: '🚍' },
  { value: 'suv', label: 'SUV', icon: '🚙' },
]

const CITY_OPTIONS = [
  'Cairo',
  'Giza',
  'Luxor',
  'Aswan',
  'Alexandria',
  'Hurghada',
  'Sharm El Sheikh',
  'Dahab',
  'Marsa Alam',
  'Siwa',
  'Fayoum'
]

// ============================================
// INTERFACES
// ============================================

interface Vehicle {
  id: string
  name: string
  vehicle_type: 'car' | 'sedan' | 'van' | 'minivan' | 'minibus' | 'bus' | 'suv'
  make: string | null
  model: string | null
  year: number | null
  license_plate: string | null
  registration_number: string | null
  passenger_capacity: number
  has_ac: boolean
  has_wifi: boolean
  is_luxury: boolean
  is_active: boolean
  current_mileage: number | null
  last_service_date: string | null
  next_service_date: string | null
  insurance_expiry: string | null
  daily_rate: number | null
  rate_per_km: number | null
  default_driver_name: string | null
  default_driver_phone: string | null
  notes: string | null
  photo_url: string | null
  tier: string | null
  is_preferred: boolean
  city: string | null
  active_bookings?: number
  upcoming_bookings?: number
  total_revenue?: number
}

// ============================================
// HELPER COMPONENTS
// ============================================

function TierBadge({ tier }: { tier: string | null }) {
  const tierConfig = TIER_OPTIONS.find(t => t.value === tier) || TIER_OPTIONS[1]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig.color}`}>
      {tierConfig.label}
    </span>
  )
}

function StatCard({ icon, label, value, dotColor }: any) {
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-gray-400">
          {icon}
        </div>
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </div>
  )
}
// ============================================
// MAIN COMPONENT
// ============================================

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [filterCity, setFilterCity] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(true)

  useEffect(() => {
    fetchVehicles()
  }, [])

  const fetchVehicles = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/vehicles?with_stats=true')
      const data = await response.json()
      
      if (data.success) {
        setVehicles(data.data)
      }
    } catch (error) {
      console.error('Error fetching vehicles:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingVehicle(null)
    setShowModal(true)
  }

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vehicle?')) return

    try {
      const response = await fetch(`/api/vehicles/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setVehicles(vehicles.filter(v => v.id !== id))
      } else {
        alert(data.error || 'Failed to delete vehicle')
      }
    } catch (error) {
      console.error('Error deleting vehicle:', error)
      alert('Failed to delete vehicle')
    }
  }

  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = 
      vehicle.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.license_plate?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.make?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesActive = filterActive === null || vehicle.is_active === filterActive
    const matchesType = filterType === 'all' || vehicle.vehicle_type === filterType
    const matchesTier = filterTier === null || vehicle.tier === filterTier
    const matchesCity = filterCity === null || vehicle.city === filterCity

    return matchesSearch && matchesActive && matchesType && matchesTier && matchesCity
  })

  const stats = {
    total: vehicles.length,
    active: vehicles.filter(v => v.is_active).length,
    inactive: vehicles.filter(v => !v.is_active).length,
    preferred: vehicles.filter(v => v.is_preferred).length,
    withBookings: vehicles.filter(v => (v.active_bookings || 0) + (v.upcoming_bookings || 0) > 0).length,
    avgDailyRate: vehicles.reduce((sum, v) => sum + (v.daily_rate || 0), 0) / vehicles.length || 0,
    typeBreakdown: VEHICLE_TYPES.reduce((acc, type) => ({
      ...acc,
      [type.value]: vehicles.filter(v => v.vehicle_type === type.value).length
    }), {} as Record<string, number>)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading vehicles...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vehicle Fleet</h1>
          <p className="text-sm text-gray-600 mt-0.5">Manage your transportation fleet</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Vehicle
        </button>
      </div>

      {/* Statistics */}
      {showStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <StatCard
            icon={<Truck className="w-4 h-4" />}
            label="Total Vehicles"
            value={stats.total}
            dotColor="bg-blue-600"
          />
          <StatCard
            icon={<Check className="w-4 h-4" />}
            label="Active"
            value={stats.active}
            dotColor="bg-green-600"
          />
          <StatCard
            icon={<X className="w-4 h-4" />}
            label="Inactive"
            value={stats.inactive}
            dotColor="bg-gray-600"
          />
          <StatCard
            icon={<Star className="w-4 h-4" />}
            label="Preferred"
            value={stats.preferred}
            dotColor="bg-amber-600"
          />
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
            label="With Bookings"
            value={stats.withBookings}
            dotColor="bg-purple-600"
          />
          <StatCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Avg. Daily Rate"
            value={`€${stats.avgDailyRate.toFixed(0)}`}
            dotColor="bg-orange-600"
          />
        </div>
      )}

      {/* Vehicle Type Breakdown */}
      {showStats && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-bold text-gray-900">Fleet Composition</h3>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
          </div>
          <div className="grid grid-cols-7 gap-3">
            {VEHICLE_TYPES.map(type => (
              <div key={type.value} className="text-center">
                <div className="text-2xl mb-1 text-gray-400">{type.icon}</div>
                <div className="text-xl font-bold text-gray-900">{stats.typeBreakdown[type.value] || 0}</div>
                <div className="text-xs text-gray-600">{type.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, license plate, or make..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
          </div>

          {/* City Filter */}
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            <select
              value={filterCity || 'all'}
              onChange={(e) => setFilterCity(e.target.value === 'all' ? null : e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
            >
              <option value="all">All Cities</option>
              {CITY_OPTIONS.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
            >
              <option value="all">All Types</option>
              {VEHICLE_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Tier Filter */}
          <div>
            <select
              value={filterTier || 'all'}
              onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
            >
              <option value="all">All Tiers</option>
              <option value="budget">Budget</option>
              <option value="standard">Standard</option>
              <option value="deluxe">Deluxe</option>
              <option value="luxury">Luxury</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterActive === null ? 'all' : filterActive ? 'active' : 'inactive'}
              onChange={(e) => {
                const value = e.target.value
                setFilterActive(value === 'all' ? null : value === 'active')
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Showing <span className="font-semibold text-gray-900">{filteredVehicles.length}</span> of{' '}
            <span className="font-semibold text-gray-900">{vehicles.length}</span> vehicles
          </p>
        </div>
      </div>

      {/* Vehicles List */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {filteredVehicles.length === 0 ? (
          <div className="p-12 text-center">
            <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Vehicles Found</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchQuery || filterActive !== null || filterType !== 'all' || filterTier !== null || filterCity !== null
                ? 'Try adjusting your filters'
                : 'Get started by adding your first vehicle'}
            </p>
            {!searchQuery && filterActive === null && filterType === 'all' && filterTier === null && filterCity === null && (
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Add First Vehicle
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Vehicle</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">City</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Type</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Capacity</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Features</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Tier</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Bookings</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Daily Rate</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Status</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {vehicle.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{vehicle.name}</div>
                          {vehicle.license_plate && (
                            <div className="text-xs text-gray-600 mt-0.5">
                              {vehicle.license_plate}
                            </div>
                          )}
                          {vehicle.make && vehicle.model && (
                            <div className="text-xs text-gray-500">
                              {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-700">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {vehicle.city || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                        {VEHICLE_TYPES.find(t => t.value === vehicle.vehicle_type)?.label || vehicle.vehicle_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                        <Users className="w-4 h-4 text-gray-400" />
                        {vehicle.passenger_capacity}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {vehicle.has_ac && (
                          <div className="p-1 bg-gray-100 text-gray-600 rounded" title="Air Conditioning">
                            <Wind className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {vehicle.has_wifi && (
                          <div className="p-1 bg-gray-100 text-gray-600 rounded" title="WiFi">
                            <Wifi className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {vehicle.is_luxury && (
                          <div className="p-1 bg-gray-100 text-gray-600 rounded" title="Luxury">
                            <Crown className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={vehicle.tier} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div className="font-medium text-gray-900">
                          {(vehicle.active_bookings || 0) + (vehicle.upcoming_bookings || 0)} total
                        </div>
                        <div className="text-gray-600">
                          {vehicle.active_bookings || 0} active
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {vehicle.daily_rate ? `€${vehicle.daily_rate}` : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          vehicle.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {vehicle.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/vehicles/${vehicle.id}`}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleEdit(vehicle)}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(vehicle.id)}
                          className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <VehicleModal
          vehicle={editingVehicle}
          onClose={() => {
            setShowModal(false)
            setEditingVehicle(null)
          }}
          onSuccess={() => {
            setShowModal(false)
            setEditingVehicle(null)
            fetchVehicles()
          }}
        />
      )}
    </div>
  )
}

function VehicleModal({ vehicle, onClose, onSuccess }: any) {
  const [formData, setFormData] = useState({
    name: vehicle?.name || '',
    vehicle_type: vehicle?.vehicle_type || 'van',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year || '',
    license_plate: vehicle?.license_plate || '',
    registration_number: vehicle?.registration_number || '',
    passenger_capacity: vehicle?.passenger_capacity || '',
    has_ac: vehicle?.has_ac !== undefined ? vehicle.has_ac : true,
    has_wifi: vehicle?.has_wifi !== undefined ? vehicle.has_wifi : false,
    is_luxury: vehicle?.is_luxury !== undefined ? vehicle.is_luxury : false,
    is_active: vehicle?.is_active !== undefined ? vehicle.is_active : true,
    current_mileage: vehicle?.current_mileage || '',
    last_service_date: vehicle?.last_service_date || '',
    next_service_date: vehicle?.next_service_date || '',
    insurance_expiry: vehicle?.insurance_expiry || '',
    daily_rate: vehicle?.daily_rate || '',
    rate_per_km: vehicle?.rate_per_km || '',
    default_driver_name: vehicle?.default_driver_name || '',
    default_driver_phone: vehicle?.default_driver_phone || '',
    notes: vehicle?.notes || '',
    tier: vehicle?.tier || 'standard',
    is_preferred: vehicle?.is_preferred || false,
    city: vehicle?.city || '',
  })

  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = vehicle ? `/api/vehicles/${vehicle.id}` : '/api/vehicles'
      const method = vehicle ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          year: formData.year ? parseInt(formData.year as any) : null,
          passenger_capacity: formData.passenger_capacity ? parseInt(formData.passenger_capacity as any) : null,
          current_mileage: formData.current_mileage ? parseInt(formData.current_mileage as any) : null,
          daily_rate: formData.daily_rate ? parseFloat(formData.daily_rate as any) : null,
          rate_per_km: formData.rate_per_km ? parseFloat(formData.rate_per_km as any) : null,
          city: formData.city || null,
        })
      })

      const data = await response.json()

      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to save vehicle')
      }
    } catch (error) {
      console.error('Error saving vehicle:', error)
      alert('Failed to save vehicle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {vehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="space-y-4">
            {/* Basic Information */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Vehicle Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Toyota Hiace - White"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Vehicle Type *
                  </label>
                  <select
                    required
                    value={formData.vehicle_type}
                    onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  >
                    {VEHICLE_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    City *
                  </label>
                  <select
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  >
                    <option value="">Select City...</option>
                    {CITY_OPTIONS.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Make
                  </label>
                  <input
                    type="text"
                    value={formData.make}
                    onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                    placeholder="e.g., Toyota"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="e.g., Hiace"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    placeholder="e.g., 2022"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Passenger Capacity *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.passenger_capacity}
                    onChange={(e) => setFormData({ ...formData, passenger_capacity: e.target.value })}
                    placeholder="e.g., 12"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Identification */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Identification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    License Plate
                  </label>
                  <input
                    type="text"
                    value={formData.license_plate}
                    onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                    placeholder="e.g., CAI-1234"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    value={formData.registration_number}
                    onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Features */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Features</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.has_ac}
                    onChange={(e) => setFormData({ ...formData, has_ac: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-600"
                  />
                  <Wind className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">Air Conditioning</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.has_wifi}
                    onChange={(e) => setFormData({ ...formData, has_wifi: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-600"
                  />
                  <Wifi className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">WiFi Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_luxury}
                    onChange={(e) => setFormData({ ...formData, is_luxury: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-600"
                  />
                  <Crown className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">Luxury Vehicle</span>
                </label>
              </div>
            </div>

            {/* Service Tier & Preference */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Service Tier & Preference</h3>
              
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
                      Preferred Vehicle
                    </span>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Preferred vehicles are prioritized when AI generates itineraries within the same tier.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Maintenance & Insurance */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Maintenance & Insurance</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Current Mileage (km)
                  </label>
                  <input
                    type="number"
                    value={formData.current_mileage}
                    onChange={(e) => setFormData({ ...formData, current_mileage: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Last Service Date
                  </label>
                  <input
                    type="date"
                    value={formData.last_service_date}
                    onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Next Service Date
                  </label>
                  <input
                    type="date"
                    value={formData.next_service_date}
                    onChange={(e) => setFormData({ ...formData, next_service_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Insurance Expiry
                  </label>
                  <input
                    type="date"
                    value={formData.insurance_expiry}
                    onChange={(e) => setFormData({ ...formData, insurance_expiry: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Rates */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Rates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Daily Rate (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.daily_rate}
                    onChange={(e) => setFormData({ ...formData, daily_rate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Rate per KM (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.rate_per_km}
                    onChange={(e) => setFormData({ ...formData, rate_per_km: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Default Driver */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Default Driver (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={formData.default_driver_name}
                    onChange={(e) => setFormData({ ...formData, default_driver_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Driver Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.default_driver_phone}
                    onChange={(e) => setFormData({ ...formData, default_driver_phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>

            {/* Status */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-600"
                />
                <span className="text-sm font-medium text-gray-900">
                  Vehicle is active and available for bookings
                </span>
              </label>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {vehicle ? 'Update Vehicle' : 'Create Vehicle'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}