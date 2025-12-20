'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Search, Plus, MoreHorizontal, Users, UserCog, X, Edit, Trash2, Eye, 
  Loader2, AlertCircle, Phone, Mail, MessageCircle, MapPin, Globe,
  LayoutGrid, List, Table2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, ArrowUpDown, Download, Upload, Star, Flag
} from 'lucide-react'

// Types
interface Contact {
  id: string
  type: 'client' | 'staff'
  name: string
  subtype?: string
  email?: string
  phone?: string
  whatsapp?: string
  city?: string
  notes?: string
  extra?: Record<string, any>
  rawData?: any
}

type ViewMode = 'grid' | 'table' | 'list'
type SortField = 'name' | 'email' | 'city' | 'status'
type SortDirection = 'asc' | 'desc'

// Config
const TYPE_CONFIG = {
  client: { 
    icon: Users, 
    label: 'Clients', 
    singular: 'Client',
    color: 'bg-primary-100 text-primary-700',
    borderColor: 'border-primary-200'
  },
  staff: { 
    icon: UserCog, 
    label: 'Staff', 
    singular: 'Staff',
    color: 'bg-purple-100 text-purple-700',
    borderColor: 'border-purple-200'
  },
}

const STAFF_ROLES = ['Meet & Greet', 'Transfer Coordinator', 'VIP Assistant', 'Hotel Rep', 'Tour Leader', 'Office Staff', 'Driver', 'Operations Manager']
const STAFF_LOCATIONS = ['Cairo (CAI)', 'Luxor (LXR)', 'Aswan (ASW)', 'Hurghada (HRG)', 'Sharm El Sheikh (SSH)', 'Alexandria (HBE)', 'Office', 'Remote']
const CLIENT_STATUS = ['prospect', 'active', 'inactive', 'vip']
const LANGUAGES = ['English', 'Spanish', 'Japanese', 'Chinese', 'Russian', 'German', 'French', 'Italian', 'Arabic']

// Form fields
const FORM_FIELDS = {
  client: [
    { name: 'First Name', key: 'first_name', type: 'text', required: true },
    { name: 'Last Name', key: 'last_name', type: 'text', required: true },
    { name: 'Email', key: 'email', type: 'email' },
    { name: 'Phone', key: 'phone', type: 'tel' },
    { name: 'WhatsApp', key: 'whatsapp', type: 'tel' },
    { name: 'Nationality', key: 'nationality', type: 'text' },
    { name: 'Status', key: 'status', type: 'select', options: CLIENT_STATUS },
    { name: 'Preferred Language', key: 'preferred_language', type: 'text' },
    { name: 'Notes', key: 'internal_notes', type: 'textarea' },
  ],
  staff: [
    { name: 'Full Name', key: 'name', type: 'text', required: true },
    { name: 'Role', key: 'role', type: 'select', options: STAFF_ROLES },
    { name: 'Location', key: 'airport_location', type: 'select', options: STAFF_LOCATIONS },
    { name: 'Email', key: 'email', type: 'email' },
    { name: 'Phone', key: 'phone', type: 'tel' },
    { name: 'WhatsApp', key: 'whatsapp', type: 'tel' },
    { name: 'Languages', key: 'languages', type: 'text' },
    { name: 'Shift Times', key: 'shift_times', type: 'text' },
    { name: 'Notes', key: 'notes', type: 'textarea' },
  ],
}

const TABLE_NAMES = {
  client: 'clients',
  staff: 'airport_staff',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  prospect: 'bg-blue-100 text-blue-700',
  vip: 'bg-amber-100 text-amber-700',
}

