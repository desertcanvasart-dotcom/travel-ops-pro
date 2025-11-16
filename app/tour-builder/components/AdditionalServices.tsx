'use client'

import { useState, useEffect } from 'react'

interface ServiceFee {
  id: string
  service_code: string
  service_name: string
  service_category: string
  service_type: string
  city: string
  base_rate_eur: number
  base_rate_non_eur: number
  rate_type: 'per_person' | 'per_group' | 'per_vehicle' | 'per_day'
  notes?: string
}

interface SelectedService {
  service: ServiceFee
  quantity?: number
}

interface AdditionalServicesProps {
  city: string
  selectedServices: SelectedService[]
  pax: number
  isEuroPassport: boolean
  onServicesChange: (services: SelectedService[]) => void
}

export default function AdditionalServices({
  city,
  selectedServices = [],
  pax,
  isEuroPassport,
  onServicesChange
}: AdditionalServicesProps) {
  const [services, setServices] = useState<ServiceFee[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!city) {
      setServices([])
      return
    }
    fetchServices()
  }, [city])

  const fetchServices = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/rates?type=service_fee&city=${city}`)
      const data = await response.json()
      
      if (data.success) {
        setServices(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch services:', error)
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  const isServiceSelected = (serviceId: string) => {
    return selectedServices.some(s => s.service.id === serviceId)
  }

  const toggleService = (service: ServiceFee) => {
    const isSelected = isServiceSelected(service.id)
    
    if (isSelected) {
      // Remove service
      onServicesChange(selectedServices.filter(s => s.service.id !== service.id))
    } else {
      // Add service with default quantity
      const defaultQuantity = service.rate_type === 'per_vehicle' ? 1 : undefined
      onServicesChange([...selectedServices, { service, quantity: defaultQuantity }])
    }
  }

  const updateQuantity = (serviceId: string, quantity: number) => {
    onServicesChange(
      selectedServices.map(s => 
        s.service.id === serviceId 
          ? { ...s, quantity: Math.max(1, quantity) }
          : s
      )
    )
  }

  const calculateServiceCost = (selectedService: SelectedService) => {
    const { service, quantity } = selectedService
    const rate = isEuroPassport ? service.base_rate_eur : service.base_rate_non_eur
    
    switch (service.rate_type) {
      case 'per_person':
        return pax * rate
      case 'per_group':
      case 'per_day':
        return rate
      case 'per_vehicle':
        return (quantity || 1) * rate
      default:
        return rate
    }
  }

  const getTotalCost = () => {
    return selectedServices.reduce((total, s) => total + calculateServiceCost(s), 0)
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

  // Group services by category
  const servicesByCategory = services.reduce((acc, service) => {
    const category = service.service_category || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(service)
    return acc
  }, {} as Record<string, ServiceFee[]>)

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        ➕ Additional Services
      </label>

      {loading ? (
        <div className="text-center py-4 text-gray-600">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      ) : services.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-600">
          No additional services available
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(servicesByCategory).map(([category, categoryServices]) => (
            <div key={category} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 text-sm">{category}</h4>
              <div className="space-y-2">
                {categoryServices.map((service) => {
                  const selected = selectedServices.find(s => s.service.id === service.id)
                  const isSelected = !!selected
                  const cost = selected ? calculateServiceCost(selected) : 0
                  
                  return (
                    <div
                      key={service.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleService(service)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">
                            {service.service_name}
                          </div>
                          <div className="text-xs text-gray-600">
                            {service.service_type}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Quantity input for per-vehicle services */}
                        {isSelected && service.rate_type === 'per_vehicle' && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Qty:</span>
                            <input
                              type="number"
                              min="1"
                              value={selected?.quantity || 1}
                              onChange={(e) => updateQuantity(service.id, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}

                        <div className="text-right">
                          <div className="font-semibold text-sm text-gray-900">
                            {isSelected ? `€${cost.toFixed(2)}` : `€${(isEuroPassport ? service.base_rate_eur : service.base_rate_non_eur).toFixed(2)}`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {service.rate_type === 'per_person' && `${pax} pax`}
                            {service.rate_type === 'per_group' && 'per group'}
                            {service.rate_type === 'per_vehicle' && (selected?.quantity ? `${selected.quantity} vehicle(s)` : 'per vehicle')}
                            {service.rate_type === 'per_day' && 'per day'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Total */}
          {selectedServices.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-green-900">
                  Total Additional Services
                </span>
                <span className="text-xl font-bold text-green-700">
                  €{getTotalCost().toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-green-700 mt-1">
                {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}