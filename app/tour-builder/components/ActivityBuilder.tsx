'use client'

import { useState, useEffect } from 'react'

interface EntranceFee {
  id: string
  service_code: string
  attraction_name: string
  city: string
  eur_rate: number
  non_eur_rate: number
  fee_type?: string
  category?: string
}

interface Transportation {
  id: string
  service_code: string
  vehicle_type: string
  service_type: string
  city: string
  capacity_min: number
  capacity_max: number
  base_rate_eur: number
  base_rate_non_eur: number
}

interface Activity {
  id?: string
  activity_order: number
  entrances?: EntranceFee[]  // ← Multiple entrances
  transportation?: Transportation
  activity_notes?: string
}

interface ActivityBuilderProps {
  city: string
  activities: Activity[]
  pax: number
  isEuroPassport: boolean
  onActivitiesChange: (activities: Activity[]) => void
}

export default function ActivityBuilder({
  city,
  activities,
  pax,
  isEuroPassport,
  onActivitiesChange
}: ActivityBuilderProps) {
  const [entrances, setEntrances] = useState<EntranceFee[]>([])
  const [transportations, setTransportations] = useState<Transportation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!city) {
      setEntrances([])
      setTransportations([])
      return
    }
    fetchOptions()
  }, [city])

  const fetchOptions = async () => {
    setLoading(true)
    try {
      const [entrancesRes, transportsRes] = await Promise.all([
        fetch(`/api/rates?type=entrance&city=${city}`),
        fetch(`/api/rates?type=transportation&city=${city}`)
      ])

      const [entrancesData, transportsData] = await Promise.all([
        entrancesRes.json(),
        transportsRes.json()
      ])

      if (entrancesData.success) {
        setEntrances(entrancesData.data || [])
      }
      if (transportsData.success) {
        setTransportations(transportsData.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch activity options:', error)
    } finally {
      setLoading(false)
    }
  }

  const addActivity = () => {
    const newActivity: Activity = {
      activity_order: activities.length + 1,
      entrances: [],
      activity_notes: ''
    }
    onActivitiesChange([...activities, newActivity])
  }

  const removeActivity = (index: number) => {
    const updated = activities.filter((_, i) => i !== index)
    const reordered = updated.map((activity, i) => ({
      ...activity,
      activity_order: i + 1
    }))
    onActivitiesChange(reordered)
  }

  const updateActivity = (index: number, field: keyof Activity, value: any) => {
    const updated = [...activities]
    updated[index] = { ...updated[index], [field]: value }
    onActivitiesChange(updated)
  }

  const toggleEntrance = (activityIndex: number, entrance: EntranceFee) => {
    const activity = activities[activityIndex]
    const currentEntrances = activity.entrances || []
    const isSelected = currentEntrances.some(e => e.id === entrance.id)
    
    const newEntrances = isSelected
      ? currentEntrances.filter(e => e.id !== entrance.id)
      : [...currentEntrances, entrance]
    
    updateActivity(activityIndex, 'entrances', newEntrances)
  }

  const moveActivity = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === activities.length - 1)
    ) {
      return
    }

    const updated = [...activities]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    // Swap activities
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp
    
    updated[index].activity_order = index + 1
    updated[targetIndex].activity_order = targetIndex + 1
    
    onActivitiesChange(updated)
  }

  const calculateActivityCost = (activity: Activity) => {
    let cost = 0
    
    if (activity.entrances && activity.entrances.length > 0) {
      activity.entrances.forEach(entrance => {
        const rate = isEuroPassport ? entrance.eur_rate : entrance.non_eur_rate
        cost += pax * rate
      })
    }
    
    if (activity.transportation) {
      const rate = isEuroPassport
        ? activity.transportation.base_rate_eur
        : activity.transportation.base_rate_non_eur
      cost += rate
    }
    
    return cost
  }

  const getTotalCost = () => {
    return activities.reduce((total, activity) => total + calculateActivityCost(activity), 0)
  }

  if (!city) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          Please select a city first
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-medium text-gray-700">
          🎯 Activities
        </label>
        <button
          onClick={addActivity}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          ➕ Add Activity
        </button>
      </div>

      {loading ? (
        <div className="text-center py-4 text-gray-600">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      ) : activities.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-600 mb-2">No activities added yet</p>
          <p className="text-sm text-gray-500">Click "Add Activity" to start building your itinerary</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div
              key={index}
              className="border border-gray-300 rounded-lg p-4 bg-white"
            >
              {/* Activity Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                    {activity.activity_order}
                  </span>
                  <span className="font-semibold text-gray-900">
                    Activity {activity.activity_order}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => moveActivity(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    ⬆️
                  </button>
                  <button
                    onClick={() => moveActivity(index, 'down')}
                    disabled={index === activities.length - 1}
                    className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    ⬇️
                  </button>
                  <button
                    onClick={() => removeActivity(index)}
                    className="p-1 text-red-600 hover:text-red-700"
                    title="Remove activity"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Entrance Multi-Select */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🎫 Entrance Tickets (Select Multiple)
                </label>
                <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto bg-white">
                  {entrances.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      No entrance tickets available
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {entrances.map((entrance) => {
                        const rate = isEuroPassport ? entrance.eur_rate : entrance.non_eur_rate
                        const isSelected = activity.entrances?.some(e => e.id === entrance.id) || false
                        
                        return (
                          <label
                            key={entrance.id}
                            className={`flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                              isSelected ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleEntrance(index, entrance)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-sm text-gray-900">
                                  {entrance.attraction_name}
                                </div>
                                {entrance.category && (
                                  <div className="text-xs text-gray-500">
                                    {entrance.category}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right ml-3">
                              <div className="font-semibold text-sm text-gray-900">
                                €{rate.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">
                                €{(pax * rate).toFixed(2)} total
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                {activity.entrances && activity.entrances.length > 0 && (
                  <div className="mt-2 text-xs text-blue-600">
                    ✓ {activity.entrances.length} entrance{activity.entrances.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>

              {/* Transportation Selector */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🚗 Transportation
                </label>
                <select
                  value={activity.transportation?.id || ''}
                  onChange={(e) => {
                    const transport = transportations.find(t => t.id === e.target.value)
                    updateActivity(index, 'transportation', transport || null)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No transportation</option>
                  {transportations
                    .filter(t => t.capacity_max >= pax)
                    .map((transport) => {
                      const rate = isEuroPassport ? transport.base_rate_eur : transport.base_rate_non_eur
                      return (
                        <option key={transport.id} value={transport.id}>
                          {transport.vehicle_type} ({transport.capacity_min}-{transport.capacity_max} pax) - €{rate}
                        </option>
                      )
                    })}
                </select>
                {transportations.filter(t => t.capacity_max >= pax).length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ No vehicles available for {pax} passengers
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📝 Notes (Optional)
                </label>
                <textarea
                  value={activity.activity_notes || ''}
                  onChange={(e) => updateActivity(index, 'activity_notes', e.target.value)}
                  placeholder="Add timing, special instructions, etc..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Activity Cost */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 flex justify-between items-center">
                <span className="text-sm font-medium text-blue-900">Activity Cost:</span>
                <span className="text-lg font-bold text-blue-700">
                  €{calculateActivityCost(activity).toFixed(2)}
                </span>
              </div>
            </div>
          ))}

          {/* Total Activities Cost */}
          {activities.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-green-900">
                  Total Activities Cost ({activities.length} activit{activities.length !== 1 ? 'ies' : 'y'})
                </span>
                <span className="text-2xl font-bold text-green-700">
                  €{getTotalCost().toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}