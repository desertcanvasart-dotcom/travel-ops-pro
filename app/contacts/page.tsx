'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { 
  Search, 
  Phone, 
  Mail, 
  Building2, 
  Users, 
  Utensils, 
  Plane, 
  Compass,
  Star,
  Globe,
  MoreHorizontal,
  Plus,
  Download,
  Upload,
  X,
  Edit,
  Trash2,
  MessageCircle,
  Loader2,
  MapPin,
  AlertCircle,
  ChevronDown,
  Eye,
  FileSpreadsheet,
  ArrowRight,
  HelpCircle,
  CheckCircle2
} from 'lucide-react'

// Types
interface Contact {
  id: string
  type: 'hotel' | 'guide' | 'restaurant' | 'airport_staff' | 'client'
  name: string
  subtype?: string
  city?: string
  contact_person?: string
  phone?: string
  email?: string
  whatsapp?: string
  address?: string
  notes?: string
  extra?: Record<string, any>
  rawData?: any
}

type ContactType = 'hotel' | 'guide' | 'restaurant' | 'airport_staff' | 'client'

// Config
const TYPE_CONFIG = {
  hotel: { 
    icon: Building2, 
    label: 'Hotels', 
    singular: 'Hotel',
    color: 'bg-blue-100 text-blue-700',
    borderColor: 'border-blue-200',
    hoverColor: 'hover:bg-blue-50'
  },
  guide: { 
    icon: Compass, 
    label: 'Tour Guides', 
    singular: 'Guide',
    color: 'bg-green-100 text-green-700',
    borderColor: 'border-green-200',
    hoverColor: 'hover:bg-green-50'
  },
  restaurant: { 
    icon: Utensils, 
    label: 'Restaurants', 
    singular: 'Restaurant',
    color: 'bg-orange-100 text-orange-700',
    borderColor: 'border-orange-200',
    hoverColor: 'hover:bg-orange-50'
  },
  airport_staff: { 
    icon: Plane, 
    label: 'Airport Staff', 
    singular: 'Airport Staff',
    color: 'bg-purple-100 text-purple-700',
    borderColor: 'border-purple-200',
    hoverColor: 'hover:bg-purple-50'
  },
  client: { 
    icon: Users, 
    label: 'Clients', 
    singular: 'Client',
    color: 'bg-primary-100 text-primary-700',
    borderColor: 'border-primary-200',
    hoverColor: 'hover:bg-primary-50'
  },
}

// Form field configurations for each type
const FORM_FIELDS: Record<ContactType, { name: string; key: string; type: string; required?: boolean; options?: string[] }[]> = {
  hotel: [
    { name: 'Hotel Name', key: 'name', type: 'text', required: true },
    { name: 'Property Type', key: 'property_type', type: 'select', options: ['Hotel', 'Resort', 'Boutique Hotel', 'Guest House', 'Nile Cruise', 'Camp'] },
    { name: 'Star Rating', key: 'star_rating', type: 'select', options: ['1', '2', '3', '4', '5'] },
    { name: 'City', key: 'city', type: 'text' },
    { name: 'Address', key: 'address', type: 'textarea' },
    { name: 'Contact Person', key: 'contact_person', type: 'text' },
    { name: 'Email', key: 'email', type: 'email' },
    { name: 'Phone', key: 'phone', type: 'tel' },
    { name: 'WhatsApp', key: 'whatsapp', type: 'tel' },
    { name: 'Notes', key: 'notes', type: 'textarea' },
  ],
  guide: [
    { name: 'Full Name', key: 'name', type: 'text', required: true },
    { name: 'Email', key: 'email', type: 'email' },
    { name: 'Phone', key: 'phone', type: 'tel' },
    { name: 'Languages', key: 'languages', type: 'text' },
    { name: 'Specialties', key: 'specialties', type: 'text' },
    { name: 'Daily Rate', key: 'daily_rate', type: 'number' },
    { name: 'Hourly Rate', key: 'hourly_rate', type: 'number' },
    { name: 'Address', key: 'address', type: 'textarea' },
    { name: 'Notes', key: 'notes', type: 'textarea' },
  ],
  restaurant: [
    { name: 'Restaurant Name', key: 'name', type: 'text', required: true },
    { name: 'Restaurant Type', key: 'restaurant_type', type: 'select', options: ['Fine Dining', 'Casual', 'Fast Food', 'Cafe', 'Buffet'] },
    { name: 'Cuisine Type', key: 'cuisine_type', type: 'text' },
    { name: 'City', key: 'city', type: 'text' },
    { name: 'Address', key: 'address', type: 'textarea' },
    { name: 'Contact Person', key: 'contact_person', type: 'text' },
    { name: 'Email', key: 'email', type: 'email' },
    { name: 'Phone', key: 'phone', type: 'tel' },
    { name: 'WhatsApp', key: 'whatsapp', type: 'tel' },
    { name: 'Capacity', key: 'capacity', type: 'number' },
    { name: 'Notes', key: 'notes', type: 'textarea' },
  ],
  airport_staff: [
    { name: 'Full Name', key: 'name', type: 'text', required: true },
    { name: 'Role', key: 'role', type: 'select', options: ['Meet & Greet', 'Transfer Coordinator', 'VIP Assistant', 'Luggage Handler', 'Driver'] },
    { name: 'Airport Location', key: 'airport_location', type: 'select', options: ['Cairo (CAI)', 'Luxor (LXR)', 'Aswan (ASW)', 'Hurghada (HRG)', 'Sharm El Sheikh (SSH)', 'Alexandria (HBE)'] },
    { name: 'Email', key: 'email', type: 'email' },
    { name: 'Phone', key: 'phone', type: 'tel' },
    { name: 'WhatsApp', key: 'whatsapp', type: 'tel' },
    { name: 'Languages', key: 'languages', type: 'text' },
    { name: 'Shift Times', key: 'shift_times', type: 'text' },
    { name: 'Notes', key: 'notes', type: 'textarea' },
  ],
  client: [
    { name: 'First Name', key: 'first_name', type: 'text', required: true },
    { name: 'Last Name', key: 'last_name', type: 'text', required: true },
    { name: 'Email', key: 'email', type: 'email' },
    { name: 'Phone', key: 'phone', type: 'tel' },
    { name: 'Nationality', key: 'nationality', type: 'text' },
    { name: 'Status', key: 'status', type: 'select', options: ['prospect', 'active', 'inactive', 'vip'] },
    { name: 'Preferred Language', key: 'preferred_language', type: 'text' },
    { name: 'Notes', key: 'internal_notes', type: 'textarea' },
  ],
}

