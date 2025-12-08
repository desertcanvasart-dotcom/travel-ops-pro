'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ConciergeBell, Plus, Search, Edit, Trash2, X, Check, AlertCircle, CheckCircle2 } from 'lucide-react'

interface HotelStaffRate {
  id: string
  service_code: string
  service_type: string
  hotel_category: 'budget' | 'standard' | 'luxury' | 'all'
  rate_eur: number
  description: string | null
  notes: string | null
  is_active: boolean
}

interface Toast { id: string; type: 'success' | 'error'; message: string }

const SERVICE_TYPES = ['porter', 'checkin_assist', 'full_service', 'concierge']
const HOTEL_CATEGORIES = ['budget', 'standard', 'luxury', 'all']

export default function HotelServicesPage() {
  const [rates, setRates] = useState<HotelStaffRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedService, setSelectedService] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<HotelStaffRate | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [formData, setFormData] = useState({
    service_code: '',
    service_type: 'porter',
    hotel_category: 'all' as 'budget' | 'standard' | 'luxury' | 'all',
    rate_eur: 0,
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
      const response = await fetch('/api/rates/hotel-services')
      const data = await response.json()
      if (data.success) setRates(data.data)
    } catch (error) {
      showToast('error', 'Failed to load hotel service rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRates() }, [])

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
    const svc = formData.service_type.replace('_', '').toUpperCase().substring(0, 6)
    const cat = formData.hotel_category.toUpperCase().substring(0, 3)
    return `HOTEL-${svc}-${cat}`
  }

  const formatServiceType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: '', service_type: 'porter', hotel_category: 'all',
      rate_eur: 0, description: '', notes: '', is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: HotelStaffRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      service_type: rate.service_type,
      hotel_category: rate.hotel_category,
      rate_eur: rate.rate_eur,
      description: rate.description || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const submitData = { ...formData, service_code: formData.service_code || generateCode() }

    try {
      const url = editingRate ? `/api/rates/hotel-services/${editingRate.id}` : '/api/rates/hotel-services'
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

  const handleDelete = async (id: string, service: string) => {
    if (!confirm(`Delete hotel service "${service}"?`)) return
    try {
      const response = await fetch(`/api/rates/hotel-services/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) { showToast('success', 'Deleted!'); fetchRates() }
      else showToast('error', data.error)
    } catch { showToast('error', 'Failed to delete') }
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.service_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.hotel_category.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesService = selectedService === 'all' || rate.service_type === selectedService
    const matchesCategory = selectedCategory === 'all' || rate.hotel_category === selectedCategory
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesService && matchesCategory && matchesActive
  })

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ConciergeBell className="w-5 h-5 text-rose-600" />
            <h1 className="text-xl font-bold text-gray-900">Hotel Services</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">
              <Plus className="w-4 h-4" /> Add Rate
            </button>
            <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">← Rates Hub</Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg" />
            </div>
            <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
              <option value="all">All Services</option>
              {SERVICE_TYPES.map(s => <option key={s} value={s}>{formatServiceType(s)}</option>)}
            </select>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
              <option value="all">All Categories</option>
              {HOTEL_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            <button onClick={() => setShowInactive(!showInactive)} className={`px-3 py-2 text-sm rounded-lg font-medium ${showInactive ? 'bg-gray-100' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <table className="w-full">
            <thead className="bg-rose-50 border-b border-rose-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-rose-800">Service Type</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-rose-800">Hotel Category</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-rose-800">Rate</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-rose-800">Description</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-rose-800">Status</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-rose-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRates.map((rate, idx) => (
                <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-rose-50`}>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      rate.service_type === 'concierge' ? 'bg-amber-100 text-amber-800' :
                      rate.service_type === 'full_service' ? 'bg-blue-100 text-blue-800' :
                      rate.service_type === 'checkin_assist' ? 'bg-purple-100 text-purple-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>{formatServiceType(rate.service_type)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      rate.hotel_category === 'luxury' ? 'bg-amber-100 text-amber-800' :
                      rate.hotel_category === 'standard' ? 'bg-blue-100 text-blue-800' :
                      rate.hotel_category === 'budget' ? 'bg-gray-100 text-gray-700' :
                      'bg-green-100 text-green-800'
                    }`}>{rate.hotel_category}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{rate.rate_eur}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[250px] truncate">{rate.description || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {rate.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(rate)} className="p-1 text-gray-500 hover:text-rose-600 rounded"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(rate.id, formatServiceType(rate.service_type))} className="p-1 text-gray-500 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRates.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No hotel service rates found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingRate ? 'Edit' : 'Add'} Hotel Service Rate</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Service Type *</label>
                  <select name="service_type" value={formData.service_type} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    {SERVICE_TYPES.map(s => <option key={s} value={s}>{formatServiceType(s)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hotel Category *</label>
                  <select name="hotel_category" value={formData.hotel_category} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    {HOTEL_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate (€) *</label>
                <input type="number" name="rate_eur" value={formData.rate_eur} onChange={handleChange} min="0" step="0.01" required className="w-full px-3 py-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input type="text" name="description" value={formData.description} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg" placeholder="e.g., Porter service per stay" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} className="w-full px-3 py-2 text-sm border rounded-lg" placeholder="Internal notes..." />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleCheckbox} className="w-4 h-4 text-rose-600 rounded" />
                <span className="text-sm">Active</span>
              </label>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-3 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />{editingRate ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}