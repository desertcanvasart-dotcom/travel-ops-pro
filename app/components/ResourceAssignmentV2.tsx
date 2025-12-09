// app/components/ResourceAssignmentV2.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { 
  Users, Truck, Hotel, UtensilsCrossed, Ship, Plane, UserCheck,
  Check, AlertCircle, Loader2, MapPin, Clock, Plus, Trash2, Calendar,
  ChevronDown, ChevronUp, X
} from 'lucide-react'

// Types
interface Resource {
  id: string
  name: string
  [key: string]: any
}

interface AssignedResource {
  id: string
  itinerary_id: string
  itinerary_day_id?: string
  resource_type: string
  resource_id: string
  resource_name: string
  start_date: string
  end_date?: string
  notes?: string
  quantity: number
  cost_eur?: number
  cost_non_eur?: number
  status: string
}

interface Conflict {
  resource_id: string
  resource_name: string
  conflicting_itinerary: string
  dates: string
}

interface ResourceAssignmentV2Props {
  itineraryId: string
  startDate: string
  endDate: string
  numTravelers?: number
  onUpdate?: () => void
}

// Resource type configurations - using existing API endpoints
const RESOURCE_TYPES = [
  { 
    key: 'guide', 
    label: 'Guides', 
    icon: Users, 
    color: 'blue',
    apiEndpoint: '/api/guides',
    nameField: 'name',
    displayField: (r: any) => `${r.name}${r.languages?.length ? ` (${r.languages.join(', ')})` : ''}`
  },
  { 
    key: 'vehicle', 
    label: 'Vehicles', 
    icon: Truck, 
    color: 'green',
    apiEndpoint: '/api/resources/transportation',
    nameField: 'name',
    displayField: (r: any) => `${r.name} - ${r.vehicle_type || 'Vehicle'} (${r.passenger_capacity || '?'} seats)`
  },
  { 
    key: 'hotel', 
    label: 'Hotels', 
    icon: Hotel, 
    color: 'purple',
    apiEndpoint: '/api/resources/hotels',
    nameField: 'name',
    displayField: (r: any) => `${r.name}${r.city ? ` - ${r.city}` : ''}${r.star_rating ? ` ⭐${r.star_rating}` : ''}`
  },
  { 
    key: 'restaurant', 
    label: 'Restaurants', 
    icon: UtensilsCrossed, 
    color: 'orange',
    apiEndpoint: '/api/resources/restaurants',
    nameField: 'name',
    displayField: (r: any) => `${r.name}${r.city ? ` - ${r.city}` : ''}${r.cuisine_type ? ` (${r.cuisine_type})` : ''}`
  },
  { 
    key: 'cruise', 
    label: 'Cruises', 
    icon: Ship, 
    color: 'indigo',
    apiEndpoint: '/api/cruises',  // May need to create this
    nameField: 'name',
    displayField: (r: any) => `${r.name}${r.ship_name ? ` - ${r.ship_name}` : ''}${r.star_rating ? ` ⭐${r.star_rating}` : ''}`
  },
  { 
    key: 'airport_staff', 
    label: 'Airport Staff', 
    icon: Plane, 
    color: 'cyan',
    apiEndpoint: '/api/resources/airport-staff',
    nameField: 'name',
    displayField: (r: any) => `${r.name}${r.location ? ` - ${r.location}` : ''}`
  },
  { 
    key: 'hotel_staff', 
    label: 'Hotel Staff', 
    icon: UserCheck, 
    color: 'pink',
    apiEndpoint: '/api/resources/hotel-staff',
    nameField: 'name',
    displayField: (r: any) => `${r.name}${r.location ? ` - ${r.location}` : ''}`
  }
]

const COLOR_CLASSES: Record<string, { bg: string, border: string, text: string, light: string }> = {
  blue: { bg: 'bg-blue-600', border: 'border-blue-200', text: 'text-blue-600', light: 'bg-blue-50' },
  green: { bg: 'bg-green-600', border: 'border-green-200', text: 'text-green-600', light: 'bg-green-50' },
  purple: { bg: 'bg-purple-600', border: 'border-purple-200', text: 'text-purple-600', light: 'bg-purple-50' },
  orange: { bg: 'bg-orange-600', border: 'border-orange-200', text: 'text-orange-600', light: 'bg-orange-50' },
  indigo: { bg: 'bg-indigo-600', border: 'border-indigo-200', text: 'text-indigo-600', light: 'bg-indigo-50' },
  cyan: { bg: 'bg-cyan-600', border: 'border-cyan-200', text: 'text-cyan-600', light: 'bg-cyan-50' },
  pink: { bg: 'bg-pink-600', border: 'border-pink-200', text: 'text-pink-600', light: 'bg-pink-50' }
}

