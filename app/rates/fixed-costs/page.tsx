'use client'

import { useEffect, useState } from 'react'
import { Droplets, Coins, Plus, Edit, Save, X, Check, Loader2, AlertTriangle, Settings } from 'lucide-react'

interface FixedCost {
  id: string
  cost_type: string
  cost_per_person_per_day: number
  description?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const COST_TYPE_CONFIG: Record<string, { icon: any; color: string; bgColor: string; label: string; hint: string }> = {
  'Water Bottle': {
    icon: Droplets,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Water Bottles',
    hint: 'Bottled water provided daily per person during touring days',
  },
  'Daily Tips': {
    icon: Coins,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    label: 'Daily Tips',
    hint: 'Daily tips per person for guides, drivers, and service staff',
  },
}

export default function FixedCostsPage() {
  const [costs, setCosts] = useState<FixedCost[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCostType, setNewCostType] = useState('')
  const [newCostRate, setNewCostRate] = useState('')
  const [newCostDescription, setNewCostDescription] = useState('')

  const showNotice = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  const fetchCosts = async () => {
    try {
      const res = await fetch('/api/rates/fixed-costs')
      const data = await res.json()
      if (data.success) {
        setCosts(data.data)
      }
    } catch (err) {
      console.error('Error fetching fixed costs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCosts()
  }, [])

  const handleSave = async (cost: FixedCost) => {
    setSaving(true)
    try {
      const res = await fetch('/api/rates/fixed-costs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cost.id,
          cost_per_person_per_day: parseFloat(editValue) || 0,
          description: editDescription || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showNotice('success', `${cost.cost_type} rate updated to €${parseFloat(editValue).toFixed(2)}`)
        setEditingId(null)
        fetchCosts()
      } else {
        showNotice('error', data.error || 'Failed to save')
      }
    } catch (err) {
      showNotice('error', 'Failed to save rate')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (cost: FixedCost) => {
    try {
      const res = await fetch('/api/rates/fixed-costs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cost.id, is_active: !cost.is_active }),
      })
      const data = await res.json()
      if (data.success) {
        showNotice('success', `${cost.cost_type} ${!cost.is_active ? 'activated' : 'deactivated'}`)
        fetchCosts()
      }
    } catch (err) {
      showNotice('error', 'Failed to toggle status')
    }
  }

  const handleAddNew = async () => {
    if (!newCostType.trim() || !newCostRate) return
    setSaving(true)
    try {
      const res = await fetch('/api/rates/fixed-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_type: newCostType.trim(),
          cost_per_person_per_day: parseFloat(newCostRate) || 0,
          description: newCostDescription || null,
          is_active: true,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showNotice('success', `"${newCostType}" added at €${parseFloat(newCostRate).toFixed(2)} per person/day`)
        setShowAddForm(false)
        setNewCostType('')
        setNewCostRate('')
        setNewCostDescription('')
        fetchCosts()
      } else {
        showNotice('error', data.error || 'Failed to add cost')
      }
    } catch (err) {
      showNotice('error', 'Failed to add cost')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#647C47] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading fixed costs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-gray-50 min-h-screen max-w-4xl mx-auto">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {notification.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#647C47]/10 rounded-lg">
            <Settings className="w-6 h-6 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fixed Daily Costs</h1>
            <p className="text-sm text-gray-600">Per-person daily rates for water, tips, and other fixed costs included in every itinerary</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c] font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Cost
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">These rates are used in all pricing calculations</p>
          <p className="text-blue-600 mt-1">Water and tips are pass-through costs with no profit margin applied. Changes here will affect all new itinerary pricing calculations.</p>
        </div>
      </div>

      {/* Cost Cards */}
      <div className="space-y-4">
        {costs.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Settings className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No fixed costs configured</h3>
            <p className="text-sm text-gray-600 mb-4">Add water bottle and daily tips rates to include them in itinerary pricing.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c]"
            >
              <Plus className="w-4 h-4" />
              Add First Cost
            </button>
          </div>
        ) : (
          costs.map((cost) => {
            const config = COST_TYPE_CONFIG[cost.cost_type] || {
              icon: Coins,
              color: 'text-gray-600',
              bgColor: 'bg-gray-100',
              label: cost.cost_type,
              hint: 'Fixed daily cost per person',
            }
            const Icon = config.icon
            const isEditing = editingId === cost.id

            return (
              <div key={cost.id} className={`bg-white rounded-lg border ${cost.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'} shadow-sm overflow-hidden`}>
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${config.bgColor}`}>
                      <Icon className={`w-6 h-6 ${config.color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">{config.label}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{cost.description || config.hint}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-lg font-bold text-gray-400">€</span>
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            min="0"
                            step="0.5"
                            className="w-24 px-3 py-2 text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] text-center"
                            autoFocus
                          />
                          <span className="text-sm text-gray-500">/person/day</span>
                        </div>
                        <button
                          onClick={() => handleSave(cost)}
                          disabled={saving}
                          className="p-2 bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c] disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold text-gray-900">€{cost.cost_per_person_per_day.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">per person / per day</p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingId(cost.id)
                            setEditValue(String(cost.cost_per_person_per_day))
                            setEditDescription(cost.description || '')
                          }}
                          className="p-2 text-gray-400 hover:text-[#647C47] hover:bg-[#647C47]/10 rounded-lg transition-colors"
                          title="Edit rate"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(cost)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                            cost.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {cost.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Editing description */}
                {isEditing && (
                  <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Optional description..."
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47]"
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add New Cost Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add Fixed Daily Cost</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Cost Type *</label>
                <input
                  type="text"
                  value={newCostType}
                  onChange={(e) => setNewCostType(e.target.value)}
                  placeholder="e.g., Water Bottle, Daily Tips"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Rate (EUR per person per day) *</label>
                <input
                  type="number"
                  value={newCostRate}
                  onChange={(e) => setNewCostRate(e.target.value)}
                  min="0"
                  step="0.5"
                  placeholder="e.g., 2.00"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={newCostDescription}
                  onChange={(e) => setNewCostDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNew}
                disabled={saving || !newCostType.trim() || !newCostRate}
                className="px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c] disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Cost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
