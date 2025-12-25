'use client'

import { useEffect, useState } from 'react'
import { 
  X, Plus, Search, Link2, Unlink, Save, Loader2, GripVertical, 
  Trash2, Car, Users, Ticket, Utensils, Building2, Ship, Train,
  AlertCircle, CheckCircle2, MapPin
} from 'lucide-react'

// ============================================
// SERVICE RATE LINKER COMPONENT - FIXED v2
// File: components/ServiceRateLinker.tsx
// Fixes: 
// - Added "entrance" category separate from "activity"
// - Service names now properly display place names
// - Better category labels
// ============================================

interface AvailableRate {
  rate_type: string
  rate_id: string
  rate_name: string
  rate_eur: number | null
  rate_non_eur: number | null
  city: string | null
  default_quantity_mode: string
  supplier_name?: string
  details?: string
}

interface TourService {
  id?: string
  service_name: string
  service_category: string
  rate_type: string | null
  rate_id: string | null
  quantity_mode: string
  quantity_value: number
  cost_per_unit: number | null
  sequence_order: number
  is_optional: boolean
  day_number: number | null
  notes: string | null
  rate_details?: any
  isNew?: boolean
}

interface ServiceRateLinkerProps {
  variationId: string
  onClose: () => void
  onSave?: () => void
}

const RATE_TYPE_ICONS: Record<string, any> = {
  transportation: Car,
  guide: Users,
  activity: Ticket,
  entrance: MapPin,  // NEW: Separate icon for entrances
  meal: Utensils,
  accommodation: Building2,
  cruise: Ship,
  train: Train,
  sleeping_train: Train
}

const RATE_TYPE_LABELS: Record<string, string> = {
  transportation: 'Transportation',
  guide: 'Guide',
  activity: 'Activity',
  entrance: 'Entrance Fee',  // NEW: Separate label
  meal: 'Meal',
  accommodation: 'Accommodation',
  cruise: 'Cruise',
  train: 'Train',
  sleeping_train: 'Sleeping Train'
}

const SERVICE_CATEGORIES = [
  { value: 'transportation', label: 'Transportation' },
  { value: 'guide', label: 'Guide' },
  { value: 'entrance', label: 'Entrance Fee' },  // NEW: Added entrance
  { value: 'activity', label: 'Activity' },
  { value: 'meal', label: 'Meal' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'cruise', label: 'Cruise' },
]

const QUANTITY_MODES = [
  { value: 'per_pax', label: 'Per Person', desc: 'Multiplied by travelers' },
  { value: 'per_group', label: 'Per Group', desc: 'Fixed for whole group' },
  { value: 'per_day', label: 'Per Day', desc: 'Multiplied by tour days' },
  { value: 'per_night', label: 'Per Night', desc: 'Multiplied by nights' },
  { value: 'fixed', label: 'Fixed', desc: 'Exact amount' }
]

