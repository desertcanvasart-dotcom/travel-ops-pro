'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useVocabLabel } from '@/hooks/useVocabLabel'
import { AccommodationRate } from '../types'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import { fmtMoney, times, convertedFrom } from '@/app/tour-builder/lib/money'

interface AccommodationSelectorProps {
  city: string
  selectedAccommodation?: AccommodationRate
  pax: number
  isEuroPassport: boolean
  onSelect: (accommodation: AccommodationRate | undefined) => void
}

export default function AccommodationSelector({
  city,
  selectedAccommodation,
  pax,
  isEuroPassport,
  onSelect
}: AccommodationSelectorProps) {
  const { rateSymbol } = useCurrency()
  const money = (n: number | null | undefined) => fmtMoney(rateSymbol, n)
  const t = useTranslations('tourBuilder.accommodation')
  const boardBasisLabel = useVocabLabel('board_basis')
  const [accommodations, setAccommodations] = useState<AccommodationRate[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    tier: 'all',
    board_basis: 'all',
    min_stars: 0
  })

  // Fetch accommodations when city changes
  useEffect(() => {
    if (!city) {
      setAccommodations([])
      return
    }

    fetchAccommodations()
  }, [city])

  const fetchAccommodations = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/rates?type=accommodation&city=${city}&in_org_currency=true`)
      const data = await response.json()
      
      if (data.success) {
        // Ensure data.data is an array
        const accommodationsData = Array.isArray(data.data) ? data.data : []
        setAccommodations(accommodationsData)
      } else {
        setAccommodations([])
      }
    } catch (error) {
      console.error('Failed to fetch accommodations:', error)
      setAccommodations([])
    } finally {
      setLoading(false)
    }
  }

  // Filter accommodations
  const filteredAccommodations = accommodations.filter(acc => {
    if (filter.tier !== 'all' && acc.tier !== filter.tier) return false
    if (filter.board_basis !== 'all' && acc.board_basis !== filter.board_basis) return false
    if (acc.star_rating < filter.min_stars) return false
    return true
  })

  // Calculate per-person price
  const getPrice = (acc: AccommodationRate) => {
    const ppDouble = isEuroPassport ? acc.pp_double_eur : acc.pp_double_non_eur
    return times(ppDouble, pax)
  }

  if (!city) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          {t('selectCityFirst')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        🏨 {t('title')}
      </label>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <select
          value={filter.tier}
          onChange={(e) => setFilter({ ...filter, tier: e.target.value })}
          title={t('allTiers')}
          className="text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="all">{t('allTiers')}</option>
          <option value="budget">Budget</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="luxury">Luxury</option>
        </select>

        <select
          value={filter.board_basis}
          onChange={(e) => setFilter({ ...filter, board_basis: e.target.value })}
          title={t('allBoardBasis')}
          className="text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="all">{t('allBoardBasis')}</option>
          <option value="BB">BB {boardBasisLabel('BB', t('boardBB'))}</option>
          <option value="HB">HB {boardBasisLabel('HB', t('boardHB'))}</option>
          <option value="FB">FB {boardBasisLabel('FB', t('boardFB'))}</option>
          <option value="AI">AI {boardBasisLabel('AI', t('boardAI'))}</option>
        </select>

        <select
          value={filter.min_stars}
          onChange={(e) => setFilter({ ...filter, min_stars: parseInt(e.target.value) })}
          title={t('allStars')}
          className="text-xs px-2 py-1 border border-gray-300 rounded"
        >
          <option value="0">{t('allStars')}</option>
          <option value="3">3+ ⭐</option>
          <option value="4">4+ ⭐</option>
          <option value="5">5 ⭐</option>
        </select>
      </div>

      {/* Selection Box */}
      <div className="border border-gray-300 rounded-lg bg-white">
        {loading ? (
          <div className="p-4 text-center text-gray-600">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
            <p className="text-sm">{t('loading')}</p>
          </div>
        ) : filteredAccommodations.length === 0 ? (
          <div className="p-4 text-center text-gray-600">
            <p className="text-sm">{t('noAccommodations', { city })}</p>
            <button
              type="button"
              onClick={() => setFilter({ tier: 'all', board_basis: 'all', min_stars: 0 })}
              className="text-xs text-blue-600 hover:text-blue-700 mt-2"
            >
              {t('resetFilters')}
            </button>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {/* No Selection Option */}
            <button
              type="button"
              onClick={() => onSelect(undefined)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                !selectedAccommodation ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
              }`}
            >
              <div className="font-medium text-gray-900">{t('noAccommodation')}</div>
              <div className="text-xs text-gray-500">{t('skipAccommodation')}</div>
            </button>

            {/* Accommodation Options */}
            {filteredAccommodations.map((acc) => (
              <button
                type="button"
                key={acc.id}
                onClick={() => onSelect(acc)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                  selectedAccommodation?.id === acc.id
                    ? 'bg-blue-50 border-l-4 border-l-blue-600'
                    : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {acc.property_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-yellow-600">
                        {'⭐'.repeat(acc.star_rating)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        acc.tier === 'luxury' ? 'bg-purple-100 text-purple-700' :
                        acc.tier === 'premium' ? 'bg-blue-100 text-blue-700' :
                        acc.tier === 'standard' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {acc.tier}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        {acc.board_basis}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {acc.room_type} • {acc.property_type}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-bold text-gray-900">
                      {money(getPrice(acc))}
                    </div>
                    <div className="text-xs text-gray-500">
                      {pax} {pax > 1 ? t('persons') : t('person')}
                    </div>
                    <div className="text-xs text-gray-400">
                      {money(isEuroPassport ? acc.pp_double_eur : acc.pp_double_non_eur)}{t('perPerson')}{convertedFrom(acc) && <span className="ml-1 text-[10px] text-amber-700">({t('convertedFrom', { currency: convertedFrom(acc) ?? '' })})</span>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      {selectedAccommodation && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex justify-between items-start text-sm">
            <div>
              <div className="font-semibold text-blue-900">
                {selectedAccommodation.property_name}
              </div>
              <div className="text-blue-700 text-xs mt-1">
                {pax} {pax > 1 ? t('persons') : t('person')} • {selectedAccommodation.room_type}
              </div>
              <div className="text-blue-600 text-xs mt-1">
                {t('board')}: {selectedAccommodation.board_basis}
                {selectedAccommodation.board_basis === 'BB' && ` ${t('boardBB')}`}
                {selectedAccommodation.board_basis === 'HB' && ` ${t('boardHB')}`}
                {selectedAccommodation.board_basis === 'FB' && ` ${t('boardFB')}`}
                {selectedAccommodation.board_basis === 'AI' && ` ${t('boardAI')}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-900">
                {money(getPrice(selectedAccommodation))}
              </div>
              <div className="text-xs text-blue-700">
                {t('totalForPax', { pax })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-2 text-xs text-gray-500">
        {t('showingProperties', { city, filtered: filteredAccommodations.length, total: accommodations.length })}
      </div>
    </div>
  )
}