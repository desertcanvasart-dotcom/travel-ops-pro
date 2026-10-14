'use client'

// ============================================
// Settings › WhatsApp — is this company's WhatsApp working?
// ============================================
// Read-only status plus a test send. The company's WhatsApp number is
// assigned by the Autoura team (PUT /api/organization/branding refuses it
// from anyone else), and the Twilio account belongs to the installation —
// neither is set from here, and the page no longer tells anyone to edit the
// server's environment file. The shapes it reads and sends are in
// lib/settings/whatsapp-status.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageCircle, Send, Check, AlertCircle, Settings, Phone, ArrowLeft } from 'lucide-react'
import {
  whatsappStatusRows,
  whatsappTestBody,
  whatsappTestOutcome,
  type WhatsAppStatus,
} from '@/lib/settings/whatsapp-status'

export default function WhatsAppSettingsPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/whatsapp/status')
      setStatus(response.ok ? await response.json() : null)
    } catch (error) {
      console.error('Failed to load WhatsApp status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!testPhone.trim()) {
      setTestResult({ success: false, message: 'Enter a phone number' })
      return
    }

    try {
      setTestLoading(true)
      setTestResult(null)
      const response = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(whatsappTestBody(testPhone)),
      })
      setTestResult(whatsappTestOutcome(await response.json().catch(() => null)))
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'The test message could not be sent.' })
    } finally {
      setTestLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="animate-pulse space-y-3">
              <div className="h-5 bg-gray-100 rounded w-1/3"></div>
              <div className="h-3 bg-gray-100 rounded w-2/3"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const rows = whatsappStatusRows(status)

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">

        <Link
          href="/settings?tab=integrations"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Settings
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">WhatsApp</h1>
              <p className="text-xs text-gray-500">Quotes, invoices and updates sent to clients from your company&apos;s WhatsApp number</p>
            </div>
          </div>

          <div className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
            ${status?.configured
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
            }
          `}>
            {status?.configured ? (
              <>
                <Check className="w-3 h-3" />
                <span>Ready to send</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3" />
                <span>Not ready yet</span>
              </>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Status</h2>
          </div>

          <div className="space-y-0">
            {rows.map(row => (
              <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-600 font-medium">{row.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${row.ok ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {row.value}
                </span>
              </div>
            ))}
            {rows.length === 0 && <p className="text-xs text-gray-500">Could not read the WhatsApp status.</p>}
          </div>

          {!status?.configured && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <p className="font-medium mb-1">Set up by the Autoura team</p>
                  <p>
                    Your company&apos;s WhatsApp number is connected by the Autoura team, not from this page.
                    Ask them to connect your number. Once it is, the number shows above and the test below works.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Test */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Send a test message</h2>
          </div>

          <p className="text-xs text-gray-600 mb-4">
            Sends a short test message from your company&apos;s WhatsApp number to the phone you enter.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Phone number
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+201234567890"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Include the country code (e.g. +20 for Egypt, +81 for Japan)
              </p>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={testLoading || !testPhone.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testLoading ? (
                <>
                  <MessageCircle className="w-3.5 h-3.5 animate-pulse" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send test message</span>
                </>
              )}
            </button>

            {testResult && (
              <div className={`
                flex items-start gap-2 p-3 rounded-lg
                ${testResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
                }
              `}>
                {testResult.success ? (
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <p className={`text-xs ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>{testResult.message}</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
