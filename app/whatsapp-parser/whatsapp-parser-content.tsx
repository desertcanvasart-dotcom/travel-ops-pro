'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle, AlertCircle, Users, Calendar, MapPin,
  Loader2, MessageSquare, Sparkles,
  User, Mail, Phone, Globe, ChevronRight, UserPlus, ArrowLeft,
  Crown, Star, Settings, Check, X, Hotel, Plane, Car, Ship,
  Sun, Map, Building2, Package, Anchor, Clock, BadgeCheck,
  Percent, Languages, ChevronDown, ChevronUp, Info, Edit3, Save,
  Zap, Pencil, FileText, Wand2, ListChecks, AlertTriangle, Plus
} from 'lucide-react'
import Link from 'next/link'

// ============================================
// TYPES
// ============================================

interface UserPreferences {
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
}

interface ExtractedDay {
  day_number: number
  date: string | null
  date_display: string | null
  title: string
  city: string
  is_arrival: boolean
  is_departure: boolean
  is_transfer_only: boolean
  is_free_day: boolean
  activities: string[]
  attractions: string[]
  meals_included: {
    breakfast: boolean
    lunch: boolean
    dinner: boolean
  }
  guide_required: boolean
  transport_type: string | null
  flight_info: string | null
  hotel_name: string | null
  overnight_city: string
  notes: string | null
}

interface ExtractedData {
  client_name: string
  client_email: string
  client_phone: string
  tour_name: string
  start_date: string
  end_date: string | null
  duration_days: number
  num_adults: number
  num_children: number
  cities: string[]
  interests: string[]
  special_requests: string[]
  budget_level: string
  hotel_name: string
  hotel_location: string
  conversation_language: string
  confidence_score: number
  nationality?: string
  tier?: string
  // NEW: Structured input detection
  is_structured_input: boolean
  structure_confidence: number
  structure_signals: string[]
  extracted_days: ExtractedDay[] | null
  raw_itinerary: string | null
}

interface ExistingClient {
  id: string
  client_code: string
  full_name: string
  email: string
  phone: string
}

interface B2BPartner {
  id: string
  company_name: string
  partner_code: string
  commission_percent: number
}

// UPDATED: Package types
type PackageType = 'day-trips' | 'tours-only' | 'land-package' | 'cruise-package' | 'cruise-land'
type GenerationStep = 'idle' | 'creating-client' | 'checking-suppliers' | 'building-route' | 'calculating-margins' | 'finalizing' | 'complete'
type ClientStep = 'pending' | 'confirming' | 'confirmed' | 'existing-selected'
type GenerationMode = 'edit' | 'quick'

// NEW: Input mode type
type InputMode = 'creative' | 'structured'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', icon: null, color: 'gray', description: 'Cost-effective, good value' },
  { value: 'standard', label: 'Standard', icon: null, color: 'blue', description: 'Comfortable mid-range' },
  { value: 'deluxe', label: 'Deluxe', icon: Star, color: 'purple', description: 'Superior quality' },
  { value: 'luxury', label: 'Luxury', icon: Crown, color: 'amber', description: 'Top-tier VIP experience' }
]

// UPDATED: New package types
const PACKAGE_TYPES = [
  { slug: 'day-trips', name: 'Day Trips', icon: Sun, description: 'No accommodation', color: 'amber' },
  { slug: 'tours-only', name: 'Tours Only', icon: Map, description: 'Client has own hotel', color: 'blue' },
  { slug: 'land-package', name: 'Land Package', icon: Hotel, description: 'Tours + Hotels', color: 'emerald' },
  { slug: 'cruise-package', name: 'Cruise Package', icon: Ship, description: 'Nile Cruise only', color: 'cyan' },
  { slug: 'cruise-land', name: 'Cruise + Land', icon: Package, description: 'Cruise + Hotels', color: 'primary' },
]

const DEFAULT_PREFERENCES: UserPreferences = {
  default_cost_mode: 'auto',
  default_tier: 'standard',
  default_margin_percent: 25,
  default_currency: 'USD'
}

const GENERATION_STEPS: { key: GenerationStep; label: string }[] = [
  { key: 'creating-client', label: 'Creating client profile...' },
  { key: 'checking-suppliers', label: 'Checking supplier availability...' },
  { key: 'building-route', label: 'Building optimal route...' },
  { key: 'calculating-margins', label: 'Calculating margins...' },
  { key: 'finalizing', label: 'Finalizing itinerary...' },
]

const SAMPLE_CONVERSATION = `Cliente: Hola, queremos hacer un tour a Memphis, Sakkara
Agente: ¡Perfecto! ¿Cuántas personas?
Cliente: 4 adultos
Agente: ¿Para qué fecha?
Cliente: 12 de noviembre
Cliente: Y queremos añadir Dahshur también
Cliente: Mi nombre es Inmaculada Yurba Minguez
Cliente: Mi email es inmayurba@yahoo.es
Agente: Perfecto, ¿en qué hotel se alojan?
Cliente: Gran Plaza
Cliente: Queremos algo de lujo, es nuestro aniversario`

// ============================================
// HELPER FUNCTIONS
// ============================================

const mapBudgetToTier = (budgetLevel: string): string => {
  const mapping: Record<string, string> = {
    'budget': 'budget', 'economy': 'budget',
    'standard': 'standard', 'mid-range': 'standard', 'moderate': 'standard',
    'deluxe': 'deluxe', 'superior': 'deluxe',
    'luxury': 'luxury', 'premium': 'luxury', 'vip': 'luxury', 'high-end': 'luxury'
  }
  return mapping[budgetLevel?.toLowerCase()] || 'standard'
}

const getTierColor = (tier: string) => {
  const colors: Record<string, { bg: string; border: string; text: string; ring: string }> = {
    luxury: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', ring: 'ring-amber-500' },
    deluxe: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', ring: 'ring-purple-500' },
    standard: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', ring: 'ring-blue-500' },
    budget: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', ring: 'ring-gray-500' }
  }
  return colors[tier] || colors.standard
}

const parseConversation = (text: string): { sender: 'client' | 'agent'; message: string; highlight?: string[] }[] => {
  const lines = text.split('\n').filter(line => line.trim())
  return lines.map(line => {
    const isClient = line.toLowerCase().startsWith('client') || line.toLowerCase().startsWith('cliente')
    const message = line.replace(/^(cliente|client|agente|agent):\s*/i, '')
    
    const highlights: string[] = []
    if (/\d+\s*(adult|adulto|person|persona)/i.test(message)) highlights.push('travelers')
    if (/\d{1,2}\s*(de\s+)?\w+|\d{4}-\d{2}-\d{2}/i.test(message)) highlights.push('date')
    if (/@|\.com|\.es|\.org/i.test(message)) highlights.push('email')
    if (/lujo|luxury|premium|vip|deluxe/i.test(message)) highlights.push('tier')
    
    return { sender: isClient ? 'client' : 'agent', message, highlight: highlights }
  })
}

