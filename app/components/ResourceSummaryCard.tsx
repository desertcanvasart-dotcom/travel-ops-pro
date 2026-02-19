'use client'

import { Users, Truck, MapPin, Clock, AlertCircle, Edit, Phone, Languages, UserCircle, Info } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

interface Guide {
  id: string
  name: string
  phone?: string
  languages: string[]
  photo_url?: string
}

interface Vehicle {
  id: string
  name: string
  type?: string // transport_company | transport | driver
  city?: string
  contact_phone?: string
  whatsapp?: string
  vehicle_types?: string[] // ['Sedan', 'Minivan', 'Van', 'Bus']
}

interface ResourceSummaryCardProps {
  guideId?: string | null
  vehicleId?: string | null
  guideNotes?: string | null
  vehicleNotes?: string | null
  pickupLocation?: string | null
  pickupTime?: string | null
  onEdit?: () => void
}

export default function ResourceSummaryCard({
  guideId,
  vehicleId,
  guideNotes,
  vehicleNotes,
  pickupLocation,
  pickupTime,
  onEdit
}: ResourceSummaryCardProps) {
  const t = useTranslations('resourceSummary')
  const [guide, setGuide] = useState<Guide | null>(null)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (guideId || vehicleId) {
      fetchResourceDetails()
    }
  }, [guideId, vehicleId])

  const fetchResourceDetails = async () => {
    try {
      setLoading(true)

      // Fetch guide details
      if (guideId) {
        const guideResponse = await fetch(`/api/guides/${guideId}`)
        const guideData = await guideResponse.json()
        if (guideData.success) {
          setGuide(guideData.data)
        }
      }

      // Fetch vehicle/transport supplier details
      if (vehicleId) {
        const vehicleResponse = await fetch(`/api/suppliers/${vehicleId}`)
        const vehicleData = await vehicleResponse.json()
        if (vehicleData.success) {
          setVehicle(vehicleData.data)
        }
      }
    } catch (error) {
      console.error('Error fetching resource details:', error)
    } finally {
      setLoading(false)
    }
  }

  // If no resources assigned, show empty state
  if (!guideId && !vehicleId && !pickupLocation && !pickupTime) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-autoura border-2 border-dashed border-gray-300 p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{t('noResourcesAssigned')}</h3>
          <p className="text-gray-600 mb-4">
            {t('noResourcesDescription')}
          </p>
          {onEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
            >
              <Edit className="w-4 h-4" />
              {t('assignResources')}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-autoura border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-gray-600">{t('loadingResources')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl shadow-autoura border border-blue-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{t('assignedResources')}</h3>
              <p className="text-blue-100 text-sm">{t('assignedSubtitle')}</p>
            </div>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-medium transition-colors backdrop-blur-sm"
            >
              <Edit className="w-4 h-4" />
              {t('edit')}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Guide Section */}
        {guide && (
          <div className="bg-white rounded-lg border-2 border-blue-200 p-5">
            <div className="flex items-start gap-4">
              {/* Guide Photo/Avatar */}
              <div className="flex-shrink-0">
                {guide.photo_url ? (
                  <img
                    src={guide.photo_url}
                    alt={guide.name}
                    className="w-20 h-20 rounded-full object-cover border-4 border-blue-100"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center border-4 border-blue-100">
                    <UserCircle className="w-12 h-12 text-white" />
                  </div>
                )}
              </div>

              {/* Guide Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-lg font-bold text-gray-900 mb-1">{guide.name}</h4>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">{t('tourGuide')}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Languages */}
                  {guide.languages && guide.languages.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Languages className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 mb-1">{t('languages')}</div>
                        <div className="flex flex-wrap gap-1">
                          {guide.languages.map((lang, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full"
                            >
                              {lang}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Phone */}
                  {guide.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500">{t('phone')}</div>
                        <a
                          href={`tel:${guide.phone}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          {guide.phone}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Guide Notes */}
                  {guideNotes && (
                    <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-200">
                      <Info className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 mb-1">{t('specialInstructions')}</div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{guideNotes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Vehicle Section */}
        {vehicle && (
          <div className="bg-white rounded-lg border-2 border-green-200 p-5">
            <div className="flex items-start gap-4">
              {/* Vehicle Icon */}
              <div className="flex-shrink-0">
                <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center border-4 border-green-100">
                  <Truck className="w-10 h-10 text-white" />
                </div>
              </div>

              {/* Vehicle/Transport Supplier Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-lg font-bold text-gray-900 mb-1">{vehicle.name}</h4>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Truck className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium capitalize">
                        {vehicle.type === 'transport_company' ? 'Transport Company' : vehicle.type === 'driver' ? 'Driver' : 'Transport'}
                      </span>
                      {vehicle.city && (
                        <>
                          <span className="text-gray-400">•</span>
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{vehicle.city}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Vehicle Types */}
                  {vehicle.vehicle_types && vehicle.vehicle_types.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Truck className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 mb-1">{t('vehicleTypes') || 'Vehicle Types'}</div>
                        <div className="flex flex-wrap gap-1">
                          {vehicle.vehicle_types.map((vt, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full"
                            >
                              {vt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Phone */}
                  {(vehicle.contact_phone || vehicle.whatsapp) && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500">{t('phone')}</div>
                        <a
                          href={`tel:${vehicle.contact_phone || vehicle.whatsapp}`}
                          className="text-sm font-medium text-green-600 hover:text-green-700"
                        >
                          {vehicle.contact_phone || vehicle.whatsapp}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Vehicle Notes */}
                  {vehicleNotes && (
                    <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-200">
                      <Info className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 mb-1">{t('specialRequirements')}</div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{vehicleNotes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pickup Details Section */}
        {(pickupLocation || pickupTime) && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <h4 className="text-lg font-bold text-gray-900">{t('pickupDetails')}</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pickupLocation && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-1">{t('location')}</div>
                    <p className="text-sm font-medium text-gray-900">{pickupLocation}</p>
                  </div>
                </div>
              )}

              {pickupTime && (
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-1">{t('time')}</div>
                    <p className="text-sm font-medium text-gray-900">{pickupTime}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Summary Footer */}
        <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">✓</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{t('allResourcesConfirmed')}</p>
            <p className="text-xs text-gray-600">
              {guide && vehicle
                ? t('guideAndVehicleAssigned')
                : guide
                ? t('guideAssignedVehicleNeeded')
                : vehicle
                ? t('vehicleAssignedGuideNeeded')
                : t('additionalResourcesNeeded')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}