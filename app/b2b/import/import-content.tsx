'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  Upload, FileText, Image as ImageIcon, X, Loader2,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  MapPin, Calendar, Users, Star, Crown, Sun, Map,
  Hotel, Package, Ship, Anchor, Edit3, Plus, Trash2,
  ArrowRight, ArrowLeft, Check, Eye
} from 'lucide-react'
import Link from 'next/link'

// ============================================
// TYPES
// ============================================

interface FileData {
  name: string
  type: string
  data: string  // base64
  size: number
}

interface ExtractedDay {
  day_number: number
  date: string | null
  date_display: string | null
  title: string
  city: string | null
  overnight_city: string
  is_arrival: boolean
  is_departure: boolean
  is_transfer_only: boolean
  is_free_day: boolean
  is_cruise_day: boolean
  activities: string[]
  attractions: string[]
  entrance_included: string[]
  photo_stops: string[]
  meals_mentioned: string[]
  guide_required: boolean
  transport_type: string | null
  flight_info: string | null
  hotel_name: string | null
  notes: string | null
}

interface ExtractedData {
  trip_name: string
  package_type: string
  start_date: string | null
  end_date: string | null
  duration_days: number
  num_adults: number
  num_children: number
  nationality: string
  language: string
  cities: string[]
  budget_level: string
  hotel_name: string | null
  is_structured_input: boolean
  structure_confidence: number
  extracted_days: ExtractedDay[]
  raw_itinerary: string
  source_file_type: string
}

interface B2BPartner {
  id: string
  company_name: string
  commission_percent: number
}

type WizardStep = 'upload' | 'review' | 'generating' | 'complete'
type GenerationStep = 'idle' | 'creating-client' | 'checking-suppliers' | 'building-route' | 'calculating-margins' | 'finalizing' | 'complete'

// ============================================
// CONSTANTS
// ============================================

const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp,.docx'
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_FILE_SIZE = 32 * 1024 * 1024 // 32MB per file

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', icon: null, color: 'gray' },
  { value: 'standard', label: 'Standard', icon: null, color: 'blue' },
  { value: 'deluxe', label: 'Deluxe', icon: Star, color: 'purple' },
  { value: 'luxury', label: 'Luxury', icon: Crown, color: 'amber' },
]

const PACKAGE_TYPES = [
  { slug: 'day-trips', name: 'Day Trips', icon: Sun, color: 'amber' },
  { slug: 'tours-only', name: 'Tours Only', icon: Map, color: 'blue' },
  { slug: 'land-package', name: 'Land Package', icon: Hotel, color: 'emerald' },
  { slug: 'full-package', name: 'Full Package', icon: Package, color: 'primary' },
  { slug: 'cruise-package', name: 'Cruise Package', icon: Ship, color: 'cyan' },
  { slug: 'cruise-land', name: 'Cruise + Land', icon: Ship, color: 'indigo' },
  { slug: 'shore-excursions', name: 'Shore Excursions', icon: Anchor, color: 'teal' },
]

const GENERATION_STEPS: { key: GenerationStep; label: string }[] = [
  { key: 'creating-client', label: 'Preparing template...' },
  { key: 'checking-suppliers', label: 'Mapping days and attractions...' },
  { key: 'building-route', label: 'Creating tour template...' },
  { key: 'finalizing', label: 'Finalizing...' },
]

// Supported languages for import (excluding Arabic per business rule)
// Defined inline to avoid importing lib/translate.ts which has server-only OpenAI dependency
const IMPORT_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
]