// ============================================
// CHAT BUBBLE COMPONENT
// ============================================

function ChatBubble({ sender, message, highlight }: { sender: 'client' | 'agent'; message: string; highlight?: string[] }) {
  const t = useTranslations('whatsappParser')
  const isClient = sender === 'client'

  return (
    <div className={`flex ${isClient ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
        isClient
          ? 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
          : 'bg-[#DCF8C6] text-gray-900 rounded-br-md'
      }`}>
        <p className="text-xs font-medium mb-0.5 opacity-60">
          {isClient ? t('chatClient') : t('chatAgent')}
        </p>
        <p>
          {message}
          {highlight && highlight.length > 0 && (
            <span className="ml-1">
              {highlight.includes('travelers') && <Users className="inline w-3 h-3 text-blue-500" />}
              {highlight.includes('date') && <Calendar className="inline w-3 h-3 text-green-500 ml-0.5" />}
              {highlight.includes('email') && <Mail className="inline w-3 h-3 text-purple-500 ml-0.5" />}
              {highlight.includes('tier') && <Crown className="inline w-3 h-3 text-amber-500 ml-0.5" />}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

// ============================================
// CONFIDENCE BADGE COMPONENT
// ============================================

function ConfidenceBadge({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
      checked ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {checked ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {label}
    </div>
  )
}

// ============================================
// STEP INDICATOR COMPONENT
// ============================================

function StepIndicator({ 
  step, 
  label, 
  status, 
  isActive 
}: { 
  step: number; 
  label: string; 
  status: 'pending' | 'active' | 'complete'; 
  isActive: boolean 
}) {
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg transition-all ${
      status === 'complete' ? 'bg-green-50 border border-green-200' :
      status === 'active' ? 'bg-primary-50 border border-primary-200' :
      'bg-gray-50 border border-gray-200 opacity-60'
    }`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
        status === 'complete' ? 'bg-green-500 text-white' :
        status === 'active' ? 'bg-primary-500 text-white' :
        'bg-gray-300 text-gray-600'
      }`}>
        {status === 'complete' ? <Check className="w-4 h-4" /> : step}
      </div>
      <span className={`text-sm font-medium ${
        status === 'complete' ? 'text-green-700' :
        status === 'active' ? 'text-primary-700' :
        'text-gray-500'
      }`}>{label}</span>
    </div>
  )
}

// ============================================
// GENERATION PROGRESS COMPONENT
// ============================================

function GenerationProgress({ currentStep, mode, inputMode }: { currentStep: GenerationStep; mode: GenerationMode; inputMode: InputMode }) {
  const t = useTranslations('whatsappParser')
  const stepIndex = GENERATION_STEPS.findIndex(s => s.key === currentStep)

  const stepLabels: Record<string, string> = {
    'creating-client': t('creatingClientProfile'),
    'checking-suppliers': t('checkingSuppliers'),
    'building-route': t('buildingRoute'),
    'calculating-margins': t('calculatingMargins'),
    'finalizing': t('finalizing'),
  }

  const displaySteps = mode === 'edit'
    ? GENERATION_STEPS.filter(s => s.key !== 'calculating-margins')
    : GENERATION_STEPS

  return (
    <div className="space-y-3 p-4 bg-primary-50 rounded-lg border border-primary-200">
      <div className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
        <span className="text-sm font-semibold text-primary-700">
          {mode === 'edit' ? t('generatingDraft') : t('generatingItinerary')}
        </span>
      </div>
      <div className="space-y-2">
        {displaySteps.map((step, idx) => {
          const originalIndex = GENERATION_STEPS.findIndex(s => s.key === step.key)
          return (
            <div key={step.key} className="flex items-center gap-2">
              {originalIndex < stepIndex ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : originalIndex === stepIndex ? (
                <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={`text-xs ${originalIndex <= stepIndex ? 'text-gray-700' : 'text-gray-400'}`}>
                {stepLabels[step.key] || step.label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2 text-xs text-primary-600 mt-2">
        {inputMode === 'structured' ? (
          <><ListChecks className="w-3 h-3" /> {t('followingYourItinerary')}</>
        ) : (
          <><Wand2 className="w-3 h-3" /> {t('aiCreatingItinerary')}</>
        )}
      </div>
      {mode === 'edit' && (
        <p className="text-xs text-primary-600">
          ✏️ {t('editBeforePricing')}
        </p>
      )}
    </div>
  )
}

// ============================================
// CLIENT CONFIRMATION MODAL
// ============================================

function ClientConfirmationModal({
  extractedData,
  phoneNumber,
  tier,
  onConfirm,
  onCancel,
  isCreating
}: {
  extractedData: ExtractedData
  phoneNumber: string | null
  tier: string
  onConfirm: (editedData: Partial<ExtractedData>) => void
  onCancel: () => void
  isCreating: boolean
}) {
  const t = useTranslations('whatsappParser')
  const [editMode, setEditMode] = useState(false)
  const [editedData, setEditedData] = useState({
    client_name: extractedData.client_name || '',
    client_email: extractedData.client_email || '',
    client_phone: extractedData.client_phone || phoneNumber || '',
    nationality: extractedData.nationality || 'Unknown'
  })

  const tierColor = getTierColor(tier)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className={`px-6 py-4 ${tierColor.bg} border-b ${tierColor.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${tierColor.bg} border-2 ${tierColor.border} flex items-center justify-center`}>
              <UserPlus className={`w-5 h-5 ${tierColor.text}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('confirmNewClient')}</h3>
              <p className="text-sm text-gray-600">{t('clientWillBeAdded')}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              <Edit3 className="w-3 h-3" />
              {editMode ? t('doneEditing') : t('editDetails')}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('fullNameRequired')}</label>
              {editMode ? (
                <input
                  type="text"
                  value={editedData.client_name}
                  onChange={(e) => setEditedData({ ...editedData, client_name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('enterClientName')}
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">
                    {editedData.client_name || <span className="text-red-500">{t('nameRequired')}</span>}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('email')}</label>
              {editMode ? (
                <input
                  type="email"
                  value={editedData.client_email}
                  onChange={(e) => setEditedData({ ...editedData, client_email: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="email@example.com"
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{editedData.client_email || t('notProvided')}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('phone')}</label>
              {editMode ? (
                <input
                  type="tel"
                  value={editedData.client_phone}
                  onChange={(e) => setEditedData({ ...editedData, client_phone: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="+20 115 801 1600"
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{editedData.client_phone || t('notProvided')}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('nationality')}</label>
              {editMode ? (
                <input
                  type="text"
                  value={editedData.nationality}
                  onChange={(e) => setEditedData({ ...editedData, nationality: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., Spanish, Japanese"
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{editedData.nationality || 'Unknown'}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`p-3 rounded-lg ${tierColor.bg} border ${tierColor.border}`}>
            <div className="flex items-center gap-2">
              <Crown className={`w-4 h-4 ${tierColor.text}`} />
              <span className={`text-sm font-semibold ${tierColor.text}`}>
                {t('tierClient', { tier: tier.charAt(0).toUpperCase() + tier.slice(1) })}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isCreating}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => onConfirm(editedData)}
            disabled={isCreating || !editedData.client_name.trim()}
            className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{t('creating')}</>
            ) : (
              <><UserPlus className="w-4 h-4" />{t('createClientAndGenerate')}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// NEW: INPUT MODE SELECTOR COMPONENT
// ============================================

function InputModeSelector({
  mode,
  onChange,
  autoDetected,
  confidence,
  signals,
  extractedDaysCount
}: {
  mode: InputMode
  onChange: (mode: InputMode) => void
  autoDetected: InputMode | null
  confidence: number
  signals: string[]
  extractedDaysCount: number
}) {
  const t = useTranslations('whatsappParser')
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          {t('inputType')}
        </h3>
        {autoDetected && (
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <Info className="w-3 h-3" />
            {showDetails ? t('hide') : t('why')}
          </button>
        )}
      </div>

      {/* Auto-detection banner */}
      {autoDetected && (
        <div className={`mb-3 p-2 rounded-lg text-xs ${
          autoDetected === 'structured'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          <div className="flex items-center gap-2">
            {autoDetected === 'structured' ? (
              <><ListChecks className="w-3 h-3" /> {t('detectedStructured', { confidence })}</>
            ) : (
              <><Wand2 className="w-3 h-3" /> {t('detectedGeneral')}</>
            )}
          </div>
          {showDetails && signals.length > 0 && (
            <div className="mt-2 pt-2 border-t border-current/20">
              <p className="font-medium mb-1">{t('detectionSignals')}</p>
              <ul className="space-y-0.5">
                {signals.map((signal, idx) => (
                  <li key={idx}>• {signal}</li>
                ))}
              </ul>
              {extractedDaysCount > 0 && (
                <p className="mt-1 font-medium">📅 {t('daysExtracted', { count: extractedDaysCount })}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Creative / General Request */}
        <button
          type="button"
          onClick={() => onChange('creative')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'creative'
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'creative' ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <Wand2 className={`w-4 h-4 ${mode === 'creative' ? 'text-blue-600' : 'text-gray-500'}`} />
            </div>
            <span className={`text-sm font-semibold ${mode === 'creative' ? 'text-blue-700' : 'text-gray-700'}`}>
              {t('letAICreate')}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            {t('letAICreateDesc')}
          </p>
        </button>

        {/* Structured / Follow Provided */}
        <button
          type="button"
          onClick={() => onChange('structured')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'structured'
              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'structured' ? 'bg-emerald-100' : 'bg-gray-100'
            }`}>
              <ListChecks className={`w-4 h-4 ${mode === 'structured' ? 'text-emerald-600' : 'text-gray-500'}`} />
            </div>
            <span className={`text-sm font-semibold ${mode === 'structured' ? 'text-emerald-700' : 'text-gray-700'}`}>
              {t('followMyPlan')}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            {t('followMyPlanDesc')}
          </p>
        </button>
      </div>

      {/* Warning if mismatched */}
      {autoDetected && mode !== autoDetected && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            {mode === 'structured'
              ? t('mismatchWarningStructured')
              : t('mismatchWarningCreative')
            }
          </p>
        </div>
      )}

      {/* Info box */}
      <div className={`mt-3 p-3 rounded-lg text-xs ${
        mode === 'structured'
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          : 'bg-blue-50 border border-blue-200 text-blue-700'
      }`}>
        {mode === 'structured' ? (
          <p>
            <strong>📋 {t('followMyPlan')}:</strong> {t('followPlanInfo')}
          </p>
        ) : (
          <p>
            <strong>✨ {t('letAICreate')}:</strong> {t('letAICreateInfo')}
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================
// GENERATION MODE SELECTOR COMPONENT
// ============================================

function GenerationModeSelector({
  mode,
  onChange
}: {
  mode: GenerationMode;
  onChange: (mode: GenerationMode) => void
}) {
  const t = useTranslations('whatsappParser')

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Settings className="w-4 h-4 text-gray-500" />
        {t('generationMode')}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('edit')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'edit'
              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'edit' ? 'bg-primary-100' : 'bg-gray-100'
            }`}>
              <Pencil className={`w-4 h-4 ${mode === 'edit' ? 'text-primary-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <span className={`text-sm font-semibold ${mode === 'edit' ? 'text-primary-700' : 'text-gray-700'}`}>
                {t('editFirst')}
              </span>
              {mode === 'edit' && (
                <span className="ml-2 px-1.5 py-0.5 bg-primary-500 text-white text-[10px] rounded font-bold">
                  {t('recommended')}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            {t('editFirstDesc')}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onChange('quick')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'quick'
              ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'quick' ? 'bg-amber-100' : 'bg-gray-100'
            }`}>
              <Zap className={`w-4 h-4 ${mode === 'quick' ? 'text-amber-600' : 'text-gray-500'}`} />
            </div>
            <span className={`text-sm font-semibold ${mode === 'quick' ? 'text-amber-700' : 'text-gray-700'}`}>
              {t('quickGenerate')}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            {t('quickGenerateDesc')}
          </p>
        </button>
      </div>
    </div>
  )
}

// ============================================
// EXTRACTED DAYS PREVIEW COMPONENT
// ============================================

function ExtractedDaysPreview({ days }: { days: ExtractedDay[] }) {
  const t = useTranslations('whatsappParser')
  const [expanded, setExpanded] = useState(false)

  if (!days || days.length === 0) return null

  const displayDays = expanded ? days : days.slice(0, 3)

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          {t('extractedDayByDay')}
        </h4>
        <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
          {days.length} {t('days')}
        </span>
      </div>

      <div className="space-y-2">
        {displayDays.map((day, idx) => (
          <div
            key={idx}
            className={`p-2 rounded-lg text-xs ${
              day.is_transfer_only || day.is_arrival || day.is_departure
                ? 'bg-white/50 border border-emerald-200'
                : 'bg-white border border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-700">
                {day.date_display || `Day ${day.day_number}`}: {day.title || day.city}
              </span>
              <div className="flex gap-1">
                {day.is_arrival && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">{t('arrival')}</span>}
                {day.is_departure && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]">{t('departure')}</span>}
                {day.is_transfer_only && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{t('transfer')}</span>}
                {day.guide_required && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">{t('guide')}</span>}
              </div>
            </div>
            {day.attractions && day.attractions.length > 0 && (
              <p className="text-gray-600 mt-1">
                📍 {day.attractions.join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>

      {days.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" /> {t('showLess')}</>
          ) : (
            <><ChevronDown className="w-3 h-3" /> {t('showMoreDays', { count: days.length - 3 })}</>
          )}
        </button>
      )}
    </div>
  )
}

// ============================================
// MAIN EXPORT WITH SUSPENSE WRAPPER
// ============================================

export default function WhatsAppParserPage() {
  const t = useTranslations('whatsappParser')

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">{t('loadingParser')}</p>
        </div>
      </div>
    }>
      <WhatsAppParserContent />
    </Suspense>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

function WhatsAppParserContent() {
  const t = useTranslations('whatsappParser')
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const preSelectedClientId = searchParams?.get('clientId')
  const conversationParam = searchParams?.get('conversation')
  const phoneParam = searchParams?.get('phone')
  const emailParam = searchParams?.get('email')

  // ============================================
  // STATE
  // ============================================

  const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  const [conversation, setConversation] = useState('')
  const [parsedMessages, setParsedMessages] = useState<ReturnType<typeof parseConversation>>([])
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedTier, setSelectedTier] = useState<string>('standard')
  // UPDATED: Default to land-package
  const [packageType, setPackageType] = useState<PackageType>('land-package')

  const [generationMode, setGenerationMode] = useState<GenerationMode>('edit')
  
  // NEW: Input mode state
  const [inputMode, setInputMode] = useState<InputMode>('creative')
  const [autoDetectedMode, setAutoDetectedMode] = useState<InputMode | null>(null)

  const [existingClients, setExistingClients] = useState<ExistingClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientStep, setClientStep] = useState<ClientStep>('pending')
  const [showClientConfirmation, setShowClientConfirmation] = useState(false)
  const [isCreatingClient, setIsCreatingClient] = useState(false)

  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle')
  const [generatedItinerary, setGeneratedItinerary] = useState<any>(null)

  const [fromInbox, setFromInbox] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [senderEmail, setSenderEmail] = useState<string | null>(null)

  // B2B Partner state
  const [b2bPartners, setB2bPartners] = useState<B2BPartner[]>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null)
  const [isB2BMode, setIsB2BMode] = useState(false)

  // Add New Partner state
  const [showAddPartner, setShowAddPartner] = useState(false)
  const [newPartnerName, setNewPartnerName] = useState('')
  const [newPartnerCode, setNewPartnerCode] = useState('')
  const [newPartnerCommission, setNewPartnerCommission] = useState('10')
  const [isCreatingPartner, setIsCreatingPartner] = useState(false)

  const itinerarySuccessRef = useRef<HTMLDivElement>(null)

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const step1Complete = !!extractedData
  const step2Complete = step1Complete && !!selectedTier && !!packageType
  const step3Complete = step2Complete && (clientStep === 'confirmed' || clientStep === 'existing-selected')
  const canGenerate = step2Complete && extractedData?.client_name?.trim()

  const getStepStatus = (step: number): 'pending' | 'active' | 'complete' => {
    if (step === 1) return extractedData ? 'complete' : (isAnalyzing ? 'active' : 'pending')
    if (step === 2) return step1Complete ? (step2Complete ? 'complete' : 'active') : 'pending'
    if (step === 3) return step2Complete ? (step3Complete ? 'complete' : 'active') : 'pending'
    if (step === 4) return generatedItinerary ? 'complete' : (isGenerating ? 'active' : 'pending')
    return 'pending'
  }

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setPreferencesLoaded(true); return }

        const { data } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (data) {
          const prefs: UserPreferences = {
            default_cost_mode: data.default_cost_mode || 'auto',
            default_tier: data.default_tier || 'standard',
            default_margin_percent: data.default_margin_percent || 25,
            default_currency: data.default_currency || 'USD'
          }
          setUserPreferences(prefs)
          setSelectedTier(prefs.default_tier)
        }
      } catch (err) {
        console.error('Error loading preferences:', err)
      } finally {
        setPreferencesLoaded(true)
      }
    }
    loadUserPreferences()
  }, [])

  useEffect(() => {
    if (conversationParam) {
      try {
        const isBase64 = new URLSearchParams(window.location.search).get("encoded") === "base64"
        const currentEmailParam = new URLSearchParams(window.location.search).get("email")
        let decoded: string

        if (isBase64) {
          // Convert URL-safe base64 back to standard base64
          let base64 = conversationParam.replace(/-/g, '+').replace(/_/g, '/')
          // Add padding if needed
          while (base64.length % 4) {
            base64 += '='
          }
          // Proper Unicode base64 decoding
          const binaryString = atob(base64)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          decoded = new TextDecoder('utf-8').decode(bytes)
        } else {
          decoded = decodeURIComponent(conversationParam)
        }

        // If we have sender email from headers, prepend it to the conversation
        // so the AI can see it explicitly
        if (currentEmailParam) {
          decoded = `[Sender Email: ${currentEmailParam}]\n\n${decoded}`
        }

        setConversation(decoded)
        setParsedMessages(parseConversation(decoded))
        setFromInbox(true)
      } catch (e) {
        console.error('Error decoding conversation:', e)
        setConversation(conversationParam)
        setParsedMessages(parseConversation(conversationParam))
        setFromInbox(true)
      }
    }
    if (phoneParam) setPhoneNumber(phoneParam)
    if (emailParam) setSenderEmail(emailParam)
  }, [conversationParam, phoneParam, emailParam])

  useEffect(() => {
    if (preSelectedClientId && !selectedClientId) {
      setSelectedClientId(preSelectedClientId)
      setClientStep('existing-selected')
    }
  }, [preSelectedClientId])

  useEffect(() => {
    if (conversation) {
      setParsedMessages(parseConversation(conversation))
    }
  }, [conversation])

  // Fetch B2B partners when B2B mode is enabled
  useEffect(() => {
    if (isB2BMode && b2bPartners.length === 0) {
      const fetchPartners = async () => {
        try {
          const response = await fetch('/api/b2b/partners')
          const data = await response.json()
          if (data.success && data.data) {
            setB2bPartners(data.data.map((p: any) => ({
              id: p.id,
              company_name: p.company_name,
              partner_code: p.partner_code,
              commission_percent: p.default_margin_percent || 10
            })))
          }
        } catch (err) {
          console.error('Error fetching B2B partners:', err)
        }
      }
      fetchPartners()
    }
  }, [isB2BMode])

  // ============================================
  // HANDLERS
  // ============================================

  // Create new B2B partner
  const handleCreatePartner = async () => {
    if (!newPartnerName.trim()) return

    setIsCreatingPartner(true)
    try {
      const response = await fetch('/api/b2b/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: newPartnerName.trim(),
          partner_code: newPartnerCode.trim() || newPartnerName.trim().substring(0, 3).toUpperCase(),
          default_margin_percent: parseFloat(newPartnerCommission) || 10,
          is_active: true
        })
      })

      const data = await response.json()
      if (data.success && data.data) {
        const newPartner: B2BPartner = {
          id: data.data.id,
          company_name: data.data.company_name,
          partner_code: data.data.partner_code,
          commission_percent: data.data.default_margin_percent || 10
        }
        setB2bPartners(prev => [...prev, newPartner])
        setSelectedPartnerId(newPartner.id)
        setShowAddPartner(false)
        setNewPartnerName('')
        setNewPartnerCode('')
        setNewPartnerCommission('10')
      }
    } catch (err) {
      console.error('Error creating partner:', err)
    } finally {
      setIsCreatingPartner(false)
    }
  }

  const loadSample = () => {
    setConversation(SAMPLE_CONVERSATION)
    setParsedMessages(parseConversation(SAMPLE_CONVERSATION))
    setExtractedData(null)
    setGeneratedItinerary(null)
    setError(null)
    setClientStep('pending')
    setSelectedClientId(null)
    setSelectedTier(userPreferences.default_tier)
    setPackageType('land-package')
    setInputMode('creative')
    setAutoDetectedMode(null)
  }

  const analyzeConversation = async () => {
    if (!conversation.trim()) {
      setError('Please paste a WhatsApp conversation')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setExtractedData(null)
    setExistingClients([])
    setSelectedClientId(preSelectedClientId || null)
    setClientStep(preSelectedClientId ? 'existing-selected' : 'pending')

    try {
      const response = await fetch('/api/ai/parse-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to analyze conversation')

      // Use email from headers if AI didn't extract one
      if (senderEmail && !result.data.client_email) {
        result.data.client_email = senderEmail
      }

      // Use phone from params if AI didn't extract one
      if (phoneNumber && !result.data.client_phone) {
        result.data.client_phone = phoneNumber
      }

      const aiDetectedTier = mapBudgetToTier(result.data.budget_level || '')
      const finalTier = result.data.budget_level ? aiDetectedTier : userPreferences.default_tier

      result.data.tier = finalTier
      setSelectedTier(finalTier)

      // Set package type from AI detection
      if (result.data.package_type) {
        // Valid package types for this component
        const validTypes: PackageType[] = ['day-trips', 'tours-only', 'land-package', 'cruise-package', 'cruise-land']
        if (validTypes.includes(result.data.package_type as PackageType)) {
          setPackageType(result.data.package_type as PackageType)
        }
      }

      setExtractedData(result.data)

      // NEW: Set input mode based on detection
      if (result.data.is_structured_input) {
        setInputMode('structured')
        setAutoDetectedMode('structured')
      } else {
        setInputMode('creative')
        setAutoDetectedMode('creative')
      }

      // Search for existing clients
      if (result.data.client_email || result.data.client_phone) {
        try {
          const { data: clients } = await supabase
            .from('clients')
            .select('id, client_code, first_name, last_name, email, phone')
            .or(`email.eq.${result.data.client_email},phone.eq.${result.data.client_phone}`)
            .limit(5)

          if (clients && clients.length > 0) {
            setExistingClients(clients.map(c => ({
              ...c,
              full_name: `${c.first_name || ''} ${c.last_name || ''}`.trim()
            })))
          }
        } catch (e) {
          console.warn('Could not search for existing clients:', e)
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const selectExistingClient = (clientId: string) => {
    setSelectedClientId(clientId)
    setClientStep('existing-selected')
  }

  const openClientConfirmation = () => {
    setShowClientConfirmation(true)
  }

  const handleConfirmClient = async (editedData: Partial<ExtractedData>) => {
    if (!extractedData) return

    setIsCreatingClient(true)
    setError(null)

    try {
      const clientName = (editedData.client_name || extractedData.client_name)?.trim()
      if (!clientName) {
        setError('Client name is required')
        setIsCreatingClient(false)
        return
      }

      const clientEmail = editedData.client_email || extractedData.client_email || null
      const clientPhone = editedData.client_phone || extractedData.client_phone || phoneNumber || null
      const clientNationality = editedData.nationality || extractedData.nationality || 'Unknown'

      // Build the updated data BEFORE any async operations
      // This ensures the correct values are passed to generateItinerary
      const updatedExtractedData: ExtractedData = {
        ...extractedData,
        client_name: clientName,
        client_email: clientEmail || '',
        client_phone: clientPhone || '',
        nationality: clientNationality
      }

      let clientId: string | null = null

      // Check if client exists
      if (clientEmail || clientPhone) {
        let query = supabase.from('clients').select('id, first_name, last_name, email, phone')
        
        if (clientEmail && clientPhone) {
          query = query.or(`email.eq.${clientEmail},phone.eq.${clientPhone}`)
        } else if (clientEmail) {
          query = query.eq('email', clientEmail)
        } else if (clientPhone) {
          query = query.eq('phone', clientPhone)
        }
        
        const { data: existingClients } = await query.limit(1)
        
        if (existingClients && existingClients.length > 0) {
          clientId = existingClients[0].id
          setSelectedClientId(clientId)
          setClientStep('existing-selected')
          setShowClientConfirmation(false)
          setExtractedData(updatedExtractedData)

          // Pass the updated data directly to avoid state timing issues
          setTimeout(() => generateItineraryWithData(clientId!, updatedExtractedData), 100)
          return
        }
      }

      // Create new client
      const nameParts = clientName.split(' ')
      const firstName = nameParts[0] || 'Unknown'
      const lastName = nameParts.slice(1).join(' ') || firstName

      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: clientEmail,
          phone: clientPhone,
          nationality: clientNationality,
          status: 'prospect',
          client_type: extractedData.num_adults > 2 ? 'family' : 'individual',
          passport_type: 'other',
          preferred_language: extractedData.conversation_language || 'English',
          client_source: 'whatsapp',
          vip_status: selectedTier === 'luxury',
          preferences: {
            accommodation_type: selectedTier === 'luxury' ? '5-star' : selectedTier === 'deluxe' ? '4-star' : '3-star',
            tour_pace: 'moderate',
            interests: extractedData.interests?.join(', ') || '',
            tier: selectedTier
          },
          note: `WhatsApp inquiry: ${extractedData.tour_name}. ${extractedData.cities?.join(', ') || 'Egypt'}. ${extractedData.num_adults} adults.`,
          link_whatsapp_phone: phoneNumber
        })
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        if (result.error?.includes('duplicate') || result.error?.includes('already exists')) {
          if (clientEmail) {
            const { data: existingByEmail } = await supabase
              .from('clients')
              .select('id')
              .eq('email', clientEmail)
              .single()
            
            if (existingByEmail) {
              setSelectedClientId(existingByEmail.id)
              setClientStep('existing-selected')
              setShowClientConfirmation(false)
              setExtractedData(updatedExtractedData)
              setTimeout(() => generateItineraryWithData(existingByEmail.id, updatedExtractedData), 100)
              return
            }
          }
        }
        throw new Error(result.error || 'Failed to create client')
      }

      setSelectedClientId(result.data.id)
      setClientStep('confirmed')
      setShowClientConfirmation(false)
      setExtractedData(updatedExtractedData)

      // Pass the updated data directly to avoid state timing issues
      setTimeout(() => generateItineraryWithData(result.data.id, updatedExtractedData), 100)

    } catch (err: any) {
      setError(err.message || 'Failed to create client')
    } finally {
      setIsCreatingClient(false)
    }
  }

  // Generate itinerary with data passed directly (avoids state timing issues)
  const generateItineraryWithData = async (clientId: string, data: ExtractedData) => {
    setIsGenerating(true)
    setError(null)
    setGenerationStep('checking-suppliers')

    try {
      await new Promise(r => setTimeout(r, 800))
      setGenerationStep('building-route')
      await new Promise(r => setTimeout(r, 600))
      
      if (generationMode === 'quick') {
        setGenerationStep('calculating-margins')
        await new Promise(r => setTimeout(r, 500))
      }
      
      setGenerationStep('finalizing')

      // Get selected partner details for commission
      const selectedPartner = selectedPartnerId
        ? b2bPartners.find(p => p.id === selectedPartnerId)
        : null

      const response = await fetch('/api/ai/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          client_id: clientId,
          tier: selectedTier,
          budget_level: selectedTier,
          package_type: packageType,
          cost_mode: userPreferences.default_cost_mode,
          margin_percent: userPreferences.default_margin_percent,
          currency: userPreferences.default_currency,
          skip_pricing: generationMode === 'edit',
          input_mode_override: inputMode,
          is_structured_input: data.is_structured_input,
          extracted_days: data.extracted_days,
          raw_itinerary: data.raw_itinerary,
          // B2B partner fields
          partner_id: selectedPartnerId,
          partner_commission_percent: selectedPartner?.commission_percent || 0,
          source: selectedPartnerId ? 'b2b_custom' : 'b2c_whatsapp'
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to generate itinerary')

      setGenerationStep('complete')
      setGeneratedItinerary(result.data)

      if (generationMode === 'edit' && result.data?.redirect_to) {
        setTimeout(() => {
          router.push(result.data.redirect_to)
        }, 500)
        return
      }

      setTimeout(() => {
        itinerarySuccessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)

    } catch (err: any) {
      setError(err.message || 'Generation failed')
      setGenerationStep('idle')
    } finally {
      setIsGenerating(false)
    }
  }

  // Generate itinerary using current extractedData state (for manual trigger)
  const generateItinerary = async (clientIdOverride?: string) => {
    if (!extractedData) return

    const clientIdToUse = clientIdOverride || selectedClientId

    if (!clientIdToUse) {
      openClientConfirmation()
      return
    }

    // Use the version that takes data directly
    await generateItineraryWithData(clientIdToUse, extractedData)
  }

  // ============================================
  // RENDER
  // ============================================

  if (!preferencesLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const tierColor = getTierColor(selectedTier)

  return (
    <div className="min-h-screen bg-gray-50">
      {showClientConfirmation && extractedData && (
        <ClientConfirmationModal
          extractedData={extractedData}
          phoneNumber={phoneNumber}
          tier={selectedTier}
          onConfirm={handleConfirmClient}
          onCancel={() => setShowClientConfirmation(false)}
          isCreating={isCreatingClient}
        />
      )}

      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {fromInbox && (
                <Link href="/whatsapp-inbox" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              )}
              <div className="p-2 bg-primary-100 rounded-lg">
                <MessageSquare className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
                <p className="text-xs text-gray-500">{t('subtitle')}</p>
              </div>
            </div>

            <Link href="/settings?tab=preferences" className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
              <Settings className="w-4 h-4" />
              <span className={`font-medium ${tierColor.text}`}>{selectedTier}</span>
              <span>• {userPreferences.default_currency}</span>
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <StepIndicator step={1} label={t('stepAnalyze')} status={getStepStatus(1)} isActive={!extractedData} />
            <StepIndicator step={2} label={t('stepConfigure')} status={getStepStatus(2)} isActive={step1Complete && !step2Complete} />
            <StepIndicator step={3} label={t('stepClient')} status={getStepStatus(3)} isActive={step2Complete && !step3Complete} />
            <StepIndicator step={4} label={t('stepGenerate')} status={getStepStatus(4)} isActive={step3Complete} />
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-12 gap-4">

          {/* LEFT COLUMN */}
          <div className="col-span-5 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#25D366]" />
                  <h2 className="text-sm font-semibold text-gray-900">{t('conversation')}</h2>
                </div>
                {!fromInbox && (
                  <button onClick={loadSample} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                    {t('loadSample')}
                  </button>
                )}
              </div>

              {parsedMessages.length > 0 && !isAnalyzing ? (
                <div className="p-4 bg-[#E5DDD5] max-h-[400px] overflow-y-auto">
                  {parsedMessages.map((msg, idx) => (
                    <ChatBubble key={idx} sender={msg.sender} message={msg.message} highlight={msg.highlight} />
                  ))}
                </div>
              ) : (
                <textarea
                  value={conversation}
                  onChange={(e) => setConversation(e.target.value)}
                  placeholder={t('pasteConversationPlaceholder')}
                  className="w-full h-80 px-4 py-3 text-sm border-0 focus:ring-0 resize-none font-mono bg-gray-50"
                />
              )}

              <div className="px-4 py-3 border-t border-gray-100">
                <button
                  onClick={analyzeConversation}
                  disabled={isAnalyzing || !conversation.trim()}
                  className="w-full px-4 py-2.5 text-sm bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('analyzingWithAI')}</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> {extractedData ? t('reAnalyze') : t('analyzeWithAI')}</>
                  )}
                </button>
              </div>
            </div>

            {extractedData && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('readinessCheck')}</h3>
                <div className="flex flex-wrap gap-2">
                  <ConfidenceBadge label={t('dataExtracted')} checked={step1Complete} />
                  <ConfidenceBadge label={`${t('tier')}: ${selectedTier}`} checked={true} />
                  <ConfidenceBadge label={`${t('language')}: ${extractedData.conversation_language}`} checked={!!extractedData.conversation_language} />
                  <ConfidenceBadge label={t('clientConfirmed')} checked={step3Complete} />
                  <ConfidenceBadge
                    label={inputMode === 'structured' ? t('followPlan') : t('aiCreate')}
                    checked={true}
                  />
                </div>
              </div>
            )}

            {/* NEW: Extracted Days Preview */}
            {extractedData?.extracted_days && extractedData.extracted_days.length > 0 && inputMode === 'structured' && (
              <ExtractedDaysPreview days={extractedData.extracted_days} />
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="col-span-7 space-y-4">

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">{t('error')}</p>
                  <p className="text-xs text-red-600 mt-1">{error}</p>
                </div>
              </div>
            )}

            {extractedData && (
              <>
                {/* Extracted Information */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="w-4 h-4 text-green-500" />
                      <h2 className="text-sm font-semibold text-gray-900">{t('extractedInformation')}</h2>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{t('claudeAIEditable')}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('client')}</h4>
                      <div>
                        <label className="text-xs text-gray-500">{t('name')} <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={extractedData.client_name}
                          onChange={(e) => setExtractedData({ ...extractedData, client_name: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder={t('enterName')}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('email')}</label>
                        <input
                          type="email"
                          value={extractedData.client_email}
                          onChange={(e) => setExtractedData({ ...extractedData, client_email: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('phone')}</label>
                        <input
                          type="tel"
                          value={extractedData.client_phone || phoneNumber || ''}
                          onChange={(e) => setExtractedData({ ...extractedData, client_phone: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('tripDetails')}</h4>
                      <div>
                        <label className="text-xs text-gray-500">{t('tour')}</label>
                        <div className="mt-1 px-3 py-2 text-sm bg-gray-50 rounded-lg text-gray-700">{extractedData.tour_name}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('date')}</label>
                        <input
                          type="date"
                          value={extractedData.start_date}
                          onChange={(e) => setExtractedData({ ...extractedData, start_date: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t('travelers')}</label>
                        <div className="mt-1 px-3 py-2 text-sm bg-gray-50 rounded-lg text-gray-700">
                          {extractedData.num_adults} {t('adults')}{extractedData.num_children > 0 && `, ${extractedData.num_children} ${t('children')}`}
                          {extractedData.duration_days > 1 && ` • ${extractedData.duration_days} ${t('days')}`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NEW: Input Mode Selector */}
                <InputModeSelector 
                  mode={inputMode}
                  onChange={setInputMode}
                  autoDetected={autoDetectedMode}
                  confidence={extractedData.structure_confidence || 0}
                  signals={extractedData.structure_signals || []}
                  extractedDaysCount={extractedData.extracted_days?.length || 0}
                />

                {/* Tier Selection */}
                <div className={`bg-white rounded-xl border-2 shadow-sm p-4 ${tierColor.border}`}>
                  {extractedData.budget_level && (
                    <div className={`mb-3 p-2 rounded-lg ${tierColor.bg} ${tierColor.text} text-sm`}>
                      <span className="font-medium">📊 {t('aiRecommendation')}</span>
                      <span className="font-bold ml-1">{selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)}</span>
                    </div>
                  )}

                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    {t('serviceTier')}
                  </h3>

                  <div className="grid grid-cols-4 gap-2">
                    {TIER_OPTIONS.map((tier) => {
                      const isSelected = selectedTier === tier.value
                      const color = getTierColor(tier.value)
                      const tierLabels: Record<string, { label: string; desc: string }> = {
                        budget: { label: t('tierBudget'), desc: t('tierBudgetDesc') },
                        standard: { label: t('tierStandard'), desc: t('tierStandardDesc') },
                        deluxe: { label: t('tierDeluxe'), desc: t('tierDeluxeDesc') },
                        luxury: { label: t('tierLuxury'), desc: t('tierLuxuryDesc') },
                      }
                      return (
                        <button
                          type="button"
                          key={tier.value}
                          onClick={() => setSelectedTier(tier.value)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            isSelected
                              ? `${color.border} ${color.bg} ring-2 ${color.ring} ring-offset-1`
                              : 'border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            {tier.icon && <tier.icon className={`w-4 h-4 ${color.text}`} />}
                            <span className={`text-sm font-semibold ${isSelected ? color.text : 'text-gray-600'}`}>{tierLabels[tier.value]?.label || tier.label}</span>
                          </div>
                          <p className="text-xs text-gray-500">{tierLabels[tier.value]?.desc || tier.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Package Type Selection */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary-500" />
                    {t('packageType')}
                  </h3>

                  <div className="grid grid-cols-5 gap-2">
                    {PACKAGE_TYPES.map((pkg) => {
                      const isSelected = packageType === pkg.slug
                      const pkgLabels: Record<string, { name: string; desc: string }> = {
                        'day-trips': { name: t('dayTrips'), desc: t('dayTripsDesc') },
                        'tours-only': { name: t('toursOnly'), desc: t('toursOnlyDesc') },
                        'land-package': { name: t('landPackage'), desc: t('landPackageDesc') },
                        'cruise-package': { name: t('cruisePackage'), desc: t('cruisePackageDesc') },
                        'cruise-land': { name: t('cruiseLand'), desc: t('cruiseLandDesc') },
                      }
                      return (
                        <button
                          type="button"
                          key={pkg.slug}
                          onClick={() => setPackageType(pkg.slug as PackageType)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            isSelected
                              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500 ring-offset-1'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <pkg.icon className={`w-4 h-4 ${isSelected ? 'text-primary-600' : 'text-gray-400'}`} />
                          </div>
                          <span className={`text-xs font-semibold ${isSelected ? 'text-primary-700' : 'text-gray-700'}`}>{pkgLabels[pkg.slug]?.name || pkg.name}</span>
                          <p className="text-[10px] text-gray-500 mt-0.5">{pkgLabels[pkg.slug]?.desc || pkg.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* B2B Partner Selection */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-indigo-500" />
                      {t('b2bPartner') || 'B2B Partner'}
                    </h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-gray-500">{t('linkToPartner') || 'Link to partner'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsB2BMode(!isB2BMode)
                          if (isB2BMode) {
                            setSelectedPartnerId(null)
                          }
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          isB2BMode ? 'bg-indigo-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isB2BMode ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </label>
                  </div>

                  {isB2BMode && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">
                        {t('b2bPartnerDesc') || 'Select a B2B partner (travel agency) to link this itinerary for commission tracking.'}
                      </p>

                      {!showAddPartner ? (
                        <>
                          <select
                            value={selectedPartnerId || ''}
                            onChange={(e) => setSelectedPartnerId(e.target.value || null)}
                            aria-label="Select B2B Partner"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          >
                            <option value="">{t('selectPartner') || '-- Select Partner --'}</option>
                            {b2bPartners.map((partner) => (
                              <option key={partner.id} value={partner.id}>
                                {partner.company_name} ({partner.partner_code}) - {partner.commission_percent}%
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => setShowAddPartner(true)}
                            className="w-full px-3 py-2 text-sm text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            {t('addNewPartner') || '+ Add New Partner'}
                          </button>
                        </>
                      ) : (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                          <input
                            type="text"
                            value={newPartnerName}
                            onChange={(e) => setNewPartnerName(e.target.value)}
                            placeholder={t('newPartnerName') || 'Company Name'}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newPartnerCode}
                              onChange={(e) => setNewPartnerCode(e.target.value.toUpperCase())}
                              placeholder={t('newPartnerCode') || 'Code (e.g., ABC)'}
                              maxLength={10}
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent uppercase"
                            />
                            <input
                              type="number"
                              value={newPartnerCommission}
                              onChange={(e) => setNewPartnerCommission(e.target.value)}
                              placeholder={t('newPartnerCommission') || 'Commission %'}
                              min="0"
                              max="100"
                              className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddPartner(false)
                                setNewPartnerName('')
                                setNewPartnerCode('')
                                setNewPartnerCommission('10')
                              }}
                              className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              {t('cancelAddPartner') || 'Cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={handleCreatePartner}
                              disabled={!newPartnerName.trim() || isCreatingPartner}
                              className="flex-1 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {isCreatingPartner ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                              {t('createPartner') || 'Create Partner'}
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedPartnerId && !showAddPartner && (
                        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                          <div className="flex items-center gap-2 text-sm text-indigo-700">
                            <Building2 className="w-4 h-4" />
                            <span className="font-medium">
                              {b2bPartners.find(p => p.id === selectedPartnerId)?.company_name}
                            </span>
                          </div>
                          <p className="text-xs text-indigo-600 mt-1">
                            {t('commissionRate') || 'Commission'}: {b2bPartners.find(p => p.id === selectedPartnerId)?.commission_percent}%
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {!isB2BMode && (
                    <p className="text-xs text-gray-400">
                      {t('directClientMode') || 'Direct client mode - no B2B partner linked'}
                    </p>
                  )}
                </div>

                {/* Generation Mode */}
                <GenerationModeSelector mode={generationMode} onChange={setGenerationMode} />

                {/* Client Step */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-primary-500" />
                    {t('step3ConfirmClient')}
                  </h3>

                  {existingClients.length > 0 && clientStep !== 'confirmed' && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 mb-2">⚠️ {t('possibleExistingClients')}</p>
                      <div className="space-y-2">
                        {existingClients.map((client) => (
                          <button
                            type="button"
                            key={client.id}
                            onClick={() => selectExistingClient(client.id)}
                            className={`w-full p-3 text-left rounded-lg border-2 transition-all ${
                              selectedClientId === client.id && clientStep === 'existing-selected'
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium">{client.full_name}</div>
                                <div className="text-xs text-gray-500">{client.client_code} • {client.email || client.phone}</div>
                              </div>
                              {selectedClientId === client.id && clientStep === 'existing-selected' && (
                                <CheckCircle className="w-5 h-5 text-primary-500" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {clientStep === 'confirmed' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-800">{t('clientCreatedSuccessfully')}</p>
                        <p className="text-xs text-green-600">{t('addedToCRM', { name: extractedData.client_name })}</p>
                      </div>
                    </div>
                  )}

                  {clientStep === 'existing-selected' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-blue-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">{t('existingClientSelected')}</p>
                        <p className="text-xs text-blue-600">{t('willBeLinkToItinerary')}</p>
                      </div>
                    </div>
                  )}

                  {clientStep === 'pending' && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-sm text-gray-700 mb-3">
                        {t('newClientWillBeCreated')}
                      </p>
                      <button
                        type="button"
                        onClick={openClientConfirmation}
                        className="w-full px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-primary-500 hover:text-primary-600 hover:bg-primary-50 transition-all flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        {t('reviewAndCreateClient')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <div className={`rounded-xl p-4 shadow-lg ${
                  generationMode === 'edit'
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600'
                }`}>
                  {isGenerating ? (
                    <GenerationProgress currentStep={generationStep} mode={generationMode} inputMode={inputMode} />
                  ) : (
                    <>
                      <p className="text-sm text-white/90 mb-3">
                        {step3Complete
                          ? inputMode === 'structured'
                            ? t('generateFromPlan', { count: extractedData.extracted_days?.length || 0, tier: selectedTier.toUpperCase() })
                            : t('aiWillCreate', { tier: selectedTier.toUpperCase(), packageType: packageType.replace('-', ' ') })
                          : t('pleaseConfirmClient')
                        }
                      </p>
                      <button
                        type="button"
                        onClick={() => generateItinerary()}
                        disabled={!canGenerate}
                        className={`w-full px-6 py-3 bg-white rounded-lg font-bold text-base disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md ${
                          generationMode === 'edit'
                            ? 'text-primary-700 hover:bg-primary-50'
                            : 'text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {inputMode === 'structured' ? (
                          <><ListChecks className="w-5 h-5" /> {t('generateFromPlanBtn')}</>
                        ) : generationMode === 'edit' ? (
                          <><Pencil className="w-5 h-5" /> {t('generateAndEdit')}</>
                        ) : (
                          <><Zap className="w-5 h-5" /> {t('quickGenerate')}</>
                        )}
                      </button>
                      {!canGenerate && !step3Complete && (
                        <p className="text-xs text-white/70 mt-2 text-center">
                          👆 {t('clickReviewFirst')}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Success States */}
                {generatedItinerary && generationMode === 'quick' && (
                  <div ref={itinerarySuccessRef} className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-green-800">{t('itineraryGenerated')}</h3>
                        <p className="text-sm text-green-600">
                          {generatedItinerary.itinerary_code} • {generatedItinerary.generation_mode === 'structured' ? t('followedYourPlan') : t('aiCreated')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/itineraries/${generatedItinerary.id}`)}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 flex items-center justify-center gap-2"
                      >
                        {t('viewItinerary')} <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/itineraries/${generatedItinerary.id}/edit`)}
                        className="px-4 py-2.5 border border-green-300 bg-white rounded-lg hover:bg-green-50 flex items-center gap-2 text-sm text-green-700"
                      >
                        <Pencil className="w-4 h-4" /> {t('edit')}
                      </button>
                    </div>
                  </div>
                )}

                {generatedItinerary && generationMode === 'edit' && (
                  <div ref={itinerarySuccessRef} className="bg-primary-50 border-2 border-primary-300 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
                      <div>
                        <h3 className="text-base font-bold text-primary-800">{t('draftCreated')}</h3>
                        <p className="text-sm text-primary-600">{t('redirectingToEditor')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!extractedData && !isAnalyzing && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-600 mb-1">{t('emptyStateTitle')}</h3>
                <p className="text-xs text-gray-400">
                  {t('emptyStateDesc')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}