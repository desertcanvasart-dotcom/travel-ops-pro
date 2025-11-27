'use client'

import { useEffect, useState } from 'react'
import { Users, Truck, Check, AlertCircle, Loader2, MapPin, Clock } from 'lucide-react'
import WhatsAppButton from '@/app/components/whatsapp/whatsapp-button'  // ← ADD THIS LINE

interface Guide {
  id: string
  name: string
  languages: string[]
  is_active: boolean
}

interface Vehicle {
  id: string
  name: string
  vehicle_type: string
  passenger_capacity: number
  is_active: boolean
}

interface ResourceAssignmentProps {
  itineraryId: string
  startDate: string
  endDate: string
  numTravelers?: number
  currentGuideId?: string | null
  currentVehicleId?: string | null
  currentGuideNotes?: string | null
  currentVehicleNotes?: string | null
  currentPickupLocation?: string | null
  currentPickupTime?: string | null
  onUpdate?: () => void
}

export default function ResourceAssignment({
  itineraryId,
  startDate,
  endDate,
  numTravelers,
  currentGuideId,
  currentVehicleId,
  currentGuideNotes,
  currentVehicleNotes,
  currentPickupLocation,
  currentPickupTime,
  onUpdate
}: ResourceAssignmentProps) {
  const [guides, setGuides] = useState<Guide[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    assigned_guide_id: currentGuideId || '',
    assigned_vehicle_id: currentVehicleId || '',
    guide_notes: currentGuideNotes || '',
    vehicle_notes: currentVehicleNotes || '',
    pickup_location: currentPickupLocation || '',
    pickup_time: currentPickupTime || ''
  })
  // Update form data when props change
  useEffect(() => {
    setFormData({
      assigned_guide_id: currentGuideId || '',
      assigned_vehicle_id: currentVehicleId || '',
      guide_notes: currentGuideNotes || '',
      vehicle_notes: currentVehicleNotes || '',
      pickup_location: currentPickupLocation || '',
      pickup_time: currentPickupTime || ''
    })
  }, [currentGuideId, currentVehicleId, currentGuideNotes, currentVehicleNotes, currentPickupLocation, currentPickupTime])

  const [conflicts, setConflicts] = useState({
    guide: false,
    vehicle: false
  })

  useEffect(() => {
    fetchAvailableResources()
  }, [startDate, endDate])

  const fetchAvailableResources = async () => {
    try {
      setLoading(true)

      // Fetch available guides
      const guidesResponse = await fetch(
        `/api/guides?is_active=true&availability_from=${startDate}&availability_to=${endDate}&exclude_itinerary_id=${itineraryId}`
      )
      
      const guidesData = await guidesResponse.json()

      // Fetch available vehicles
      const vehiclesResponse = await fetch(
        `/api/vehicles?is_active=true&availability_from=${startDate}&availability_to=${endDate}&exclude_itinerary_id=${itineraryId}`
      )
      const vehiclesData = await vehiclesResponse.json()

      if (guidesData.success) {
        setGuides(guidesData.data)
      }

      if (vehiclesData.success) {
        setVehicles(vehiclesData.data)
      }

      // Check if current assignments have conflicts
      checkConflicts(guidesData.data, vehiclesData.data)

    } catch (error) {
      console.error('Error fetching resources:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkConflicts = (availableGuides: Guide[], availableVehicles: Vehicle[]) => {
    // Check if currently assigned guide is NOT in available list
    const guideHasConflict = currentGuideId && 
      !availableGuides.find(g => g.id === currentGuideId)

    // Check if currently assigned vehicle is NOT in available list
    const vehicleHasConflict = currentVehicleId && 
      !availableVehicles.find(v => v.id === currentVehicleId)

    setConflicts({
      guide: !!guideHasConflict,
      vehicle: !!vehicleHasConflict
    })
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      const response = await fetch(`/api/itineraries/${itineraryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_guide_id: formData.assigned_guide_id || null,
          assigned_vehicle_id: formData.assigned_vehicle_id || null,
          guide_notes: formData.guide_notes || null,
          vehicle_notes: formData.vehicle_notes || null,
          pickup_location: formData.pickup_location || null,
          pickup_time: formData.pickup_time || null
        })
      })

      const data = await response.json()

      if (data.success) {
        if (onUpdate) onUpdate()
      } else {
        alert(data.error || 'Failed to update resources')
      }
    } catch (error) {
      console.error('Error updating resources:', error)
      alert('Failed to update resources')
    } finally {
      setSaving(false)
    }
  }

  const selectedGuide = guides.find(g => g.id === formData.assigned_guide_id)
  const selectedVehicle = vehicles.find(v => v.id === formData.assigned_vehicle_id)

  // Filter vehicles by capacity if num_travelers is provided
  const suitableVehicles = numTravelers
    ? vehicles.filter(v => v.passenger_capacity >= numTravelers)
    : vehicles

  const hasChanges = 
    formData.assigned_guide_id !== (currentGuideId || '') ||
    formData.assigned_vehicle_id !== (currentVehicleId || '') ||
    formData.guide_notes !== (currentGuideNotes || '') ||
    formData.vehicle_notes !== (currentVehicleNotes || '') ||
    formData.pickup_location !== (currentPickupLocation || '') ||
    formData.pickup_time !== (currentPickupTime || '')

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-autoura border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading resources...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-autoura border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Resource Assignment</h3>
        {(conflicts.guide || conflicts.vehicle) && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">Conflict Detected</span>
          </div>
        )}
      </div>

      {/* Guide Assignment */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-600" />
          <label className="text-sm font-semibold text-gray-900">Tour Guide</label>
        </div>

        <select
          value={formData.assigned_guide_id}
          onChange={(e) => setFormData({ ...formData, assigned_guide_id: e.target.value })}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent ${
            conflicts.guide ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
          }`}
        >
          <option value="">No guide assigned</option>
          {guides.map(guide => (
            <option key={guide.id} value={guide.id}>
              {guide.name} - {guide.languages.join(', ')}
            </option>
          ))}
        </select>

        {conflicts.guide && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-700">
              <p className="font-medium">Currently assigned guide has a scheduling conflict!</p>
              <p className="mt-1">Please select a different guide or adjust the dates.</p>
            </div>
          </div>
        )}

        {selectedGuide && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm text-blue-900">
              <span className="font-medium">{selectedGuide.name}</span>
              <span className="text-blue-700"> • Languages: {selectedGuide.languages.join(', ')}</span>
            </div>
          </div>
        )}

        {/* Notify Guide via WhatsApp */}
        {formData.assigned_guide_id && formData.assigned_guide_id !== currentGuideId && (
          <div className="mt-3">
            <WhatsAppButton 
              itineraryId={itineraryId}
              type="guide"
              guideId={formData.assigned_guide_id}
              onSuccess={() => {
                alert('Guide notified successfully! 📱')
              }}
              className="bg-blue-600 hover:bg-blue-700 w-full"
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              Click to notify the guide via WhatsApp after saving
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes for Guide
          </label>
          <textarea
            rows={2}
            value={formData.guide_notes}
            onChange={(e) => setFormData({ ...formData, guide_notes: e.target.value })}
            placeholder="Special instructions, requirements, or notes for the guide..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Vehicle Assignment */}
      <div className="space-y-3 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary-600" />
          <label className="text-sm font-semibold text-gray-900">Vehicle</label>
          {numTravelers && (
            <span className="text-xs text-gray-600 ml-auto">
              ({numTravelers} travelers - showing suitable vehicles only)
            </span>
          )}
        </div>

        <select
          value={formData.assigned_vehicle_id}
          onChange={(e) => setFormData({ ...formData, assigned_vehicle_id: e.target.value })}
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent ${
            conflicts.vehicle ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
          }`}
        >
          <option value="">No vehicle assigned</option>
          {suitableVehicles.map(vehicle => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name} - {vehicle.passenger_capacity} seats ({vehicle.vehicle_type})
            </option>
          ))}
        </select>

        {conflicts.vehicle && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-700">
              <p className="font-medium">Currently assigned vehicle has a scheduling conflict!</p>
              <p className="mt-1">Please select a different vehicle or adjust the dates.</p>
            </div>
          </div>
        )}

        {numTravelers && suitableVehicles.length === 0 && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium">No vehicles available with capacity for {numTravelers} travelers!</p>
              <p className="mt-1">You may need to use multiple vehicles or add more vehicles to your fleet.</p>
            </div>
          </div>
        )}

        {selectedVehicle && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm text-green-900">
              <span className="font-medium">{selectedVehicle.name}</span>
              <span className="text-green-700"> • {selectedVehicle.passenger_capacity} seats • {selectedVehicle.vehicle_type}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes for Vehicle/Driver
          </label>
          <textarea
            rows={2}
            value={formData.vehicle_notes}
            onChange={(e) => setFormData({ ...formData, vehicle_notes: e.target.value })}
            placeholder="Special requirements, equipment needed, parking instructions..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Pickup Details */}
      <div className="space-y-3 pt-6 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900">Pickup Details</h4>
        
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <MapPin className="w-4 h-4" />
            Pickup Location
          </label>
          <input
            type="text"
            value={formData.pickup_location}
            onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
            placeholder="e.g., Hotel lobby, Airport Terminal 3, Client address..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <Clock className="w-4 h-4" />
            Pickup Time
          </label>
          <input
            type="time"
            value={formData.pickup_time}
            onChange={(e) => setFormData({ ...formData, pickup_time: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Summary */}
      {guides.length === 0 && vehicles.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">No resources available for these dates</p>
            <p className="mt-1">All guides and vehicles are already booked during this period. Consider:</p>
            <ul className="mt-2 ml-4 list-disc space-y-1">
              <li>Adjusting the tour dates</li>
              <li>Adding more guides/vehicles to your fleet</li>
              <li>Checking for conflicts in overlapping bookings</li>
            </ul>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          {hasChanges ? (
            <span className="text-orange-600 font-medium">• Unsaved changes</span>
          ) : (
            <span className="text-green-600 font-medium">✓ All changes saved</span>
          )}
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Resources
            </>
          )}
        </button>
      </div>
    </div>
  )
}