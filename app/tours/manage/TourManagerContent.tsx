'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  Map,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  Download,
  Upload,
  LayoutGrid,
  List,
  Table2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  Calendar,
  Users,
  Star,
  Layers,
  MapPin,
  Calculator,
  Link2
} from 'lucide-react'
import ServiceRateLinker from '@/components/ServiceRateLinker'

// ============================================
// INTERFACES
// ============================================

interface TourCategory {
  id: string
  category_name: string
  category_code: string
}

interface TourVariation {
  id: string
  template_id: string
  variation_code: string
  variation_name: string
  tier: 'budget' | 'standard' | 'luxury'
  group_type: 'private' | 'shared'
  min_pax: number
  max_pax: number
  optimal_pax?: number
  inclusions: string[]
  exclusions: string[]
  optional_extras?: string[]
  guide_type?: string
  guide_languages?: string[]
  vehicle_type?: string
  accommodation_standard?: string
  meal_quality?: string
  is_active: boolean
}

interface TourDay {
  id: string
  template_id: string
  day_number: number
  title: string
  description?: string
  city?: string
  overnight_city?: string
  meals_included?: string[]
  activities?: TourDayActivity[]
}

interface TourDayActivity {
  id: string
  tour_day_id: string
  activity_name: string
  activity_type: string
  sequence_order: number
  duration_minutes?: number
  location?: string
  description?: string
  attraction_id?: string
  restaurant_id?: string
  is_optional: boolean
}

interface TourTemplate {
  id: string
  template_code: string
  template_name: string
  category_id?: string
  tour_type: string
  duration_days: number
  duration_nights?: number
  primary_destination_id?: string
  destinations_covered?: string[]
  cities_covered?: string[]
  short_description?: string
  long_description?: string
  highlights?: string[]
  main_attractions?: string[]
  best_for?: string[]
  physical_level?: string
  age_suitability?: string
  pickup_required?: boolean
  accommodation_nights?: number
  meals_included?: string[]
  image_url?: string
  is_featured: boolean
  is_active: boolean
  popularity_score?: number
  default_transportation_service?: string
  transportation_city?: string
  created_at: string
  category?: TourCategory
  variations?: TourVariation[]
  days?: TourDay[]
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

type ViewMode = 'table' | 'cards' | 'compact'

// ============================================
// EGYPTIAN CITIES
// ============================================
const EGYPTIAN_CITIES = [
  'Cairo', 'Giza', 'Alexandria', 'Luxor', 'Aswan', 'Hurghada',
  'Sharm El Sheikh', 'Dahab', 'Marsa Alam', 'El Gouna', 'Siwa',
  'Fayoum', 'Port Said', 'Suez', 'Ismailia', 'Taba', 'Nuweiba',
  'Safaga', 'Ain Sokhna', 'Saint Catherine', 'Bahariya Oasis',
  'White Desert', 'Black Desert', 'Kharga Oasis', 'Dakhla Oasis'
]

const TOUR_TYPES = [
  { value: 'day_tour', label: 'Day Tour' },
  { value: 'full_day', label: 'Full Day' },
  { value: 'multi_day', label: 'Multi-Day Tour' },
  { value: 'cruise', label: 'Nile Cruise' },
  { value: 'safari', label: 'Desert Safari' },
  { value: 'diving', label: 'Diving Trip' },
  { value: 'cultural', label: 'Cultural Experience' },
  { value: 'adventure', label: 'Adventure Tour' }
]

const PHYSICAL_LEVELS = [
  { value: 'easy', label: 'Easy - Suitable for all' },
  { value: 'moderate', label: 'Moderate - Some walking' },
  { value: 'challenging', label: 'Challenging - Active travelers' },
  { value: 'demanding', label: 'Demanding - Fit travelers only' }
]

const BEST_FOR_OPTIONS = [
  'Families', 'Couples', 'Solo Travelers', 'Groups', 'Seniors',
  'History Buffs', 'Adventure Seekers', 'Photography', 'Relaxation',
  'First-time Visitors', 'Repeat Visitors', 'Luxury Travelers', 'Budget Travelers'
]

// ============================================
// TOAST COMPONENT
// ============================================
function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = toast.type === 'success' ? 'bg-green-50 border-green-200' :
                  toast.type === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
  
  const iconColor = toast.type === 'success' ? 'text-green-600' :
                    toast.type === 'error' ? 'text-red-600' :
                    'text-blue-600'
  
