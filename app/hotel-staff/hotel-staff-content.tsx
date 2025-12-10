'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Crown, Star } from 'lucide-react'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

// ============================================
// INTERFACES
// ============================================

interface Hotel {
  id: string
  name: string
  city: string
}

interface HotelStaff {
  id: string
  name: string
  role?: string
  hotel_id?: string
  hotel?: Hotel
  phone: string
  whatsapp?: string
  email?: string
  languages?: string[]
  shift_times?: string
  notes?: string
  is_active: boolean
  tier: string | null
  is_preferred: boolean
  created_at: string
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

export default function HotelStaffContent() {
  const searchParams = useSearchParams()
  const [staff, setStaff] = useState<HotelStaff[]>([])
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedHotel, setSelectedHotel] = useState('all')
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingStaff, setEditingStaff] = useState<HotelStaff | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    hotel_id: '',
    phone: '',
    whatsapp: '',
    email: '',
    languages: [] as string[],
    shift_times: '',
    notes: '',
    is_active: true,
    tier: 'standard',
    is_preferred: false
  })

  // Fetch staff and hotels
  const fetchData = async () => {
    try {
      const [staffRes, hotelsRes] = await Promise.all([
        fetch('/api/resources/hotel-staff'),
        fetch('/api/resources/hotels')
      ])
      
      const staffData = await staffRes.json()
      const hotelsData = await hotelsRes.json()
      
      if (staffData.success) {
        setStaff(staffData.data)
      }
      if (hotelsData.success) {
        setHotels(hotelsData.data)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching data:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    
    const editId = searchParams.get('edit')
    if (editId) {
      const staffMember = staff.find(s => s.id === editId)
      if (staffMember) {
        handleEdit(staffMember)
      }
    }
  }, [searchParams])

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // Handle checkbox for active status
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      is_active: e.target.checked
    }))
  }

  // Handle languages
  const toggleLanguage = (language: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(language)
        ? prev.languages.filter(l => l !== language)
        : [...prev.languages, language]
    }))
  }

  // Open modal for new staff
  const handleAddNew = () => {
    setEditingStaff(null)
    setFormData({
      name: '',
      role: '',
      hotel_id: '',
      phone: '',
      whatsapp: '',
      email: '',
      languages: [],
      shift_times: '',
      notes: '',
      is_active: true,
      tier: 'standard',
      is_preferred: false
    })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (staffMember: HotelStaff) => {
    setEditingStaff(staffMember)
    setFormData({
      name: staffMember.name,
      role: staffMember.role || '',
      hotel_id: staffMember.hotel_id || '',
      phone: staffMember.phone,
      whatsapp: staffMember.whatsapp || '',
      email: staffMember.email || '',
      languages: staffMember.languages || [],
      shift_times: staffMember.shift_times || '',
      notes: staffMember.notes || '',
      is_active: staffMember.is_active,
      tier: staffMember.tier || 'standard',
      is_preferred: staffMember.is_preferred || false
    })
    setShowModal(true)
  }

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const url = editingStaff 
        ? `/api/resources/hotel-staff/${editingStaff.id}`
        : '/api/resources/hotel-staff'
      
      const method = editingStaff ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          hotel_id: formData.hotel_id || null
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(editingStaff ? 'Staff updated!' : 'Staff created!')
        setShowModal(false)
        fetchData()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error saving staff:', error)
      alert('Failed to save staff')
    }
  }

  // Delete staff
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return
    
    try {
      const response = await fetch(`/api/resources/hotel-staff/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Staff deleted!')
        fetchData()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error deleting staff:', error)
      alert('Failed to delete staff')
    }
  }
  
  // Filter staff
  const filteredStaff = staff.filter(member => {
    const matchesSearch = searchTerm === '' || 
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.hotel?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.phone.includes(searchTerm)
    
    const matchesHotel = selectedHotel === 'all' || member.hotel_id === selectedHotel
    const matchesActive = showInactive || member.is_active
    const matchesTier = filterTier === null || member.tier === filterTier
    
    return matchesSearch && matchesHotel && matchesActive && matchesTier
  })

  // Calculate stats
  const activeStaff = staff.filter(s => s.is_active).length
  const inactiveStaff = staff.filter(s => !s.is_active).length
  const assignedStaff = staff.filter(s => s.hotel_id).length
  const unassignedStaff = staff.filter(s => !s.hotel_id).length
  const preferredStaff = staff.filter(s => s.is_preferred).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading hotel staff...</p>
        </div>
      </div>
    )
  }

  const languagesList = ['English', 'Arabic', 'French', 'German', 'Spanish', 'Italian', 'Russian', 'Chinese', 'Japanese']

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Hotel Staff</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-pink-600" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNew}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-1.5"
              >
                <span>+</span>
                Add Staff
              </button>
              <Link 
                href="/rates"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Resources
              </Link>
              <Link 
                href="/" 
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="container mx-auto px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🛎️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-pink-600" />
            </div>
            <p className="text-xs text-gray-600">Total Staff</p>
            <p className="text-2xl font-bold text-gray-900">{staff.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">✓</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeStaff}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🏨</span>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Assigned</p>
            <p className="text-2xl font-bold text-gray-900">{assignedStaff}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">📋</span>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">Unassigned</p>
            <p className="text-2xl font-bold text-gray-900">{unassignedStaff}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            </div>
            <p className="text-xs text-gray-600">Preferred</p>
            <p className="text-2xl font-bold text-gray-900">{preferredStaff}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name, hotel, role, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-48">
              <select
                value={selectedHotel}
                onChange={(e) => setSelectedHotel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              >
                <option value="all">All Hotels</option>
                <option value="">Unassigned</option>
                {hotels.map(hotel => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </div>
            <div className="md:w-40">
              <select
                value={filterTier || 'all'}
                onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              >
                <option value="all">All Tiers</option>
                <option value="budget">Budget</option>
                <option value="standard">Standard</option>
                <option value="deluxe">Deluxe</option>
                <option value="luxury">Luxury</option>
              </select>
            </div>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                showInactive 
                  ? 'bg-white border border-red-300 text-red-700' 
                  : 'bg-white border border-green-300 text-green-700'
              }`}
            >
              {showInactive ? 'Active Only' : 'Show Inactive'}
            </button>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredStaff.length}</span> of {staff.length} staff members
            </p>
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Role</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Hotel</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Contact</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Languages</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Tier</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStaff.map((member, index) => (
                <tr key={member.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {member.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.name}</p>
                        {member.shift_times && <p className="text-xs text-gray-500">🕐 {member.shift_times}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                      {member.role || 'Staff'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {member.hotel ? (
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.hotel.name}</p>
                        <p className="text-xs text-gray-500">{member.hotel.city}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      <p className="text-gray-700">📞 {member.phone}</p>
                      {member.whatsapp && <p className="text-green-600">💬 {member.whatsapp}</p>}
                      {member.email && <p className="text-gray-500 text-xs">{member.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {member.languages?.map(lang => (
                        <span key={lang} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TierBadge tier={member.tier} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      member.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(member)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(member.id, member.name)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl text-gray-400">🛎️</span>
                      <p className="text-sm font-medium">No hotel staff found</p>
                      <button
                        onClick={handleAddNew}
                        className="mt-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        Add Your First Staff Member
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingStaff ? 'Edit Hotel Staff' : 'Add New Hotel Staff'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {/* Basic Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Mohamed Ali"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Front Desk Manager"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Assigned Hotel
                    </label>
                    <select
                      name="hotel_id"
                      value={formData.hotel_id}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="">-- No Hotel Assigned --</option>
                      {hotels.map(hotel => (
                        <option key={hotel.id} value={hotel.id}>
                          {hotel.name} ({hotel.city})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Leave unassigned if staff works at multiple hotels</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Shift Times
                    </label>
                    <input
                      type="text"
                      name="shift_times"
                      value={formData.shift_times}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., 7AM - 3PM"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Phone *
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="+20 123 456 789"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      WhatsApp
                    </label>
                    <input
                      type="tel"
                      name="whatsapp"
                      value={formData.whatsapp}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="+20 123 456 789"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="staff@hotel.com"
                    />
                  </div>
                </div>
              </div>

              {/* Languages */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Languages Spoken</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {languagesList.map(language => (
                    <label key={language} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.languages.includes(language)}
                        onChange={() => toggleLanguage(language)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{language}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Service Tier & Preference */}
              <div className="mb-4">
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
                        Preferred Staff Member
                      </span>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Preferred staff are prioritized when AI generates itineraries within the same tier.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  placeholder="Additional information about this staff member..."
                />
              </div>

              {/* Active Status */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={handleCheckboxChange}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active (available for assignments)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
                >
                  {editingStaff ? 'Update Staff' : 'Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}