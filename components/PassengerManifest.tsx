'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Loader2, Star, Mail, Phone, BadgeCheck } from 'lucide-react'

interface Passenger {
  id: string
  title: string | null
  first_name: string
  last_name: string
  full_name: string | null
  date_of_birth: string | null
  gender: string | null
  nationality: string | null
  email: string | null
  phone: string | null
  passport_number: string | null
  passport_expiry: string | null
  passport_issuing_country: string | null
  passenger_type: string
  is_lead_passenger: boolean
  room_type: string | null
  meal_preference: string | null
  mobility_requirements: string | null
  medical_conditions: string | null
  special_requests: string | null
}

const TYPE_BADGE: Record<string, string> = {
  adult: 'bg-blue-100 text-blue-700',
  child: 'bg-purple-100 text-purple-700',
  infant: 'bg-pink-100 text-pink-700',
  tour_leader: 'bg-amber-100 text-amber-700',
}

const EMPTY = {
  title: '',
  first_name: '',
  last_name: '',
  passenger_type: 'adult',
  is_lead_passenger: false,
  nationality: '',
  email: '',
  phone: '',
  passport_number: '',
  passport_expiry: '',
  passport_issuing_country: '',
  date_of_birth: '',
  room_type: '',
  meal_preference: '',
  mobility_requirements: '',
  medical_conditions: '',
  special_requests: '',
}

export default function PassengerManifest({ bookingId }: { bookingId: string }) {
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/passengers`)
      const json = await res.json()
      if (json.success) setPassengers(json.data)
    } catch {
      /* surfaced via empty state */
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required')
      return
    }
    setSaving(true)
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
      )
      const res = await fetch(`/api/bookings/${bookingId}/passengers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Failed to add passenger')
        return
      }
      setForm({ ...EMPTY })
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#647C47]'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Users className="w-4 h-4" /> Passengers <span className="text-gray-400">({passengers.length})</span>
        </h3>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="w-4 h-4" /> Add passenger
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input className={inputCls} placeholder="Title" value={form.title} onChange={set('title')} />
            <input className={inputCls} placeholder="First name *" value={form.first_name} onChange={set('first_name')} />
            <input className={inputCls} placeholder="Last name *" value={form.last_name} onChange={set('last_name')} />
            <select className={inputCls} value={form.passenger_type} onChange={set('passenger_type')}>
              <option value="adult">Adult</option>
              <option value="child">Child</option>
              <option value="infant">Infant</option>
              <option value="tour_leader">Tour leader</option>
            </select>
            <input className={inputCls} placeholder="Nationality" value={form.nationality} onChange={set('nationality')} />
            <input className={inputCls} type="date" title="Date of birth" value={form.date_of_birth} onChange={set('date_of_birth')} />
            <input className={inputCls} placeholder="Email" value={form.email} onChange={set('email')} />
            <input className={inputCls} placeholder="Phone" value={form.phone} onChange={set('phone')} />
            <input className={inputCls} placeholder="Passport number" value={form.passport_number} onChange={set('passport_number')} />
            <input className={inputCls} type="date" title="Passport expiry" value={form.passport_expiry} onChange={set('passport_expiry')} />
            <input className={inputCls} placeholder="Passport country" value={form.passport_issuing_country} onChange={set('passport_issuing_country')} />
            <input className={inputCls} placeholder="Room type" value={form.room_type} onChange={set('room_type')} />
            <input className={inputCls} placeholder="Meal preference" value={form.meal_preference} onChange={set('meal_preference')} />
          </div>
          <input className={inputCls} placeholder="Special requests / mobility / medical" value={form.special_requests} onChange={set('special_requests')} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_lead_passenger} onChange={set('is_lead_passenger')} /> Lead passenger
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save passenger
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }} className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>
      ) : passengers.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-8 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No passengers recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {passengers.map((p) => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">{p.full_name || `${p.first_name} ${p.last_name}`}</span>
                  {p.is_lead_passenger && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#647C47]/10 text-[#647C47]"><Star className="w-3 h-3" /> Lead</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_BADGE[p.passenger_type] || 'bg-gray-100 text-gray-600'}`}>{p.passenger_type}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  {p.nationality && <span>{p.nationality}</span>}
                  {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                  {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                  {p.passport_number && <span className="flex items-center gap-1"><BadgeCheck className="w-3 h-3" />{p.passport_number}{p.passport_expiry ? ` · exp ${p.passport_expiry}` : ''}</span>}
                  {p.room_type && <span>Room: {p.room_type}</span>}
                  {p.meal_preference && <span>Meal: {p.meal_preference}</span>}
                </div>
                {(p.special_requests || p.medical_conditions || p.mobility_requirements) && (
                  <p className="text-xs text-gray-600 mt-1">{[p.special_requests, p.mobility_requirements, p.medical_conditions].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
