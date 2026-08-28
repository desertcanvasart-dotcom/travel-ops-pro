'use client'

import { todayLocal } from '@/lib/today'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { SUPPLIER_FORM_FIELDS, type SupplierFormField } from '@/lib/suppliers/fields'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import { 
  Plus, MoreHorizontal, Building2, Car, Compass, Ship, Ticket, Utensils, 
  ShoppingBag, MapPin, Users, Briefcase, X, Edit, Trash2, Eye, Loader2, AlertCircle,
  Phone, Mail, MessageCircle, LayoutGrid, List, Table2, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Download,
  Globe, DollarSign, FileText, Check, TrainFront, Plane, ConciergeBell, BellRing
} from 'lucide-react'
import { useCurrency } from '@/app/contexts/PreferencesContext'

// Types
interface Supplier {
  id: string
  name: string
  /** The primary role, shown on the badge. */
  type: string
  /** Every role this supplier fills — a driver who also meets clients airside
   *  carries both, and each picker finds them by the role it cares about. */
  types?: string[] | null
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  whatsapp?: string
  address?: string
  city?: string
  country?: string
  website?: string
  status: 'active' | 'inactive' | 'pending'
  notes?: string
  // Managed under Rates › Commissions; shown read-only here.
  default_commission_rate?: number | null
  commission_type?: string | null
  created_at: string
}

interface TransportRate {
  id: string
  service_code: string
  service_type: string
  vehicle_type: string
  city: string
  destination_city?: string
  base_rate_eur: number
  base_rate_non_eur: number
  capacity_min?: number
  capacity_max?: number
}

type ViewMode = 'grid' | 'table' | 'list'
type SortField = 'name' | 'type' | 'city' | 'status'
type SortDirection = 'asc' | 'desc'

// Constants - FULL EGYPTIAN CITIES LIST (36 cities)
const EGYPTIAN_CITIES = [
  'Alamein', 'Alexandria', 'Aswan', 'Asyut', 'Bahariya', 'Beni Suef', 'Cairo',
  'Dahab', 'Dakhla', 'Edfu', 'El Arish', 'El Balyana', 'El Gouna', 'El Quseir',
  'El Tor', 'Esna', 'Farafra', 'Fayoum', 'Giza', 'Hurghada', 'Ismailia', 'Kharga', 
  'Kom Ombo', 'Luxor', 'Marsa Alam', 'Minya', 'Nuweiba', 'Port Said', 'Qena', 
  'Rafah', 'Rosetta (Rashid)', 'Safaga', 'Saint Catherine', 'Sharm El Sheikh', 
  'Sheikh Zuweid', 'Siwa', 'Sohag', 'Suez', 'Taba'
]

