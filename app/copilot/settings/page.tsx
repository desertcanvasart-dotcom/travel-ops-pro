'use client'

import { useState, useEffect } from 'react'
import { Settings, Check, Sparkles } from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import type { CopilotTone } from '@/types/copilot'

const TONE_OPTIONS: { value: CopilotTone; label: string; description: string; example: string }[] = [
  {
    value: 'professional',
    label: 'Professional',
    description: 'Warm and efficient. Balances friendliness with competence.',
    example: 'Dear Sarah, thank you for reaching out. Your booking for the Cairo & Luxor tour (March 15–22) is confirmed. I\'ve attached the updated itinerary with your hotel preferences included. Please let me know if you have any questions.',
  },
  {
    value: 'friendly',
    label: 'Friendly',
    description: 'Conversational and approachable. More casual while remaining respectful.',
    example: 'Hi Sarah! Great news — your Cairo & Luxor tour is all set for March 15–22! 🎉 I\'ve updated the itinerary with those hotel preferences you mentioned. Take a look and let me know if anything needs tweaking!',
  },
  {
    value: 'formal',
    label: 'Formal',
    description: 'Polished and dignified. Uses proper salutations and formal language.',
    example: 'Dear Ms. Johnson, I am pleased to confirm your reservation for the Cairo & Luxor tour, scheduled for 15–22 March. The itinerary has been revised to accommodate your accommodation preferences. Should you require any further adjustments, please do not hesitate to contact us.',
  },
]

export default function CopilotSettingsPage() {
  const { user } = useAuth()
  const [tone, setTone] = useState<CopilotTone>('professional')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    const fetchSettings = async () => {
      try {
        const res = await fetch(`/api/copilot/settings?user_id=${user.id}`)
        const data = await res.json()
        if (data.success && data.settings?.tone) {
          setTone(data.settings.tone)
        }
      } catch (err) {
        console.error('Failed to fetch copilot settings:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [user?.id])

  const handleSave = async (newTone: CopilotTone) => {
    if (!user?.id) return
    setTone(newTone)
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/copilot/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, tone: newTone }),
      })
      const data = await res.json()
      if (data.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      console.error('Failed to save copilot settings:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-sm text-gray-400">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#647C47]/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#647C47]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">AI Copilot Settings</h1>
          <p className="text-sm text-gray-500">Configure how Claude drafts replies</p>
        </div>
        {saved && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
            <Check className="w-3 h-3" />
            Saved
          </span>
        )}
      </div>

      {/* Tone Selector */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Reply Tone</h2>
        <p className="text-xs text-gray-500 mb-4">Choose the tone Claude uses when drafting replies to customers</p>

        <div className="space-y-3">
          {TONE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSave(option.value)}
              disabled={saving}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                tone === option.value
                  ? 'border-[#647C47] bg-[#647C47]/5'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{option.label}</span>
                {tone === option.value && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-[#647C47] bg-[#647C47]/10 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-3">{option.description}</p>
              <div className="bg-gray-50 rounded-md p-3 border border-gray-100">
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Preview</div>
                <div className="text-xs text-gray-600 italic">{option.example}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
