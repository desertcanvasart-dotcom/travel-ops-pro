'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Train, Plus, Search, Edit, Trash2, X, Check, AlertCircle, CheckCircle2 } from 'lucide-react'

interface TrainRate {
  id: string
  service_code: string
  operator_name: string
  origin_city: string
  destination_city: string
  class_type: 'first_class' | 'second_class'
  rate_eur: number
  duration_hours: number | null
  departure_times: string | null
  description: string | null
  notes: string | null
  is_active: boolean
}

interface Toast { id: string; type: 'success' | 'error'; message: string }

const CITIES = ['Cairo', 'Alexandria', 'Luxor', 'Aswan', 'Giza']
const CLASS_TYPES = ['first_class', 'second_class']

export default function TrainsPage() {
  const [rates, setRates] = useState<TrainRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<TrainRate | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [formData, setFormData] = useState({
    service_code: '',
    operator_name: 'Egyptian Railways',
    origin_city: 'Cairo',
    destination_city: 'Alexandria',
    class_type: 'first_class' as 'first_class' | 'second_class',
    rate_eur: 0,
    duration_hours: 0,
    departure_times: '',
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
      const response = await fetch('/api/rates/trains')
      const data = await response.json()
      if (data.success) setRates(data.data)
    } catch (error) {
      showToast('error', 'Failed to load train rates')
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
    const cls = formData.class_type === 'first_class' ? '1ST' : '2ND'
    return `TRAIN-${formData.origin_city.substring(0,3).toUpperCase()}-${formData.destination_city.substring(0,3).toUpperCase()}-${cls}`
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: '', operator_name: 'Egyptian Railways', origin_city: 'Cairo', destination_city: 'Alexandria',
      class_type: 'first_class', rate_eur: 0, duration_hours: 0, departure_times: '', description: '', notes: '', is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: TrainRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      operator_name: rate.operator_name,
      origin_city: rate.origin_city,
      destination_city: rate.destination_city,
      class_type: rate.class_type,
      rate_eur: rate.rate_eur,
      duration_hours: rate.duration_hours || 0,
      departure_times: rate.departure_times || '',
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
      duration_hours: formData.duration_hours || null
    }

    try {
      const url = editingRate ? `/api/rates/trains/${editingRate.id}` : '/api/rates/trains'
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

  const handleDelete = async (id: string, route: string) => {
    if (!confirm(`Delete train rate "${route}"?`)) return
    try {
      const response = await fetch(`/api/rates/trains/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) { showToast('success', 'Deleted!'); fetchRates() }
      else showToast('error', data.error)
    } catch { showToast('error', 'Failed to delete') }
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.origin_city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.destination_city.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesClass = selectedClass === 'all' || rate.class_type === selectedClass
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesClass && matchesActive
  })

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div></div>
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
            <Train className="w-5 h-5 text-orange-600" />
            <h1 className="text-xl font-bold text-gray-900">Train Rates</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
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
              <input type="text" placeholder="Search routes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg" />
            </div>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
              <option value="all">All Classes</option>
              <option value="first_class">First Class</option>
              <option value="second_class">Second Class</option>
            </select>
            <button onClick={() => setShowInactive(!showInactive)} className={`px-3 py-2 text-sm rounded-lg font-medium ${showInactive ? 'bg-gray-100' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <table className="w-full">
            <thead className="bg-orange-50 border-b border-orange-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800">Route</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-orange-800">Class</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-orange-800">Duration</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-orange-800">Rate</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800">Departures</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-orange-800">Status</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-orange-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRates.map((rate, idx) => (
                <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-orange-50`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{rate.origin_city} → {rate.destination_city}</p>
                    <p className="text-xs text-gray-500">{rate.operator_name}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${rate.class_type === 'first_class' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                      {rate.class_type === 'first_class' ? '1st Class' : '2nd Class'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-700">{rate.duration_hours ? `${rate.duration_hours}h` : '-'}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{rate.rate_eur}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[150px] truncate">{rate.departure_times || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {rate.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(rate)} className="p-1 text-gray-500 hover:text-orange-600 rounded"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(rate.id, `${rate.origin_city}-${rate.destination_city}`)} className="p-1 text-gray-500 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRates.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">No train rates found</td></tr>
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
              <h2 className="text-lg font-bold">{editingRate ? 'Edit' : 'Add'} Train Rate</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Origin *</label>
                  <select name="origin_city" value={formData.origin_city} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Destination *</label>
                  <select name="destination_city" value={formData.destination_city} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Class *</label>
                  <select name="class_type" value={formData.class_type} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    <option value="first_class">First Class</option>
                    <option value="second_class">Second Class</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rate (€) *</label>
                  <input type="number" name="rate_eur" value={formData.rate_eur} onChange={handleChange} min="0" step="0.01" required className="w-full px-3 py-2 text-sm border rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Duration (hours)</label>
                  <input type="number" name="duration_hours" value={formData.duration_hours} onChange={handleChange} min="0" step="0.5" className="w-full px-3 py-2 text-sm border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Departure Times</label>
                <input type="text" name="departure_times" value={formData.departure_times} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg" placeholder="07:00, 09:00, 14:00, 19:00" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleCheckbox} className="w-4 h-4 text-orange-600 rounded" />
                <span className="text-sm">Active</span>
              </label>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium flex items-center justify-center gap-2">
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