// Supplier type configuration
  const TYPE_CONFIG: Record<string, { icon: any; label: string; singular: string; color: string; borderColor: string }> = {
  hotel: { icon: Building2, label: 'Hotels', singular: 'Hotel', color: 'bg-blue-100 text-blue-700', borderColor: 'border-blue-200' },
  transport: { icon: Car, label: 'Transport', singular: 'Transport', color: 'bg-cyan-100 text-cyan-700', borderColor: 'border-cyan-200' },
  local_operator: { icon: Globe, label: 'Local Operators', singular: 'Local Operator', color: 'bg-emerald-100 text-emerald-700', borderColor: 'border-emerald-200' },
  driver: { icon: Car, label: 'Drivers', singular: 'Driver', color: 'bg-teal-100 text-teal-700', borderColor: 'border-teal-200' },
  guide: { icon: Compass, label: 'Guides', singular: 'Guide', color: 'bg-green-100 text-green-700', borderColor: 'border-green-200' },
  cruise: { icon: Ship, label: 'Cruises', singular: 'Cruise', color: 'bg-indigo-100 text-indigo-700', borderColor: 'border-indigo-200' },
  activity_provider: { icon: Ticket, label: 'Activities', singular: 'Activity Provider', color: 'bg-purple-100 text-purple-700', borderColor: 'border-purple-200' },
  attraction: { icon: MapPin, label: 'Attractions', singular: 'Attraction', color: 'bg-pink-100 text-pink-700', borderColor: 'border-pink-200' },
  tour_operator: { icon: Globe, label: 'Tour Operators', singular: 'Tour Operator', color: 'bg-amber-100 text-amber-700', borderColor: 'border-amber-200' },
  ground_handler: { icon: Briefcase, label: 'Ground Handlers', singular: 'Ground Handler', color: 'bg-slate-100 text-slate-700', borderColor: 'border-slate-200' },
  train_operator: { icon: TrainFront, label: 'Train Operators', singular: 'Train Operator', color: 'bg-sky-100 text-sky-700', borderColor: 'border-sky-200' },
  air_carrier: { icon: Plane, label: 'Air Carriers', singular: 'Air Carrier', color: 'bg-violet-100 text-violet-700', borderColor: 'border-violet-200' },
  airport_assistant: { icon: ConciergeBell, label: 'Airport Assistants', singular: 'Airport Assistant', color: 'bg-lime-100 text-lime-700', borderColor: 'border-lime-200' },
  hotel_assistant: { icon: BellRing, label: 'Hotel Assistants', singular: 'Hotel Assistant', color: 'bg-fuchsia-100 text-fuchsia-700', borderColor: 'border-fuchsia-200' },
  restaurant: { icon: Utensils, label: 'Restaurants', singular: 'Restaurant', color: 'bg-orange-100 text-orange-700', borderColor: 'border-orange-200' },
  shop: { icon: ShoppingBag, label: 'Shops', singular: 'Shop', color: 'bg-rose-100 text-rose-700', borderColor: 'border-rose-200' },
  other: { icon: Briefcase, label: 'Other', singular: 'Supplier', color: 'bg-gray-100 text-gray-700', borderColor: 'border-gray-200' }
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  pending: 'bg-yellow-100 text-yellow-700'
}

