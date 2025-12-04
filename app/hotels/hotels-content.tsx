'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Building2,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  X,
  Check,
  Download,
  Upload,
  LayoutGrid,
  List,
  Table2,
  Star,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'

// ============================================
// EGYPTIAN CITIES
// ============================================
const EGYPTIAN_CITIES = [
  'Cairo',
  'Giza',
  'Alexandria',
  'Luxor',
  'Aswan',
  'Hurghada',
  'Sharm El Sheikh',
  'Dahab',
  'Marsa Alam',
  'El Gouna',
  'Siwa',
  'Fayoum',
  'Port Said',
  'Suez',
  'Ismailia',
  'Taba',
  'Nuweiba',
  'Safaga',
  'Ain Sokhna',
  'Ras Sudr',
  'Saint Catherine',
  'Bahariya Oasis',
  'Kharga Oasis',
  'Dakhla Oasis'
]

// ============================================
// INTERFACES
// ============================================

interface Hotel {
  id: string
  name: string
  property_type?: string
  star_rating?: number
  city: string
  address?: string
  contact_person?: string
  phone?: string
  email?: string
  whatsapp?: string
  capacity?: number
  amenities?: string[]
  notes?: string
  is_active: boolean
  created_at: string
  // Rate fields
  rate_single_eur?: number
  rate_double_eur?: number
  rate_triple_eur?: number
  rate_single_non_eur?: number
  rate_double_non_eur?: number
  rate_triple_non_eur?: number
  rate_suite_eur?: number
  rate_suite_non_eur?: number
  high_season_markup_percent?: number
  peak_season_markup_percent?: number
  breakfast_included?: boolean
  breakfast_rate_eur?: number
  rate_valid_from?: string
  rate_valid_to?: string
  meal_plan?: string
  child_policy?: string
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

type ViewMode = 'table' | 'cards' | 'compact'

// ============================================
// TOAST COMPONENT
// ============================================
function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = toast.type === 'success' ? 'bg-green-50 border-green-200' :
                  toast.type === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
  
  const iconColor = toast.type === 'success' ? 'text-green-600' :
                    toast.type === 'error' ? 'text-red-600' :
                    'text-blue-600'
  
