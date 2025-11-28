'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Send, Check, AlertCircle, Settings, Phone, Zap } from 'lucide-react'

interface ConfigStatus {
  configured: boolean
  config: {
    accountSid: string
    apiKey: string
    apiSecret: string
    whatsappFrom: string
    businessName: string
    autoSendEnabled: string
    statusUpdatesEnabled: string
  }
  message: string
}

export default function WhatsAppSettingsPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/whatsapp/test')
      const data = await response.json()
      setConfig(data)
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!testPhone) {
      setTestResult({ success: false, message: 'Please enter a phone number' })
      return
    }

    try {
      setTestLoading(true)
      setTestResult(null)

      const response = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: testPhone })
      })

      const data = await response.json()
      setTestResult(data)

    } catch (error: any) {
      setTestResult({ success: false, message: error.message })
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

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">WhatsApp Integration</h1>
              <p className="text-xs text-gray-500">Send quotes and updates directly to your clients</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
            ${config?.configured 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-amber-50 text-amber-700 border border-amber-200'
            }
          `}>
            {config?.configured ? (
              <>
                <Check className="w-3 h-3" />
                <span>Fully Configured</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3" />
                <span>Configuration Incomplete</span>
              </>
            )}
          </div>
        </div>

        {/* Configuration Status */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Configuration Status</h2>
          </div>

          <div className="space-y-0">
            {Object.entries(config?.config || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-600 font-medium capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className={`
                  text-xs px-2 py-0.5 rounded
                  ${value.includes('✅') ? 'bg-green-50 text-green-700' : ''}
                  ${value.includes('❌') ? 'bg-red-50 text-red-700' : ''}
                  ${value.includes('⚠️') ? 'bg-amber-50 text-amber-700' : ''}
                  ${!value.includes('✅') && !value.includes('❌') && !value.includes('⚠️') ? 'text-gray-700' : ''}
                `}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {!config?.configured && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <p className="font-medium mb-1">Configuration Required</p>
                  <p>Please check your <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">.env.local</code> file and ensure all Twilio credentials are set.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Test Connection */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Test Connection</h2>
          </div>

          <p className="text-xs text-gray-600 mb-4">
            Send a test message to verify your WhatsApp integration is working correctly.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Your Phone Number
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+201234567890"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Include country code (e.g., +20 for Egypt, +1 for USA)
              </p>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={testLoading || !testPhone}
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
                  <span>Send Test Message</span>
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
                  <>
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-green-800">
                      <p className="font-medium">Success!</p>
                      <p className="mt-0.5">{testResult.message}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-red-800">
                      <p className="font-medium">Error</p>
                      <p className="mt-0.5">{testResult.message}</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-primary-600 rounded-lg shadow-sm p-5 text-white">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4" />
            <h2 className="text-sm font-semibold">Quick Start Guide</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold">1</span>
              </div>
              <div>
                <p className="text-xs font-medium">Configure Twilio Credentials</p>
                <p className="text-white/70 text-[11px] mt-0.5">Add your credentials to <code className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">.env.local</code></p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold">2</span>
              </div>
              <div>
                <p className="text-xs font-medium">Test the Connection</p>
                <p className="text-white/70 text-[11px] mt-0.5">Send yourself a test message using the form above</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold">3</span>
              </div>
              <div>
                <p className="text-xs font-medium">Start Sending Messages</p>
                <p className="text-white/70 text-[11px] mt-0.5">Use the "Send via WhatsApp" buttons throughout the app</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}