export default function ResourceAssignmentV2({
  itineraryId,
  startDate,
  endDate,
  numTravelers,
  onUpdate
}: ResourceAssignmentV2Props) {
  const [activeTab, setActiveTab] = useState('guide')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Available resources from each table
  const [availableResources, setAvailableResources] = useState<Record<string, Resource[]>>({})
  
  // Assigned resources for this itinerary
  const [assignedResources, setAssignedResources] = useState<AssignedResource[]>([])
  
  // Conflicts
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  
  // Add resource modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addFormData, setAddFormData] = useState({
    resource_id: '',
    start_date: startDate,
    end_date: endDate,
    notes: '',
    quantity: 1
  })

  // Pickup details (legacy support)
  const [pickupDetails, setPickupDetails] = useState({
    pickup_location: '',
    pickup_time: ''
  })

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData()
  }, [itineraryId, startDate, endDate])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchAvailableResources(),
        fetchAssignedResources(),
        fetchConflicts()
      ])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableResources = async () => {
    const resources: Record<string, Resource[]> = {}
    
    for (const type of RESOURCE_TYPES) {
      try {
        const response = await fetch(`${type.apiEndpoint}?is_active=true`)
        const data = await response.json()
        
        // Handle different response formats
        if (data.success && data.data) {
          resources[type.key] = data.data
        } else if (Array.isArray(data)) {
          resources[type.key] = data
        } else {
          resources[type.key] = []
        }
      } catch (error) {
        console.error(`Error fetching ${type.key}:`, error)
        resources[type.key] = []
      }
    }
    
    setAvailableResources(resources)
  }

  const fetchAssignedResources = async () => {
    try {
      const response = await fetch(`/api/itinerary-resources?itinerary_id=${itineraryId}`)
      const data = await response.json()
      
      if (data.success) {
        setAssignedResources(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching assigned resources:', error)
    }
  }

  const fetchConflicts = async () => {
    try {
      const response = await fetch(`/api/itinerary-resources/conflicts?itinerary_id=${itineraryId}`)
      const data = await response.json()
      
      if (data.success) {
        setConflicts(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching conflicts:', error)
    }
  }

  const handleAddResource = async () => {
    if (!addFormData.resource_id) {
      alert('Please select a resource')
      return
    }

    setSaving(true)
    try {
      const activeType = RESOURCE_TYPES.find(t => t.key === activeTab)
      const selectedResource = availableResources[activeTab]?.find(r => r.id === addFormData.resource_id)
      
      const response = await fetch('/api/itinerary-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary_id: itineraryId,
          resource_type: activeTab,
          resource_id: addFormData.resource_id,
          resource_name: selectedResource?.[activeType?.nameField || 'name'] || 'Unknown',
          start_date: addFormData.start_date,
          end_date: addFormData.end_date,
          notes: addFormData.notes,
          quantity: addFormData.quantity,
          status: 'confirmed'
        })
      })

      const data = await response.json()

      if (data.success) {
        await fetchAssignedResources()
        await fetchConflicts()
        setShowAddModal(false)
        resetAddForm()
        if (onUpdate) onUpdate()
      } else {
        alert(data.error || 'Failed to add resource')
      }
    } catch (error) {
      console.error('Error adding resource:', error)
      alert('Failed to add resource')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveResource = async (resourceId: string) => {
    if (!confirm('Remove this resource assignment?')) return

    try {
      const response = await fetch(`/api/itinerary-resources?id=${resourceId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        await fetchAssignedResources()
        await fetchConflicts()
        if (onUpdate) onUpdate()
      } else {
        alert(data.error || 'Failed to remove resource')
      }
    } catch (error) {
      console.error('Error removing resource:', error)
      alert('Failed to remove resource')
    }
  }

  const resetAddForm = () => {
    setAddFormData({
      resource_id: '',
      start_date: startDate,
      end_date: endDate,
      notes: '',
      quantity: 1
    })
  }

  const getResourcesForType = (type: string) => {
    return assignedResources.filter(r => r.resource_type === type)
  }

  const getConflictsForType = (type: string) => {
    return conflicts.filter(c => 
      assignedResources.some(r => r.resource_type === type && r.resource_id === c.resource_id)
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading resources...</span>
        </div>
      </div>
    )
  }

  const activeTypeConfig = RESOURCE_TYPES.find(t => t.key === activeTab)!
  const activeColor = COLOR_CLASSES[activeTypeConfig.color]
  const activeResources = getResourcesForType(activeTab)
  const activeConflicts = getConflictsForType(activeTab)
  const availableForType = availableResources[activeTab] || []

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Resource Assignment</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(startDate)} - {formatDate(endDate)} • {numTravelers} travelers
          </p>
        </div>
        {conflicts.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex min-w-max">
          {RESOURCE_TYPES.map((type) => {
            const Icon = type.icon
            const count = getResourcesForType(type.key).length
            const hasConflict = getConflictsForType(type.key).length > 0
            const isActive = activeTab === type.key
            const colorClass = COLOR_CLASSES[type.color]
            
            return (
              <button
                key={type.key}
                onClick={() => setActiveTab(type.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive 
                    ? `${colorClass.text} border-current` 
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{type.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                    isActive ? colorClass.light + ' ' + colorClass.text : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
                {hasConflict && (
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Conflicts Warning */}
        {activeConflicts.length > 0 && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800">Scheduling Conflicts Detected</p>
                <ul className="mt-2 text-sm text-orange-700 space-y-1">
                  {activeConflicts.map((conflict, idx) => (
                    <li key={idx}>
                      <strong>{conflict.resource_name}</strong> is also booked for {conflict.conflicting_itinerary} ({conflict.dates})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Assigned Resources List */}
        {activeResources.length > 0 ? (
          <div className="space-y-3 mb-4">
            {activeResources.map((resource) => (
              <div 
                key={resource.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${activeColor.border} ${activeColor.light}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{resource.resource_name}</span>
                    {resource.quantity > 1 && (
                      <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                        ×{resource.quantity}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      resource.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                      resource.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {resource.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(resource.start_date)}
                      {resource.end_date && resource.end_date !== resource.start_date && (
                        <> - {formatDate(resource.end_date)}</>
                      )}
                    </span>
                    {resource.notes && (
                      <span className="text-gray-500 truncate max-w-xs">• {resource.notes}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveResource(resource.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 mb-4">
            <activeTypeConfig.icon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No {activeTypeConfig.label.toLowerCase()} assigned yet</p>
          </div>
        )}

        {/* Add Button */}
        <button
          onClick={() => {
            resetAddForm()
            setShowAddModal(true)
          }}
          className={`w-full py-3 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${activeColor.border} ${activeColor.text} hover:${activeColor.light}`}
        >
          <Plus className="w-4 h-4" />
          Add {activeTypeConfig.label.slice(0, -1)}
        </button>

        {/* Available count */}
        <p className="text-xs text-gray-500 mt-2 text-center">
          {availableForType.length} {activeTypeConfig.label.toLowerCase()} available
        </p>
      </div>

      {/* Add Resource Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Add {activeTypeConfig.label.slice(0, -1)}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Resource Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select {activeTypeConfig.label.slice(0, -1)}
                </label>
                <select
                  value={addFormData.resource_id}
                  onChange={(e) => setAddFormData({ ...addFormData, resource_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value="">Choose...</option>
                  {availableForType.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {activeTypeConfig.displayField(resource)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={addFormData.start_date}
                    onChange={(e) => setAddFormData({ ...addFormData, start_date: e.target.value })}
                    min={startDate}
                    max={endDate}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={addFormData.end_date}
                    onChange={(e) => setAddFormData({ ...addFormData, end_date: e.target.value })}
                    min={addFormData.start_date}
                    max={endDate}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Quantity (for hotels/vehicles) */}
              {['hotel', 'vehicle'].includes(activeTab) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity {activeTab === 'hotel' ? '(rooms)' : '(vehicles)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={addFormData.quantity}
                    onChange={(e) => setAddFormData({ ...addFormData, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={addFormData.notes}
                  onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
                  placeholder="Special requirements, room type, meal preferences..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddResource}
                disabled={saving || !addFormData.resource_id}
                className={`px-6 py-2 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${activeColor.bg} hover:opacity-90`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Add {activeTypeConfig.label.slice(0, -1)}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}