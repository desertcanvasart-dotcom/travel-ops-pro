'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Phone,
  Mail,
  Globe,
  Star,
  Calendar,
  DollarSign,
  AlertCircle,
  X,
  Check,
  Eye,
  Crown,
  Award
} from 'lucide-react'

interface Guide {
  id: string
  name: string
  email: string | null
  phone: string | null
  languages: string[]
  specialties: string[]
  certification_number: string | null
  license_expiry: string | null
  is_active: boolean
  max_group_size: number | null
  hourly_rate: number | null
  daily_rate: number | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  address: string | null
  notes: string | null
  profile_photo_url: string | null
  tier: string | null
  is_preferred: boolean
  active_bookings?: number
  upcoming_bookings?: number
  total_revenue?: number
}

const COMMON_LANGUAGES = [
  'English', 'Arabic', 'French', 'German', 'Spanish', 
  'Italian', 'Russian', 'Chinese', 'Japanese', 'Portuguese'
]

const COMMON_SPECIALTIES = [
  'Ancient Egypt', 'Cairo Tours', 'Pyramids', 'Luxor',
  'Valley of Kings', 'Temples', 'Desert Safari', 'Siwa Oasis',
  'Red Sea', 'Diving', 'Beach Tours', 'Cultural Tours',
  'Adventure Tours', 'Photography Tours'
]

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

export default function GuidesPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(true)

  useEffect(() => {
    fetchGuides()
  }, [])

  const fetchGuides = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/guides?with_stats=true')
      const data = await response.json()
      
      if (data.success) {
        setGuides(data.data)
      }
    } catch (error) {
      console.error('Error fetching guides:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingGuide(null)
    setShowModal(true)
  }

  const handleEdit = (guide: Guide) => {
    setEditingGuide(guide)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this guide?')) return

    try {
      const response = await fetch(`/api/guides/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setGuides(guides.filter(g => g.id !== id))
      } else {
        alert(data.error || 'Failed to delete guide')
      }
    } catch (error) {
      console.error('Error deleting guide:', error)
      alert('Failed to delete guide')
    }
  }

  const filteredGuides = guides.filter(guide => {
    const matchesSearch = 
      guide.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guide.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guide.languages.some(lang => lang.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesActive = filterActive === null || guide.is_active === filterActive
    const matchesTier = filterTier === null || guide.tier === filterTier

    return matchesSearch && matchesActive && matchesTier
  })

  const stats = {
    total: guides.length,
    active: guides.filter(g => g.is_active).length,
    inactive: guides.filter(g => !g.is_active).length,
    preferred: guides.filter(g => g.is_preferred).length,
    avgDailyRate: guides.reduce((sum, g) => sum + (g.daily_rate || 0), 0) / guides.length || 0
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading guides...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tour Guides</h1>
          <p className="text-sm text-gray-600 mt-0.5">Manage your tour guides and staff</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Guide
        </button>
      </div>

      {/* Statistics */}
      {showStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            icon={<Users className="w-4 h-4" />}
            label="Total Guides"
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
            dotColor="bg-amber-500"
          />
          <StatCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Avg. Daily Rate"
            value={`€${stats.avgDailyRate.toFixed(0)}`}
            dotColor="bg-orange-600"
          />
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
                placeholder="Search by name, email, or language..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
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

          {/* Tier Filter */}
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-gray-400" />
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
        </div>

        {/* Results Count */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Showing <span className="font-semibold text-gray-900">{filteredGuides.length}</span> of{' '}
            <span className="font-semibold text-gray-900">{guides.length}</span> guides
          </p>
        </div>
      </div>

      {/* Guides List */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {filteredGuides.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Guides Found</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchQuery || filterActive !== null || filterTier !== null
                ? 'Try adjusting your filters'
                : 'Get started by adding your first guide'}
            </p>
            {!searchQuery && filterActive === null && filterTier === null && (
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Add First Guide
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Guide</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Languages</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Tier</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Daily Rate</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Status</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredGuides.map((guide) => (
                  <tr key={guide.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-900">{guide.name}</span>
                            {guide.is_preferred && (
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                            )}
                          </div>
                          {guide.email && (
                            <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
                              <Mail className="w-3 h-3" />
                              {guide.email}
                            </div>
                          )}
                          {guide.phone && (
                            <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
                              <Phone className="w-3 h-3" />
                              {guide.phone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {guide.languages.slice(0, 3).map((lang, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium"
                          >
                            {lang}
                          </span>
                        ))}
                        {guide.languages.length > 3 && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            +{guide.languages.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={guide.tier} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {guide.daily_rate ? `€${guide.daily_rate}` : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          guide.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {guide.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/guides/${guide.id}`}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleEdit(guide)}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(guide.id)}
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
        <GuideModal
          guide={editingGuide}
          onClose={() => {
            setShowModal(false)
            setEditingGuide(null)
          }}
          onSuccess={() => {
            setShowModal(false)
            setEditingGuide(null)
            fetchGuides()
          }}
        />
      )}
    </div>
  )
}

