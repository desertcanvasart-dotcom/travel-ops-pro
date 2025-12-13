'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  BedDouble, Plus, Search, Edit, Trash2, X, Check, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

// ============================================
// CONSTANTS
// ============================================

const CITIES = ['Cairo', 'Luxor', 'Aswan']
const CABIN_TYPES = ['single', 'double']
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface SleepingTrain {
  id: string
  service_code: string
  operator_name: string
  origin_city: string
  destination_city: string
  cabin_type: 'single' | 'double'
  rate_oneway_eur: number
  rate_roundtrip_eur: number | null
  departure_time: string | null
  arrival_time: string | null
  meals_included: string | null
  description: string | null
  notes: string | null
  is_active: boolean
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
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600 bg-white"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">per page</span>
        </div>
        <span className="text-sm text-gray-500">
          Showing {startIndex + 1}-{endIndex} of {totalItems} rates
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
                    ? 'bg-purple-600 text-white'
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

export default function SleepingTrainsPage() {
  const dialog = useConfirmDialog()
  
  const [rates, setRates] = useState<SleepingTrain[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCabin, setSelectedCabin] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<SleepingTrain | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const [formData, setFormData] = useState({
    service_code: '',
    operator_name: 'Watania Sleeping Trains',
    origin_city: 'Cairo',
    destination_city: 'Luxor',
    cabin_type: 'double' as 'single' | 'double',
    rate_oneway_eur: 0,
    rate_roundtrip_eur: 0,
    departure_time: '20:00',
    arrival_time: '06:00',
    meals_included: 'Dinner & Breakfast',
    description: '',
    notes: '',
    is_active: true
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchRates = async () => {
    try {
      const response = await fetch('/api/rates/sleeping-trains')
      const data = await response.json()
      if (data.success) setRates(data.data)
    } catch (error) {
      showToast('error', 'Failed to load sleeping train rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRates() }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCabin, showInactive, itemsPerPage])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }))
  }

  const generateCode = () => {
    return `SLEEP-${formData.origin_city.substring(0,3).toUpperCase()}-${formData.destination_city.substring(0,3).toUpperCase()}-${formData.cabin_type.toUpperCase()}`
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: '', 
      operator_name: 'Watania Sleeping Trains', 
      origin_city: 'Cairo', 
      destination_city: 'Luxor',
      cabin_type: 'double', 
      rate_oneway_eur: 0, 
      rate_roundtrip_eur: 0, 
      departure_time: '20:00', 
      arrival_time: '06:00',
      meals_included: 'Dinner & Breakfast', 
      description: '', 
      notes: '', 
      is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: SleepingTrain) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      operator_name: rate.operator_name,
      origin_city: rate.origin_city,
      destination_city: rate.destination_city,
      cabin_type: rate.cabin_type,
      rate_oneway_eur: rate.rate_oneway_eur,
      rate_roundtrip_eur: rate.rate_roundtrip_eur || 0,
      departure_time: rate.departure_time || '',
      arrival_time: rate.arrival_time || '',
      meals_included: rate.meals_included || '',
      description: rate.description || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const submitData = {
      ...formData,
      service_code: formData.service_code || generateCode(),
      rate_roundtrip_eur: formData.rate_roundtrip_eur || null
    }

    try {
      const url = editingRate ? `/api/rates/sleeping-trains/${editingRate.id}` : '/api/rates/sleeping-trains'
      const response = await fetch(url, {
        method: editingRate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })
      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingRate ? 'Rate updated!' : 'Rate created!')
        setShowModal(false)
        fetchRates()
      } else {
        showToast('error', data.error || 'Failed to save')
      }
    } catch (error) {
      showToast('error', 'Failed to save rate')
    }
  }

  const handleDelete = async (rate: SleepingTrain) => {
    const routeName = `${rate.origin_city} → ${rate.destination_city}`
    const cabinType = rate.cabin_type.charAt(0).toUpperCase() + rate.cabin_type.slice(1)
    
    const confirmed = await dialog.confirmDelete('Sleeping Train Rate',
      `Are you sure you want to delete the sleeping train rate "${routeName}" (${cabinType} cabin)? This action cannot be undone.`
    )
    
    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/sleeping-trains/${rate.id}`, { method: 'DELETE' })
      const data = await response.json()
      
      if (data.success) { 
        showToast('success', 'Sleeping train rate deleted!') 
        fetchRates() 
      } else {
        await dialog.alert('Error', data.error || 'Failed to delete sleeping train rate', 'warning')
      }
    } catch { 
      await dialog.alert('Error', 'Failed to delete sleeping train rate. Please try again.', 'warning')
    }
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.origin_city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.destination_city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.operator_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCabin = selectedCabin === 'all' || rate.cabin_type === selectedCabin
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesCabin && matchesActive
  })

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Stats
  const stats = {
    total: rates.length,
    active: rates.filter(r => r.is_active).length,
    singleCabin: rates.filter(r => r.cabin_type === 'single').length,
    doubleCabin: rates.filter(r => r.cabin_type === 'double').length,
    avgRate: rates.length > 0 
      ? Math.round(rates.reduce((sum, r) => sum + r.rate_oneway_eur, 0) / rates.length)
      : 0
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading sleeping train rates...</p>
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
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BedDouble className="w-5 h-5 text-purple-600" />
            <h1 className="text-xl font-bold text-gray-900">Sleeping Trains</h1>
            <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
              <Plus className="w-4 h-4" /> Add Rate
            </button>
            <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
              ← Rates Hub
            </Link>
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
            <p className="text-xs text-gray-600">Single Cabin</p>
            <p className="text-2xl font-bold text-indigo-600">{stats.singleCabin}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Double Cabin</p>
            <p className="text-2xl font-bold text-purple-600">{stats.doubleCabin}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Avg. One-Way</p>
            <p className="text-2xl font-bold text-green-600">€{stats.avgRate}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search routes, operators, or codes..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" 
              />
            </div>
            <select 
              value={selectedCabin} 
              onChange={(e) => setSelectedCabin(e.target.value)} 
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600"
            >
              <option value="all">All Cabins</option>
              {CABIN_TYPES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
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
            Showing {filteredRates.length} of {rates.length} sleeping train rates
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-purple-50 border-b border-purple-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-purple-800">Route</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Cabin</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Departure</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Arrival</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-purple-800">One-Way</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-purple-800">Round-Trip</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Meals</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate, idx) => (
                  <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-purple-50 transition-colors`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{rate.origin_city} → {rate.destination_city}</p>
                      <p className="text-xs text-gray-500">{rate.operator_name}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.cabin_type === 'single' ? 'bg-indigo-100 text-indigo-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {rate.cabin_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {rate.departure_time || '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {rate.arrival_time || '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      €{rate.rate_oneway_eur}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">
                      {rate.rate_roundtrip_eur ? `€${rate.rate_roundtrip_eur}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600 max-w-[120px] truncate">
                      {rate.meals_included || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={() => handleEdit(rate)} 
                          className="p-1 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(rate)} 
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedRates.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <BedDouble className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No sleeping train rates found</p>
                      <button onClick={handleAddNew} className="mt-2 text-sm text-purple-600 hover:underline">
                        Add your first sleeping train rate
                      </button>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingRate ? 'Edit' : 'Add'} Sleeping Train Rate</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Operator</label>
                <input 
                  type="text" 
                  name="operator_name" 
                  value={formData.operator_name} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600" 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Origin *</label>
                  <select 
                    name="origin_city" 
                    value={formData.origin_city} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600"
                  >
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Destination *</label>
                  <select 
                    name="destination_city" 
                    value={formData.destination_city} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600"
                  >
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cabin Type *</label>
                  <select 
                    name="cabin_type" 
                    value={formData.cabin_type} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600"
                  >
                    {CABIN_TYPES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">One-Way (€) *</label>
                  <input 
                    type="number" 
                    name="rate_oneway_eur" 
                    value={formData.rate_oneway_eur} 
                    onChange={handleChange} 
                    min="0" 
                    step="0.01" 
                    required 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Round-Trip (€)</label>
                  <input 
                    type="number" 
                    name="rate_roundtrip_eur" 
                    value={formData.rate_roundtrip_eur} 
                    onChange={handleChange} 
                    min="0" 
                    step="0.01" 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Departure Time</label>
                  <input 
                    type="time" 
                    name="departure_time" 
                    value={formData.departure_time} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Arrival Time</label>
                  <input 
                    type="time" 
                    name="arrival_time" 
                    value={formData.arrival_time} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Meals Included</label>
                <input 
                  type="text" 
                  name="meals_included" 
                  value={formData.meals_included} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600" 
                  placeholder="Dinner & Breakfast" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Service Code</label>
                <input 
                  type="text" 
                  name="service_code" 
                  value={formData.service_code} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 font-mono" 
                  placeholder="Auto-generated if empty"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea 
                  name="notes" 
                  value={formData.notes} 
                  onChange={handleChange} 
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600" 
                  placeholder="Additional notes..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="is_active" 
                  checked={formData.is_active} 
                  onChange={handleCheckbox} 
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500" 
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              <div className="flex gap-2 pt-3 border-t">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingRate ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}