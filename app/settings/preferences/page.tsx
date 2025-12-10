'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { 
  Settings, Save, Calculator, Crown, CheckCircle, AlertCircle,
  ToggleLeft, ToggleRight, Info
} from 'lucide-react'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', description: 'Cost-effective options' },
  { value: 'standard', label: 'Standard', description: 'Comfortable mid-range' },
  { value: 'deluxe', label: 'Deluxe', description: 'Superior quality' },
  { value: 'luxury', label: 'Luxury', description: 'Top-tier VIP experience' }
]

const COST_MODE_OPTIONS = [
  { 
    value: 'auto', 
    label: 'Auto-Calculate', 
    description: 'System calculates costs from rates database automatically',
    icon: Calculator
  },
  { 
    value: 'manual', 
    label: 'Manual Entry', 
    description: 'Enter actual costs manually for each service',
    icon: Settings
  }
]

// ============================================
// INTERFACES
// ============================================

interface UserPreferences {
  id?: string
  user_id?: string
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
  updated_at?: string
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PreferencesPage() {
  const [preferences, setPreferences] = useState<UserPreferences>({
    default_cost_mode: 'auto',
    default_tier: 'standard',
    default_margin_percent: 25,
    default_currency: 'EUR'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [hasChanges, setHasChanges] = useState(false)

  const supabase = createClient()

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  // Load preferences
  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setLoading(false)
        return
      }

      // Try to get existing preferences
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setPreferences({
          id: data.id,
          user_id: data.user_id,
          default_cost_mode: data.default_cost_mode || 'auto',
          default_tier: data.default_tier || 'standard',
          default_margin_percent: data.default_margin_percent || 25,
          default_currency: data.default_currency || 'EUR',
          updated_at: data.updated_at
        })
      }
      // If no preferences exist, keep defaults
    } catch (error) {
      console.error('Error loading preferences:', error)
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async () => {
    setSaving(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        showToast('error', 'Please sign in to save preferences')
        return
      }

      const prefData = {
        user_id: user.id,
        default_cost_mode: preferences.default_cost_mode,
        default_tier: preferences.default_tier,
        default_margin_percent: preferences.default_margin_percent,
        default_currency: preferences.default_currency,
        updated_at: new Date().toISOString()
      }

      // Upsert - insert or update
      const { error } = await supabase
        .from('user_preferences')
        .upsert(prefData, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        })

      if (error) throw error

      showToast('success', 'Preferences saved successfully!')
      setHasChanges(false)
      
    } catch (error: any) {
      console.error('Error saving preferences:', error)
      showToast('error', error.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const updatePreference = (key: keyof UserPreferences, value: any) => {
    setPreferences(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading preferences...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Settings className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Preferences</h1>
                <p className="text-xs text-gray-600">Configure default settings for itineraries and pricing</p>
              </div>
            </div>
            
            <button
              onClick={savePreferences}
              disabled={saving || !hasChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                hasChanges 
                  ? 'bg-primary-600 text-white hover:bg-primary-700' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

        {/* Cost Mode Setting */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Cost Calculation Mode</h2>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            Choose how costs are calculated for new itineraries. You can override this per itinerary.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {COST_MODE_OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected = preferences.default_cost_mode === option.value
              
              return (
                <button
                  key={option.value}
                  onClick={() => updatePreference('default_cost_mode', option.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary-100' : 'bg-gray-100'}`}>
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-primary-600' : 'text-gray-500'}`} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                        {option.label}
                      </span>
                      {isSelected && (
                        <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full font-medium">
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 ml-11">{option.description}</p>
                </button>
              )
            })}
          </div>

          {/* Info box for manual mode */}
          {preferences.default_cost_mode === 'manual' && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Manual Mode Selected</p>
                  <p className="text-xs text-amber-700 mt-1">
                    New itineraries will have editable cost fields. Auto-calculated values will be pre-filled as a starting point, which you can then modify with actual expenses.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Default Tier Setting */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-bold text-gray-900">Default Service Tier</h2>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            Set the default tier for new itineraries. AI will select suppliers matching this tier.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TIER_OPTIONS.map((tier) => {
              const isSelected = preferences.default_tier === tier.value
              
              return (
                <button
                  key={tier.value}
                  onClick={() => updatePreference('default_tier', tier.value)}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    isSelected
                      ? tier.value === 'luxury'
                        ? 'border-amber-500 bg-amber-50'
                        : tier.value === 'deluxe'
                        ? 'border-purple-500 bg-purple-50'
                        : tier.value === 'standard'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-500 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    {tier.value === 'luxury' && <Crown className="w-4 h-4 text-amber-600" />}
                    <span className={`text-sm font-semibold ${
                      isSelected ? 'text-gray-900' : 'text-gray-700'
                    }`}>
                      {tier.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{tier.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Default Margin Setting */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">💰</span>
            <h2 className="text-base font-bold text-gray-900">Default Profit Margin</h2>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            Set the default margin percentage applied to supplier costs.
          </p>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={preferences.default_margin_percent}
              onChange={(e) => updatePreference('default_margin_percent', parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <div className="w-20 text-center">
              <span className="text-2xl font-bold text-primary-600">{preferences.default_margin_percent}%</span>
            </div>
          </div>

          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
          </div>
        </div>

        {/* Default Currency Setting */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">💱</span>
            <h2 className="text-base font-bold text-gray-900">Default Currency</h2>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            Set the default currency for new itineraries and pricing.
          </p>

          <div className="flex gap-2">
            {['EUR', 'USD', 'GBP', 'EGP'].map((currency) => {
              const isSelected = preferences.default_currency === currency
              const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
              
              return (
                <button
                  key={currency}
                  onClick={() => updatePreference('default_currency', currency)}
                  className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {symbols[currency]} {currency}
                </button>
              )
            })}
          </div>
        </div>

        {/* Unsaved Changes Warning */}
        {hasChanges && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span className="text-sm text-amber-800 font-medium">You have unsaved changes</span>
            <button
              onClick={savePreferences}
              disabled={saving}
              className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg font-medium hover:bg-primary-700"
            >
              Save Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}