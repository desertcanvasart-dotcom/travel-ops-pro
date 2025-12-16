'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Plus, 
  Search, 
  Building,
  Store,
  Car,
  Ship,
  UtensilsCrossed,
  Users,
  Truck,
  MapPin,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  Phone,
  Mail,
  Globe,
  Percent,
  MoreHorizontal,
  Sparkles,
  UserCheck
} from 'lucide-react'

interface Supplier {
  id: string
  name: string
  type: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  address: string | null
  city: string | null
  country: string
  default_commission_rate: number | null
  commission_type: 'receivable' | 'payable' | null
  payment_terms: string | null
  bank_details: string | null
  status: string
  notes: string | null
  created_at: string
}

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  hotel: { label: 'Hotel', icon: Building, color: 'text-blue-600 bg-blue-50' },
  transport: { label: 'Transport', icon: Car, color: 'text-purple-600 bg-purple-50' },
  restaurant: { label: 'Restaurant', icon: UtensilsCrossed, color: 'text-orange-600 bg-orange-50' },
  shop: { label: 'Shop', icon: Store, color: 'text-pink-600 bg-pink-50' },
  cruise: { label: 'Cruise', icon: Ship, color: 'text-cyan-600 bg-cyan-50' },
  attraction: { label: 'Attraction', icon: MapPin, color: 'text-amber-600 bg-amber-50' },
  guide: { label: 'Guide', icon: Users, color: 'text-green-600 bg-green-50' },
  driver: { label: 'Driver', icon: Truck, color: 'text-indigo-600 bg-indigo-50' },
  agent: { label: 'Agent', icon: UserCheck, color: 'text-rose-600 bg-rose-50' },
  ground_handler: { label: 'Ground Handler', icon: Users, color: 'text-teal-600 bg-teal-50' },
  tour_operator: { label: 'Tour Operator', icon: MapPin, color: 'text-violet-600 bg-violet-50' },
  activity_provider: { label: 'Activity Provider', icon: Sparkles, color: 'text-red-600 bg-red-50' },
  other: { label: 'Other', icon: MoreHorizontal, color: 'text-gray-600 bg-gray-50' }
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'text-green-700 bg-green-50' },
  inactive: { label: 'Inactive', color: 'text-gray-500 bg-gray-100' },
  pending: { label: 'Pending', color: 'text-amber-700 bg-amber-50' }
}

interface FormData {
  name: string
  type: string
  contact_name: string
  contact_email: string
  contact_phone: string
  website: string
  address: string
  city: string
  country: string
  default_commission_rate: number | null
  commission_type: string
  payment_terms: string
  bank_details: string
  status: string
  notes: string
}

