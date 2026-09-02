'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { CalendarRange, Plus, Trash2, X, Check, Loader2, Info, ChevronLeft, CalendarPlus, Pencil, Copy } from 'lucide-react'
import { SEASON_COLOURS } from '@/lib/pricing/season-admin'

// ============================================
// THE OPERATOR'S OWN HIGH DATES
// ============================================
// Every other page under Rates records what a SUPPLIER charges. This one
// records what the operator has decided to ask on dates they know sell out —
// a demand premium added after margin, on the selling price.
//
// It lives here because it is a price the engine reads, and the audience is
// the same people who keep the rate tables.

interface SeasonWindow {
  id: string
  start_date: string
  end_date: string
  label: string | null
}

interface Season {
  id: string
  name: string
  uplift_percent: number
  colour: string
  display_order: number
  is_active: boolean
  pricing_season_dates: SeasonWindow[]
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/** 15 → "15", 12.5 → "12.5". Trailing zeros are noise on a rate somebody typed. */
const formatPercent = (value: number) => String(Number(value))

export default function PricingSeasonsPage() {
  const t = useTranslations('rates.seasons')
  const tDialog = useTranslations('confirmDialog')
  const dialog = useConfirmDialog()
  const tCommon = useTranslations('rates.common')

  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [showAddSeason, setShowAddSeason] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPercent, setNewPercent] = useState('')
  const [newColour, setNewColour] = useState(SEASON_COLOURS[1])

  // Which season is open for editing, and what is typed in it. A premium gets
  // revised — last year's 15% is this year's 18% — so the number has to be
  // reachable without deleting the season and its dates along with it.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPercent, setEditPercent] = useState('')
  const [editColour, setEditColour] = useState(SEASON_COLOURS[0])

