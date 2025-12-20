'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Search, Plus, Edit, Trash2, X, Check, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

// ============================================
// CONSTANTS
// ============================================

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface Attraction {
  id: string
  service_code: string
  attraction_name: string
  city: string
  fee_type?: string
  eur_rate: number
  non_eur_rate: number
  egyptian_rate?: number
  student_discount_percentage?: number
  child_discount_percent?: number
  season?: string
  rate_valid_from: string
  rate_valid_to: string
  category?: string
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

// ============================================
// PAGINATION COMPONENT
// ============================================

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (items: number) => void
}) {
  const goToPage = (page: number) => {
    onPageChange(Math.max(1, Math.min(page, totalPages)))
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-600 bg-white"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">per page</span>
        </div>
        <span className="text-sm text-gray-500">
          Showing {startIndex + 1}-{endIndex} of {totalItems} attractions
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1 mx-2">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }
            
            return (
              <button
                key={pageNum}
                onClick={() => goToPage(pageNum)}
                className={`min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors ${
                  currentPage === pageNum
                    ? 'bg-amber-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AttractionsContent() {
  const searchParams = useSearchParams()
  const dialog = useConfirmDialog()
  
  const [attractions, setAttractions] = useState<Attraction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingAttraction, setEditingAttraction] = useState<Attraction | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  
  const today = new Date().toISOString().split('T')[0]
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  
  const [formData, setFormData] = useState({
    service_code: '',
    attraction_name: '',
    city: '',
    fee_type: 'standard',
    eur_rate: 0,
    non_eur_rate: 0,
    egyptian_rate: 0,
    student_discount_percentage: 0,
    child_discount_percent: 0,
    season: 'all_year',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    category: '',
    notes: '',
    is_active: true
  })

  // Toast helper
  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  // Fetch attractions
  const fetchAttractions = async () => {
    try {
      const response = await fetch('/api/resources/attractions')
      const data = await response.json()
      if (data.success) {
        setAttractions(data.data)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching attractions:', error)
      showToast('error', 'Failed to load attractions')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAttractions()
    
    const editId = searchParams.get('edit')
    if (editId) {
      const attraction = attractions.find(a => a.id === editId)
      if (attraction) {
        handleEdit(attraction)
      }
    }
  }, [searchParams])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCity, selectedCategory, showInactive, itemsPerPage])

  // Generate service code
  const generateServiceCode = () => {
    const prefix = 'ENT'
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `${prefix}-${random}`
  }

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  // Handle checkbox for active status
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      is_active: e.target.checked
    }))
  }

  // Open modal for new attraction
  const handleAddNew = () => {
    setEditingAttraction(null)
    setFormData({
      service_code: generateServiceCode(),
      attraction_name: '',
      city: '',
      fee_type: 'standard',
      eur_rate: 0,
      non_eur_rate: 0,
      egyptian_rate: 0,
      student_discount_percentage: 0,
      child_discount_percent: 0,
      season: 'all_year',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      category: '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (attraction: Attraction) => {
    setEditingAttraction(attraction)
    setFormData({
      service_code: attraction.service_code,
      attraction_name: attraction.attraction_name,
      city: attraction.city,
      fee_type: attraction.fee_type || 'standard',
      eur_rate: attraction.eur_rate,
      non_eur_rate: attraction.non_eur_rate,
      egyptian_rate: attraction.egyptian_rate || 0,
      student_discount_percentage: attraction.student_discount_percentage || 0,
      child_discount_percent: attraction.child_discount_percent || 0,
      season: attraction.season || 'all_year',
      rate_valid_from: attraction.rate_valid_from,
      rate_valid_to: attraction.rate_valid_to,
      category: attraction.category || '',
      notes: attraction.notes || '',
      is_active: attraction.is_active
    })
    setShowModal(true)
  }

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const url = editingAttraction 
        ? `/api/resources/attractions/${editingAttraction.id}`
        : '/api/resources/attractions'
      
      const method = editingAttraction ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingAttraction ? 'Attraction updated!' : 'Attraction created!')
        setShowModal(false)
        fetchAttractions()
      } else {
        showToast('error', data.error || 'Failed to save')
      }
    } catch (error) {
      console.error('Error saving attraction:', error)
      showToast('error', 'Failed to save attraction')
    }
  }

  // Delete attraction
  const handleDelete = async (id: string, name: string) => {
    const confirmed = await dialog.confirmDelete('Attraction',
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    )
    
    if (!confirmed) return
    
    try {
      const response = await fetch(`/api/resources/attractions/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', 'Attraction deleted!')
        fetchAttractions()
      } else {
        await dialog.alert('Error', data.error || 'Failed to delete attraction', 'warning')
      }
    } catch (error) {
      console.error('Error deleting attraction:', error)
      await dialog.alert('Error', 'Failed to delete attraction. Please try again.', 'warning')
    }
  }

  // Filter attractions
  const filteredAttractions = attractions.filter(attraction => {
    const matchesSearch = searchTerm === '' || 
      attraction.attraction_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attraction.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attraction.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attraction.category?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCity = selectedCity === 'all' || attraction.city === selectedCity
    const matchesCategory = selectedCategory === 'all' || attraction.category === selectedCategory
    const matchesActive = showInactive || attraction.is_active
    
    return matchesSearch && matchesCity && matchesCategory && matchesActive
  })

  // Pagination calculations
  const totalItems = filteredAttractions.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedAttractions = filteredAttractions.slice(startIndex, endIndex)

  // Get unique values for filters
  const cities = Array.from(new Set(attractions.map(a => a.city))).filter(Boolean).sort()
  const categories = Array.from(new Set(attractions.map(a => a.category))).filter(Boolean).sort()

  // Calculate stats
  const activeAttractions = attractions.filter(a => a.is_active).length
  const inactiveAttractions = attractions.filter(a => !a.is_active).length
  const avgRate = attractions.length > 0 
  ? (attractions.reduce((sum, a) => sum + (a.eur_rate || 0), 0) / attractions.length).toFixed(2)
  : '0.00'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading attractions...</p>
        </div>
      </div>
    )
  }

  const categoryOptions = [
    'temple', 'pyramid', 'museum', 'tomb', 'church', 'mosque', 
    'fortress', 'palace', 'nature', 'entertainment', 'other'
  ]

  const feeTypeOptions = [
    { value: 'standard', label: 'Standard' },
    { value: 'free', label: 'Free Entry' },
    { value: 'donation', label: 'Donation Based' },
    { value: 'included', label: 'Included in Package' }
  ]

  const seasonOptions = [
    { value: 'all_year', label: 'All Year' },
    { value: 'high_season', label: 'High Season' },
    { value: 'low_season', label: 'Low Season' },
    { value: 'summer', label: 'Summer' },
    { value: 'winter', label: 'Winter' }
  ]

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
              <h1 className="text-xl font-bold text-gray-900">Attractions & Entrance Fees</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNew}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Attraction
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
              <span className="text-gray-400 text-xl">🎫</span>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            </div>
            <p className="text-xs text-gray-600">Total Attractions</p>
            <p className="text-2xl font-bold text-gray-900">{attractions.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">✓</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeAttractions}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">✗</span>
              <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
            </div>
            <p className="text-xs text-gray-600">Inactive</p>
            <p className="text-2xl font-bold text-gray-900">{inactiveAttractions}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🏙️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Cities</p>
            <p className="text-2xl font-bold text-gray-900">{cities.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">💶</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <p className="text-xs text-gray-600">Avg. EUR Rate</p>
            <p className="text-2xl font-bold text-gray-900">€{avgRate}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, city, code, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-40">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              >
                <option value="all">All Cities</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <div className="md:w-40">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
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
              Showing <span className="font-bold text-gray-900">{filteredAttractions.length}</span> of {attractions.length} attractions
            </p>
          </div>
        </div>

        {/* Attractions Table */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Attraction</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Category</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">EUR Rate</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Non-EUR</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Egyptian</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Child %</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedAttractions.map((attraction, index) => (
                  <tr key={attraction.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{attraction.attraction_name}</p>
                        <p className="text-xs text-gray-500 font-mono">{attraction.service_code}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {attraction.category && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium capitalize">
                          {attraction.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                        {attraction.city}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">
                      {attraction.fee_type === 'free' ? 'FREE' : `€${(attraction.eur_rate || 0).toFixed(2)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-primary-600">
                      {attraction.fee_type === 'free' ? 'FREE' : `€${(attraction.non_eur_rate || 0).toFixed(2)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-600">
                      {attraction.egyptian_rate ? `€${attraction.egyptian_rate.toFixed(2)}` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-600">
                        {attraction.child_discount_percent ? `${attraction.child_discount_percent}%` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        attraction.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {attraction.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(attraction)}
                          className="p-1 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(attraction.id, attraction.attraction_name)}
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedAttractions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-3xl text-gray-400">🎫</span>
                        <p className="text-sm font-medium">No attractions found</p>
                        <button
                          onClick={handleAddNew}
                          className="mt-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          Add Your First Attraction
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalItems > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingAttraction ? 'Edit Attraction' : 'Add New Attraction'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {/* Basic Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Attraction Name *
                    </label>
                    <input
                      type="text"
                      name="attraction_name"
                      value={formData.attraction_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Pyramids of Giza"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Service Code
                    </label>
                    <input
                      type="text"
                      name="service_code"
                      value={formData.service_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm bg-gray-50"
                      placeholder="Auto-generated"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Giza"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Category
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="">Select category...</option>
                      {categoryOptions.map(cat => (
                        <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Fee Type
                    </label>
                    <select
                      name="fee_type"
                      value={formData.fee_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      {feeTypeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Season
                    </label>
                    <select
                      name="season"
                      value={formData.season}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      {seasonOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pricing Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Pricing</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      EUR Rate (€) *
                    </label>
                    <input
                      type="number"
                      name="eur_rate"
                      value={formData.eur_rate}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Non-EUR Rate (€) *
                    </label>
                    <input
                      type="number"
                      name="non_eur_rate"
                      value={formData.non_eur_rate}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Egyptian Rate (€)
                    </label>
                    <input
                      type="number"
                      name="egyptian_rate"
                      value={formData.egyptian_rate}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Discounts */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Discounts</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Child Discount (%)
                    </label>
                    <input
                      type="number"
                      name="child_discount_percent"
                      value={formData.child_discount_percent}
                      onChange={handleChange}
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., 50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Student Discount (%)
                    </label>
                    <input
                      type="number"
                      name="student_discount_percentage"
                      value={formData.student_discount_percentage}
                      onChange={handleChange}
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., 25"
                    />
                  </div>
                </div>
              </div>

              {/* Validity Period */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Rate Validity Period</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Valid From *
                    </label>
                    <input
                      type="date"
                      name="rate_valid_from"
                      value={formData.rate_valid_from}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Valid To *
                    </label>
                    <input
                      type="date"
                      name="rate_valid_to"
                      value={formData.rate_valid_to}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>
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
                  placeholder="Additional information about this attraction..."
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
                  <span className="text-sm font-medium text-gray-700">Active (available for itineraries)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingAttraction ? 'Update Attraction' : 'Create Attraction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}