function TierBadge({ tier }: { tier: string | null }) {
  const tierConfig = TIER_OPTIONS.find(t => t.value === tier) || TIER_OPTIONS[1] // default to standard
  
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

function GuideModal({ guide, onClose, onSuccess }: any) {
  const [formData, setFormData] = useState({
    name: guide?.name || '',
    email: guide?.email || '',
    phone: guide?.phone || '',
    languages: guide?.languages || [],
    specialties: guide?.specialties || [],
    certification_number: guide?.certification_number || '',
    license_expiry: guide?.license_expiry || '',
    is_active: guide?.is_active !== undefined ? guide.is_active : true,
    max_group_size: guide?.max_group_size || '',
    daily_rate: guide?.daily_rate || '',
    hourly_rate: guide?.hourly_rate || '',
    emergency_contact_name: guide?.emergency_contact_name || '',
    emergency_contact_phone: guide?.emergency_contact_phone || '',
    address: guide?.address || '',
    notes: guide?.notes || '',
    tier: guide?.tier || 'standard',
    is_preferred: guide?.is_preferred || false,
  })

  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = guide ? `/api/guides/${guide.id}` : '/api/guides'
      const method = guide ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          max_group_size: formData.max_group_size ? parseInt(formData.max_group_size as any) : null,
          daily_rate: formData.daily_rate ? parseFloat(formData.daily_rate as any) : null,
          hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate as any) : null,
        })
      })

      const data = await response.json()

      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to save guide')
      }
    } catch (error) {
      console.error('Error saving guide:', error)
      alert('Failed to save guide')
    } finally {
      setSaving(false)
    }
  }

  const toggleLanguage = (lang: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l: string) => l !== lang)
        : [...prev.languages, lang]
    }))
  }

  const toggleSpecialty = (spec: string) => {
    setFormData(prev => ({
      ...prev,
      specialties: prev.specialties.includes(spec)
        ? prev.specialties.filter((s: string) => s !== spec)
        : [...prev.specialties, spec]
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {guide ? 'Edit Guide' : 'Add New Guide'}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Max Group Size
                  </label>
                  <input
                    type="number"
                    value={formData.max_group_size}
                    onChange={(e) => setFormData({ ...formData, max_group_size: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Tier & Preferred Section - NEW */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Service Tier & Preference</h3>
              
              {/* Tier Selection */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Service Tier
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, tier: tier.value })}
                      className={`px-4 py-2 text-sm rounded-lg border-2 font-medium transition-all ${
                        formData.tier === tier.value
                          ? tier.value === 'budget'
                            ? 'border-gray-600 bg-gray-100 text-gray-800'
                            : tier.value === 'standard'
                            ? 'border-blue-600 bg-blue-50 text-blue-800'
                            : tier.value === 'deluxe'
                            ? 'border-purple-600 bg-purple-50 text-purple-800'
                            : 'border-amber-600 bg-amber-50 text-amber-800'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {tier.value === 'luxury' && <Crown className="w-3.5 h-3.5 inline mr-1" />}
                      {tier.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Tier determines which itineraries this guide will be assigned to based on client's selected style.
                </p>
              </div>

              {/* Preferred Toggle */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_preferred}
                    onChange={(e) => setFormData({ ...formData, is_preferred: e.target.checked })}
                    className="w-5 h-5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-semibold text-gray-900">
                        Preferred Supplier
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Preferred guides are prioritized when AI generates itineraries within the same tier.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Languages */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Languages</h3>
              <div className="flex flex-wrap gap-2">
                {COMMON_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                      formData.languages.includes(lang)
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {/* Specialties */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Specialties</h3>
              <div className="flex flex-wrap gap-2">
                {COMMON_SPECIALTIES.map((spec) => (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => toggleSpecialty(spec)}
                    className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                      formData.specialties.includes(spec)
                        ? 'border-purple-600 bg-purple-50 text-purple-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {spec}
                  </button>
                ))}
              </div>
            </div>

            {/* Rates */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Rates & Certification</h3>
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
                    Hourly Rate (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.hourly_rate}
                    onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Certification Number
                  </label>
                  <input
                    type="text"
                    value={formData.certification_number}
                    onChange={(e) => setFormData({ ...formData, certification_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    License Expiry
                  </label>
                  <input
                    type="date"
                    value={formData.license_expiry}
                    onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Emergency Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Address & Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Address
              </label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>

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
                  Guide is active and available for bookings
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
                {guide ? 'Update Guide' : 'Create Guide'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}