// Table name mapping
const TABLE_NAMES: Record<ContactType, string> = {
  hotel: 'hotel_contacts',
  guide: 'guides',
  restaurant: 'restaurant_contacts',
  airport_staff: 'airport_staff',
  client: 'clients',
}

export default function ContactsPage() {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [newContactType, setNewContactType] = useState<ContactType>('hotel')
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Dropdown menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  
  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false)

  useEffect(() => {
    fetchAllContacts()
  }, [])

  const fetchAllContacts = async () => {
    setLoading(true)
    try {
      const allContacts: Contact[] = []

      // Fetch hotels
      const { data: hotels } = await supabase
        .from('hotel_contacts')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (hotels) {
        allContacts.push(...hotels.map(h => ({
          id: h.id,
          type: 'hotel' as const,
          name: h.name,
          subtype: h.property_type,
          city: h.city,
          contact_person: h.contact_person,
          phone: h.phone,
          email: h.email,
          whatsapp: h.whatsapp,
          address: h.address,
          notes: h.notes,
          extra: { star_rating: h.star_rating },
          rawData: h
        })))
      }

      // Fetch guides
      const { data: guides } = await supabase
        .from('guides')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (guides) {
        allContacts.push(...guides.map(g => ({
          id: g.id,
          type: 'guide' as const,
          name: g.name,
          subtype: 'Tour Guide',
          contact_person: g.name,
          phone: g.phone,
          email: g.email,
          whatsapp: g.phone,
          address: g.address,
          notes: g.notes,
          extra: { languages: g.languages, specialties: g.specialties, daily_rate: g.daily_rate, hourly_rate: g.hourly_rate },
          rawData: g
        })))
      }

      // Fetch restaurants
      const { data: restaurants } = await supabase
        .from('restaurant_contacts')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (restaurants) {
        allContacts.push(...restaurants.map(r => ({
          id: r.id,
          type: 'restaurant' as const,
          name: r.name,
          subtype: r.restaurant_type,
          city: r.city,
          contact_person: r.contact_person,
          phone: r.phone,
          email: r.email,
          whatsapp: r.whatsapp,
          address: r.address,
          notes: r.notes,
          extra: { cuisine_type: r.cuisine_type, capacity: r.capacity },
          rawData: r
        })))
      }

      // Fetch airport staff
      const { data: airportStaff } = await supabase
        .from('airport_staff')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (airportStaff) {
        allContacts.push(...airportStaff.map(a => ({
          id: a.id,
          type: 'airport_staff' as const,
          name: a.name,
          subtype: a.role,
          city: a.airport_location,
          contact_person: a.name,
          phone: a.phone,
          email: a.email,
          whatsapp: a.whatsapp,
          notes: a.notes,
          extra: { languages: a.languages, shift_times: a.shift_times },
          rawData: a
        })))
      }

      // Fetch clients
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .order('first_name')

      if (clients) {
        allContacts.push(...clients.map(c => ({
          id: c.id,
          type: 'client' as const,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          subtype: c.status,
          contact_person: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          phone: c.phone,
          email: c.email,
          notes: c.internal_notes,
          extra: { nationality: c.nationality, preferred_language: c.preferred_language },
          rawData: c
        })))
      }

      setContacts(allContacts)
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter contacts
  const filteredContacts = contacts.filter(contact => {
    const matchesType = selectedType === 'all' || contact.type === selectedType
    const matchesSearch = !searchQuery || 
      contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone?.includes(searchQuery)
    
    return matchesType && matchesSearch
  })

  // Stats
  const stats = {
    all: contacts.length,
    hotel: contacts.filter(c => c.type === 'hotel').length,
    guide: contacts.filter(c => c.type === 'guide').length,
    restaurant: contacts.filter(c => c.type === 'restaurant').length,
    airport_staff: contacts.filter(c => c.type === 'airport_staff').length,
    client: contacts.filter(c => c.type === 'client').length,
  }

  // CRUD Operations
  const handleAdd = () => {
    setFormData({})
    setError(null)
    setNewContactType(selectedType !== 'all' ? selectedType as ContactType : 'hotel')
    setShowAddModal(true)
  }

  const handleEdit = (contact: Contact) => {
    setSelectedContact(contact)
    setFormData(contact.rawData || {})
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
      const tableName = TABLE_NAMES[newContactType]
      const insertData = { ...formData, is_active: true }
      
      // Handle special cases
      if (newContactType === 'guide') {
        if (formData.languages && typeof formData.languages === 'string') {
          insertData.languages = formData.languages.split(',').map((l: string) => l.trim())
        }
        if (formData.specialties && typeof formData.specialties === 'string') {
          insertData.specialties = formData.specialties.split(',').map((s: string) => s.trim())
        }
      }
      
      if (newContactType === 'airport_staff') {
        if (formData.languages && typeof formData.languages === 'string') {
          insertData.languages = formData.languages.split(',').map((l: string) => l.trim())
        }
      }

      const { error: insertError } = await supabase
        .from(tableName)
        .insert(insertData)

      if (insertError) throw insertError

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
      const tableName = TABLE_NAMES[selectedContact.type]
      const updateData = { ...formData }
      
      // Handle special cases
      if (selectedContact.type === 'guide') {
        if (formData.languages && typeof formData.languages === 'string') {
          updateData.languages = formData.languages.split(',').map((l: string) => l.trim())
        }
        if (formData.specialties && typeof formData.specialties === 'string') {
          updateData.specialties = formData.specialties.split(',').map((s: string) => s.trim())
        }
      }
      
      if (selectedContact.type === 'airport_staff') {
        if (formData.languages && typeof formData.languages === 'string') {
          updateData.languages = formData.languages.split(',').map((l: string) => l.trim())
        }
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', selectedContact.id)

      if (updateError) throw updateError

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
      const tableName = TABLE_NAMES[selectedContact.type]
      
      // Soft delete by setting is_active to false (except for clients)
      if (selectedContact.type === 'client') {
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('id', selectedContact.id)
        
        if (deleteError) throw deleteError
      } else {
        const { error: updateError } = await supabase
          .from(tableName)
          .update({ is_active: false })
          .eq('id', selectedContact.id)
        
        if (updateError) throw updateError
      }

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
    const dataToExport = filteredContacts.map(c => ({
      Type: TYPE_CONFIG[c.type].singular,
      Name: c.name,
      'Contact Person': c.contact_person,
      Email: c.email,
      Phone: c.phone,
      City: c.city,
      WhatsApp: c.whatsapp
    }))
    
    const csv = [
      Object.keys(dataToExport[0] || {}).join(','),
      ...dataToExport.map(row => Object.values(row).map(v => `"${v || ''}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // Render form field
  const renderFormField = (field: { name: string; key: string; type: string; required?: boolean; options?: string[] }) => {
    const value = formData[field.key] || ''
    
    if (field.type === 'select' && field.options) {
      return (
        <select
          value={value}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
        >
          <option value="">Select {field.name}</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }
    
    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
          placeholder={`Enter ${field.name.toLowerCase()}`}
        />
      )
    }
    
    return (
      <input
        type={field.type}
        value={value}
        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
        className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        placeholder={`Enter ${field.name.toLowerCase()}`}
        required={field.required}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">All Contacts</h1>
              <p className="text-sm text-gray-500">Manage all your clients and partners in one place</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button 
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button 
                onClick={handleAdd}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                <Plus className="w-4 h-4" />
                Add Contact
              </button>
            </div>
          </div>

          {/* Stats/Filters */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedType('all')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                selectedType === 'all' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
              <span className="px-1.5 py-0.5 bg-white/20 rounded-full">{stats.all}</span>
            </button>
            {Object.entries(TYPE_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSelectedType(key)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  selectedType === key 
                    ? config.color
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <config.icon className="w-3.5 h-3.5" />
                {config.label}
                <span className={`px-1.5 py-0.5 rounded-full ${
                  selectedType === key ? 'bg-white/30' : 'bg-gray-200'
                }`}>
                  {stats[key as keyof typeof stats]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
          />
        </div>
      </div>

      {/* Contacts Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No contacts found</p>
            <button 
              onClick={handleAdd}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              Add your first contact
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map((contact) => {
              const config = TYPE_CONFIG[contact.type]
              const Icon = config.icon
              
              return (
                <div 
                  key={`${contact.type}-${contact.id}`}
                  className={`bg-white rounded-lg border ${config.borderColor} p-4 hover:shadow-md transition-all cursor-pointer group`}
                  onClick={() => handleView(contact)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{contact.name}</h3>
                        <p className="text-xs text-gray-500">
                          {contact.subtype}
                          {contact.city && ` • ${contact.city}`}
                        </p>
                      </div>
                    </div>
                    <div className="relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenMenuId(openMenuId === contact.id ? null : contact.id)
                        }}
                        className="p-1 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                      </button>
                      
                      {/* Dropdown Menu */}
                      {openMenuId === contact.id && (
                        <div className="absolute right-0 top-8 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleView(contact)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Details
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(contact)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteClick(contact)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {contact.contact_person && contact.contact_person !== contact.name && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {contact.contact_person}
                    </div>
                  )}

                  {contact.email && (
                    <a 
                      href={`mailto:${contact.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary-600 mb-2"
                    >
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      {contact.email}
                    </a>
                  )}

                  {contact.phone && (
                    <div className="flex items-center gap-3">
                      <a 
                        href={`tel:${contact.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary-600"
                      >
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        {contact.phone}
                      </a>
                      {contact.whatsapp && (
                        <a
                          href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Extra info based on type */}
                  {contact.type === 'hotel' && contact.extra?.star_rating && (
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                      {Array.from({ length: parseInt(contact.extra.star_rating) }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      ))}
                    </div>
                  )}

                  {contact.type === 'guide' && contact.extra?.languages && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                      <Globe className="w-3.5 h-3.5" />
                      {Array.isArray(contact.extra.languages) 
                        ? contact.extra.languages.slice(0, 3).join(', ')
                        : contact.extra.languages
                      }
                    </div>
                  )}

                  {contact.type === 'restaurant' && contact.extra?.cuisine_type && (
                    <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                      🍽️ {contact.extra.cuisine_type}
                    </div>
                  )}

                  {contact.type === 'airport_staff' && contact.city && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                      <MapPin className="w-3.5 h-3.5" />
                      {contact.city}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {openMenuId && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setOpenMenuId(null)}
        />
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">Add New Contact</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Contact Type Selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Contact Type</label>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setNewContactType(key as ContactType)
                        setFormData({})
                      }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                        newContactType === key 
                          ? `${config.color} ${config.borderColor}` 
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <config.icon className="w-4 h-4" />
                      <span className="text-[10px] font-medium">{config.singular}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Form Fields */}
              <div className="space-y-3">
                {FORM_FIELDS[newContactType].map(field => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {field.name}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderFormField(field)}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveNew}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {showEditModal && selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${TYPE_CONFIG[selectedContact.type].color} flex items-center justify-center`}>
                  {(() => {
                    const Icon = TYPE_CONFIG[selectedContact.type].icon
                    return <Icon className="w-4 h-4" />
                  })()}
                </div>
                <h3 className="text-base font-semibold text-gray-900">Edit {TYPE_CONFIG[selectedContact.type].singular}</h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Dynamic Form Fields */}
              <div className="space-y-3">
                {FORM_FIELDS[selectedContact.type].map(field => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {field.name}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderFormField(field)}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Contact Modal */}
      {showViewModal && selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${TYPE_CONFIG[selectedContact.type].color} flex items-center justify-center`}>
                  {(() => {
                    const Icon = TYPE_CONFIG[selectedContact.type].icon
                    return <Icon className="w-5 h-5" />
                  })()}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{selectedContact.name}</h3>
                  <p className="text-xs text-gray-500">{TYPE_CONFIG[selectedContact.type].singular} • {selectedContact.subtype}</p>
                </div>
              </div>
              <button onClick={() => setShowViewModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Contact Info */}
              <div className="space-y-3">
                {selectedContact.contact_person && selectedContact.contact_person !== selectedContact.name && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Users className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Contact Person</p>
                      <p className="text-sm font-medium text-gray-900">{selectedContact.contact_person}</p>
                    </div>
                  </div>
                )}

                {selectedContact.email && (
                  <a 
                    href={`mailto:${selectedContact.email}`}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="text-sm font-medium text-primary-600">{selectedContact.email}</p>
                    </div>
                  </a>
                )}

                {selectedContact.phone && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="text-sm font-medium text-gray-900">{selectedContact.phone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${selectedContact.phone}`}
                        className="p-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200"
                        title="Call"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                      {selectedContact.whatsapp && (
                        <a
                          href={`https://wa.me/${selectedContact.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {selectedContact.city && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="text-sm font-medium text-gray-900">{selectedContact.city}</p>
                    </div>
                  </div>
                )}

                {selectedContact.address && (
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Address</p>
                      <p className="text-sm text-gray-900">{selectedContact.address}</p>
                    </div>
                  </div>
                )}

                {/* Type-specific info */}
                {selectedContact.type === 'hotel' && selectedContact.extra?.star_rating && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Star className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Rating</p>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: parseInt(selectedContact.extra.star_rating) }).map((_, i) => (
                          <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {selectedContact.type === 'guide' && (
                  <>
                    {selectedContact.extra?.languages && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <Globe className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Languages</p>
                          <p className="text-sm font-medium text-gray-900">
                            {Array.isArray(selectedContact.extra.languages) 
                              ? selectedContact.extra.languages.join(', ')
                              : selectedContact.extra.languages
                            }
                          </p>
                        </div>
                      </div>
                    )}
                    {(selectedContact.extra?.daily_rate || selectedContact.extra?.hourly_rate) && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-400 text-sm">💰</span>
                        <div>
                          <p className="text-xs text-gray-500">Rates</p>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedContact.extra?.daily_rate && `${selectedContact.extra.daily_rate}/day`}
                            {selectedContact.extra?.daily_rate && selectedContact.extra?.hourly_rate && ' • '}
                            {selectedContact.extra?.hourly_rate && `${selectedContact.extra.hourly_rate}/hour`}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {selectedContact.notes && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Notes</p>
                    <p className="text-sm text-gray-700">{selectedContact.notes}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowViewModal(false)
                  handleDeleteClick(selectedContact)
                }}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => {
                    setShowViewModal(false)
                    handleEdit(selectedContact)
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Delete Contact</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone.</p>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete <strong>{selectedContact.name}</strong>? 
                {selectedContact.type !== 'client' 
                  ? ' This contact will be marked as inactive.'
                  : ' This will permanently remove the client record.'
                }
              </p>

              {error && (
                <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          fetchAllContacts()
        }}
        supabase={supabase}
      />
    </div>
  )
}

// ============================================================================
// IMPORT MODAL COMPONENT
// ============================================================================

interface ImportField {
  key: string
  label: string
  required: boolean
  type: 'text' | 'email' | 'number' | 'array'
}

interface ImportResult {
  success: number
  failed: number
  errors: { row: number; message: string }[]
}

const IMPORT_FIELDS: Record<ContactType, ImportField[]> = {
  hotel: [
    { key: 'name', label: 'Hotel Name', required: true, type: 'text' },
    { key: 'property_type', label: 'Property Type', required: false, type: 'text' },
    { key: 'star_rating', label: 'Star Rating', required: false, type: 'number' },
    { key: 'city', label: 'City', required: false, type: 'text' },
    { key: 'address', label: 'Address', required: false, type: 'text' },
    { key: 'contact_person', label: 'Contact Person', required: false, type: 'text' },
    { key: 'email', label: 'Email', required: false, type: 'email' },
    { key: 'phone', label: 'Phone', required: false, type: 'text' },
    { key: 'whatsapp', label: 'WhatsApp', required: false, type: 'text' },
    { key: 'notes', label: 'Notes', required: false, type: 'text' },
  ],
  guide: [
    { key: 'name', label: 'Full Name', required: true, type: 'text' },
    { key: 'email', label: 'Email', required: false, type: 'email' },
    { key: 'phone', label: 'Phone', required: false, type: 'text' },
    { key: 'languages', label: 'Languages', required: false, type: 'array' },
    { key: 'specialties', label: 'Specialties', required: false, type: 'array' },
    { key: 'daily_rate', label: 'Daily Rate', required: false, type: 'number' },
    { key: 'hourly_rate', label: 'Hourly Rate', required: false, type: 'number' },
    { key: 'address', label: 'Address', required: false, type: 'text' },
    { key: 'notes', label: 'Notes', required: false, type: 'text' },
  ],
  restaurant: [
    { key: 'name', label: 'Restaurant Name', required: true, type: 'text' },
    { key: 'restaurant_type', label: 'Restaurant Type', required: false, type: 'text' },
    { key: 'cuisine_type', label: 'Cuisine Type', required: false, type: 'text' },
    { key: 'city', label: 'City', required: false, type: 'text' },
    { key: 'address', label: 'Address', required: false, type: 'text' },
    { key: 'contact_person', label: 'Contact Person', required: false, type: 'text' },
    { key: 'email', label: 'Email', required: false, type: 'email' },
    { key: 'phone', label: 'Phone', required: false, type: 'text' },
    { key: 'whatsapp', label: 'WhatsApp', required: false, type: 'text' },
    { key: 'capacity', label: 'Capacity', required: false, type: 'number' },
    { key: 'notes', label: 'Notes', required: false, type: 'text' },
  ],
  airport_staff: [
    { key: 'name', label: 'Full Name', required: true, type: 'text' },
    { key: 'role', label: 'Role', required: false, type: 'text' },
    { key: 'airport_location', label: 'Airport Location', required: false, type: 'text' },
    { key: 'email', label: 'Email', required: false, type: 'email' },
    { key: 'phone', label: 'Phone', required: false, type: 'text' },
    { key: 'whatsapp', label: 'WhatsApp', required: false, type: 'text' },
    { key: 'languages', label: 'Languages', required: false, type: 'array' },
    { key: 'shift_times', label: 'Shift Times', required: false, type: 'text' },
    { key: 'notes', label: 'Notes', required: false, type: 'text' },
  ],
  client: [
    { key: 'first_name', label: 'First Name', required: true, type: 'text' },
    { key: 'last_name', label: 'Last Name', required: true, type: 'text' },
    { key: 'email', label: 'Email', required: false, type: 'email' },
    { key: 'phone', label: 'Phone', required: false, type: 'text' },
    { key: 'nationality', label: 'Nationality', required: false, type: 'text' },
    { key: 'status', label: 'Status', required: false, type: 'text' },
    { key: 'preferred_language', label: 'Preferred Language', required: false, type: 'text' },
    { key: 'internal_notes', label: 'Notes', required: false, type: 'text' },
  ],
}

const IMPORT_TYPE_CONFIG: Record<ContactType, { icon: any; label: string; color: string }> = {
  hotel: { icon: Building2, label: 'Hotels', color: 'bg-blue-100 text-blue-700' },
  guide: { icon: Compass, label: 'Tour Guides', color: 'bg-green-100 text-green-700' },
  restaurant: { icon: Utensils, label: 'Restaurants', color: 'bg-orange-100 text-orange-700' },
  airport_staff: { icon: Plane, label: 'Airport Staff', color: 'bg-purple-100 text-purple-700' },
  client: { icon: Users, label: 'Clients', color: 'bg-primary-100 text-primary-700' },
}

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
  supabase: any
}

function ImportModal({ isOpen, onClose, onImportComplete, supabase }: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [step, setStep] = useState<'type' | 'upload' | 'mapping' | 'preview' | 'result'>('type')
  const [contactType, setContactType] = useState<ContactType>('hotel')
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const resetState = () => {
    setStep('type')
    setFile(null)
    setCsvData([])
    setCsvHeaders([])
    setColumnMapping({})
    setResult(null)
    setImportError(null)
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n').filter(line => line.trim())
    return lines.map(line => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return

    setImportError(null)
    setFile(uploadedFile)

    try {
      const text = await uploadedFile.text()
      const parsed = parseCSV(text)
      
      if (parsed.length < 2) {
        setImportError('File must contain at least a header row and one data row')
        return
      }

      const headers = parsed[0]
      const data = parsed.slice(1)
      
      setCsvHeaders(headers)
      setCsvData(data)
      
      const autoMapping: Record<string, string> = {}
      const fields = IMPORT_FIELDS[contactType]
      
      headers.forEach((header, index) => {
        const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const matchedField = fields.find(f => 
          f.key === normalizedHeader || 
          f.label.toLowerCase().replace(/[^a-z0-9]/g, '_') === normalizedHeader ||
          f.key.includes(normalizedHeader) ||
          normalizedHeader.includes(f.key)
        )
        if (matchedField) {
          autoMapping[matchedField.key] = index.toString()
        }
      })
      
      setColumnMapping(autoMapping)
      setStep('mapping')
    } catch (err: any) {
      setImportError('Failed to parse file: ' + err.message)
    }
  }

  const downloadTemplate = () => {
    const fields = IMPORT_FIELDS[contactType]
    const headers = fields.map(f => f.label)
    
    const exampleRow = fields.map(f => {
      switch (f.key) {
        case 'name': return 'Example Name'
        case 'first_name': return 'John'
        case 'last_name': return 'Doe'
        case 'email': return 'example@email.com'
        case 'phone': return '+20 123 456 7890'
        case 'city': return 'Cairo'
        case 'languages': return 'English, Arabic'
        case 'specialties': return 'Pyramids, Luxor'
        case 'star_rating': return '5'
        case 'daily_rate': return '100'
        case 'status': return 'active'
        default: return ''
      }
    })
    
    const csv = [headers.join(','), exampleRow.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${contactType}_import_template.csv`
    a.click()
  }

  const isValidEmail = (email: string): boolean => {
    return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const processRowData = (row: string[], fields: ImportField[]): Record<string, any> => {
    const data: Record<string, any> = {}
    
    fields.forEach(field => {
      const columnIndex = columnMapping[field.key]
      if (columnIndex !== undefined && columnIndex !== '') {
        let value = row[parseInt(columnIndex)]?.trim() || ''
        
        if (field.type === 'number' && value) {
          data[field.key] = parseFloat(value) || null
        } else if (field.type === 'array' && value) {
          data[field.key] = value.split(',').map(v => v.trim()).filter(Boolean)
        } else if (value) {
          data[field.key] = value
        }
      }
    })
    
    return data
  }

  const validateRow = (data: Record<string, any>, fields: ImportField[], rowIndex: number): string | null => {
    for (const field of fields) {
      if (field.required && !data[field.key]) {
        return `Row ${rowIndex + 1}: Missing required field "${field.label}"`
      }
      if (field.type === 'email' && data[field.key] && !isValidEmail(data[field.key])) {
        return `Row ${rowIndex + 1}: Invalid email format for "${field.label}"`
      }
    }
    return null
  }

  const handleImport = async () => {
    setImporting(true)
    setImportError(null)
    
    const fields = IMPORT_FIELDS[contactType]
    const tableName = TABLE_NAMES[contactType]
    const results: ImportResult = { success: 0, failed: 0, errors: [] }
    
    try {
      const rowsToInsert: Record<string, any>[] = []
      
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i]
        const data = processRowData(row, fields)
        
        if (contactType !== 'client') {
          data.is_active = true
        }
        
        const validationError = validateRow(data, fields, i)
        if (validationError) {
          results.failed++
          results.errors.push({ row: i + 2, message: validationError })
          continue
        }
        
        const hasRequiredData = fields.filter(f => f.required).every(f => data[f.key])
        if (!hasRequiredData) {
          results.failed++
          results.errors.push({ row: i + 2, message: 'Missing required fields' })
          continue
        }
        
        rowsToInsert.push(data)
      }
      
      const chunkSize = 50
      for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
        const chunk = rowsToInsert.slice(i, i + chunkSize)
        
        const { error: insertError } = await supabase
          .from(tableName)
          .insert(chunk)
        
        if (insertError) {
          for (const row of chunk) {
            const { error: singleError } = await supabase
              .from(tableName)
              .insert(row)
            
            if (singleError) {
              results.failed++
              results.errors.push({ 
                row: rowsToInsert.indexOf(row) + 2, 
                message: singleError.message 
              })
            } else {
              results.success++
            }
          }
        } else {
          results.success += chunk.length
        }
      }
      
      setResult(results)
      setStep('result')
      
      if (results.success > 0) {
        onImportComplete()
      }
    } catch (err: any) {
      setImportError('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  const getPreviewData = () => {
    const fields = IMPORT_FIELDS[contactType]
    return csvData.slice(0, 5).map(row => processRowData(row, fields))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Import Contacts</h3>
              <p className="text-xs text-gray-500">
                {step === 'type' && 'Step 1: Select contact type'}
                {step === 'upload' && 'Step 2: Upload your file'}
                {step === 'mapping' && 'Step 3: Map columns'}
                {step === 'preview' && 'Step 4: Preview & import'}
                {step === 'result' && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {importError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {importError}
              <button onClick={() => setImportError(null)} className="ml-auto">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'type' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">What type of contacts do you want to import?</p>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(IMPORT_TYPE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon
                  return (
                    <button
                      key={key}
                      onClick={() => setContactType(key as ContactType)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                        contactType === key 
                          ? 'border-primary-500 bg-primary-50' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg ${config.color} flex items-center justify-center`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{config.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
                >
                  <Download className="w-4 h-4" />
                  Download {IMPORT_TYPE_CONFIG[contactType].label} template CSV
                </button>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 hover:bg-primary-50/50 transition-colors cursor-pointer"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">CSV file (comma-separated)</p>
              </div>

              {file && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={() => { setFile(null); setCsvData([]); setCsvHeaders([]) }} className="p-1 hover:bg-gray-200 rounded">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-700">
                  <p className="font-medium mb-1">Tips for successful import:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>First row should be column headers</li>
                    <li>Use comma (,) as separator</li>
                    <li>For arrays (languages, specialties), separate with commas</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Map your CSV columns to the database fields. Found {csvData.length} rows to import.
              </p>

              <div className="space-y-3">
                {IMPORT_FIELDS[contactType].map(field => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-1/3">
                      <label className="text-sm font-medium text-gray-700">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <select
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                    >
                      <option value="">-- Skip this field --</option>
                      {csvHeaders.map((header, index) => (
                        <option key={index} value={index.toString()}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Sample data from your file:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        {csvHeaders.map((header, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium text-gray-600 border border-gray-200">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1.5 text-gray-700 border border-gray-200 truncate max-w-[150px]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Ready to import <strong>{csvData.length}</strong> {IMPORT_TYPE_CONFIG[contactType].label.toLowerCase()}
                </p>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${IMPORT_TYPE_CONFIG[contactType].color}`}>
                  {IMPORT_TYPE_CONFIG[contactType].label}
                </span>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {IMPORT_FIELDS[contactType].filter(f => columnMapping[f.key]).map(field => (
                        <th key={field.key} className="px-3 py-2 text-left font-medium text-gray-600">{field.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getPreviewData().map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {IMPORT_FIELDS[contactType].filter(f => columnMapping[f.key]).map(field => (
                          <td key={field.key} className="px-3 py-2 text-gray-700">
                            {Array.isArray(row[field.key]) ? row[field.key].join(', ') : row[field.key] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {csvData.length > 5 && (
                <p className="text-xs text-gray-500 text-center">Showing 5 of {csvData.length} rows</p>
              )}
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-6">
                {result.success > 0 ? (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900">Import Complete!</h4>
                    <p className="text-sm text-gray-500 mt-1">Successfully imported {result.success} contacts</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900">Import Failed</h4>
                    <p className="text-sm text-gray-500 mt-1">No contacts were imported</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">{result.success}</p>
                  <p className="text-xs text-green-600">Successful</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-700">{result.failed}</p>
                  <p className="text-xs text-red-600">Failed</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-red-50 border-b border-red-200">
                    <p className="text-xs font-medium text-red-700">Errors ({result.errors.length})</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <div key={i} className="px-3 py-2 text-xs text-red-600 border-b border-red-100 last:border-0">{err.message}</div>
                    ))}
                    {result.errors.length > 10 && (
                      <div className="px-3 py-2 text-xs text-red-500 bg-red-50">And {result.errors.length - 10} more errors...</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
          <div>
            {step !== 'type' && step !== 'result' && (
              <button
                onClick={() => {
                  if (step === 'upload') setStep('type')
                  if (step === 'mapping') setStep('upload')
                  if (step === 'preview') setStep('mapping')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Back
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {step === 'result' ? (
              <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
                Done
              </button>
            ) : (
              <>
                <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                  Cancel
                </button>
                
                {step === 'type' && (
                  <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
                    Continue
                  </button>
                )}
                
                {step === 'mapping' && (
                  <button
                    onClick={() => setStep('preview')}
                    disabled={!IMPORT_FIELDS[contactType].filter(f => f.required).every(f => columnMapping[f.key])}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Preview
                  </button>
                )}
                
                {step === 'preview' && (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Import {csvData.length} Contacts
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}