// ============================================
// HELPERS
// ============================================

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type: string) {
  if (type === 'application/pdf') return FileText
  if (type.startsWith('image/')) return ImageIcon
  return FileText
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ImportContent() {
  const t = useTranslations('b2bImport')
  const router = useRouter()

  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload')

  // Upload state
  const [files, setFiles] = useState<FileData[]>([])
  const [contentLanguage, setContentLanguage] = useState('en')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Review state
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [formData, setFormData] = useState({
    trip_name: '',
    start_date: '',
    num_adults: 2,
    num_children: 0,
    tier: 'standard',
    package_type: 'land-package',
    guide_language: 'en',
    partner_id: '',
  })
  const [editingDays, setEditingDays] = useState<ExtractedDay[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set())

  // Generation state
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle')
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [createdItineraryId, setCreatedItineraryId] = useState<string | null>(null)

  // Partners
  const [partners, setPartners] = useState<B2BPartner[]>([])

  // Fetch partners on mount
  useEffect(() => {
    fetch('/api/b2b/partners')
      .then(res => res.json())
      .then(data => {
        if (data.data) setPartners(data.data)
      })
      .catch(() => {})
  }, [])

  // ============================================
  // FILE HANDLING
  // ============================================

  const handleFileSelect = useCallback(async (fileList: FileList | File[]) => {
    const newFiles: FileData[] = []
    const fileArray = Array.from(fileList)

    for (const file of fileArray) {
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        setExtractError(t('unsupportedFileType') + `: ${file.name}`)
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        setExtractError(t('fileTooLarge') + `: ${file.name}`)
        return
      }

      const base64 = await fileToBase64(file)
      newFiles.push({
        name: file.name,
        type: file.type,
        data: base64,
        size: file.size,
      })
    }

    setFiles(prev => [...prev, ...newFiles])
    setExtractError(null)
  }, [t])

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files)
    }
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  // ============================================
  // EXTRACTION
  // ============================================

  const handleExtract = async () => {
    if (files.length === 0) return

    setIsExtracting(true)
    setExtractError(null)

    try {
      const response = await fetch('/api/ai/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map(f => ({
            name: f.name,
            type: f.type,
            data: f.data,
            size: f.size,
          })),
          language: contentLanguage,
        })
      })

      // Check if response is actually JSON (not an HTML error page)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setExtractError('Server error during extraction. Please try again.')
        return
      }

      const result = await response.json()

      if (!result.success) {
        setExtractError(result.error || t('extractionFailed'))
        return
      }

      const data = result.data as ExtractedData
      setExtractedData(data)
      setEditingDays(data.extracted_days)

      // Pre-fill form data
      setFormData({
        trip_name: data.trip_name || '',
        start_date: data.start_date || '',
        num_adults: data.num_adults || 2,
        num_children: data.num_children || 0,
        tier: data.budget_level || 'standard',
        package_type: data.package_type || 'land-package',
        guide_language: data.language || 'en',
        partner_id: '',
      })

      // Expand all days initially
      setExpandedDays(new Set(data.extracted_days.map((_, i) => i)))

      setStep('review')
    } catch (err: any) {
      console.error('Extraction error:', err)
      setExtractError(err.message || t('extractionFailed'))
    } finally {
      setIsExtracting(false)
    }
  }

  // ============================================
  // GENERATION
  // ============================================

  const handleGenerate = async () => {
    if (!extractedData) return

    setStep('generating')
    setGenerationStep('creating-client')
    setGenerationError(null)

    const selectedPartner = partners.find(p => p.id === formData.partner_id)

    try {
      // Simulate step progression
      const stepInterval = setInterval(() => {
        setGenerationStep(prev => {
          const steps: GenerationStep[] = ['creating-client', 'checking-suppliers', 'building-route', 'finalizing']
          const idx = steps.indexOf(prev)
          if (idx < steps.length - 1) return steps[idx + 1]
          return prev
        })
      }, 3000)

      // Build itinerary days in the format tour_templates expects
      const templateItinerary = editingDays.map(day => ({
        day: day.day_number,
        title: day.title,
        description: day.activities?.join('. ') || '',
        meals: day.meals_mentioned || [],
        city: day.overnight_city || day.city || '',
        is_cruise_day: day.is_cruise_day || false,
      }))

      // Determine tour_type from duration
      const tourType = editingDays.length <= 1 ? 'day_tour' : 'multi_day'

      // Collect all attractions from extracted days
      const allAttractions = [...new Set(editingDays.flatMap(d => d.attractions || []))]

      // Create tour template via the templates API
      const response = await fetch('/api/tours/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: formData.trip_name,
          tour_type: tourType,
          duration_days: editingDays.length,
          duration_nights: Math.max(0, editingDays.length - 1),
          cities_covered: extractedData.cities || [],
          short_description: `${editingDays.length}-day ${extractedData.cities?.join(', ') || ''} tour`,
          highlights: allAttractions.slice(0, 10),
          main_attractions: allAttractions,
          physical_level: 'moderate',
          is_active: true,
          itinerary: templateItinerary,
          inclusions: extractedData.cities ? [`Private guided tour covering ${extractedData.cities.join(', ')}`] : [],
          exclusions: [],
          package_type: formData.package_type,
        })
      })

      clearInterval(stepInterval)

      const result = await response.json()

      if (!response.ok || !result.success) {
        setGenerationError(result.error || 'Failed to create tour template')
        setStep('review')
        return
      }

      setGenerationStep('complete')
      setCreatedItineraryId(result.data?.id)
      setStep('complete')
    } catch (err: any) {
      console.error('Generation error:', err)
      setGenerationError(err.message || 'Failed to generate itinerary')
      setStep('review')
    }
  }

  // ============================================
  // DAY EDITING
  // ============================================

  const updateDay = (index: number, updates: Partial<ExtractedDay>) => {
    setEditingDays(prev => prev.map((day, i) =>
      i === index ? { ...day, ...updates } : day
    ))
  }

  const removeDay = (index: number) => {
    setEditingDays(prev => prev.filter((_, i) => i !== index).map((day, i) => ({
      ...day,
      day_number: i + 1,
      title: day.title.replace(/Day \d+/, `Day ${i + 1}`),
    })))
  }

  const toggleDayExpanded = (index: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  // ============================================
  // RESET
  // ============================================

  const handleReset = () => {
    setStep('upload')
    setFiles([])
    setExtractedData(null)
    setEditingDays([])
    setFormData({
      trip_name: '',
      start_date: '',
      num_adults: 2,
      num_children: 0,
      tier: 'standard',
      package_type: 'land-package',
      guide_language: 'en',
      partner_id: '',
    })
    setExtractError(null)
    setGenerationError(null)
    setCreatedItineraryId(null)
    setGenerationStep('idle')
    setExpandedDays(new Set())
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { key: 'upload', label: t('uploadStep') },
          { key: 'review', label: t('reviewStep') },
          { key: 'generating', label: t('generateStep') },
        ].map((s, i) => {
          const isActive = s.key === step || (s.key === 'generating' && step === 'complete')
          const isComplete = (
            (s.key === 'upload' && step !== 'upload') ||
            (s.key === 'review' && (step === 'generating' || step === 'complete')) ||
            (s.key === 'generating' && step === 'complete')
          )

          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${isComplete || isActive ? 'bg-[#647C47]' : 'bg-gray-300'}`} />}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                isComplete ? 'bg-[#647C47] text-white' :
                isActive ? 'bg-[#647C47]/10 text-[#647C47] border border-[#647C47]/30' :
                'bg-gray-100 text-gray-400'
              }`}>
                {isComplete ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span>{s.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Dropzone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              isDragging
                ? 'border-[#647C47] bg-[#647C47]/5'
                : files.length > 0
                  ? 'border-gray-300 bg-gray-50'
                  : 'border-gray-300 hover:border-[#647C47] hover:bg-gray-50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFileSelect(e.target.files)
                e.target.value = ''
              }}
            />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-[#647C47]' : 'text-gray-400'}`} />
            <p className="text-sm font-medium text-gray-700">{t('dropzoneTitle')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('dropzoneSubtitle')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('maxFileSize')}</p>
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{t('selectedFiles')}</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); setFiles([]) }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  {t('clearAll')}
                </button>
              </div>
              {files.map((file, i) => {
                const Icon = getFileIcon(file.type)
                return (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                    <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Language Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('contentLanguage')}</label>
            <select
              value={contentLanguage}
              onChange={(e) => setContentLanguage(e.target.value)}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
            >
              {IMPORT_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {extractError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{extractError}</p>
            </div>
          )}

          {/* Extract Button */}
          <button
            onClick={handleExtract}
            disabled={files.length === 0 || isExtracting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#647C47] text-white font-medium rounded-lg hover:bg-[#4f6238] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('extracting')}
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                {t('extractButton')}
              </>
            )}
          </button>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 'review' && extractedData && (
        <div className="space-y-6">
          {/* Confidence */}
          {extractedData.structure_confidence < 0.7 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Low confidence extraction ({Math.round(extractedData.structure_confidence * 100)}%). Please review carefully.
              </p>
            </div>
          )}

          {/* Generation error from previous attempt */}
          {generationError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{generationError}</p>
            </div>
          )}

          {/* Trip Details */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">{t('reviewTitle')}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Trip Name */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('tripName')}</label>
                <input
                  type="text"
                  value={formData.trip_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, trip_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                />
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('startDate')}</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('duration')}</label>
                <p className="px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-lg">
                  {editingDays.length} {t('days')}
                </p>
              </div>

              {/* Adults */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('adults')}</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formData.num_adults}
                  onChange={(e) => setFormData(prev => ({ ...prev, num_adults: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                />
              </div>

              {/* Children */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('children')}</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={formData.num_children}
                  onChange={(e) => setFormData(prev => ({ ...prev, num_children: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                />
              </div>

              {/* Tier */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('tier')}</label>
                <select
                  value={formData.tier}
                  onChange={(e) => setFormData(prev => ({ ...prev, tier: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                >
                  {TIER_OPTIONS.map(tier => (
                    <option key={tier.value} value={tier.value}>{tier.label}</option>
                  ))}
                </select>
              </div>

              {/* Package Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('packageType')}</label>
                <select
                  value={formData.package_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, package_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                >
                  {PACKAGE_TYPES.map(pt => (
                    <option key={pt.slug} value={pt.slug}>{pt.name}</option>
                  ))}
                </select>
              </div>

              {/* Guide Language */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('guideLanguage')}</label>
                <select
                  value={formData.guide_language}
                  onChange={(e) => setFormData(prev => ({ ...prev, guide_language: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                >
                  {IMPORT_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                  ))}
                </select>
              </div>

              {/* B2B Partner */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('partner')}</label>
                <select
                  value={formData.partner_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, partner_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#647C47]"
                >
                  <option value="">{t('noPartner')}</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.company_name} ({p.commission_percent}%)</option>
                  ))}
                </select>
              </div>

              {/* Cities */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('cities')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {extractedData.cities.map((city, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-[#647C47]/10 text-[#647C47] text-xs rounded-full">
                      <MapPin className="w-3 h-3" />
                      {city}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Day-by-Day */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">{t('dayByDay')}</h3>

            {editingDays.map((day, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Day Header */}
                <button
                  type="button"
                  onClick={() => toggleDayExpanded(index)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 bg-[#647C47] text-white text-xs font-bold rounded-full">
                      {day.day_number}
                    </span>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{day.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {day.overnight_city && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="w-3 h-3" />
                            {day.overnight_city}
                          </span>
                        )}
                        {day.is_cruise_day && (
                          <span className="text-xs text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">Cruise</span>
                        )}
                        {day.is_free_day && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Free Day</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {expandedDays.has(index) ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {/* Day Details (expanded) */}
                {expandedDays.has(index) && (
                  <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
                    {/* Title */}
                    <div className="pt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                      <input
                        type="text"
                        value={day.title}
                        onChange={(e) => updateDay(index, { title: e.target.value })}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#647C47]"
                      />
                    </div>

                    {/* Overnight City */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t('overnightCity')}</label>
                      <input
                        type="text"
                        value={day.overnight_city}
                        onChange={(e) => updateDay(index, { overnight_city: e.target.value })}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#647C47]"
                      />
                    </div>

                    {/* Activities */}
                    {day.activities.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('activities')}</label>
                        <ul className="space-y-1">
                          {day.activities.map((act, ai) => (
                            <li key={ai} className="flex items-center gap-2 text-sm text-gray-700">
                              <span className="w-1.5 h-1.5 bg-[#647C47] rounded-full flex-shrink-0" />
                              {act}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Attractions */}
                    {day.attractions.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('attractions')}</label>
                        <div className="flex flex-wrap gap-1.5">
                          {day.attractions.map((attr, ai) => (
                            <span key={ai} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              {attr}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meals */}
                    {day.meals_mentioned.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Meals</label>
                        <div className="flex gap-2">
                          {day.meals_mentioned.map((meal, mi) => (
                            <span key={mi} className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded">
                              {meal}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Remove Day */}
                    {editingDays.length > 1 && (
                      <button
                        onClick={() => removeDay(index)}
                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 mt-2"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('removeDay')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep('upload')}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-[#647C47] text-white font-medium rounded-lg hover:bg-[#4f6238] transition-colors text-sm"
            >
              <ArrowRight className="w-4 h-4" />
              {t('generateItinerary')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Generating */}
      {step === 'generating' && (
        <div className="space-y-4 p-6 bg-[#647C47]/5 rounded-xl border border-[#647C47]/20">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-[#647C47] animate-spin" />
            <span className="text-sm font-semibold text-[#647C47]">{t('generatingItinerary')}</span>
          </div>
          <div className="space-y-2">
            {GENERATION_STEPS.map((gs) => {
              const steps: GenerationStep[] = ['creating-client', 'checking-suppliers', 'building-route', 'finalizing']
              const currentIdx = steps.indexOf(generationStep)
              const stepIdx = steps.indexOf(gs.key)

              return (
                <div key={gs.key} className="flex items-center gap-2">
                  {stepIdx < currentIdx ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : stepIdx === currentIdx ? (
                    <Loader2 className="w-4 h-4 text-[#647C47] animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                  )}
                  <span className={`text-xs ${stepIdx <= currentIdx ? 'text-gray-700' : 'text-gray-400'}`}>
                    {gs.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <div className="text-center py-12 space-y-6">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('itineraryCreated')}</h2>
            <p className="text-sm text-gray-500 mt-1">{formData.trip_name}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/tours/manage"
              className="flex items-center gap-2 px-6 py-2.5 bg-[#647C47] text-white font-medium rounded-lg hover:bg-[#4f6238] transition-colors text-sm"
            >
              <Package className="w-4 h-4" />
              {t('goToTours')}
            </Link>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('importAnother')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