const initialFormData: FormData = {
  name: '',
  type: 'hotel',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  address: '',
  city: '',
  country: 'Egypt',
  default_commission_rate: null,
  commission_type: 'receivable',
  payment_terms: '',
  bank_details: '',
  status: 'active',
  notes: ''
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)

  const fetchSuppliers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.append('type', typeFilter)
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/suppliers?${params}`)
      if (response.ok) {
        const result = await response.json()
        setSuppliers(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = editingId ? `/api/suppliers/${editingId}` : '/api/suppliers'
      const method = editingId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          default_commission_rate: formData.default_commission_rate || null
        })
      })

      if (response.ok) {
        setIsModalOpen(false)
        setEditingId(null)
        setFormData(initialFormData)
        fetchSuppliers()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to save supplier')
      }
    } catch (error) {
      console.error('Error saving supplier:', error)
      alert('Failed to save supplier')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (supplier: Supplier) => {
    setFormData({
      name: supplier.name,
      type: supplier.type,
      contact_name: supplier.contact_name || '',
      contact_email: supplier.contact_email || '',
      contact_phone: supplier.contact_phone || '',
      website: supplier.website || '',
      address: supplier.address || '',
      city: supplier.city || '',
      country: supplier.country || 'Egypt',
      default_commission_rate: supplier.default_commission_rate,
      commission_type: supplier.commission_type || 'receivable',
      payment_terms: supplier.payment_terms || '',
      bank_details: supplier.bank_details || '',
      status: supplier.status,
      notes: supplier.notes || ''
    })
    setEditingId(supplier.id)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return

    try {
      const response = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchSuppliers()
      }
    } catch (error) {
      console.error('Error deleting supplier:', error)
    }
  }

  const openAddModal = () => {
    setFormData(initialFormData)
    setEditingId(null)
    setIsModalOpen(true)
  }

  const filteredSuppliers = suppliers.filter(s => {
    const search = searchTerm.toLowerCase()
    return (
      s.name.toLowerCase().includes(search) ||
      s.contact_name?.toLowerCase().includes(search) ||
      s.city?.toLowerCase().includes(search) ||
      s.contact_email?.toLowerCase().includes(search)
    )
  })

  // Stats
  const totalSuppliers = suppliers.length
  const activeSuppliers = suppliers.filter(s => s.status === 'active').length
  const withCommission = suppliers.filter(s => s.default_commission_rate).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Building className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Suppliers</h1>
            <p className="text-sm text-gray-500">Manage hotels, shops, transport & partners</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f6238] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Supplier
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Total Suppliers</p>
          <p className="text-2xl font-bold text-gray-900">{totalSuppliers}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeSuppliers}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">With Commission Rate</p>
          <p className="text-2xl font-bold text-purple-600">{withCommission}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white cursor-pointer"
          >
            <option value="">All Types</option>
            {Object.entries(TYPE_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Supplier</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Contact</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Location</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Commission</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Status</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Building className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No suppliers found</p>
                  <button
                    onClick={openAddModal}
                    className="mt-3 text-sm text-[#647C47] hover:underline font-medium"
                  >
                    Add your first supplier
                  </button>
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((supplier) => {
                const typeConfig = TYPE_CONFIG[supplier.type] || TYPE_CONFIG.other
                const statusConfig = STATUS_CONFIG[supplier.status] || STATUS_CONFIG.active
                const TypeIcon = typeConfig.icon

                return (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{supplier.name}</p>
                      {supplier.website && (
                        <a 
                          href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Globe className="h-3 w-3" />
                          {supplier.website}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${typeConfig.color}`}>
                        <TypeIcon className="h-3 w-3" />
                        {typeConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {supplier.contact_name && (
                        <p className="text-sm text-gray-900">{supplier.contact_name}</p>
                      )}
                      {supplier.contact_email && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {supplier.contact_email}
                        </p>
                      )}
                      {supplier.contact_phone && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {supplier.contact_phone}
                        </p>
                      )}
                      {!supplier.contact_name && !supplier.contact_email && !supplier.contact_phone && (
                        <span className="text-xs text-gray-400">No contact info</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600">
                        {[supplier.city, supplier.country].filter(Boolean).join(', ') || '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {supplier.default_commission_rate ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          supplier.commission_type === 'receivable' 
                            ? 'bg-green-50 text-green-700' 
                            : 'bg-red-50 text-red-700'
                        }`}>
                          <Percent className="h-3 w-3" />
                          {supplier.default_commission_rate}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(supplier.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Name & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Supplier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder="e.g., Marriott Cairo"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    required
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Name</label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                    placeholder="John Smith"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                    placeholder="contact@hotel.com"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input
                    type="text"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    placeholder="+20 123 456 7890"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              {/* Website & Address */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="www.hotel.com"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="123 Nile Street"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              {/* City & Country */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="Cairo"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="Egypt"
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              {/* Commission Settings */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Commission Settings</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Rate (%)</label>
                    <input
                      type="number"
                      value={formData.default_commission_rate || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        default_commission_rate: e.target.value ? parseFloat(e.target.value) : null 
                      }))}
                      placeholder="10"
                      step="0.5"
                      min="0"
                      max="100"
                      className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Commission Type</label>
                    <select
                      value={formData.commission_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, commission_type: e.target.value }))}
                      className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                    >
                      <option value="receivable">Receivable (they pay you)</option>
                      <option value="payable">Payable (you pay them)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Payment Terms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Terms</label>
                <input
                  type="text"
                  value={formData.payment_terms}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                  placeholder="e.g., Net 30, Monthly settlement"
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Bank Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bank Details</label>
                <textarea
                  value={formData.bank_details}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_details: e.target.value }))}
                  rows={2}
                  placeholder="Account name, number, bank, SWIFT..."
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] resize-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Supplier' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}