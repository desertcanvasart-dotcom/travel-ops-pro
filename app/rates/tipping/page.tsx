'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DollarSign, Plus, Search, Edit, Trash2, X, Check, AlertCircle, CheckCircle2 } from 'lucide-react'

interface TippingRate {
  id: string
  service_code: string
  role_type: string
  context: string | null
  rate_unit: string
  rate_eur: number
  description: string | null
  notes: string | null
  is_active: boolean
}

interface Toast { id: string; type: 'success' | 'error'; message: string }

const ROLE_TYPES = ['guide', 'driver', 'boat_crew', 'porter', 'hotel_staff', 'restaurant', 'other']
const CONTEXTS = ['day_tour', 'half_day_tour', 'cruise', 'transfer', 'airport', 'hotel', 'restaurant', 'felucca', 'motorboat']
const RATE_UNITS = ['per_day', 'per_service', 'per_cruise', 'per_night', 'per_person']

export default function TippingPage() {
  const [rates, setRates] = useState<TippingRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<TippingRate | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [formData, setFormData] = useState({
    service_code: '',
    role_type: 'guide',
    context: 'day_tour',
    rate_unit: 'per_day',
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
      const response = await fetch('/api/rates/tipping')
      const data = await response.json()
      if (data.success) setRates(data.data)
    } catch (error) {
      showToast('error', 'Failed to load tipping rates')
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
    return `TIP-${formData.role_type.toUpperCase()}-${formData.context?.toUpperCase() || 'GEN'}`
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({ service_code: '', role_type: 'guide', context: 'day_tour', rate_unit: 'per_day', rate_eur: 0, description: '', notes: '', is_active: true })
    setShowModal(true)
  }

  const handleEdit = (rate: TippingRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      role_type: rate.role_type,
      context: rate.context || '',
      rate_unit: rate.rate_unit,
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
      const url = editingRate ? `/api/rates/tipping/${editingRate.id}` : '/api/rates/tipping'
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

  const handleDelete = async (id: string, role: string) => {
    if (!confirm(`Delete tipping rate for "${role}"?`)) return
    try {
      const response = await fetch(`/api/rates/tipping/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) { showToast('success', 'Deleted!'); fetchRates() }
      else showToast('error', data.error)
    } catch { showToast('error', 'Failed to delete') }
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || rate.role_type.toLowerCase().includes(searchTerm.toLowerCase()) || rate.context?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = selectedRole === 'all' || rate.role_type === selectedRole
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesRole && matchesActive
  })

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div></div>
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
            <DollarSign className="w-5 h-5 text-green-600" />
            <h1 className="text-xl font-bold text-gray-900">Tipping Rates</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
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
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
              <option value="all">All Roles</option>
              {ROLE_TYPES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
            <button onClick={() => setShowInactive(!showInactive)} className={`px-3 py-2 text-sm rounded-lg font-medium ${showInactive ? 'bg-gray-100' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <table className="w-full">
            <thead className="bg-green-50 border-b border-green-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-green-800">Role</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Context</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Unit</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-green-800">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-green-800">Description</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Status</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRates.map((rate, idx) => (
                <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-green-50`}>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      rate.role_type === 'guide' ? 'bg-blue-100 text-blue-800' :
                      rate.role_type === 'driver' ? 'bg-orange-100 text-orange-800' :
                      rate.role_type === 'boat_crew' ? 'bg-cyan-100 text-cyan-800' :
                      'bg-gray-100 text-gray-700'
                    }`}>{rate.role_type.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">{rate.context?.replace('_', ' ') || '-'}</td>
                  <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">{rate.rate_unit.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{rate.rate_eur}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{rate.description || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {rate.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(rate)} className="p-1 text-gray-500 hover:text-green-600 rounded"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(rate.id, rate.role_type)} className="p-1 text-gray-500 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRates.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">No tipping rates found</td></tr>
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
              <h2 className="text-lg font-bold">{editingRate ? 'Edit' : 'Add'} Tipping Rate</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role Type *</label>
                  <select name="role_type" value={formData.role_type} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    {ROLE_TYPES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Context</label>
                  <select name="context" value={formData.context} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    <option value="">No specific context</option>
                    {CONTEXTS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rate Unit *</label>
                  <select name="rate_unit" value={formData.rate_unit} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg">
                    {RATE_UNITS.map(u => <option key={u} value={u}>{u.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (€) *</label>
                  <input type="number" name="rate_eur" value={formData.rate_eur} onChange={handleChange} min="0" step="0.5" required className="w-full px-3 py-2 text-sm border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input type="text" name="description" value={formData.description} onChange={handleChange} className="w-full px-3 py-2 text-sm border rounded-lg" placeholder="e.g., Full day tour guide tip" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleCheckbox} className="w-4 h-4 text-green-600 rounded" />
                <span className="text-sm">Active</span>
              </label>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2">
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