export default function ContactsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<'all' | 'client' | 'staff'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12)
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [newContactType, setNewContactType] = useState<'client' | 'staff'>('client')
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // URL sync
  useEffect(() => {
    const typeParam = searchParams.get('type') as 'client' | 'staff' | null
    if (typeParam && ['client', 'staff'].includes(typeParam)) {
      setSelectedType(typeParam)
    }
  }, [searchParams])

  const handleTypeChange = (type: 'all' | 'client' | 'staff') => {
    setSelectedType(type)
    setCurrentPage(1)
    router.push(type === 'all' ? '/contacts' : `/contacts?type=${type}`, { scroll: false })
  }

  useEffect(() => {
    fetchAllContacts()
  }, [])

  const fetchAllContacts = async () => {
    setLoading(true)
    try {
      const allContacts: Contact[] = []

      // Fetch clients
      const clientsRes = await fetch('/api/clients')
      if (clientsRes.ok) {
        const result = await clientsRes.json()
        const clients = result.data || []
        allContacts.push(...clients.map((c: any) => ({
          id: c.id,
          type: 'client' as const,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          subtype: c.status,
          email: c.email,
          phone: c.phone,
          whatsapp: c.whatsapp || c.phone,
          city: c.nationality,
          notes: c.internal_notes,
          extra: { nationality: c.nationality, preferred_language: c.preferred_language, status: c.status },
          rawData: c
        })))
      }

      // Fetch staff
      const staffRes = await fetch('/api/airport-staff')
      if (staffRes.ok) {
        const result = await staffRes.json()
        const staff = result.data || []
        allContacts.push(...staff.map((s: any) => ({
          id: s.id,
          type: 'staff' as const,
          name: s.name,
          subtype: s.role,
          email: s.email,
          phone: s.phone,
          whatsapp: s.whatsapp || s.phone,
          city: s.airport_location,
          notes: s.notes,
          extra: { role: s.role, languages: s.languages, shift_times: s.shift_times },
          rawData: s
        })))
      }

      setContacts(allContacts)
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter and sort
  const filteredContacts = contacts
    .filter(contact => {
      const matchesType = selectedType === 'all' || contact.type === selectedType
      const matchesSearch = !searchQuery || 
        contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.phone?.includes(searchQuery)
      return matchesType && matchesSearch
    })
    .sort((a, b) => {
      let aVal = '', bVal = ''
      switch (sortField) {
        case 'name': aVal = a.name?.toLowerCase() || ''; bVal = b.name?.toLowerCase() || ''; break
        case 'email': aVal = a.email?.toLowerCase() || ''; bVal = b.email?.toLowerCase() || ''; break
        case 'city': aVal = a.city?.toLowerCase() || ''; bVal = b.city?.toLowerCase() || ''; break
        case 'status': aVal = a.subtype || ''; bVal = b.subtype || ''; break
      }
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })

  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedContacts = filteredContacts.slice(startIndex, startIndex + itemsPerPage)

  useEffect(() => { setCurrentPage(1) }, [searchQuery, selectedType, itemsPerPage])

  const stats = {
    all: contacts.length,
    client: contacts.filter(c => c.type === 'client').length,
    staff: contacts.filter(c => c.type === 'staff').length,
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
    return sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-primary-600" /> : <ChevronDown className="w-3.5 h-3.5 text-primary-600" />
  }

  // CRUD
  const handleAdd = () => {
    const defaultType = selectedType !== 'all' ? selectedType : 'client'
    setNewContactType(defaultType as 'client' | 'staff')
    setFormData({})
    setError(null)
    setShowAddModal(true)
  }

  const handleEdit = (contact: Contact) => {
    setSelectedContact(contact)
    setFormData({ ...contact.rawData })
    setError(null)
    setShowEditModal(true)
    setOpenMenuId(null)
  }

  const handleView = (contact: Contact) => {
    setSelectedContact(contact)
    setShowViewModal(true)
    setOpenMenuId(null)
  }

  const handleDeleteClick = (contact: Contact) => {
    setSelectedContact(contact)
    setShowDeleteModal(true)
    setOpenMenuId(null)
  }

  const handleSaveNew = async () => {
    setSaving(true)
    setError(null)
    try {
      const endpoint = newContactType === 'client' ? '/api/clients' : '/api/airport-staff'
      const body = newContactType === 'client' 
        ? { ...formData }
        : { ...formData, is_active: true }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to create')
      setShowAddModal(false)
      setFormData({})
      fetchAllContacts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!selectedContact) return
    setSaving(true)
    setError(null)
    try {
      const endpoint = selectedContact.type === 'client' 
        ? `/api/clients/${selectedContact.id}`
        : `/api/airport-staff/${selectedContact.id}`
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to update')
      setShowEditModal(false)
      setSelectedContact(null)
      setFormData({})
      fetchAllContacts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedContact) return
    setSaving(true)
    setError(null)
    try {
      const endpoint = selectedContact.type === 'client'
        ? `/api/clients/${selectedContact.id}`
        : `/api/airport-staff/${selectedContact.id}`
      
      const response = await fetch(endpoint, { method: 'DELETE' })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to delete')
      setShowDeleteModal(false)
      setSelectedContact(null)
      fetchAllContacts()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleExport = () => {
    const csv = [
      ['Type', 'Name', 'Email', 'Phone', 'Location/Nationality', 'Status/Role'].join(','),
      ...filteredContacts.map(c => [c.type, c.name, c.email, c.phone, c.city, c.subtype].map(v => `"${v || ''}"`).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const renderFormField = (field: any) => {
    const value = formData[field.key]
    if (field.type === 'select' && field.options) {
      return (
        <select
          value={value || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
        >
          <option value="">Select {field.name}</option>
          {field.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )
    }
    if (field.type === 'textarea') {
      return (
        <textarea
          value={value || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
        />
      )
    }
    return (
      <input
        type={field.type}
        value={value || ''}
        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        required={field.required}
      />
    )
  }

  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (currentPage > 3) pages.push('...')
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i)
      if (currentPage < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {selectedType === 'all' ? 'Contacts' : TYPE_CONFIG[selectedType].label}
              </h1>
              <p className="text-sm text-gray-500">Manage your clients and internal staff</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                {(['grid', 'table', 'list'] as ViewMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === mode ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500'}`}
                  >
                    {mode === 'grid' ? <LayoutGrid className="w-4 h-4" /> : mode === 'table' ? <Table2 className="w-4 h-4" /> : <List className="w-4 h-4" />}
                  </button>
                ))}
              </div>
              <div className="w-px h-6 bg-gray-200" />
              <button onClick={handleExport} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                <Download className="w-4 h-4" /> Export
              </button>
              <button onClick={handleAdd} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
                <Plus className="w-4 h-4" /> Add Contact
              </button>
            </div>
          </div>

          {/* Type Tabs - ONLY Clients and Staff */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => handleTypeChange('all')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${selectedType === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              All <span className="px-1.5 py-0.5 bg-white/20 rounded-full">{stats.all}</span>
            </button>
            <button
              onClick={() => handleTypeChange('client')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${selectedType === 'client' ? TYPE_CONFIG.client.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <Users className="w-3.5 h-3.5" /> Clients
              <span className={`px-1.5 py-0.5 rounded-full ${selectedType === 'client' ? 'bg-white/30' : 'bg-gray-200'}`}>{stats.client}</span>
            </button>
            <button
              onClick={() => handleTypeChange('staff')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${selectedType === 'staff' ? TYPE_CONFIG.staff.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <UserCog className="w-3.5 h-3.5" /> Staff
              <span className={`px-1.5 py-0.5 rounded-full ${selectedType === 'staff' ? 'bg-white/30' : 'bg-gray-200'}`}>{stats.staff}</span>
            </button>
          </div>

          {/* Info Banner for Suppliers */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <Globe className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-blue-800">
              Looking for hotels, transport companies, guides, or other suppliers? 
              <a href="/suppliers" className="font-medium underline ml-1">Go to Suppliers →</a>
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-primary-600 animate-spin" /></div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No contacts found</p>
            <button onClick={handleAdd} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
              <Plus className="w-4 h-4" /> Add your first contact
            </button>
          </div>
        ) : (
          <>
            {/* GRID VIEW */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedContacts.map((contact) => {
                  const config = TYPE_CONFIG[contact.type]
                  const Icon = config.icon
                  return (
                    <div key={`${contact.type}-${contact.id}`} className={`bg-white rounded-lg border ${config.borderColor} p-4 hover:shadow-md transition-all cursor-pointer group`} onClick={() => handleView(contact)}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{contact.name}</h3>
                            <p className="text-xs text-gray-500">{contact.subtype}{contact.city && ` • ${contact.city}`}</p>
                          </div>
                        </div>
                        <div className="relative">
                          <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === contact.id ? null : contact.id) }} className="p-1 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="w-4 h-4 text-gray-400" />
                          </button>
                          {openMenuId === contact.id && (
                            <div className="absolute right-0 top-8 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                              <button onClick={(e) => { e.stopPropagation(); handleView(contact) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"><Eye className="w-3.5 h-3.5" /> View</button>
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(contact) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"><Edit className="w-3.5 h-3.5" /> Edit</button>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(contact) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {contact.email && <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary-600 mb-2"><Mail className="w-3.5 h-3.5 text-gray-400" />{contact.email}</a>}
                      {contact.phone && (
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-2 text-xs text-gray-600"><Phone className="w-3.5 h-3.5 text-gray-400" />{contact.phone}</span>
                          {contact.whatsapp && <a href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" onClick={(e) => e.stopPropagation()} className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"><MessageCircle className="w-3 h-3" /></a>}
                        </div>
                      )}
                      {contact.type === 'client' && contact.extra?.status && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[contact.extra.status] || 'bg-gray-100 text-gray-600'}`}>
                            {contact.extra.status === 'vip' && <Star className="w-3 h-3 mr-1" />}
                            {contact.extra.status}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* TABLE VIEW */}
            {viewMode === 'table' && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3"><button onClick={() => handleSort('name')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">Name <SortIcon field="name" /></button></th>
                      <th className="text-left px-4 py-3"><span className="text-xs font-semibold text-gray-600">Type</span></th>
                      <th className="text-left px-4 py-3"><button onClick={() => handleSort('email')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">Email <SortIcon field="email" /></button></th>
                      <th className="text-left px-4 py-3"><span className="text-xs font-semibold text-gray-600">Phone</span></th>
                      <th className="text-left px-4 py-3"><button onClick={() => handleSort('status')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">Status/Role <SortIcon field="status" /></button></th>
                      <th className="text-right px-4 py-3"><span className="text-xs font-semibold text-gray-600">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedContacts.map((contact) => {
                      const config = TYPE_CONFIG[contact.type]
                      const Icon = config.icon
                      return (
                        <tr key={`${contact.type}-${contact.id}`} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => handleView(contact)}>
                          <td className="px-4 py-3"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center`}><Icon className="w-4 h-4" /></div><span className="text-sm font-medium text-gray-900">{contact.name}</span></div></td>
                          <td className="px-4 py-3"><span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>{config.singular}</span></td>
                          <td className="px-4 py-3">{contact.email ? <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} className="text-sm text-primary-600 hover:underline">{contact.email}</a> : <span className="text-gray-400">—</span>}</td>
                          <td className="px-4 py-3"><span className="text-sm text-gray-600">{contact.phone || '—'}</span></td>
                          <td className="px-4 py-3"><span className="text-sm text-gray-600">{contact.subtype || '—'}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(contact) }} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(contact) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* LIST VIEW */}
            {viewMode === 'list' && (
              <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {paginatedContacts.map((contact) => {
                  const config = TYPE_CONFIG[contact.type]
                  const Icon = config.icon
                  return (
                    <div key={`${contact.type}-${contact.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer group" onClick={() => handleView(contact)}>
                      <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
                      <div className="flex-1 grid grid-cols-4 gap-4">
                        <div><p className="text-sm font-medium text-gray-900">{contact.name}</p><p className="text-xs text-gray-500">{config.singular}</p></div>
                        <div>{contact.email && <span className="text-sm text-gray-600">{contact.email}</span>}</div>
                        <div>{contact.phone && <span className="text-sm text-gray-600">{contact.phone}</span>}</div>
                        <div><span className="text-sm text-gray-600">{contact.subtype || '—'}</span></div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(contact) }} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(contact) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 0 && (
              <div className="mt-6 flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-600">Showing <span className="font-medium">{startIndex + 1}</span>–<span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredContacts.length)}</span> of <span className="font-medium">{filteredContacts.length}</span></p>
                <div className="flex items-center gap-4">
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronsLeft className="w-4 h-4" /></button>
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                      {getPageNumbers().map((page, i) => page === '...' ? <span key={`e${i}`} className="px-2 text-gray-400">...</span> : (
                        <button key={page} onClick={() => setCurrentPage(page as number)} className={`min-w-[32px] h-8 px-2 text-sm font-medium rounded-lg ${currentPage === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{page}</button>
                      ))}
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronsRight className="w-4 h-4" /></button>
                    </div>
                  )}
                  <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="h-8 w-24 px-2 text-sm border border-gray-200 rounded-lg outline-none bg-white">
                    <option value={12}>12 / page</option>
                    <option value={24}>24 / page</option>
                    <option value={48}>48 / page</option>
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {openMenuId && <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />}

      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">Add New Contact</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
              
              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Contact Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['client', 'staff'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => { setNewContactType(type); setFormData({}) }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${newContactType === type ? TYPE_CONFIG[type].color + ' ' + TYPE_CONFIG[type].borderColor : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      {type === 'client' ? <Users className="w-5 h-5" /> : <UserCog className="w-5 h-5" />}
                      <span className="font-medium">{TYPE_CONFIG[type].singular}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {FORM_FIELDS[newContactType].map(field => (
                  <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{field.name}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
                    {renderFormField(field)}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleSaveNew} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {(() => { const c = TYPE_CONFIG[selectedContact.type]; return <div className={`w-8 h-8 rounded-lg ${c.color} flex items-center justify-center`}><c.icon className="w-4 h-4" /></div> })()}
                <h3 className="text-base font-semibold text-gray-900">Edit {TYPE_CONFIG[selectedContact.type].singular}</h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                {FORM_FIELDS[selectedContact.type].map(field => (
                  <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{field.name}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
                    {renderFormField(field)}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {showViewModal && selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {(() => { const c = TYPE_CONFIG[selectedContact.type]; return <div className={`w-10 h-10 rounded-lg ${c.color} flex items-center justify-center`}><c.icon className="w-5 h-5" /></div> })()}
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selectedContact.name}</h3>
                  <p className="text-xs text-gray-500">{TYPE_CONFIG[selectedContact.type].singular}{selectedContact.subtype && ` • ${selectedContact.subtype}`}</p>
                </div>
              </div>
              <button onClick={() => setShowViewModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {selectedContact.type === 'client' && selectedContact.extra?.status && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[selectedContact.extra.status]}`}>
                  {selectedContact.extra.status === 'vip' && <Star className="w-3 h-3" />}
                  {selectedContact.extra.status}
                </span>
              )}
              {selectedContact.email && <a href={`mailto:${selectedContact.email}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100"><Mail className="w-4 h-4 text-gray-400" /><div><p className="text-xs text-gray-500">Email</p><p className="text-sm font-medium text-primary-600">{selectedContact.email}</p></div></a>}
              {selectedContact.phone && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <div className="flex-1"><p className="text-xs text-gray-500">Phone</p><p className="text-sm font-medium text-gray-900">{selectedContact.phone}</p></div>
                  <div className="flex items-center gap-2">
                    <a href={`tel:${selectedContact.phone}`} className="p-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200"><Phone className="w-4 h-4" /></a>
                    {selectedContact.whatsapp && <a href={`https://wa.me/${selectedContact.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"><MessageCircle className="w-4 h-4" /></a>}
                  </div>
                </div>
              )}
              {selectedContact.city && <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><MapPin className="w-4 h-4 text-gray-400" /><div><p className="text-xs text-gray-500">{selectedContact.type === 'client' ? 'Nationality' : 'Location'}</p><p className="text-sm font-medium text-gray-900">{selectedContact.city}</p></div></div>}
              {selectedContact.notes && <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500 mb-1">Notes</p><p className="text-sm text-gray-700">{selectedContact.notes}</p></div>}
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
              <button onClick={() => { setShowViewModal(false); handleDeleteClick(selectedContact) }} className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Delete</button>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowViewModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg">Close</button>
                <button onClick={() => { setShowViewModal(false); handleEdit(selectedContact) }} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"><Edit className="w-4 h-4" /> Edit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {showDeleteModal && selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><Trash2 className="w-6 h-6 text-red-600" /></div>
              <div><h3 className="text-base font-semibold text-gray-900">Delete Contact</h3><p className="text-sm text-gray-500">This cannot be undone.</p></div>
            </div>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete <strong>{selectedContact.name}</strong>?</p>
            {error && <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleDelete} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}