  // Which season's "add dates" row is open, and what is typed in it.
  const [addingDatesFor, setAddingDatesFor] = useState<string | null>(null)
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const showNotice = (type: 'success' | 'error', message: string) => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 4000)
  }

  const fetchSeasons = async () => {
    try {
      const res = await fetch('/api/pricing/seasons')
      const data = await res.json()
      if (data.success) setSeasons(data.data)
      else showNotice('error', data.error || t('failedToLoad'))
    } catch {
      showNotice('error', t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSeasons() }, [])

  const handleAddSeason = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/pricing/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          uplift_percent: parseFloat(newPercent) || 0,
          colour: newColour,
          display_order: seasons.length + 1,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showNotice('success', t('seasonSaved'))
        setShowAddSeason(false)
        setNewName(''); setNewPercent(''); setNewColour(SEASON_COLOURS[1])
        fetchSeasons()
      } else {
        showNotice('error', data.error || t('failedToSave'))
      }
    } catch {
      showNotice('error', t('failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const patchSeason = async (season: Season, update: Record<string, unknown>, message: string) => {
    try {
      const res = await fetch(`/api/pricing/seasons/${season.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      const data = await res.json()
      if (data.success) {
        showNotice('success', message)
        fetchSeasons()
      } else {
        showNotice('error', data.error || t('failedToSave'))
      }
    } catch {
      showNotice('error', t('failedToSave'))
    }
  }

  const startEditing = (season: Season) => {
    setEditingId(season.id)
    setEditName(season.name)
    setEditPercent(formatPercent(Number(season.uplift_percent)))
    setEditColour(season.colour)
  }

  const handleSaveEdit = async (season: Season) => {
    if (!editName.trim()) return
    setSaving(true)
    await patchSeason(
      season,
      { name: editName.trim(), uplift_percent: parseFloat(editPercent) || 0, colour: editColour },
      t('seasonSaved')
    )
    setSaving(false)
    setEditingId(null)
  }

  const handleDeleteSeason = async (season: Season) => {
    if (!(await dialog.confirm({ message: t('deleteSeasonConfirm', { name: season.name }), variant: 'danger', confirmText: tDialog('delete'), cancelText: tDialog('cancel') }))) return
    try {
      const res = await fetch(`/api/pricing/seasons/${season.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showNotice('success', t('seasonDeleted'))
        fetchSeasons()
      } else {
        showNotice('error', data.error || t('failedToDelete'))
      }
    } catch {
      showNotice('error', t('failedToDelete'))
    }
  }

  const handleAddDates = async (season: Season) => {
    if (!newStart || !newEnd) return
    setSaving(true)
    try {
      const res = await fetch('/api/pricing/season-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: season.id,
          start_date: newStart,
          end_date: newEnd,
          label: newLabel.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showNotice('success', t('datesSaved'))
        setAddingDatesFor(null)
        setNewStart(''); setNewEnd(''); setNewLabel('')
        fetchSeasons()
      } else {
        showNotice('error', data.error || t('failedToSave'))
      }
    } catch {
      showNotice('error', t('failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDates = async (window: SeasonWindow) => {
    if (!(await dialog.confirm({ message: t('deleteDatesConfirm'), variant: 'danger', confirmText: tDialog('delete'), cancelText: tDialog('cancel') }))) return
    try {
      const res = await fetch(`/api/pricing/season-dates/${window.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showNotice('success', t('datesDeleted'))
        fetchSeasons()
      } else {
        showNotice('error', data.error || t('failedToDelete'))
      }
    } catch {
      showNotice('error', t('failedToDelete'))
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[#647C47]" />
      </div>
    )
  }

  const today = todayIso()

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {notice && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          notice.type === 'success' ? 'bg-[#647C47] text-white' : 'bg-red-600 text-white'
        }`}>
          {notice.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/rates" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ChevronLeft className="w-4 h-4" />
            {t('ratesHub')}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-[#647C47]" />
            {t('title')}
          </h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setShowAddSeason(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c] font-medium flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t('addSeason')}
        </button>
      </div>

      {/* How the premium is charged — the three rules that surprise people */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">{t('howItWorksTitle')}</p>
          <ul className="list-disc pl-4 space-y-1 text-blue-700">
            <li>{t('howItWorksDeparture')}</li>
            <li>{t('howItWorksOverlap')}</li>
            <li>{t('howItWorksPassThrough')}</li>
          </ul>
        </div>
      </div>

      {/* New season */}
      {showAddSeason && (
        <div className="bg-white rounded-lg border border-[#647C47]/40 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('seasonName')}</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('seasonNamePlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('premium')}</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={0.5}
                  value={newPercent}
                  onChange={(e) => setNewPercent(e.target.value)}
                  placeholder="15"
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                />
                <span className="absolute right-3 top-2 text-sm text-gray-400">%</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('colour')}</label>
            <div className="flex items-center gap-2">
              {SEASON_COLOURS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  onClick={() => setNewColour(colour)}
                  aria-label={colour}
                  className={`w-7 h-7 rounded-full border-2 ${newColour === colour ? 'border-gray-900' : 'border-transparent'}`}
                  style={{ backgroundColor: colour }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setShowAddSeason(false); setNewName(''); setNewPercent('') }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleAddSeason}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {tCommon('create')}
            </button>
          </div>
        </div>
      )}

      {/* Seasons */}
      {seasons.length === 0 && !showAddSeason ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CalendarRange className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('noSeasons')}</h3>
          <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">{t('noSeasonsHint')}</p>
          <button
            onClick={() => setShowAddSeason(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c]"
          >
            <Plus className="w-4 h-4" />
            {t('addFirstSeason')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {seasons.map((season) => {
            const windows = season.pricing_season_dates || []
            return (
              <div
                key={season.id}
                className={`bg-white rounded-lg border shadow-sm overflow-hidden ${season.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}
              >
                {editingId === season.id ? (
                  <div className="flex flex-wrap items-end gap-3 p-5 border-b border-gray-100 bg-gray-50">
                    <div className="flex-1 min-w-[12rem]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('seasonName')}</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="w-28">
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('premium')}</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          step={0.5}
                          value={editPercent}
                          onChange={(e) => setEditPercent(e.target.value)}
                          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm"
                        />
                        <span className="absolute right-3 top-2 text-sm text-gray-400">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('colour')}</label>
                      <div className="flex items-center gap-2 py-1.5">
                        {SEASON_COLOURS.map((colour) => (
                          <button
                            key={colour}
                            type="button"
                            onClick={() => setEditColour(colour)}
                            aria-label={colour}
                            className={`w-6 h-6 rounded-full border-2 ${editColour === colour ? 'border-gray-900' : 'border-transparent'}`}
                            style={{ backgroundColor: colour }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                      >
                        {tCommon('cancel')}
                      </button>
                      <button
                        onClick={() => handleSaveEdit(season)}
                        disabled={saving || !editName.trim()}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c] disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {tCommon('update')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: season.colour }} />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{season.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {windows.length === 0 ? t('noDates') : t('windowCount', { count: windows.length })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-lg font-semibold text-gray-900">
                        +{formatPercent(Number(season.uplift_percent))}%
                      </span>
                      <button
                        onClick={() => patchSeason(season, { is_active: !season.is_active }, t('seasonSaved'))}
                        className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                          season.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {season.is_active ? tCommon('active') : tCommon('inactive')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Duplicate: the add form, pre-filled from this season.
                          setNewName(`${season.name} (copy)`)
                          setNewPercent(formatPercent(Number(season.uplift_percent)))
                          setNewColour(season.colour)
                          setShowAddSeason(true)
                        }}
                        className="p-1.5 text-gray-400 hover:text-[#647C47]"
                        aria-label={tCommon('duplicate')}
                        title={tCommon('duplicate')}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEditing(season)}
                        className="p-1.5 text-gray-400 hover:text-[#647C47]"
                        aria-label={tCommon('edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSeason(season)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        aria-label={tCommon('delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Windows */}
                <div className="divide-y divide-gray-100">
                  {windows.length === 0 && (
                    <p className="px-5 py-3 text-sm text-amber-700 bg-amber-50">{t('noDatesWarning')}</p>
                  )}
                  {windows.map((window) => {
                    const past = window.end_date < today
                    return (
                      <div key={window.id} className={`flex items-center justify-between gap-4 px-5 py-3 ${past ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-medium text-gray-900 tabular-nums">
                            {window.start_date} – {window.end_date}
                          </span>
                          {window.label && <span className="text-gray-500">{window.label}</span>}
                          {past && <span className="text-xs text-gray-400">{t('pastWindow')}</span>}
                        </div>
                        <button
                          onClick={() => handleDeleteDates(window)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          aria-label={tCommon('delete')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}

                  {addingDatesFor === season.id ? (
                    <div className="px-5 py-4 bg-gray-50 flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('from')}</label>
                        <input
                          type="date"
                          value={newStart}
                          onChange={(e) => {
                            setNewStart(e.target.value)
                            // Most windows are a few days long; offering the same
                            // day saves the second click and is never wrong.
                            if (!newEnd || newEnd < e.target.value) setNewEnd(e.target.value)
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('to')}</label>
                        <input
                          type="date"
                          value={newEnd}
                          min={newStart || undefined}
                          onChange={(e) => setNewEnd(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex-1 min-w-[12rem]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('labelOptional')}</label>
                        <input
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          placeholder={t('labelPlaceholder')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setAddingDatesFor(null); setNewStart(''); setNewEnd(''); setNewLabel('') }}
                          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                        >
                          {tCommon('cancel')}
                        </button>
                        <button
                          onClick={() => handleAddDates(season)}
                          disabled={saving || !newStart || !newEnd}
                          className="flex items-center gap-2 px-3 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#566b3c] disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          {tCommon('create')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingDatesFor(season.id); setNewStart(''); setNewEnd(''); setNewLabel('') }}
                      className="w-full px-5 py-3 text-sm text-[#647C47] hover:bg-gray-50 flex items-center gap-2 font-medium"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      {t('addDates')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
