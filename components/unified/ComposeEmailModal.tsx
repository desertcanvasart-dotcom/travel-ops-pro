'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Send, Loader2, X, AlertCircle, Paperclip, Image as ImageIcon,
  FileText, Signature, ChevronDown, Users, Building2
} from 'lucide-react'
import RichTextEditor from '@/components/email/RichTextEditor'
import { replacePlaceholders, getPlaceholders } from '@/lib/template-placeholders'

interface Attachment {
  filename: string
  mimeType: string
  data: string
  size: number
}

interface EmailSignature {
  id: string
  name: string
  content: string
  is_default: boolean
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
  channel?: string
}

interface Client {
  id: string
  name: string
  email: string
  phone?: string
}

interface ComposeEmailModalProps {
  onClose: () => void
  userId: string
  onSent?: () => void
  defaultTo?: string
  defaultSubject?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ComposeEmailModal({
  onClose,
  userId,
  onSent,
  defaultTo = '',
  defaultSubject = '',
}: ComposeEmailModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [to, setTo] = useState(defaultTo)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showSignatureDropdown, setShowSignatureDropdown] = useState(false)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)

  // Template placeholder state
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})

  // Client/Partner CRM state
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [loadingCRMData, setLoadingCRMData] = useState(false)
  const [clientItineraries, setClientItineraries] = useState<any[]>([])
  const [selectedItineraryId, setSelectedItineraryId] = useState('')
  const [crmPlaceholderData, setCrmPlaceholderData] = useState<Record<string, string>>({})

  // Load signatures, templates, and clients
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sigRes, tempRes, clientsRes] = await Promise.all([
          fetch(`/api/email/signatures?userId=${userId}`),
          fetch(`/api/email/templates?userId=${userId}`),
          // Recipient picker: the clients API clamps to max 200 per page
          fetch('/api/clients?limit=200'),
        ])

        const sigData = await sigRes.json()
        const tempData = await tempRes.json()
        const clientsData = await clientsRes.json()

        if (sigData.signatures) setSignatures(sigData.signatures)
        if (tempData.templates) setTemplates(tempData.templates)
        if (clientsData.clients) setClients(clientsData.clients)

        // Apply default signature
        const defaultSig = sigData.signatures?.find((s: EmailSignature) => s.is_default)
        if (defaultSig) {
          setBody(`<p></p><br/>${defaultSig.content}`)
        }
      } catch (err) {
        console.error('Error fetching compose data:', err)
      }
    }

    if (userId) fetchData()
  }, [userId])

  // Client CRM data loading
  const fetchClientCRMData = async (clientId: string) => {
    if (!clientId) {
      setClientItineraries([])
      setSelectedItineraryId('')
      setCrmPlaceholderData({})
      return
    }

    setLoadingCRMData(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/template-data?userId=${userId}`)
      const data = await response.json()

      if (data.error) {
        console.error('Error fetching CRM data:', data.error)
        return
      }

      setClientItineraries(data.allItineraries || [])
      if (data.latestItinerary) {
        setSelectedItineraryId(data.latestItinerary.id)
      }
      setCrmPlaceholderData(data.placeholderData || {})

      // Auto-fill "To" field
      const client = clients.find(c => c.id === clientId)
      if (client?.email) {
        setTo(client.email)
      }
    } catch (err) {
      console.error('Error fetching client CRM data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const fetchItineraryData = async (clientId: string, itineraryId: string) => {
    if (!clientId || !itineraryId) return

    setLoadingCRMData(true)
    try {
      const response = await fetch(
        `/api/clients/${clientId}/template-data?userId=${userId}&itineraryId=${itineraryId}`
      )
      const data = await response.json()
      if (data.placeholderData) {
        setCrmPlaceholderData(data.placeholderData)
      }
    } catch (err) {
      console.error('Error fetching itinerary data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId)
    setSelectedItineraryId('')
    fetchClientCRMData(clientId)
  }

  const handleItineraryChange = (itineraryId: string) => {
    setSelectedItineraryId(itineraryId)
    if (selectedClientId && itineraryId) {
      fetchItineraryData(selectedClientId, itineraryId)
    }
  }

  // File handling
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const maxSize = 25 * 1024 * 1024

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > maxSize) {
        setError(`File "${file.name}" is too large. Maximum size is 25MB.`)
        continue
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachments(prev => [...prev, {
          filename: file.name,
          mimeType: file.type,
          data: base64,
          size: file.size
        }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  // Signatures
  const insertSignature = (signature: EmailSignature) => {
    setBody(prev => `${prev}<br/>${signature.content}`)
    setShowSignatureDropdown(false)
  }

  // Templates
  const useTemplate = (template: EmailTemplate) => {
    const placeholders = getPlaceholders(template.content + ' ' + template.subject)

    if (placeholders.length > 0) {
      setSelectedTemplate(template)
      setPlaceholderValues({})
      if (!selectedClientId) setCrmPlaceholderData({})
      setShowPlaceholderModal(true)
    } else {
      setSubject(template.subject)
      setBody(template.content)
    }
    setShowTemplateDropdown(false)
  }

  const applyTemplateWithPlaceholders = () => {
    if (!selectedTemplate) return

    const finalData = { ...crmPlaceholderData, ...placeholderValues }
    const processedSubject = replacePlaceholders(selectedTemplate.subject, finalData)
    const processedContent = replacePlaceholders(selectedTemplate.content, finalData)

    setSubject(processedSubject)
    setBody(processedContent)
    setShowPlaceholderModal(false)
    setSelectedTemplate(null)
  }

  // Send
  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError('Please fill in all fields')
      return
    }

    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to,
          subject,
          body,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      onSent?.()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">New Message</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="recipient@example.com"
            />
          </div>

          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="Email subject"
            />
          </div>

          {/* Templates & Signatures Bar */}
          <div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            {templates.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Templates
                </button>
                {showTemplateDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 max-h-96 overflow-y-auto">
                    {['customer', 'partner', 'supplier', 'internal'].map(category => {
                      const categoryTemplates = templates.filter(t => t.category === category)
                      if (categoryTemplates.length === 0) return null

                      return (
                        <div key={category}>
                          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                              {category === 'customer' && 'Customer Templates'}
                              {category === 'partner' && 'Partner Templates'}
                              {category === 'supplier' && 'Supplier Templates'}
                              {category === 'internal' && 'Internal Templates'}
                            </span>
                          </div>
                          {categoryTemplates.map((template) => (
                            <button
                              key={template.id}
                              onClick={() => template.channel !== 'whatsapp' && useTemplate(template)}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 ${
                                template.channel === 'whatsapp' ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              title={template.channel === 'whatsapp' ? 'WhatsApp only' : ''}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900">{template.name}</span>
                                {template.channel === 'whatsapp' && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">WA only</span>
                                )}
                                {template.channel === 'both' && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">+WA</span>
                                )}
                              </div>
                              {template.subject && (
                                <span className="block text-gray-500 truncate mt-0.5">{template.subject}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {signatures.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowSignatureDropdown(!showSignatureDropdown)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <Signature className="w-3.5 h-3.5" />
                  Signatures
                </button>
                {showSignatureDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    {signatures.map((sig) => (
                      <button
                        key={sig.id}
                        onClick={() => insertSignature(sig)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900">{sig.name}</span>
                        {sig.is_default && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">Default</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rich Text Editor */}
          <div className="flex-1 p-4">
            <RichTextEditor
              content={body}
              onChange={setBody}
              placeholder="Write your message..."
              minHeight="200px"
              maxHeight="300px"
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-600 mb-2">Attachments ({attachments.length})</p>
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate max-w-[150px]">{file.filename}</p>
                      <p className="text-[10px] text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                    <button onClick={() => removeAttachment(index)} className="p-1 hover:bg-gray-100 rounded">
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-1">
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar" />
            <input ref={imageInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept="image/*" />
            <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Attach file">
              <Paperclip className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Insert image">
              <ImageIcon className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
              Discard
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showSignatureDropdown || showTemplateDropdown) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowSignatureDropdown(false)
            setShowTemplateDropdown(false)
          }}
        />
      )}

      {/* Placeholder Modal */}
      {showPlaceholderModal && selectedTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowPlaceholderModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Fill Template: {selectedTemplate.name}</h3>
              <button onClick={() => setShowPlaceholderModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Client CRM Section */}
              <div className="p-4 bg-primary-50 rounded-lg border border-primary-100">
                <p className="text-xs font-semibold text-primary-800 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Load Client from CRM
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select Client</label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => handleClientChange(e.target.value)}
                      className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                    >
                      <option value="">-- Select a client --</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.name} ({client.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedClientId && clientItineraries.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Select Trip/Itinerary</label>
                      <select
                        value={selectedItineraryId}
                        onChange={(e) => handleItineraryChange(e.target.value)}
                        className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                      >
                        <option value="">-- Select an itinerary --</option>
                        {clientItineraries.map((itin: any) => (
                          <option key={itin.id} value={itin.id}>
                            {itin.itinerary_code} - {itin.trip_name} ({itin.start_date})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {loadingCRMData && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading CRM data...
                    </div>
                  )}
                </div>
              </div>

              {/* Show loaded client data */}
              {selectedClientId && Object.keys(crmPlaceholderData).length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-2">Client data loaded</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {crmPlaceholderData.client_name && (
                      <div><span className="text-gray-500">Client:</span> {crmPlaceholderData.client_name}</div>
                    )}
                    {crmPlaceholderData.trip_name && (
                      <div><span className="text-gray-500">Trip:</span> {crmPlaceholderData.trip_name}</div>
                    )}
                    {crmPlaceholderData.total && (
                      <div><span className="text-gray-500">Total:</span> {crmPlaceholderData.total}</div>
                    )}
                    {crmPlaceholderData.trip_dates && (
                      <div className="col-span-2"><span className="text-gray-500">Dates:</span> {crmPlaceholderData.trip_dates}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Manual placeholder overrides */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Override Placeholders</p>
                <div className="space-y-2">
                  {getPlaceholders(selectedTemplate.content + ' ' + selectedTemplate.subject).map((placeholder) => (
                    <div key={placeholder} className="flex items-center gap-2">
                      <label className="w-32 text-xs text-gray-500 truncate flex-shrink-0">{`{{${placeholder}}}`}</label>
                      <input
                        type="text"
                        value={placeholderValues[placeholder] || crmPlaceholderData[placeholder] || ''}
                        onChange={(e) => setPlaceholderValues(prev => ({
                          ...prev,
                          [placeholder]: e.target.value
                        }))}
                        className="flex-1 h-8 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500"
                        placeholder={crmPlaceholderData[placeholder] || `Enter ${placeholder}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowPlaceholderModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={applyTemplateWithPlaceholders}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