// Multi-select component
function MultiSelect({ options, value, onChange, placeholder, labelFor = (v) => v }: { 
  options: string[]; value: string[]; onChange: (v: string[]) => void; placeholder: string; labelFor?: (v: string) => string 
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(!isOpen) }}
        className="w-full min-h-[40px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-left flex items-center justify-between gap-2 cursor-pointer hover:border-gray-300"
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : (
            value.map(v => (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs font-medium">
                {labelFor(v)}
                <span 
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onChange(value.filter(x => x !== v)) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(value.filter(x => x !== v)) } }}
                  className="hover:text-primary-900 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {options.map(option => (
              <div
                key={option}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (value.includes(option)) {
                    onChange(value.filter(v => v !== option))
                  } else {
                    onChange([...value, option])
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (value.includes(option)) {
                      onChange(value.filter(v => v !== option))
                    } else {
                      onChange([...value, option])
                    }
                  }
                }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between cursor-pointer"
              >
                <span>{labelFor(option)}</span>
                {value.includes(option) && <Check className="w-4 h-4 text-primary-600" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function SuppliersContent() {
  const { rateSymbol } = useCurrency()
  const t = useTranslations('suppliers')
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12)
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  // Bulk selection — same kit as the rates pages. Above every early return.
  const bulk = useBulkSelect()
  const [bulkNotice, setBulkNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  
  // View modal tabs
  const [viewTab, setViewTab] = useState<'details' | 'rates' | 'documents'>('details')
  const [supplierRates, setSupplierRates] = useState<TransportRate[]>([])
  const [loadingRates, setLoadingRates] = useState(false)

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam && (typeParam === 'all' || TYPE_CONFIG[typeParam])) {
      setSelectedType(typeParam)
    }
  }, [searchParams])

  const handleTypeChange = (type: string) => {
    setSelectedType(type)
    setCurrentPage(1)
    router.push(type === 'all' ? '/suppliers' : `/suppliers?type=${type}`, { scroll: false })
  }

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/suppliers')
      if (response.ok) {
        const result = await response.json()
        setSuppliers(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSupplierRates = async (supplierId: string) => {
    setLoadingRates(true)
    try {
      const response = await fetch(`/api/resources/transportation?supplier_id=${supplierId}`)
      if (response.ok) {
        const result = await response.json()
        setSupplierRates(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching rates:', error)
      setSupplierRates([])
    } finally {
      setLoadingRates(false)
    }
  }

  // Filter and sort
  const filteredSuppliers = suppliers
    .filter(supplier => {
      const roles = supplier.types?.length ? supplier.types : [supplier.type]
      const matchesType = selectedType === 'all' || roles.includes(selectedType)
      const matchesStatus = selectedStatus === 'all' || supplier.status === selectedStatus
      const matchesSearch = !searchQuery || 
        supplier.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.contact_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.city?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesType && matchesStatus && matchesSearch
    })
    .sort((a, b) => {
      let aVal = '', bVal = ''
      switch (sortField) {
        case 'name': aVal = a.name?.toLowerCase() || ''; bVal = b.name?.toLowerCase() || ''; break
        case 'type': aVal = a.type || ''; bVal = b.type || ''; break
        case 'city': aVal = a.city?.toLowerCase() || ''; bVal = b.city?.toLowerCase() || ''; break
        case 'status': aVal = a.status || ''; bVal = b.status || ''; break
      }
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedSuppliers = filteredSuppliers.slice(startIndex, startIndex + itemsPerPage)

  useEffect(() => { setCurrentPage(1) }, [searchQuery, selectedType, selectedStatus, itemsPerPage])

  const stats = suppliers.reduce((acc, s) => {
    // Counted once per role: the totals on the chips answer "how many people
    // do this?", which is the question the chip asks.
    for (const role of (s.types?.length ? s.types : [s.type])) {
      acc[role] = (acc[role] || 0) + 1
    }
    acc.all = (acc.all || 0) + 1
    return acc
  }, { all: 0 } as Record<string, number>)

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

  const getTypeConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.other

  const handleAdd = () => {
    const defaultType = selectedType !== 'all' ? selectedType : 'hotel'
    setFormData({ status: 'active', type: defaultType, types: [defaultType] })
    setError(null)
    setShowAddModal(true)
  }

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    // Only what the form edits: the retired extras stay on the row untouched
    // and are never re-sent, so editing a contact cannot disturb a rate fact.
    const editable: Record<string, any> = { type: supplier.type, types: supplier.types?.length ? supplier.types : [supplier.type] }
    for (const f of SUPPLIER_FORM_FIELDS) if (f.key !== 'types') editable[f.key] = (supplier as any)[f.key] ?? ''
    setFormData(editable)
    setError(null)
    setShowEditModal(true)
    setOpenMenuId(null)
  }

  const handleView = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setViewTab('details')
    setSupplierRates([])
    setShowViewModal(true)
    setOpenMenuId(null)
    
    // Fetch rates for transport-side suppliers
    if (['transport', 'local_operator', 'driver'].includes(supplier.type)) {
      fetchSupplierRates(supplier.id)
    }
  }

  const handleDeleteClick = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setShowDeleteModal(true)
    setOpenMenuId(null)
  }

  const handleSaveNew = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to create')
      setShowAddModal(false)
      setFormData({})
      fetchSuppliers()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!selectedSupplier) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/suppliers/${selectedSupplier.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to update')
      setShowEditModal(false)
      setSelectedSupplier(null)
      setFormData({})
      fetchSuppliers()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleBulkDelete = async () => {
    const [ok, failed, reasons] = await bulkDeleteByIds([...bulk.selected], id => `/api/suppliers/${id}`)
    bulk.clear()
    // A partial result names its count AND the server's reason. "3 of 5
    // deleted" with no why is a puzzle; "2 blocked: referenced by invoices"
    // is an instruction.
    if (failed === 0) setBulkNotice({ tone: 'ok', text: t('bulkDeleted', { count: ok }) })
    else setBulkNotice({ tone: 'warn', text: t('bulkPartial', { ok, failed, reason: reasons.join(' · ') }) })
    fetchSuppliers()
  }

  const handleDelete = async () => {
    if (!selectedSupplier) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/suppliers/${selectedSupplier.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to delete')
      setShowDeleteModal(false)
      setSelectedSupplier(null)
      fetchSuppliers()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleExport = () => {
    const csv = [
      ['Name', 'Roles', 'Contact', 'Email', 'Phone', 'WhatsApp', 'City', 'Status'].join(','),
      ...filteredSuppliers.map(s => [
        s.name, 
        (s.types?.length ? s.types : [s.type]).join('; '), 
        s.contact_name, 
        s.contact_email, 
        s.contact_phone, 
        s.whatsapp, 
        s.city, 
        s.status
      ].map(v => `"${v || ''}"`).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `suppliers-${todayLocal()}.csv`
    a.click()
  }

  // The form is the same for every role — see lib/suppliers/fields.ts. Role
  // details (languages, vehicles, routes, commissions) live under Rates.
  const fieldLabel = (field: SupplierFormField) => t(field.labelKey)
  const optionLabel = (field: SupplierFormField, opt: string) =>
    field.key === 'status' ? t(`status${opt.charAt(0).toUpperCase() + opt.slice(1)}`) : opt

  const renderFormField = (field: SupplierFormField) => {
    const value = formData[field.key]
    const inputClass = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none'

    if (field.kind === 'roles') {
      const roleOptions = Object.keys(TYPE_CONFIG).filter(k => k !== 'other')
      return (
        <MultiSelect
          options={roleOptions}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => setFormData(prev => ({ ...prev, types: v, type: v.includes(prev.type) ? prev.type : v[0] }))}
          placeholder={t('selectOption', { field: fieldLabel(field) })}
          labelFor={(k) => getTypeConfig(k).singular}
        />
      )
    }

    if (field.kind === 'select') {
      const options = field.options === 'cities' ? EGYPTIAN_CITIES : (field.options || [])
      return (
        <select
          value={value || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          className={`${inputClass} bg-white`}
        >
          <option value="">{t('selectOption', { field: fieldLabel(field) })}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{optionLabel(field, opt)}</option>
          ))}
        </select>
      )
    }

    if (field.kind === 'textarea') {
      return (
        <textarea
          value={value || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
          placeholder={t('enterValue', { field: fieldLabel(field).toLowerCase() })}
        />
      )
    }

    return (
      <input
        type={field.kind}
        value={value || ''}
        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
        className={inputClass}
        placeholder={t('enterValue', { field: fieldLabel(field).toLowerCase() })}
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
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      for (let i = start; i <= end; i++) pages.push(i)
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
          <div className="flex items-center justify-between flex-wrap gap-y-2">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {selectedType === 'all' ? t('allSuppliers') : getTypeConfig(selectedType).label}
              </h1>
              <p className="text-sm text-gray-500">{t('subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                {(['grid', 'table', 'list'] as ViewMode[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === mode ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {mode === 'grid' ? <LayoutGrid className="w-4 h-4" /> : mode === 'table' ? <Table2 className="w-4 h-4" /> : <List className="w-4 h-4" />}
                  </button>
                ))}
              </div>
              <div className="w-px h-6 bg-gray-200" />
              <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                <Download className="w-4 h-4" /> {t('export')}
              </button>
              <button type="button" onClick={handleAdd} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
                <Plus className="w-4 h-4" /> {t('addSupplier')}
              </button>
            </div>
          </div>

          {/* Type Tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => handleTypeChange('all')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${selectedType === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {t('all')} <span className="px-1.5 py-0.5 bg-white/20 rounded-full">{stats.all || 0}</span>
            </button>
            {Object.entries(TYPE_CONFIG).filter(([key]) => key !== 'other' && stats[key]).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleTypeChange(key)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${selectedType === key ? config.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <config.icon className="w-3.5 h-3.5" />
                {config.label}
                <span className={`px-1.5 py-0.5 rounded-full ${selectedType === key ? 'bg-white/30' : 'bg-gray-200'}`}>{stats[key] || 0}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-3 pr-4 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
            />
          </div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-lg outline-none bg-white"
          >
            <option value="all">{t('allStatus')}</option>
            <option value="active">{t('statusActive')}</option>
            <option value="inactive">{t('statusInactive')}</option>
            <option value="pending">{t('statusPending')}</option>
          </select>

        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">{t('noSuppliersFound')}</p>
            <button type="button" onClick={handleAdd} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
              <Plus className="w-4 h-4" /> {t('addFirstSupplier')}
            </button>
          </div>
        ) : (
          <>
            {bulkNotice && (
              <div className={`mb-3 flex items-start justify-between gap-3 px-4 py-2.5 rounded-lg border text-sm ${bulkNotice.tone === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <span>{bulkNotice.text}</span>
                <button type="button" onClick={() => setBulkNotice(null)} className="text-xs opacity-70 hover:opacity-100">{t('dismiss')}</button>
              </div>
            )}
            <BulkDeleteBar count={bulk.selected.size} label={t('bulkLabel')} onDelete={handleBulkDelete} onClear={bulk.clear} />

            {/* GRID VIEW */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedSuppliers.map((supplier) => {
                  const config = getTypeConfig(supplier.type)
                  const Icon = config.icon
                  return (
                    <div key={supplier.id} className={`bg-white rounded-lg border ${bulk.has(supplier.id) ? 'border-red-300 ring-1 ring-red-200' : config.borderColor} p-4 hover:shadow-md transition-all cursor-pointer group`} onClick={() => handleView(supplier)}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" aria-label="select supplier" checked={bulk.has(supplier.id)} onChange={() => bulk.toggle(supplier.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 flex-shrink-0" />
                          <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{supplier.name}</h3>
                            <p className="text-xs text-gray-500">
                              {config.singular}{supplier.city && ` • ${supplier.city}`}
                            </p>
                          </div>
                        </div>
                        <div className="relative">
                          <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === supplier.id ? null : supplier.id) }} className="p-1 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="w-4 h-4 text-gray-400" />
                          </button>
                          {openMenuId === supplier.id && (
                            <div className="absolute right-0 top-8 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleView(supplier) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"><Eye className="w-3.5 h-3.5" /> {t('view')}</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(supplier) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"><Edit className="w-3.5 h-3.5" /> {t('edit')}</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteClick(supplier) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /> {t('delete')}</button>
                            </div>
                          )}
                        </div>
                      </div>

                      {supplier.contact_email && (
                        <a href={`mailto:${supplier.contact_email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary-600 mb-2">
                          <Mail className="w-3.5 h-3.5 text-gray-400" /> {supplier.contact_email}
                        </a>
                      )}
                      {supplier.contact_phone && (
                        <div className="flex items-center gap-3 mb-3">
                          <span className="flex items-center gap-2 text-xs text-gray-600"><Phone className="w-3.5 h-3.5 text-gray-400" /> {supplier.contact_phone}</span>
                          {supplier.whatsapp && (
                            <a href={`https://wa.me/${supplier.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" onClick={(e) => e.stopPropagation()} className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200">
                              <MessageCircle className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[supplier.status]}`}>{t(`status${supplier.status.charAt(0).toUpperCase() + supplier.status.slice(1)}`)}</span>
                        {supplier.website && (
                          <a href={supplier.website} target="_blank" onClick={(e) => e.stopPropagation()} className="text-gray-400 hover:text-primary-600"><Globe className="w-3.5 h-3.5" /></a>
                        )}
                      </div>
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
                      <th className="px-3 py-3 w-8"><input type="checkbox" aria-label="select all" checked={paginatedSuppliers.length > 0 && bulk.selected.size === paginatedSuppliers.length} onChange={() => bulk.toggleAll(paginatedSuppliers.map(s => s.id))} className="w-4 h-4" /></th>
                      <th className="text-left px-4 py-3"><button onClick={() => handleSort('name')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">{t('name')} <SortIcon field="name" /></button></th>
                      <th className="text-left px-4 py-3"><button onClick={() => handleSort('type')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">{t('type')} <SortIcon field="type" /></button></th>
                      <th className="text-left px-4 py-3"><button onClick={() => handleSort('city')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">{t('city')} <SortIcon field="city" /></button></th>
                      <th className="text-left px-4 py-3"><span className="text-xs font-semibold text-gray-600">{t('contact')}</span></th>
                      <th className="text-left px-4 py-3"><button onClick={() => handleSort('status')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">{t('status')} <SortIcon field="status" /></button></th>
                      <th className="text-right px-4 py-3"><span className="text-xs font-semibold text-gray-600">{t('actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSuppliers.map((supplier) => {
                      const config = getTypeConfig(supplier.type)
                      const Icon = config.icon
                      return (
                        <tr key={supplier.id} className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${bulk.has(supplier.id) ? 'bg-red-50/40' : ''}`} onClick={() => handleView(supplier)}>
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="select row" checked={bulk.has(supplier.id)} onChange={() => bulk.toggle(supplier.id)} className="w-4 h-4" /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
                              <div>
                                <span className="text-sm font-medium text-gray-900">{supplier.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>{config.label}</span></td>
                          <td className="px-4 py-3"><span className="text-sm text-gray-600">{supplier.city || '—'}</span></td>
                          <td className="px-4 py-3">{supplier.contact_email ? <a href={`mailto:${supplier.contact_email}`} onClick={(e) => e.stopPropagation()} className="text-sm text-primary-600 hover:underline">{supplier.contact_email}</a> : <span className="text-sm text-gray-400">—</span>}</td>
                          <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[supplier.status]}`}>{t(`status${supplier.status.charAt(0).toUpperCase() + supplier.status.slice(1)}`)}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(supplier) }} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(supplier) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
                {paginatedSuppliers.map((supplier) => {
                  const config = getTypeConfig(supplier.type)
                  const Icon = config.icon
                  return (
                    <div key={supplier.id} className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer group ${bulk.has(supplier.id) ? 'bg-red-50/40' : ''}`} onClick={() => handleView(supplier)}>
                      <input type="checkbox" aria-label="select supplier" checked={bulk.has(supplier.id)} onChange={() => bulk.toggle(supplier.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 flex-shrink-0" />
                      <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center flex-shrink-0`}><Icon className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0 grid grid-cols-5 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate">{supplier.name}</p>
                          <p className="text-xs text-gray-500">{config.label}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">{supplier.city && <><MapPin className="w-3.5 h-3.5 text-gray-400" />{supplier.city}</>}</div>
                        <div>{supplier.contact_email && <a href={`mailto:${supplier.contact_email}`} onClick={(e) => e.stopPropagation()} className="text-sm text-gray-600 hover:text-primary-600 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" /><span className="truncate">{supplier.contact_email}</span></a>}</div>
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">{supplier.contact_phone && <><Phone className="w-3.5 h-3.5 text-gray-400" /><span className="truncate">{supplier.contact_phone}</span></>}</div>
                        <div><span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[supplier.status]}`}>{t(`status${supplier.status.charAt(0).toUpperCase() + supplier.status.slice(1)}`)}</span></div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(supplier) }} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(supplier) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 0 && (
              <div className="mt-6 flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-600">{t('showing')} <span className="font-medium">{startIndex + 1}</span>–<span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredSuppliers.length)}</span> {t('of')} <span className="font-medium">{filteredSuppliers.length}</span></p>
                <div className="flex items-center gap-4">
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronsLeft className="w-4 h-4" /></button>
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                      {getPageNumbers().map((page, i) => page === '...' ? <span key={`e${i}`} className="px-2 text-gray-400">...</span> : (
                        <button key={page} onClick={() => setCurrentPage(page as number)} className={`min-w-[32px] h-8 px-2 text-sm font-medium rounded-lg ${currentPage === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{page}</button>
                      ))}
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40"><ChevronsRight className="w-4 h-4" /></button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-sm text-gray-500">{t('show')}</span>
                    <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="h-8 px-2 pr-7 text-sm border border-gray-200 rounded-lg outline-none bg-white">
                      <option value={12}>12</option>
                      <option value={24}>24</option>
                      <option value={48}>48</option>
                    </select>
                    <span className="text-sm text-gray-500">{t('perPage')}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {openMenuId && <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />}

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {formData.type && (() => {
                  const config = getTypeConfig(formData.type)
                  const Icon = config.icon
                  return <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
                })()}
                <h2 className="text-lg font-semibold text-gray-900">{showAddModal ? t('addSupplier') : t('editSupplier')}</h2>
              </div>
              <button onClick={() => { setShowAddModal(false); setShowEditModal(false); setError(null) }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              {(['sectionIdentity', 'sectionContact', 'sectionLocation', 'sectionNotes'] as const).map((section) => (
                <div key={section} className="mb-5 last:mb-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t(section)}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SUPPLIER_FORM_FIELDS.filter(f => f.sectionKey === section).map((field) => (
                      <div key={field.key} className={field.wide || field.kind === 'roles' ? 'md:col-span-2' : ''}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {fieldLabel(field)} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {renderFormField(field)}
                        {field.kind === 'roles' && <p className="text-xs text-gray-500 mt-1">{t('rolesHint')}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="mt-4 text-xs text-gray-500 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                {t('detailsLiveInRates')} <Link href="/rates" className="text-primary-600 hover:underline">{t('rates')}</Link>
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button type="button" onClick={() => { setShowAddModal(false); setShowEditModal(false); setError(null) }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                {t('cancel')}
              </button>
              <button type="button" onClick={showAddModal ? handleSaveNew : handleSaveEdit} disabled={saving || !formData.name || !(formData.types?.length)} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {(() => {
                  const config = getTypeConfig(selectedSupplier.type)
                  const Icon = config.icon
                  return <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
                })()}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selectedSupplier.name}</h2>
                  <p className="text-sm text-gray-500">{(selectedSupplier.types?.length ? selectedSupplier.types : [selectedSupplier.type]).map(r => getTypeConfig(r).singular).join(' · ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowViewModal(false); handleEdit(selectedSupplier) }} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-5 h-5" /></button>
                <button onClick={() => setShowViewModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 border-b border-gray-200">
              <div className="flex gap-6">
                <button type="button" onClick={() => setViewTab('details')} className={`py-3 text-sm font-medium border-b-2 transition-colors ${viewTab === 'details' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('details')}</button>
                {['transport', 'local_operator', 'driver'].includes(selectedSupplier.type) && (
                  <button type="button" onClick={() => setViewTab('rates')} className={`py-3 text-sm font-medium border-b-2 transition-colors ${viewTab === 'rates' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t('rates')} {supplierRates.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-xs">{supplierRates.length}</span>}
                  </button>
                )}
                <button type="button" onClick={() => setViewTab('documents')} className={`py-3 text-sm font-medium border-b-2 transition-colors ${viewTab === 'documents' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('documents')}</button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {viewTab === 'details' && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" /> {t('contactInformation')}</h3>
                    <div className="space-y-3">
                      {selectedSupplier.contact_name && <div><p className="text-xs text-gray-500">{t('contactPerson')}</p><p className="text-sm font-medium text-gray-900">{selectedSupplier.contact_name}</p></div>}
                      {selectedSupplier.contact_email && <div><p className="text-xs text-gray-500">{t('email')}</p><a href={`mailto:${selectedSupplier.contact_email}`} className="text-sm font-medium text-primary-600 hover:underline">{selectedSupplier.contact_email}</a></div>}
                      {selectedSupplier.contact_phone && <div><p className="text-xs text-gray-500">{t('phone')}</p><a href={`tel:${selectedSupplier.contact_phone}`} className="text-sm font-medium text-gray-900">{selectedSupplier.contact_phone}</a></div>}
                      {selectedSupplier.whatsapp && <div><p className="text-xs text-gray-500">{t('whatsApp')}</p><a href={`https://wa.me/${selectedSupplier.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" className="text-sm font-medium text-green-600 hover:underline flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{selectedSupplier.whatsapp}</a></div>}
                      {selectedSupplier.website && <div><p className="text-xs text-gray-500">{t('website')}</p><a href={selectedSupplier.website} target="_blank" className="text-sm font-medium text-primary-600 hover:underline flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{selectedSupplier.website}</a></div>}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> {t('locationDetails')}</h3>
                    <div className="space-y-3">
                      {selectedSupplier.city && <div><p className="text-xs text-gray-500">{t('city')}</p><p className="text-sm font-medium text-gray-900">{selectedSupplier.city}</p></div>}
                      {selectedSupplier.address && <div><p className="text-xs text-gray-500">{t('address')}</p><p className="text-sm font-medium text-gray-900">{selectedSupplier.address}</p></div>}
                      <div><p className="text-xs text-gray-500">{t('status')}</p><span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[selectedSupplier.status]}`}>{t(`status${selectedSupplier.status.charAt(0).toUpperCase() + selectedSupplier.status.slice(1)}`)}</span></div>
                    </div>
                  </div>
                  <div className="col-span-2 space-y-4 pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><DollarSign className="w-4 h-4 text-gray-400" /> {t('financial')}</h3>
                    <div className="flex items-center gap-4">
                      {selectedSupplier.default_commission_rate != null ? (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">{selectedSupplier.commission_type === 'payable' ? t('commissionWePay') : t('commissionWeReceive')}</p>
                          <p className="text-lg font-semibold text-gray-900">{selectedSupplier.default_commission_rate}%</p>
                        </div>
                      ) : null}
                      <Link href="/rates/commissions" className="text-sm text-primary-600 hover:underline">{t('manageInCommissionRates')} →</Link>
                    </div>
                  </div>
                  {selectedSupplier.notes && (
                    <div className="col-span-2 space-y-2 pt-4 border-t border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> {t('notes')}</h3>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedSupplier.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {viewTab === 'rates' && (
                <div>
                  {loadingRates ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
                  ) : supplierRates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p>{t('noRatesFound')}</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead><tr className="bg-gray-50"><th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{t('service')}</th><th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{t('vehicle')}</th><th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{t('route')}</th><th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">{t('eurRate')}</th><th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">{t('nonEurRate')}</th></tr></thead>
                      <tbody>{supplierRates.map(rate => (<tr key={rate.id} className="border-t border-gray-100"><td className="px-3 py-2 text-sm font-medium">{rate.service_code}</td><td className="px-3 py-2 text-sm">{rate.vehicle_type}</td><td className="px-3 py-2 text-sm">{rate.city}{rate.destination_city && ` → ${rate.destination_city}`}</td><td className="px-3 py-2 text-sm text-right font-medium text-green-600">{rateSymbol}{rate.base_rate_eur}</td><td className="px-3 py-2 text-sm text-right">{rateSymbol}{rate.base_rate_non_eur}</td></tr>))}</tbody>
                    </table>
                  )}
                </div>
              )}

              {viewTab === 'documents' && (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p>{t('documentsComing')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <div><h3 className="text-lg font-semibold text-gray-900">{t('deleteSupplier')}</h3><p className="text-sm text-gray-500">{t('deleteWarning')}</p></div>
            </div>
            <p className="text-sm text-gray-600 mb-6">{t('deleteConfirm', { name: selectedSupplier.name })}</p>
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => { setShowDeleteModal(false); setError(null) }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">{t('cancel')}</button>
              <button type="button" onClick={handleDelete} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? t('deleting') : t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}