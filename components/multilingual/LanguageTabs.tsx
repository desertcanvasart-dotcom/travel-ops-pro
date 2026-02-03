'use client'

import { useState } from 'react'
import { Globe, Plus } from 'lucide-react'
import { Language, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '@/types/multilingual'

interface LanguageTabsProps {
  availableLanguages: Language[]
  activeLanguage: Language
  onLanguageChange: (language: Language) => void
  onCreateVersion?: (language: Language) => void
  disabled?: boolean
}

/**
 * Tabbed language switcher for detail pages
 * Shows tabs for each language with indicators for missing versions
 */
export function LanguageTabs({
  availableLanguages,
  activeLanguage,
  onLanguageChange,
  onCreateVersion,
  disabled = false
}: LanguageTabsProps) {
  const allLanguages: Language[] = ['en', 'ja']

  return (
    <div className="flex border-b border-gray-200">
      {allLanguages.map(lang => {
        const isAvailable = availableLanguages.includes(lang)
        const isActive = activeLanguage === lang

        return (
          <button
            key={lang}
            onClick={() => {
              if (isAvailable) {
                onLanguageChange(lang)
              } else if (onCreateVersion) {
                onCreateVersion(lang)
              }
            }}
            disabled={disabled}
            className={`
              relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              flex items-center gap-2
              ${isActive
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span className="text-base">{LANGUAGE_FLAGS[lang]}</span>
            <span>{LANGUAGE_NAMES[lang]}</span>

            {!isAvailable && (
              <span className="text-xs text-gray-400 ml-1">
                ({lang === 'ja' ? '未作成' : 'Not created'})
              </span>
            )}

            {!isAvailable && onCreateVersion && (
              <Plus className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
        )
      })}
    </div>
  )
}

interface CreateVersionPromptProps {
  entityType: 'itinerary' | 'tour' | 'quote'
  language: Language
  onCreateFromScratch: () => void
  onCopyAndTranslate?: () => void
  isLoading?: boolean
}

/**
 * Prompt shown when a language version doesn't exist
 * Offers options to create from scratch or copy/translate
 */
export function CreateVersionPrompt({
  entityType,
  language,
  onCreateFromScratch,
  onCopyAndTranslate,
  isLoading = false
}: CreateVersionPromptProps) {
  const entityLabels = {
    itinerary: { en: 'itinerary', ja: '旅程' },
    tour: { en: 'tour template', ja: 'ツアーテンプレート' },
    quote: { en: 'quote', ja: '見積書' }
  }

  const isJapanese = language === 'ja'

  return (
    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <Globe className="w-12 h-12 text-gray-400 mx-auto mb-3" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {isJapanese
          ? `${LANGUAGE_NAMES[language]}版がありません`
          : `No ${LANGUAGE_NAMES[language]} version`
        }
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        {isJapanese
          ? `この${entityLabels[entityType].ja}の${LANGUAGE_NAMES[language]}版を作成しますか？`
          : `Would you like to create a ${LANGUAGE_NAMES[language]} version of this ${entityLabels[entityType].en}?`
        }
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onCreateFromScratch}
          disabled={isLoading}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isJapanese ? '作成中...' : 'Creating...'}
            </span>
          ) : (
            isJapanese ? '新規作成' : 'Create from scratch'
          )}
        </button>
        {onCopyAndTranslate && (
          <button
            onClick={onCopyAndTranslate}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJapanese ? 'コピーして翻訳' : 'Copy & Translate'}
          </button>
        )}
      </div>
    </div>
  )
}

export default LanguageTabs
