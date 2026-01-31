'use client'

import { useState } from 'react'
import { Send, MessageCircle, Check, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface WhatsAppButtonProps {
  itineraryId?: string
  type: 'quote' | 'status' | 'guide' | 'contract'
  status?: 'confirmed' | 'cancelled' | 'pending_payment' | 'paid' | 'completed'
  clientPhone?: string
  clientName?: string
  guideId?: string
  contractPdfUrl?: string
  onSuccess?: () => void
  className?: string
}

export default function WhatsAppButton({
  itineraryId,
  type,
  status,
  clientPhone,
  clientName,
  guideId,
  contractPdfUrl,
  onSuccess,
  className = ''
}: WhatsAppButtonProps) {
  const t = useTranslations('whatsappButton')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    try {
      setLoading(true)
      setError(null)

      let endpoint = ''
      let body: any = {}

      switch (type) {
        case 'quote':
          endpoint = '/api/whatsapp/send-quote'
          body = { itineraryId, clientPhone, clientName }
          break
        case 'status':
          endpoint = '/api/whatsapp/send-status'
          body = { itineraryId, status }
          break
        case 'guide':
          endpoint = '/api/whatsapp/notify-guide'
          body = { itineraryId, guideId }
          break
        case 'contract':
          endpoint = '/api/whatsapp/send-contract'
          body = { itineraryId, contractPdfUrl }
          break
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send message')
      }

      console.log('✅ WhatsApp sent:', data.messageId)
      setSent(true)
      
      setTimeout(() => setSent(false), 3000)

      if (onSuccess) {
        onSuccess()
      }

    } catch (err: any) {
      console.error('❌ Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getButtonText = () => {
    if (loading) {
      if (type === 'quote') return t('sendingQuote')
      if (type === 'guide') return t('notifyingGuide')
      if (type === 'contract') return t('sendingContract')
      if (status === 'confirmed') return t('sendingConfirmation')
      if (status === 'pending_payment') return t('sendingReminder')
      if (status === 'paid') return t('sendingConfirmation')
      return t('sending')
    }

    if (sent) return t('sent')

    if (type === 'quote') return t('sendQuoteViaWhatsApp')
    if (type === 'guide') return t('notifyGuideViaWhatsApp')
    if (type === 'contract') return t('sendContractViaWhatsApp')

    if (type === 'status') {
      switch (status) {
        case 'confirmed':
          return t('sendConfirmation')
        case 'pending_payment':
          return t('paymentReminder')
        case 'paid':
          return t('paymentReceived')
        case 'cancelled':
          return t('sendCancellation')
        case 'completed':
          return t('sendThankYou')
        default:
          return t('sendUpdateViaWhatsApp')
      }
    }

    return t('sendViaWhatsApp')
  }

  const getIcon = () => {
    if (loading) return <MessageCircle className="w-4 h-4 animate-pulse" />
    if (sent) return <Check className="w-4 h-4" />
    return <Send className="w-4 h-4" />
  }

  const getButtonColor = () => {
    if (sent) return 'bg-green-600 hover:bg-green-700'
    if (error) return 'bg-red-600 hover:bg-red-700'
    return 'bg-[#25D366] hover:bg-[#20BD5A]'
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSend}
        disabled={loading || sent}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg
          text-white font-medium
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          shadow-sm hover:shadow-md
          ${getButtonColor()}
          ${className}
        `}
      >
        {getIcon()}
        {getButtonText()}
      </button>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
