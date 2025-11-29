'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { 
  Search, 
  Filter, 
  Phone, 
  Mail, 
  MapPin, 
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
  ChevronDown
} from 'lucide-react'

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
  extra?: Record<string, any>
}

const TYPE_CONFIG = {
  hotel: { 
    icon: Building2, 
    label: 'Hotels', 
    color: 'bg-blue-100 text-blue-700',
    borderColor: 'border-blue-200'
  },
  guide: { 
    icon: Compass, 
    label: 'Tour Guides', 
    color: 'bg-green-100 text-green-700',
    borderColor: 'border-green-200'
  },
  restaurant: { 
    icon: Utensils, 
    label: 'Restaurants', 
    color: 'bg-orange-100 text-orange-700',
    borderColor: 'border-orange-200'
  },
  airport_staff: { 
    icon: Plane, 
    label: 'Airport Staff', 
    color: 'bg-purple-100 text-purple-700',
    borderColor: 'border-purple-200'
  },
  client: { 
    icon: Users, 
    label: 'Clients', 
    color: 'bg-primary-100 text-primary-700',
    borderColor: 'border-primary-200'
  },
}

export default function ContactsPage() {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

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
        .select('id, name, property_type, city, contact_person, phone, email, whatsapp, star_rating')
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
          extra: { star_rating: h.star_rating }
        })))
      }

      // Fetch guides
      const { data: guides } = await supabase
        .from('guides')
        .select('id, name, phone, email, languages, specialties')
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
          extra: { languages: g.languages, specialties: g.specialties }
        })))
      }

      // Fetch restaurants
      const { data: restaurants } = await supabase
        .from('restaurant_contacts')
        .select('id, name, restaurant_type, cuisine_type, city, contact_person, phone, email, whatsapp')
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
          extra: { cuisine_type: r.cuisine_type }
        })))
      }

      // Fetch airport staff
      const { data: airportStaff } = await supabase
        .from('airport_staff')
        .select('id, name, role, airport_location, phone, email, whatsapp, languages')
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
          extra: { languages: a.languages }
        })))
      }

      // Fetch clients
      const { data: clients } = await supabase
        .from('clients')
        .select('id, first_name, last_name, email, phone, status, nationality')
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
          extra: { nationality: c.nationality }
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
      contact.city?.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesType && matchesSearch
  })

  // Group by type for stats
  const stats = {
    all: contacts.length,
    hotel: contacts.filter(c => c.type === 'hotel').length,
    guide: contacts.filter(c => c.type === 'guide').length,
    restaurant: contacts.filter(c => c.type === 'restaurant').length,
    airport_staff: contacts.filter(c => c.type === 'airport_staff').length,
    client: contacts.filter(c => c.type === 'client').length,
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
              <button className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                <Download className="w-4 h-4" />
                Export
              </button>
              <button className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
                <Plus className="w-4 h-4" />
                Add Contact
              </button>
            </div>
          </div>

          {/* Stats */}
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
                    ? `${config.color}` 
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
            placeholder="Search by name, email, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>
      </div>

      {/* Contacts Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No contacts found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map((contact) => {
              const config = TYPE_CONFIG[contact.type]
              const Icon = config.icon
              
              return (
                <div 
                  key={`${contact.type}-${contact.id}`}
                  className={`bg-white rounded-lg border ${config.borderColor} p-4 hover:shadow-md transition-shadow`}
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
                    <button className="p-1 hover:bg-gray-100 rounded">
                      <MoreHorizontal className="w-4 h-4 text-gray-400" />
                    </button>
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
                      className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary-600 mb-2"
                    >
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      {contact.email}
                    </a>
                  )}

                  {contact.phone && (
                    <a 
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary-600 mb-2"
                    >
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      {contact.phone}
                    </a>
                  )}

                  {/* Extra info based on type */}
                  {contact.type === 'hotel' && contact.extra?.star_rating && (
                    <div className="flex items-center gap-1 mt-2">
                      {Array.from({ length: contact.extra.star_rating }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      ))}
                    </div>
                  )}

                  {contact.type === 'guide' && contact.extra?.languages && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                      <Globe className="w-3.5 h-3.5" />
                      {Array.isArray(contact.extra.languages) 
                        ? contact.extra.languages.join(', ') 
                        : contact.extra.languages
                      }
                    </div>
                  )}

                  {contact.type === 'restaurant' && contact.extra?.cuisine_type && (
                    <div className="text-xs text-gray-500 mt-2">
                      Cuisine: {contact.extra.cuisine_type}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}