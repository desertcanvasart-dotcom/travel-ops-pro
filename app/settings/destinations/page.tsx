'use client'

// ============================================
// DESTINATIONS — the countries and cities the agency operates
// ============================================
// The vocabulary behind every city dropdown (docs/plans/multi-destination.md).
// Adding a destination here is the first step of operating a new country;
// the rest — attractions, rates, writing rules — is entered through the
// screens that already exist. Cities referenced by rates cannot be deleted,
// only deactivated, because rates key on the city NAME.

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Globe, Loader2, Plus, Trash2, Check, MapPin, Star } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { clearDestinationCache, type Destination, type DestinationCity } from '@/app/components/useDestinationCities'

interface AdminCity extends DestinationCity {
  id: string
  is_active?: boolean
  lat?: number | null
  lng?: number | null
}

interface AdminDestination extends Omit<Destination, 'cities'> {
  is_active?: boolean
  generation_brief?: string | null
  glossary?: { text?: string } | string | null
  cities: AdminCity[]
}

export default function DestinationsSettingsPage() {
  const t = useTranslations('destinationsSettings')
  const confirmDialog = useConfirm()
  const [destinations, setDestinations] = useState<AdminDestination[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newCountry, setNewCountry] = useState({ code: '', name: '', name_ja: '' })
  const [newCity, setNewCity] = useState({ name: '', name_ja: '', aliases: '' })
  const [warning, setWarning] = useState<string | null>(null)
  // Local draft of the generation brief/glossary per destination, saved on blur-button.
  const [voiceDrafts, setVoiceDrafts] = useState<Record<string, { generation_brief: string; glossary: string }>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/destinations?include_inactive=1')
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load')
      setDestinations(data.data)
      if (data.data.length === 1) setOpenId(data.data[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (payload: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    setWarning(null)
    try {
      const res = await fetch('/api/destinations/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to save')
        return false
      }
      setWarning(data.warning || null)
      clearDestinationCache() // dropdowns pick the change up on next mount
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Globe className="w-6 h-6 text-[#647C47]" />
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">{t('subtitle')}</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {warning && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">{warning}</div>
      )}

      {destinations.length === 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          {t('migrationMissing')}
        </div>
      )}

      <div className="space-y-4">
        {destinations.map(dest => {
          const open = openId === dest.id
          const activeCities = dest.cities.filter(c => c.is_active !== false)
          return (
            <div key={dest.id} className={`bg-white border rounded-lg ${dest.is_active === false ? 'border-dashed border-gray-300 opacity-70' : 'border-gray-200'}`}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : dest.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="font-mono text-xs px-1.5 py-0.5 bg-gray-100 rounded">{dest.country_code}</span>
                <span className="font-semibold text-gray-900">{dest.name}</span>
                {dest.name_ja && <span className="text-sm text-gray-500">{dest.name_ja}</span>}
                {dest.is_default && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3" /> {t('default')}
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400">
                  {t('cityCount', { count: activeCities.length })}
                </span>
              </button>

              {open && (
                <div className="border-t border-gray-100 p-4 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {dest.cities.map(city => (
                      <span
                        key={city.id}
                        className={`group flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${
                          city.is_active === false
                            ? 'bg-gray-50 text-gray-400 border-dashed border-gray-300'
                            : 'bg-[#f4f7f1] text-[#4a5c35] border-[#b8c9a8]'
                        }`}
                        title={city.name_ja || undefined}
                      >
                        <MapPin className="w-3 h-3" />
                        {city.name}
                        <button
                          type="button"
                          title={city.is_active === false ? t('activateCity') : t('deactivateCity')}
                          onClick={() => act({ action: 'update_city', id: city.id, is_active: city.is_active === false })}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[#647C47]"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title={t('deleteCity')}
                          onClick={async () => {
                            if (await confirmDialog(t('deleteCityConfirm', { name: city.name }))) {
                              act({ action: 'delete_city', id: city.id })
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-44"
                      placeholder={t('newCityName')}
                      value={newCity.name}
                      onChange={e => setNewCity(c => ({ ...c, name: e.target.value }))}
                    />
                    <input
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-36"
                      placeholder={t('newCityNameJa')}
                      value={newCity.name_ja}
                      onChange={e => setNewCity(c => ({ ...c, name_ja: e.target.value }))}
                    />
                    <input
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-40"
                      placeholder={t('newCityAliases')}
                      title={t('newCityAliasesHint')}
                      value={newCity.aliases}
                      onChange={e => setNewCity(c => ({ ...c, aliases: e.target.value }))}
                    />
                    <button
                      type="button"
                      disabled={busy || !newCity.name.trim()}
                      onClick={async () => {
                        if (await act({ action: 'add_city', destination_id: dest.id, name: newCity.name.trim(), name_ja: newCity.name_ja.trim() || null, aliases: newCity.aliases })) {
                          setNewCity({ name: '', name_ja: '', aliases: '' })
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#647C47] text-white rounded-lg text-sm hover:bg-[#4a5c35] disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('addCity')}
                    </button>
                    <div className="ml-auto flex items-center gap-3">
                      {!dest.is_default && (
                        <button
                          type="button"
                          onClick={() => act({ action: 'update_destination', id: dest.id, is_default: true })}
                          className="text-xs text-amber-600 hover:text-amber-800"
                        >
                          {t('makeDefault')}
                        </button>
                      )}
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dest.is_active !== false}
                          onChange={e => act({ action: 'update_destination', id: dest.id, is_active: e.target.checked })}
                        />
                        {t('active')}
                      </label>
                    </div>
                  </div>

                  {/* The destination's voice in the generation prompt */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs font-medium text-gray-600">{t('voiceTitle')}</p>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                      rows={3}
                      placeholder={t('briefPlaceholder')}
                      value={voiceDrafts[dest.id]?.generation_brief ?? dest.generation_brief ?? ''}
                      onChange={e => setVoiceDrafts(v => ({ ...v, [dest.id]: {
                        generation_brief: e.target.value,
                        glossary: v[dest.id]?.glossary ?? (typeof dest.glossary === 'string' ? dest.glossary : dest.glossary?.text ?? ''),
                      } }))}
                    />
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                      rows={4}
                      placeholder={t('glossaryPlaceholder')}
                      value={voiceDrafts[dest.id]?.glossary ?? (typeof dest.glossary === 'string' ? dest.glossary : dest.glossary?.text ?? '')}
                      onChange={e => setVoiceDrafts(v => ({ ...v, [dest.id]: {
                        generation_brief: v[dest.id]?.generation_brief ?? dest.generation_brief ?? '',
                        glossary: e.target.value,
                      } }))}
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busy || !voiceDrafts[dest.id]}
                        onClick={async () => {
                          const draft = voiceDrafts[dest.id]
                          if (!draft) return
                          if (await act({ action: 'update_destination', id: dest.id, generation_brief: draft.generation_brief, glossary: draft.glossary })) {
                            setVoiceDrafts(v => Object.fromEntries(Object.entries(v).filter(([k]) => k !== dest.id)))
                          }
                        }}
                        className="px-3 py-1.5 bg-[#647C47] text-white rounded-lg text-sm hover:bg-[#4a5c35] disabled:opacity-50"
                      >
                        {t('saveVoice')}
                      </button>
                      <p className="text-xs text-gray-500">
                        {dest.country_code === 'EG' ? t('voiceHintEgypt') : t('voiceHint')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-xs font-medium text-gray-600 mb-2">{t('addCountry')}</p>
        <div className="flex items-center gap-2">
          <input
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-20 uppercase"
            placeholder={t('codePlaceholder')}
            maxLength={2}
            value={newCountry.code}
            onChange={e => setNewCountry(c => ({ ...c, code: e.target.value.toUpperCase() }))}
          />
          <input
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1 max-w-xs"
            placeholder={t('namePlaceholder')}
            value={newCountry.name}
            onChange={e => setNewCountry(c => ({ ...c, name: e.target.value }))}
          />
          <input
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40"
            placeholder={t('nameJaPlaceholder')}
            value={newCountry.name_ja}
            onChange={e => setNewCountry(c => ({ ...c, name_ja: e.target.value }))}
          />
          <button
            type="button"
            disabled={busy || newCountry.code.length !== 2 || !newCountry.name.trim()}
            onClick={async () => {
              if (await act({ action: 'create_destination', country_code: newCountry.code, name: newCountry.name.trim(), name_ja: newCountry.name_ja.trim() || null })) {
                setNewCountry({ code: '', name: '', name_ja: '' })
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('create')}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">{t('addCountryHint')}</p>
      </div>
    </div>
  )
}