  const textColor = toast.type === 'success' ? 'text-green-800' :
                    toast.type === 'error' ? 'text-red-800' :
                    'text-blue-800'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColor} animate-slide-in`}>
      {toast.type === 'success' ? (
        <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />
      ) : (
        <AlertCircle className={`w-5 h-5 ${iconColor}`} />
      )}
      <span className={`text-sm font-medium ${textColor}`}>{toast.message}</span>
      <button onClick={onClose} className={`ml-2 ${iconColor} hover:opacity-70`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function TourManagerContent() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [templates, setTemplates] = useState<TourTemplate[]>([])
  const [categories, setCategories] = useState<TourCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TourTemplate | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'basic' | 'days' | 'variations'>('basic')
  
  // SERVICE RATE LINKER STATE
  const [serviceLinkerVariation, setServiceLinkerVariation] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    template_code: '',
    template_name: '',
    category_id: '',
    tour_type: 'day_tour',
    duration_days: 1,
    duration_nights: 0,
    cities_covered: [] as string[],
    short_description: '',
    long_description: '',
    highlights: [] as string[],
    main_attractions: [] as string[],
    best_for: [] as string[],
    physical_level: 'moderate',
    age_suitability: 'all_ages',
    pickup_required: true,
    meals_included: [] as string[],
    image_url: '',
    is_featured: false,
    is_active: true,
    default_transportation_service: 'day_tour',
    transportation_city: 'Cairo'
  })

  const [highlightInput, setHighlightInput] = useState('')
  const [attractionInput, setAttractionInput] = useState('')

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/tours/templates')
      const data = await response.json()
      if (data.success) {
        setTemplates(data.data)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      showToast('error', 'Failed to load tour templates')
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/tours/categories')
      const data = await response.json()
      if (data.success) {
        setCategories(data.data)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  useEffect(() => {
    Promise.all([fetchTemplates(), fetchCategories()]).finally(() => setLoading(false))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value
    }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }))
  }

  const toggleCity = (city: string) => {
    setFormData(prev => ({
      ...prev,
      cities_covered: prev.cities_covered.includes(city)
        ? prev.cities_covered.filter(c => c !== city)
        : [...prev.cities_covered, city]
    }))
  }

  const toggleBestFor = (item: string) => {
    setFormData(prev => ({
      ...prev,
      best_for: prev.best_for.includes(item)
        ? prev.best_for.filter(b => b !== item)
        : [...prev.best_for, item]
    }))
  }

  const toggleMeal = (meal: string) => {
    setFormData(prev => ({
      ...prev,
      meals_included: prev.meals_included.includes(meal)
        ? prev.meals_included.filter(m => m !== meal)
        : [...prev.meals_included, meal]
    }))
  }

  const addHighlight = () => {
    if (highlightInput.trim()) {
      setFormData(prev => ({
        ...prev,
        highlights: [...prev.highlights, highlightInput.trim()]
      }))
      setHighlightInput('')
    }
  }

  const removeHighlight = (index: number) => {
    setFormData(prev => ({
      ...prev,
      highlights: prev.highlights.filter((_, i) => i !== index)
    }))
  }

  const addAttraction = () => {
    if (attractionInput.trim()) {
      setFormData(prev => ({
        ...prev,
        main_attractions: [...prev.main_attractions, attractionInput.trim()]
      }))
      setAttractionInput('')
    }
  }

  const removeAttraction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      main_attractions: prev.main_attractions.filter((_, i) => i !== index)
    }))
  }

  const generateTemplateCode = () => {
    const city = formData.cities_covered[0] || 'EGYPT'
    const type = formData.tour_type.toUpperCase().replace('_', '-')
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `${city.substring(0, 3).toUpperCase()}-${type.substring(0, 3)}-${random}`
  }

  const handleAddNew = () => {
    setEditingTemplate(null)
    setFormData({
      template_code: '',
      template_name: '',
      category_id: categories[0]?.id || '',
      tour_type: 'day_tour',
      duration_days: 1,
      duration_nights: 0,
      cities_covered: [],
      short_description: '',
      long_description: '',
      highlights: [],
      main_attractions: [],
      best_for: [],
      physical_level: 'moderate',
      age_suitability: 'all_ages',
      pickup_required: true,
      meals_included: [],
      image_url: '',
      is_featured: false,
      is_active: true,
      default_transportation_service: 'day_tour',
      transportation_city: 'Cairo'
    })
    setActiveTab('basic')
    setShowModal(true)
  }

  const handleEdit = (template: TourTemplate) => {
    setEditingTemplate(template)
    setFormData({
      template_code: template.template_code,
      template_name: template.template_name,
      category_id: template.category_id || '',
      tour_type: template.tour_type,
      duration_days: template.duration_days,
      duration_nights: template.duration_nights || 0,
      cities_covered: template.cities_covered || [],
      short_description: template.short_description || '',
      long_description: template.long_description || '',
      highlights: template.highlights || [],
      main_attractions: template.main_attractions || [],
      best_for: template.best_for || [],
      physical_level: template.physical_level || 'moderate',
      age_suitability: template.age_suitability || 'all_ages',
      pickup_required: template.pickup_required !== false,
      meals_included: template.meals_included || [],
      image_url: template.image_url || '',
      is_featured: template.is_featured,
      is_active: template.is_active,
      default_transportation_service: template.default_transportation_service || 'day_tour',
      transportation_city: template.transportation_city || 'Cairo'
    })
    setActiveTab('basic')
    setShowModal(true)
  }

  const handleDuplicate = async (template: TourTemplate) => {
    try {
      const response = await fetch('/api/tours/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...template,
          id: undefined,
          template_code: generateTemplateCode(),
          template_name: `${template.template_name} (Copy)`,
          created_at: undefined,
          updated_at: undefined
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', `Duplicated: ${template.template_name}`)
        fetchTemplates()
      } else {
        showToast('error', data.error || 'Failed to duplicate')
      }
    } catch (error) {
      showToast('error', 'Failed to duplicate template')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const dataToSubmit = {
      ...formData,
      template_code: formData.template_code || generateTemplateCode()
    }
    
    try {
      const url = editingTemplate 
        ? `/api/tours/templates/${editingTemplate.id}`
        : '/api/tours/templates'
      
      const method = editingTemplate ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSubmit)
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingTemplate 
          ? `${formData.template_name} updated!` 
          : `${formData.template_name} created!`)
        setShowModal(false)
        fetchTemplates()
      } else {
        showToast('error', data.error || 'Failed to save')
      }
    } catch (error) {
      showToast('error', 'Failed to save template')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This will also delete all variations and days.`)) return
    
    try {
      const response = await fetch(`/api/tours/templates/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', `${name} deleted!`)
        fetchTemplates()
      } else {
        showToast('error', data.error || 'Failed to delete')
      }
    } catch (error) {
      showToast('error', 'Failed to delete template')
    }
  }

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchTerm === '' || 
      template.template_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.template_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.cities_covered?.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesCategory = selectedCategory === 'all' || template.category_id === selectedCategory
    const matchesType = selectedType === 'all' || template.tour_type === selectedType
    const matchesActive = showInactive || template.is_active
    
    return matchesSearch && matchesCategory && matchesType && matchesActive
  })

  const activeTemplates = templates.filter(t => t.is_active).length
  const totalVariations = templates.reduce((sum, t) => sum + (t.variations?.length || 0), 0)
  const featuredCount = templates.filter(t => t.is_featured).length

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      budget: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      standard: 'bg-blue-50 text-blue-700 border-blue-200',
      luxury: 'bg-amber-50 text-amber-700 border-amber-200'
    }
    const icons: Record<string, string> = {
      budget: '💰',
      standard: '💎',
      luxury: '👑'
    }
    return { style: styles[tier] || 'bg-gray-50 text-gray-700', icon: icons[tier] || '' }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading tour templates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <ToastNotification key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      <input ref={fileInputRef} type="file" accept=".csv,.json" className="hidden" />

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="w-5 h-5 text-green-600" />
              <h1 className="text-xl font-bold text-gray-900">Tour Programs Manager</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg- green-700 transition-colors font-medium">
                <Plus className="w-4 h-4" />
                Add Template
              </button>
              <Link href="/tours" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <Eye className="w-4 h-4" />
                Browse Tours
              </Link>
              <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                ← Resources
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Map className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Templates</p>
            <p className="text-2xl font-bold text-gray-900">{templates.length}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Variations</p>
            <p className="text-2xl font-bold text-gray-900">{totalVariations}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeTemplates}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            </div>
            <p className="text-xs text-gray-600">Featured</p>
            <p className="text-2xl font-bold text-gray-900">{featuredCount}</p>
          </div>
        </div>

        {/* Search, Filters & View Toggle */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, code, or city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-48 relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="md:w-40 relative">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Types</option>
                {TOUR_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                showInactive
                  ? 'bg-gray-100 border border-gray-300 text-gray-700'
                  : 'bg-white border border-green-300 text-green-700'
              }`}
            >
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Table View"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded ${viewMode === 'compact' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Compact View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredTemplates.length}</span> of {templates.length} templates
            </p>
          </div>
        </div>

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Template</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Duration</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cities</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Variations</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTemplates.map((template, index) => (
                    <React.Fragment key={template.id}>
                      <tr
                        className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors cursor-pointer`}
                        onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedTemplate === template.id ? 'rotate-90' : ''}`} />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{template.template_name}</p>
                              <p className="text-xs text-gray-500 font-mono">{template.template_code}</p>
                            </div>
                            {template.is_featured && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {TOUR_TYPES.find(t => t.value === template.tour_type)?.label || template.tour_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-900">
                            {template.duration_days}D{template.duration_nights ? `/${template.duration_nights}N` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {template.cities_covered?.slice(0, 3).map(city => (
                              <span key={city} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{city}</span>
                            ))}
                            {(template.cities_covered?.length || 0) > 3 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                +{(template.cities_covered?.length || 0) - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-medium text-purple-600">{template.variations?.length || 0}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            template.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {template.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleEdit(template)}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(template)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Duplicate"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(template.id, template.template_name)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded Row - Variations */}
                      {expandedTemplate === template.id && template.variations && template.variations.length > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="px-8 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Layers className="w-4 h-4 text-purple-600" />
                              <span className="text-sm font-medium text-gray-700">Variations</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {template.variations.map(variation => {
                                const { style, icon } = getTierBadge(variation.tier)
                                return (
                                  <div key={variation.id} className={`px-3 py-2 rounded-lg border ${style} flex items-center gap-2`}>
                                    <span>{icon}</span>
                                    <div className="flex-1">
                                      <p className="text-xs font-medium">{variation.variation_name}</p>
                                      <p className="text-xs opacity-75">{variation.group_type} • {variation.min_pax}-{variation.max_pax} pax</p>
                                    </div>
                                    <div className="flex items-center gap-1 ml-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setServiceLinkerVariation(variation.id) }}
                                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                        title="Link Services to Rates"
                                      >
                                        <Link2 className="w-4 h-4" />
                                      </button>
                                      <Link
                                        href={`/b2b/calculator/${variation.id}`}
                                        className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                                        title="Calculate Price"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Calculator className="w-4 h-4" />
                                      </Link>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {filteredTemplates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">No tour templates found</p>
                        <button onClick={handleAddNew} className="mt-3 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg- green-700">
                          Create Your First Template
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Card View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{template.template_name}</h3>
                      <p className="text-xs text-gray-500 font-mono">{template.template_code}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {template.is_featured && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        template.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {template.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{template.duration_days} day{template.duration_days > 1 ? 's' : ''}</span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                        {TOUR_TYPES.find(t => t.value === template.tour_type)?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{template.cities_covered?.join(', ') || 'No cities set'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Layers className="w-4 h-4" />
                      <span>{template.variations?.length || 0} variations</span>
                    </div>
                  </div>
                  {template.variations && template.variations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.variations.map(v => {
                        const { style, icon } = getTierBadge(v.tier)
                        return (
                          <span key={v.id} className={`px-2 py-0.5 rounded text-xs border ${style}`}>
                            {icon} {v.tier}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {template.short_description && (
                    <p className="text-xs text-gray-500 line-clamp-2">{template.short_description}</p>
                  )}
                </div>
                <div className="flex border-t border-gray-200 divide-x divide-gray-200">
                  <button
                    onClick={() => handleEdit(template)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="w-4 h-4" />Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(template)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Copy className="w-4 h-4" />Copy
                  </button>
                  <button
                    onClick={() => handleDelete(template.id, template.template_name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />Delete
                  </button>
                </div>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <div className="col-span-full bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
                <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No tour templates found</p>
                <button onClick={handleAddNew} className="mt-3 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg- green-700">
                  Create Your First Template
                </button>
              </div>
            )}
          </div>
        )}

        {/* Compact View */}
        {viewMode === 'compact' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 divide-y divide-gray-100">
            {filteredTemplates.map((template) => (
              <div key={template.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full inline-block ${template.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900 truncate block">{template.template_name}</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="text-xs text-gray-500 font-mono">{template.template_code}</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{template.duration_days}D</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="text-xs text-purple-600 font-medium">{template.variations?.length || 0} var</span>
                  </div>
                  {template.is_featured && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => handleEdit(template)} className="p-1 text-gray-400 hover:text-green-600 transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDuplicate(template)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(template.id, template.template_name)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <div className="p-12 text-center">
                <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No tour templates found</p>
                <button onClick={handleAddNew} className="mt-3 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg- green-700">
                  Create Your First Template
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingTemplate ? 'Edit Tour Template' : 'Add New Tour Template'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4">
              {/* Basic Information */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">1</span>
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                    <input
                      type="text"
                      name="template_name"
                      value={formData.template_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Memphis, Sakkara & Dahshur Day Trip"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Template Code</label>
                    <input
                      type="text"
                      name="template_code"
                      value={formData.template_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm font-mono"
                      placeholder="Auto-generated if empty"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                    <select
                      name="category_id"
                      value={formData.category_id}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                    >
                      <option value="">Select Category...</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tour Type *</label>
                    <select
                      name="tour_type"
                      value={formData.tour_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                    >
                      {TOUR_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Duration (Days) *</label>
                    <input
                      type="number"
                      name="duration_days"
                      value={formData.duration_days}
                      onChange={handleChange}
                      min="1"
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Duration (Nights)</label>
                    <input
                      type="number"
                      name="duration_nights"
                      value={formData.duration_nights}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Physical Level</label>
                    <select
                      name="physical_level"
                      value={formData.physical_level}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600  focus:border-transparent shadow-sm"
                    >
                      {PHYSICAL_LEVELS.map(level => (
                        <option key={level.value} value={level.value}>{level.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Cities Covered */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  Cities Covered
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {EGYPTIAN_CITIES.map(city => (
                    <label key={city} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.cities_covered.includes(city)}
                        onChange={() => toggleCity(city)}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-600"
                      />
                      <span className="text-xs text-gray-700">{city}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Descriptions */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">3</span>
                  Descriptions
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Short Description</label>
                    <input
                      type="text"
                      name="short_description"
                      value={formData.short_description}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                      placeholder="Brief summary for cards and listings"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Full Description</label>
                    <textarea
                      name="long_description"
                      value={formData.long_description}
                      onChange={handleChange}
                      rows={4}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                      placeholder="Detailed tour description..."
                    />
                  </div>
                </div>
              </div>

              {/* Highlights */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">4</span>
                  Highlights
                </h3>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={highlightInput}
                    onChange={(e) => setHighlightInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHighlight())}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                    placeholder="Add a highlight and press Enter"
                  />
                  <button type="button" onClick={addHighlight} className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 text-sm font-medium">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.highlights.map((h, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs border border-amber-200">
                      ✨ {h}
                      <button type="button" onClick={() => removeHighlight(i)} className="text-amber-500 hover:text-amber-700">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Main Attractions */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">5</span>
                  Main Attractions
                </h3>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={attractionInput}
                    onChange={(e) => setAttractionInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAttraction())}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                    placeholder="Add an attraction and press Enter"
                  />
                  <button type="button" onClick={addAttraction} className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.main_attractions.map((a, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs border border-green-200">
                      🏛️ {a}
                      <button type="button" onClick={() => removeAttraction(i)} className="text-green-500 hover:text-green-700">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Best For */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">6</span>
                  Best For
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                  {BEST_FOR_OPTIONS.map(option => (
                    <label key={option} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.best_for.includes(option)}
                        onChange={() => toggleBestFor(option)}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-600"
                      />
                      <span className="text-xs text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Meals & Options */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">7</span>
                  Meals & Options
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Meals Included</p>
                    <div className="space-y-1">
                      {['Breakfast', 'Lunch', 'Dinner'].map(meal => (
                        <label key={meal} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.meals_included.includes(meal)}
                            onChange={() => toggleMeal(meal)}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-600"
                          />
                          <span className="text-xs text-gray-700">{meal}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Options</p>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="pickup_required"
                          checked={formData.pickup_required}
                          onChange={handleCheckboxChange}
                          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-600"
                        />
                        <span className="text-xs text-gray-700">Pickup Required</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="is_featured"
                          checked={formData.is_featured}
                          onChange={handleCheckboxChange}
                          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-600"
                        />
                        <span className="text-xs text-gray-700">Featured Tour ⭐</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="is_active"
                          checked={formData.is_active}
                          onChange={handleCheckboxChange}
                          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-600"
                        />
                        <span className="text-xs text-gray-700">Active</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Transportation City</label>
                    <select
                      name="transportation_city"
                      value={formData.transportation_city}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                    >
                      {EGYPTIAN_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                    <input
                      type="url"
                      name="image_url"
                      value={formData.image_url}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
                      placeholder="https://..."
                    />
                  </div>
                </div>
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
                  className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg- green-700 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SERVICE RATE LINKER MODAL */}
      {serviceLinkerVariation && (
        <ServiceRateLinker
          variationId={serviceLinkerVariation}
          onClose={() => setServiceLinkerVariation(null)}
          onSave={() => {
            fetchTemplates()
            showToast('success', 'Services saved successfully!')
          }}
        />
      )}

      <style jsx>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  )
}