export default function ServiceRateLinker({ variationId, onClose, onSave }: ServiceRateLinkerProps) {
  const [services, setServices] = useState<TourService[]>([])
  const [originalServices, setOriginalServices] = useState<TourService[]>([])
  const [availableRates, setAvailableRates] = useState<AvailableRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Rate picker state
  const [showRatePicker, setShowRatePicker] = useState(false)
  const [selectedServiceIndex, setSelectedServiceIndex] = useState<number | null>(null)
  const [rateSearchTerm, setRateSearchTerm] = useState('')
  const [selectedRateType, setSelectedRateType] = useState<string>('all')

  useEffect(() => { 
    fetchData() 
  }, [variationId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    console.log('🔍 Fetching data for variation:', variationId)
    
    try {
      // Fetch existing services
      const servicesRes = await fetch(`/api/tours/variations/${variationId}/services`)
      const servicesData = await servicesRes.json()
      console.log('📦 Services response:', servicesData)
      
      if (servicesData.success) {
        const loadedServices = servicesData.data || []
        setServices(loadedServices)
        setOriginalServices(JSON.parse(JSON.stringify(loadedServices)))
        console.log('✅ Loaded', loadedServices.length, 'services')
      } else {
        console.error('❌ Failed to load services:', servicesData.error)
        setError('Failed to load services: ' + (servicesData.error || 'Unknown error'))
      }

      // Fetch available rates
      const ratesRes = await fetch('/api/rates/available')
      const ratesData = await ratesRes.json()
      console.log('📦 Rates response:', ratesData.success, 'count:', ratesData.data?.length)
      
      if (ratesData.success) {
        setAvailableRates(ratesData.data || [])
      } else {
        console.error('❌ Failed to load rates:', ratesData.error)
      }
    } catch (err) {
      console.error('❌ Fetch error:', err)
      setError('Failed to load data: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const hasChanges = () => {
    return JSON.stringify(services) !== JSON.stringify(originalServices)
  }

  const addNewService = () => {
    const newService: TourService = {
      service_name: '',  // Empty so user must enter a name
      service_category: 'entrance',  // Default to entrance (most common)
      rate_type: null,
      rate_id: null,
      quantity_mode: 'per_pax',
      quantity_value: 1,
      cost_per_unit: 0,
      sequence_order: services.length + 1,
      is_optional: false,
      day_number: null,
      notes: null,
      isNew: true
    }
    setServices([...services, newService])
  }

  const addServiceFromRate = (rate: AvailableRate) => {
    console.log('➕ Adding service from rate:', rate)
    
    // Determine the best category based on rate_type
    let category = rate.rate_type
    // Map activity rates to entrance category for temple/museum fees
    if (rate.rate_type === 'activity' && rate.rate_name) {
      const entranceKeywords = ['entrance', 'temple', 'tomb', 'museum', 'pyramid', 'valley', 'dam', 'citadel', 'catacomb']
      if (entranceKeywords.some(kw => rate.rate_name.toLowerCase().includes(kw))) {
        category = 'entrance'
      }
    }
    
    const newService: TourService = {
      service_name: rate.rate_name,  // Use the actual rate name!
      service_category: category,
      rate_type: rate.rate_type,
      rate_id: rate.rate_id,
      quantity_mode: rate.default_quantity_mode || 'per_pax',
      quantity_value: 1,
      cost_per_unit: rate.rate_eur,
      sequence_order: services.length + 1,
      is_optional: false,
      day_number: null,
      notes: null,
      isNew: true
    }
    setServices([...services, newService])
    setShowRatePicker(false)
    setSelectedServiceIndex(null)
  }

  const openRatePicker = (index: number, currentCategory?: string) => {
    setSelectedServiceIndex(index)
    // Map entrance back to activity for rate search
    const searchType = currentCategory === 'entrance' ? 'activity' : currentCategory
    setSelectedRateType(searchType || 'all')
    setRateSearchTerm('')
    setShowRatePicker(true)
  }

  const linkRateToService = (rate: AvailableRate) => {
    if (selectedServiceIndex === null) return
    
    console.log('🔗 Linking rate to service at index:', selectedServiceIndex, rate)
    
    setServices(prev => prev.map((s, i) => {
      if (i !== selectedServiceIndex) return s
      
      // Determine category
      let category = rate.rate_type
      if (rate.rate_type === 'activity' && rate.rate_name) {
        const entranceKeywords = ['entrance', 'temple', 'tomb', 'museum', 'pyramid', 'valley', 'dam', 'citadel', 'catacomb']
        if (entranceKeywords.some(kw => rate.rate_name.toLowerCase().includes(kw))) {
          category = 'entrance'
        }
      }
      
      return { 
        ...s, 
        rate_type: rate.rate_type, 
        rate_id: rate.rate_id, 
        quantity_mode: rate.default_quantity_mode || s.quantity_mode, 
        cost_per_unit: rate.rate_eur,
        service_category: category,
        // Update service name if it's empty or generic
        service_name: (!s.service_name || s.service_name === 'New Service' || s.service_name === '') 
          ? rate.rate_name 
          : s.service_name
      }
    }))
    setShowRatePicker(false)
    setSelectedServiceIndex(null)
  }

  const unlinkRate = (index: number) => {
    setServices(prev => prev.map((s, i) => 
      i === index 
        ? { ...s, rate_type: null, rate_id: null } 
        : s
    ))
  }

  const updateService = (index: number, field: keyof TourService, value: any) => {
    setServices(prev => prev.map((s, i) => 
      i === index ? { ...s, [field]: value } : s
    ))
  }

  const removeService = (index: number) => {
    setServices(prev => prev.filter((_, i) => i !== index))
  }

  const saveChanges = async () => {
    if (services.length > 0) {
      const invalidServices = services.filter(s => !s.service_name || !s.service_name.trim())
      if (invalidServices.length > 0) {
        setError('All services must have a name')
        return
      }
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    
    console.log('💾 Saving services for variation:', variationId)
    console.log('📤 Payload:', services.length, 'services')
    
    try {
      const payload = { 
        services: services.map((s, i) => ({
          service_name: s.service_name,
          service_category: s.service_category,
          rate_type: s.rate_type,
          rate_id: s.rate_id,
          quantity_mode: s.quantity_mode,
          quantity_value: s.quantity_value,
          cost_per_unit: s.cost_per_unit,
          is_optional: s.is_optional,
          day_number: s.day_number,
          notes: s.notes,
          sequence_order: i + 1
        }))
      }
      
      console.log('📤 Full payload:', JSON.stringify(payload, null, 2))
      
      const res = await fetch(`/api/tours/variations/${variationId}/services`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      const data = await res.json()
      console.log('📥 Save response:', data)
      
      if (data.success) {
        setSuccess(`${services.length} services saved successfully!`)
        setOriginalServices(JSON.parse(JSON.stringify(services)))
        onSave?.()
        setTimeout(() => onClose(), 1500)
      } else {
        console.error('❌ Save failed:', data.error)
        setError(data.error || 'Failed to save changes')
      }
    } catch (err) {
      console.error('❌ Save error:', err)
      setError('Failed to save changes: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Filter rates - include activity when searching for entrance
  const filteredRates = availableRates.filter(rate => {
    let matchesType = selectedRateType === 'all' || rate.rate_type === selectedRateType
    // Also show activity rates when searching for entrance
    if (selectedRateType === 'entrance' && rate.rate_type === 'activity') {
      matchesType = true
    }
    const matchesSearch = !rateSearchTerm || 
      rate.rate_name?.toLowerCase().includes(rateSearchTerm.toLowerCase()) || 
      rate.supplier_name?.toLowerCase().includes(rateSearchTerm.toLowerCase()) ||
      rate.city?.toLowerCase().includes(rateSearchTerm.toLowerCase())
    return matchesType && matchesSearch
  })

  const getRateIcon = (type: string) => { 
    const Icon = RATE_TYPE_ICONS[type] || Ticket
    return <Icon className="w-4 h-4" /> 
  }

  const getCategoryLabel = (category: string) => {
    const found = SERVICE_CATEGORIES.find(c => c.value === category)
    return found?.label || category
  }

  const calculatePreview = () => {
    let total = 0
    services.filter(s => !s.is_optional).forEach(s => {
      const cost = s.cost_per_unit || 0
      const qty = s.quantity_value || 1
      switch (s.quantity_mode) {
        case 'per_pax': total += cost * qty * 2; break
        case 'per_group':
        case 'fixed': total += cost * qty; break
        case 'per_day': total += cost * qty * 1; break
        case 'per_night': total += cost * qty * 1; break
        default: total += cost * qty
      }
    })
    return total
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[#647C47]" />
          <span className="text-gray-600">Loading services...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[#647C47]" />
              Link Services to Rates
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Add services and connect them to rate tables for dynamic pricing
            </p>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              Variation ID: {variationId}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Services List */}
          {services.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
              <Ticket className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium mb-1">No services found</p>
              <p className="text-sm text-gray-400 mb-4">Add services to enable dynamic pricing</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={addNewService}
                  className="px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Service Manually
                </button>
                <button
                  onClick={() => { setSelectedServiceIndex(null); setShowRatePicker(true) }}
                  className="px-4 py-2 border border-[#647C47] text-[#647C47] rounded-lg hover:bg-[#647C47]/5 text-sm font-medium flex items-center gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  Add from Rate Tables
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {services.map((service, index) => (
                <div 
                  key={service.id || `new-${index}`} 
                  className={`border rounded-lg p-4 ${
                    service.rate_id 
                      ? 'border-green-200 bg-green-50/50' 
                      : service.isNew 
                        ? 'border-blue-200 bg-blue-50/50'
                        : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Drag Handle */}
                    <div className="pt-2 text-gray-300 cursor-move">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    
                    {/* Service Details */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Index, Category Icon, Name Input, Category Dropdown */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-medium text-gray-400 w-6">#{index + 1}</span>
                        
                        {/* Category Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          service.service_category === 'entrance' ? 'bg-amber-100 text-amber-600' :
                          service.service_category === 'transportation' ? 'bg-blue-100 text-blue-600' :
                          service.service_category === 'guide' ? 'bg-purple-100 text-purple-600' :
                          service.service_category === 'meal' ? 'bg-orange-100 text-orange-600' :
                          service.service_category === 'cruise' ? 'bg-cyan-100 text-cyan-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {getRateIcon(service.service_category)}
                        </div>
                        
                        {/* Service Name Input */}
                        <input
                          type="text"
                          value={service.service_name || ''}
                          onChange={(e) => updateService(index, 'service_name', e.target.value)}
                          placeholder="Enter service name (e.g., Valley of the Kings Entrance)..."
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                        />
                        
                        {/* Category Dropdown */}
                        <select
                          value={service.service_category}
                          onChange={(e) => updateService(index, 'service_category', e.target.value)}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] min-w-[140px]"
                        >
                          {SERVICE_CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Row 2: Rate Link or Manual Cost */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {service.rate_id ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 border border-green-200 rounded-lg">
                              {getRateIcon(service.rate_type || '')}
                              <span className="text-sm text-green-800">
                                Linked to {RATE_TYPE_LABELS[service.rate_type || ''] || service.rate_type}
                              </span>
                              <span className="text-xs text-green-600 font-medium">
                                €{service.cost_per_unit}
                              </span>
                            </div>
                            <button 
                              onClick={() => openRatePicker(index, service.service_category)} 
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Change
                            </button>
                            <button 
                              onClick={() => unlinkRate(index)} 
                              className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                            >
                              <Unlink className="w-3 h-3" />
                              Unlink
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => openRatePicker(index, service.service_category)} 
                              className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-[#647C47] hover:text-[#647C47]"
                            >
                              <Link2 className="w-4 h-4" />
                              Link to Rate
                            </button>
                            <span className="text-xs text-gray-400">or</span>
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-gray-500">€</span>
                              <input
                                type="number"
                                value={service.cost_per_unit || ''}
                                onChange={(e) => updateService(index, 'cost_per_unit', parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47]"
                              />
                            </div>
                          </div>
                        )}

                        {/* Quantity Mode & Value */}
                        <div className="flex items-center gap-2 ml-auto">
                          <select
                            value={service.quantity_mode}
                            onChange={(e) => updateService(index, 'quantity_mode', e.target.value)}
                            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                          >
                            {QUANTITY_MODES.map(mode => (
                              <option key={mode.value} value={mode.value}>{mode.label}</option>
                            ))}
                          </select>
                          <span className="text-xs text-gray-400">×</span>
                          <input
                            type="number"
                            value={service.quantity_value}
                            onChange={(e) => updateService(index, 'quantity_value', parseFloat(e.target.value) || 1)}
                            className="w-14 px-2 py-1.5 text-sm border border-gray-300 rounded-lg text-center"
                            min="0.5"
                            step="0.5"
                          />
                        </div>

                        {/* Optional Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={service.is_optional}
                            onChange={(e) => updateService(index, 'is_optional', e.target.checked)}
                            className="w-4 h-4 text-amber-600 border-gray-300 rounded"
                          />
                          <span className="text-xs text-gray-500">Optional</span>
                        </label>

                        {/* Delete */}
                        <button
                          onClick={() => removeService(index)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add More Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={addNewService}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Service Manually
                </button>
                <button
                  onClick={() => { setSelectedServiceIndex(null); setShowRatePicker(true) }}
                  className="flex items-center gap-2 px-4 py-2 border border-[#647C47] text-[#647C47] rounded-lg text-sm hover:bg-[#647C47]/5"
                >
                  <Link2 className="w-4 h-4" />
                  Add from Rate Tables
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div className="text-sm">
            <span className="text-gray-500">{services.filter(s => s.rate_id).length} of {services.length} linked</span>
            <span className="mx-3 text-gray-300">|</span>
            <span className="text-gray-500">Preview (2 pax):</span>
            <span className="ml-2 text-lg font-semibold text-[#647C47]">€{calculatePreview().toFixed(0)}</span>
            {hasChanges() && (
              <>
                <span className="mx-3 text-gray-300">|</span>
                <span className="text-amber-600 text-xs">Unsaved changes</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button 
              onClick={saveChanges} 
              disabled={saving || !hasChanges()}
              className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Rate Picker Modal */}
      {showRatePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold">
                {selectedServiceIndex === null ? 'Add Service from Rate Table' : 'Link to Rate'}
              </h3>
              <button 
                onClick={() => { setShowRatePicker(false); setSelectedServiceIndex(null) }} 
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            {/* Search & Filter */}
            <div className="p-4 border-b bg-gray-50 flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  value={rateSearchTerm} 
                  onChange={(e) => setRateSearchTerm(e.target.value)} 
                  placeholder="Search rates by name, city, supplier..." 
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg" 
                />
              </div>
              <select 
                value={selectedRateType} 
                onChange={(e) => setSelectedRateType(e.target.value)} 
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="all">All Types</option>
                {Object.entries(RATE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            
            {/* Rate List */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredRates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No rates found</p>
                  <p className="text-xs mt-1">Total available: {availableRates.length}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredRates.map(rate => (
                    <button 
                      key={`${rate.rate_type}-${rate.rate_id}`} 
                      onClick={() => {
                        if (selectedServiceIndex === null) {
                          addServiceFromRate(rate)
                        } else {
                          linkRateToService(rate)
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg text-left"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        rate.rate_type === 'activity' ? 'bg-amber-100 text-amber-600' :
                        rate.rate_type === 'transportation' ? 'bg-blue-100 text-blue-600' :
                        rate.rate_type === 'guide' ? 'bg-purple-100 text-purple-600' :
                        rate.rate_type === 'meal' ? 'bg-orange-100 text-orange-600' :
                        rate.rate_type === 'cruise' ? 'bg-cyan-100 text-cyan-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {getRateIcon(rate.rate_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{rate.rate_name || 'Unnamed rate'}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {rate.supplier_name && <span>{rate.supplier_name} • </span>}
                          {rate.city && <span>{rate.city} • </span>}
                          <span className="capitalize">{rate.rate_type}</span>
                          {rate.details && <span> • {rate.details}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#647C47]">€{rate.rate_eur || 0}</p>
                        {rate.rate_non_eur && rate.rate_non_eur !== rate.rate_eur && (
                          <p className="text-xs text-gray-400">Non-EU: €{rate.rate_non_eur}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}