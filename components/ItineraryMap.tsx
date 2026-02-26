'use client'

import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Map as MapIcon, ChevronDown, ChevronUp, Ship, Route } from 'lucide-react'
import {
  resolveCityCoordinates,
  NILE_CRUISE_CITIES,
  type CityCoordinate,
} from '@/lib/constants/egypt-city-coordinates'

import 'leaflet/dist/leaflet.css'

// ============================================
// TYPES
// ============================================

export interface ItineraryMapDay {
  day_number: number
  title?: string
  city?: string
  overnight_city?: string | null
  date?: string
  is_cruise_day?: boolean
}

interface ResolvedStop {
  dayNumber: number
  title: string
  city: string
  overnightCity: string
  coords: CityCoordinate
  isCruise: boolean
  date?: string
}

interface ItineraryMapProps {
  days: ItineraryMapDay[]
  defaultExpanded?: boolean
  height?: number
}

// ============================================
// NUMBERED MARKER FACTORY
// ============================================

const LAND_COLOR = '#647C47'
const CRUISE_COLOR = '#3B82F6'

function createNumberedIcon(num: number, isCruise: boolean): L.DivIcon {
  const bg = isCruise ? CRUISE_COLOR : LAND_COLOR
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${bg};color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;
      border:2.5px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">${num}</div>`,
  })
}

// ============================================
// AUTO-FIT BOUNDS HELPER
// ============================================

function FitBounds({ stops }: { stops: ResolvedStop[] }) {
  const map = useMap()

  useMemo(() => {
    if (stops.length === 0) return
    const latLngs: L.LatLngExpression[] = stops.map((s) => [s.coords.lat, s.coords.lng] as L.LatLngTuple)
    const bounds = L.latLngBounds(latLngs)
    // Pad a bit so markers aren't at the very edge
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
  }, [stops, map])

  return null
}

// ============================================
// OFFSET OVERLAPPING MARKERS
// ============================================
// When multiple days share the same city, nudge
// markers slightly so they don't perfectly overlap.

function offsetCoords(
  stops: ResolvedStop[]
): (ResolvedStop & { displayLat: number; displayLng: number })[] {
  const seen = new Map<string, number>() // key → count so far

  return stops.map((stop) => {
    const key = `${stop.coords.lat},${stop.coords.lng}`
    const count = seen.get(key) || 0
    seen.set(key, count + 1)

    // Spiral offset: each duplicate gets a small shift
    const angle = (count * 137.508 * Math.PI) / 180 // golden angle
    const radius = count * 0.012 // ~1.3 km per step
    return {
      ...stop,
      displayLat: stop.coords.lat + radius * Math.cos(angle),
      displayLng: stop.coords.lng + radius * Math.sin(angle),
    }
  })
}

// ============================================
// DETECT CRUISE SEGMENTS
// ============================================

function isCruiseCity(cityName: string): boolean {
  return NILE_CRUISE_CITIES.some(
    (c) => c.toLowerCase() === cityName.toLowerCase()
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ItineraryMap({
  days,
  defaultExpanded = false,
  height = 420,
}: ItineraryMapProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // Resolve all days to map-able stops
  const stops = useMemo<ResolvedStop[]>(() => {
    const result: ResolvedStop[] = []

    for (const day of days) {
      const cityName = day.city || day.overnight_city || ''
      if (!cityName) continue

      const coords = resolveCityCoordinates(cityName)
      if (!coords) continue

      // Detect cruise: explicit flag, or both this city and overnight are Nile cruise cities
      const overnightName = day.overnight_city || cityName
      const isCruise =
        day.is_cruise_day === true ||
        (isCruiseCity(cityName) && isCruiseCity(overnightName))

      result.push({
        dayNumber: day.day_number,
        title: day.title || `Day ${day.day_number}`,
        city: cityName,
        overnightCity: overnightName,
        coords,
        isCruise,
        date: day.date,
      })
    }

    return result
  }, [days])

  // Build polyline segments (land vs cruise)
  const segments = useMemo(() => {
    const segs: { points: [number, number][]; isCruise: boolean }[] = []
    if (stops.length < 2) return segs

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]
      const to = stops[i + 1]
      const segIsCruise = from.isCruise && to.isCruise
      const points: [number, number][] = [
        [from.coords.lat, from.coords.lng],
        [to.coords.lat, to.coords.lng],
      ]

      // Merge consecutive segments of same type
      if (segs.length > 0 && segs[segs.length - 1].isCruise === segIsCruise) {
        segs[segs.length - 1].points.push(points[1])
      } else {
        segs.push({ points, isCruise: segIsCruise })
      }
    }

    return segs
  }, [stops])

  const offsetStops = useMemo(() => offsetCoords(stops), [stops])

  // Nothing to show
  if (stops.length === 0) return null

  // Detect if any cruise segments exist (for legend)
  const hasCruise = stops.some((s) => s.isCruise)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#E8EDE0] flex items-center justify-center">
            <MapIcon className="w-4 h-4 text-[#647C47]" />
          </div>
          <span className="text-sm font-semibold text-gray-900">
            Route Map
          </span>
          <span className="text-xs text-gray-500">
            {stops.length} stop{stops.length !== 1 ? 's' : ''}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Map body */}
      {expanded && (
        <div>
          <div style={{ height }} className="relative">
            <MapContainer
              center={[stops[0].coords.lat, stops[0].coords.lng]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
              attributionControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitBounds stops={stops} />

              {/* Route polylines */}
              {segments.map((seg, idx) => (
                <Polyline
                  key={idx}
                  positions={seg.points}
                  pathOptions={{
                    color: seg.isCruise ? CRUISE_COLOR : LAND_COLOR,
                    weight: 3,
                    opacity: 0.7,
                    dashArray: seg.isCruise ? '8 6' : undefined,
                  }}
                />
              ))}

              {/* Numbered markers */}
              {offsetStops.map((stop) => (
                <Marker
                  key={stop.dayNumber}
                  position={[stop.displayLat, stop.displayLng]}
                  icon={createNumberedIcon(stop.dayNumber, stop.isCruise)}
                >
                  <Popup>
                    <div className="min-w-[160px]">
                      <div className="font-semibold text-gray-900 mb-1">
                        Day {stop.dayNumber}: {stop.title}
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div>
                          <span className="font-medium text-gray-700">City:</span>{' '}
                          {stop.city}
                        </div>
                        {stop.overnightCity !== stop.city && (
                          <div>
                            <span className="font-medium text-gray-700">Overnight:</span>{' '}
                            {stop.overnightCity}
                          </div>
                        )}
                        {stop.date && (
                          <div>
                            <span className="font-medium text-gray-700">Date:</span>{' '}
                            {new Date(stop.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                        )}
                        {stop.isCruise && (
                          <div className="flex items-center gap-1 text-blue-600 mt-1">
                            <Ship className="w-3 h-3" /> Nile Cruise
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Legend */}
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ background: LAND_COLOR }}
              />
              <Route className="w-3 h-3" style={{ color: LAND_COLOR }} />
              <span>Land route</span>
            </div>
            {hasCruise && (
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ background: CRUISE_COLOR }}
                />
                <Ship className="w-3 h-3" style={{ color: CRUISE_COLOR }} />
                <span>Nile Cruise</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