  const textColor = toast.type === 'success' ? 'text-green-800' :
                    toast.type === 'error' ? 'text-red-800' :
                    'text-blue-800'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColor} animate-slide-in`}>
      {toast.type === 'success' ? (
        <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />
      ) : toast.type === 'error' ? (
        <AlertCircle className={`w-5 h-5 ${iconColor}`} />
      ) : (
        <AlertCircle className={`w-5 h-5 ${iconColor}`} />
      )}
      <span className={`text-sm font-medium ${textColor}`}>{toast.message}</span>
      <button onClick={onClose} className={`ml-2 ${iconColor} hover:opacity-70`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function HotelsContent() {
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const today = new Date().toISOString().split('T')[0]
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  
  const [formData, setFormData] = useState({
    name: '',
    property_type: 'hotel',
    star_rating: 5,
    city: '',
    address: '',
    contact_person: '',
    phone: '',
    email: '',
    whatsapp: '',
    capacity: 0,
    amenities: [] as string[],
    notes: '',
    is_active: true,
    rate_single_eur: 0,
    rate_double_eur: 0,
    rate_triple_eur: 0,
    rate_single_non_eur: 0,
    rate_double_non_eur: 0,
    rate_triple_non_eur: 0,
    rate_suite_eur: 0,
    rate_suite_non_eur: 0,
    high_season_markup_percent: 0,
    peak_season_markup_percent: 0,
    breakfast_included: true,
    breakfast_rate_eur: 0,
    rate_valid_from: today,
    rate_valid_to: nextYear,
    meal_plan: 'BB',
    child_policy: ''
  })

  // Toast helpers
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Fetch hotels
  const fetchHotels = async () => {
    try {
      const response = await fetch('/api/resources/hotels')
      const data = await response.json()
      if (data.success) {
        setHotels(data.data)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching hotels:', error)
      showToast('error', 'Failed to load hotels')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHotels()
  }, [])

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  // Handle checkbox
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }))
  }

  // Handle amenities
  const toggleAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }))
  }

  // Open modal for new hotel
  const handleAddNew = () => {
    setEditingHotel(null)
    setFormData({
      name: '',
      property_type: 'hotel',
      star_rating: 5,
      city: '',
      address: '',
      contact_person: '',
      phone: '',
      email: '',
      whatsapp: '',
      capacity: 0,
      amenities: [],
      notes: '',
      is_active: true,
      rate_single_eur: 0,
      rate_double_eur: 0,
      rate_triple_eur: 0,
      rate_single_non_eur: 0,
      rate_double_non_eur: 0,
      rate_triple_non_eur: 0,
      rate_suite_eur: 0,
      rate_suite_non_eur: 0,
      high_season_markup_percent: 0,
      peak_season_markup_percent: 0,
      breakfast_included: true,
      breakfast_rate_eur: 0,
      rate_valid_from: today,
      rate_valid_to: nextYear,
      meal_plan: 'BB',
      child_policy: ''
    })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (hotel: Hotel) => {
    setEditingHotel(hotel)
    setFormData({
      name: hotel.name,
      property_type: hotel.property_type || 'hotel',
      star_rating: hotel.star_rating || 5,
      city: hotel.city,
      address: hotel.address || '',
      contact_person: hotel.contact_person || '',
      phone: hotel.phone || '',
      email: hotel.email || '',
      whatsapp: hotel.whatsapp || '',
      capacity: hotel.capacity || 0,
      amenities: hotel.amenities || [],
      notes: hotel.notes || '',
      is_active: hotel.is_active,
      rate_single_eur: hotel.rate_single_eur || 0,
      rate_double_eur: hotel.rate_double_eur || 0,
      rate_triple_eur: hotel.rate_triple_eur || 0,
      rate_single_non_eur: hotel.rate_single_non_eur || 0,
      rate_double_non_eur: hotel.rate_double_non_eur || 0,
      rate_triple_non_eur: hotel.rate_triple_non_eur || 0,
      rate_suite_eur: hotel.rate_suite_eur || 0,
      rate_suite_non_eur: hotel.rate_suite_non_eur || 0,
      high_season_markup_percent: hotel.high_season_markup_percent || 0,
      peak_season_markup_percent: hotel.peak_season_markup_percent || 0,
      breakfast_included: hotel.breakfast_included !== false,
      breakfast_rate_eur: hotel.breakfast_rate_eur || 0,
      rate_valid_from: hotel.rate_valid_from || today,
      rate_valid_to: hotel.rate_valid_to || nextYear,
      meal_plan: hotel.meal_plan || 'BB',
      child_policy: hotel.child_policy || ''
    })
    setShowModal(true)
  }

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const url = editingHotel 
        ? `/api/resources/hotels/${editingHotel.id}`
        : '/api/resources/hotels'
      
      const method = editingHotel ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingHotel ? `${formData.name} updated successfully!` : `${formData.name} created successfully!`)
        setShowModal(false)
        fetchHotels()
      } else {
        showToast('error', data.error || 'Failed to save hotel')
      }
    } catch (error) {
      console.error('Error saving hotel:', error)
      showToast('error', 'Failed to save hotel')
    }
  }

  // Delete hotel
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    
    try {
      const response = await fetch(`/api/resources/hotels/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', `${name} deleted successfully!`)
        fetchHotels()
      } else {
        showToast('error', data.error || 'Failed to delete hotel')
      }
    } catch (error) {
      console.error('Error deleting hotel:', error)
      showToast('error', 'Failed to delete hotel')
    }
  }

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Name', 'Property Type', 'Star Rating', 'City', 'Address', 'Contact Person',
      'Phone', 'Email', 'WhatsApp', 'Capacity', 'Single EUR', 'Double EUR', 'Triple EUR',
      'Suite EUR', 'Single Non-EUR', 'Double Non-EUR', 'Triple Non-EUR', 'Suite Non-EUR',
      'High Season %', 'Peak Season %', 'Meal Plan', 'Breakfast Included', 'Active'
    ]
    
    const rows = filteredHotels.map(h => [
      h.name,
      h.property_type || '',
      h.star_rating || '',
      h.city,
      h.address || '',
      h.contact_person || '',
      h.phone || '',
      h.email || '',
      h.whatsapp || '',
      h.capacity || '',
      h.rate_single_eur || '',
      h.rate_double_eur || '',
      h.rate_triple_eur || '',
      h.rate_suite_eur || '',
      h.rate_single_non_eur || '',
      h.rate_double_non_eur || '',
      h.rate_triple_non_eur || '',
      h.rate_suite_non_eur || '',
      h.high_season_markup_percent || '',
      h.peak_season_markup_percent || '',
      h.meal_plan || '',
      h.breakfast_included ? 'Yes' : 'No',
      h.is_active ? 'Yes' : 'No'
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `hotels_export_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    
    showToast('success', `Exported ${filteredHotels.length} hotels to CSV`)
  }

  // Import from CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
        
        let imported = 0
        let failed = 0

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/"/g, '').trim()) || []
          
          if (values.length < 4) continue

          const hotelData = {
            name: values[0] || '',
            property_type: values[1] || 'hotel',
            star_rating: parseInt(values[2]) || 5,
            city: values[3] || '',
            address: values[4] || '',
            contact_person: values[5] || '',
            phone: values[6] || '',
            email: values[7] || '',
            whatsapp: values[8] || '',
            capacity: parseInt(values[9]) || 0,
            rate_single_eur: parseFloat(values[10]) || 0,
            rate_double_eur: parseFloat(values[11]) || 0,
            rate_triple_eur: parseFloat(values[12]) || 0,
            rate_suite_eur: parseFloat(values[13]) || 0,
            rate_single_non_eur: parseFloat(values[14]) || 0,
            rate_double_non_eur: parseFloat(values[15]) || 0,
            rate_triple_non_eur: parseFloat(values[16]) || 0,
            rate_suite_non_eur: parseFloat(values[17]) || 0,
            high_season_markup_percent: parseFloat(values[18]) || 0,
            peak_season_markup_percent: parseFloat(values[19]) || 0,
            meal_plan: values[20] || 'BB',
            breakfast_included: values[21]?.toLowerCase() !== 'no',
            is_active: values[22]?.toLowerCase() !== 'no'
          }

          if (!hotelData.name || !hotelData.city) {
            failed++
            continue
          }

          try {
            const response = await fetch('/api/resources/hotels', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(hotelData)
            })
            
            if (response.ok) {
              imported++
            } else {
              failed++
            }
          } catch {
            failed++
          }
        }

        showToast('success', `Imported ${imported} hotels${failed > 0 ? `, ${failed} failed` : ''}`)
        fetchHotels()
      } catch (error) {
        console.error('Import error:', error)
        showToast('error', 'Failed to import CSV file')
      }
    }
    reader.readAsText(file)
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Filter hotels
  const filteredHotels = hotels.filter(hotel => {
    const matchesSearch = searchTerm === '' || 
      hotel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hotel.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hotel.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCity = selectedCity === 'all' || hotel.city === selectedCity
    const matchesActive = showInactive || hotel.is_active
    
    return matchesSearch && matchesCity && matchesActive
  })

  // Get unique cities from data
  const usedCities = Array.from(new Set(hotels.map(h => h.city))).sort()

  // Stats
  const activeHotels = hotels.filter(h => h.is_active).length
  const hotelsWithRates = hotels.filter(h => (h.rate_double_eur || 0) > 0).length
  const avgRate = hotels.length > 0 
    ? (hotels.reduce((sum, h) => sum + (h.rate_double_eur || 0), 0) / hotels.filter(h => (h.rate_double_eur || 0) > 0).length || 0).toFixed(0)
    : '0'

  const amenitiesList = [
    'WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Bar', 
    'Room Service', 'Parking', 'Airport Shuttle', 'Pet Friendly'
  ]

  const mealPlanOptions = [
    { value: 'RO', label: 'Room Only' },
    { value: 'BB', label: 'Bed & Breakfast' },
    { value: 'HB', label: 'Half Board' },
    { value: 'FB', label: 'Full Board' },
    { value: 'AI', label: 'All Inclusive' }
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading hotels...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <ToastNotification key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleImportCSV}
        className="hidden"
      />

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              <h1 className="text-xl font-bold text-gray-900">Hotel Contacts & Rates</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <div className="flex items-center gap-2">
              {/* Import/Export */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Hotel
              </button>
              <Link 
                href="/resources"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Resources
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Total Hotels</p>
            <p className="text-2xl font-bold text-gray-900">{hotels.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeHotels}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">💶</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <p className="text-xs text-gray-600">With Rates</p>
            <p className="text-2xl font-bold text-gray-900">{hotelsWithRates}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">📊</span>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">Avg. Double Rate</p>
            <p className="text-2xl font-bold text-gray-900">€{avgRate}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Cities</p>
            <p className="text-2xl font-bold text-gray-900">{usedCities.length}</p>
          </div>
        </div>

        {/* Search, Filters & View Toggle */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, city, or contact person..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-48 relative">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Cities</option>
                {usedCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                showInactive 
                  ? 'bg-gray-100 border border-gray-300 text-gray-700' 
                  : 'bg-white border border-green-300 text-green-700'
              }`}
            >
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
            
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Table View"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded ${viewMode === 'compact' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Compact View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredHotels.length}</span> of {hotels.length} hotels
            </p>
          </div>
        </div>

        {/* Hotels Display - Table View */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Hotel</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Stars</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Single (EUR)</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Double (EUR)</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Meal Plan</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHotels.map((hotel, index) => (
                    <tr key={hotel.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{hotel.name}</p>
                          {hotel.contact_person && <p className="text-xs text-gray-500">👤 {hotel.contact_person}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                          {hotel.property_type || 'Hotel'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-yellow-500 text-xs">
                          {'⭐'.repeat(hotel.star_rating || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {hotel.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {(hotel.rate_single_eur || 0) > 0 ? `€${hotel.rate_single_eur}` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-green-600">
                          {(hotel.rate_double_eur || 0) > 0 ? `€${hotel.rate_double_eur}` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          {hotel.meal_plan || 'BB'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          hotel.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {hotel.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(hotel)}
                            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(hotel.id, hotel.name)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredHotels.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">No hotels found</p>
                        <button
                          onClick={handleAddNew}
                          className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          Add Your First Hotel
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Hotels Display - Card View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredHotels.map((hotel) => (
              <div key={hotel.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{hotel.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-yellow-500 text-xs">
                          {'⭐'.repeat(hotel.star_rating || 0)}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs capitalize">
                          {hotel.property_type || 'Hotel'}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      hotel.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {hotel.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{hotel.city}</span>
                    </div>
                    {hotel.contact_person && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="w-4 h-4 text-center">👤</span>
                        <span>{hotel.contact_person}</span>
                      </div>
                    )}
                    {hotel.phone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4" />
                        <span>{hotel.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-xs text-gray-500">Single</p>
                        <p className="text-sm font-bold text-gray-900">
                          {(hotel.rate_single_eur || 0) > 0 ? `€${hotel.rate_single_eur}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Double</p>
                        <p className="text-sm font-bold text-green-600">
                          {(hotel.rate_double_eur || 0) > 0 ? `€${hotel.rate_double_eur}` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex border-t border-gray-200 divide-x divide-gray-200">
                  <button
                    onClick={() => handleEdit(hotel)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(hotel.id, hotel.name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {filteredHotels.length === 0 && (
              <div className="col-span-full bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No hotels found</p>
                <button
                  onClick={handleAddNew}
                  className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Your First Hotel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hotels Display - Compact View */}
        {viewMode === 'compact' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 divide-y divide-gray-100">
            {filteredHotels.map((hotel) => (
              <div key={hotel.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full inline-block ${hotel.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900 truncate block">{hotel.name}</span>
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    <span className="text-yellow-500 text-xs">{'⭐'.repeat(hotel.star_rating || 0)}</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{hotel.city}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-green-600">
                      {(hotel.rate_double_eur || 0) > 0 ? `€${hotel.rate_double_eur}` : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => handleEdit(hotel)}
                    className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(hotel.id, hotel.name)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {filteredHotels.length === 0 && (
              <div className="p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No hotels found</p>
                <button
                  onClick={handleAddNew}
                  className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Your First Hotel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingHotel ? 'Edit Hotel' : 'Add New Hotel'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {/* Basic Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">1</span>
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Hotel Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Marriott Cairo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Property Type *
                    </label>
                    <select
                      name="property_type"
                      value={formData.property_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="hotel">🏨 Hotel</option>
                      <option value="resort">🏖️ Resort</option>
                      <option value="apartment">🏢 Apartment</option>
                      <option value="guesthouse">🏠 Guesthouse</option>
                      <option value="cruise">🚢 Cruise</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Star Rating
                    </label>
                    <select
                      name="star_rating"
                      value={formData.star_rating}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value={5}>⭐⭐⭐⭐⭐ 5 Stars</option>
                      <option value={4}>⭐⭐⭐⭐ 4 Stars</option>
                      <option value={3}>⭐⭐⭐ 3 Stars</option>
                      <option value={2}>⭐⭐ 2 Stars</option>
                      <option value={1}>⭐ 1 Star</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      City *
                    </label>
                    <select
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="">Select City...</option>
                      {EGYPTIAN_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="Full address"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person</label>
                    <input type="text" name="contact_person" value={formData.contact_person} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="Name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="+20 123 456 789" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="contact@hotel.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                    <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="+20 123 456 789" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Capacity (rooms)</label>
                    <input type="number" name="capacity" value={formData.capacity} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="e.g., 100" />
                  </div>
                </div>
              </div>

              {/* Room Rates - EUR */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">3</span>
                  Room Rates - EUR Passport Holders <span className="text-xs font-normal text-gray-500 ml-2">(per night)</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Single (€)</label>
                    <input type="number" name="rate_single_eur" value={formData.rate_single_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Double (€)</label>
                    <input type="number" name="rate_double_eur" value={formData.rate_double_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Triple (€)</label>
                    <input type="number" name="rate_triple_eur" value={formData.rate_triple_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Suite (€)</label>
                    <input type="number" name="rate_suite_eur" value={formData.rate_suite_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                </div>
              </div>

              {/* Room Rates - Non-EUR */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">4</span>
                  Room Rates - Non-EUR Passport Holders <span className="text-xs font-normal text-gray-500 ml-2">(per night)</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Single (€)</label>
                    <input type="number" name="rate_single_non_eur" value={formData.rate_single_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Double (€)</label>
                    <input type="number" name="rate_double_non_eur" value={formData.rate_double_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Triple (€)</label>
                    <input type="number" name="rate_triple_non_eur" value={formData.rate_triple_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Suite (€)</label>
                    <input type="number" name="rate_suite_non_eur" value={formData.rate_suite_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                </div>
              </div>

              {/* Seasonal Pricing & Meal Plan */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">5</span>
                  Seasonal Pricing & Meal Plan
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">High Season Markup (%)</label>
                    <input type="number" name="high_season_markup_percent" value={formData.high_season_markup_percent} onChange={handleChange} min="0" max="100"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="e.g., 20" />
                    <p className="text-xs text-gray-400 mt-1">Oct - Apr</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Peak Season Markup (%)</label>
                    <input type="number" name="peak_season_markup_percent" value={formData.peak_season_markup_percent} onChange={handleChange} min="0" max="100"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="e.g., 40" />
                    <p className="text-xs text-gray-400 mt-1">Christmas, Easter</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default Meal Plan</label>
                    <select name="meal_plan" value={formData.meal_plan} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm">
                      {mealPlanOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Extra Breakfast (€)</label>
                    <input type="number" name="breakfast_rate_eur" value={formData.breakfast_rate_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="breakfast_included" checked={formData.breakfast_included} onChange={handleCheckboxChange}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                    <span className="text-sm text-gray-700">Breakfast included in room rate</span>
                  </label>
                </div>
              </div>

              {/* Rate Validity */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center text-xs font-bold">6</span>
                  Rate Validity Period
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
                    <input type="date" name="rate_valid_from" value={formData.rate_valid_from} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid To</label>
                    <input type="date" name="rate_valid_to" value={formData.rate_valid_to} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Child Policy</label>
                    <input type="text" name="child_policy" value={formData.child_policy} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="e.g., Under 6 free, 6-12 50% off" />
                  </div>
                </div>
              </div>

              {/* Amenities */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">7</span>
                  Amenities
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {amenitiesList.map(amenity => (
                    <label key={amenity} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.amenities.includes(amenity)} onChange={() => toggleAmenity(amenity)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                      <span className="text-sm text-gray-700">{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="Additional information..." />
              </div>

              {/* Active Status */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleCheckboxChange}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                  <span className="text-sm font-medium text-gray-700">Active (available for bookings)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {editingHotel ? 'Update Hotel' : 'Create Hotel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}