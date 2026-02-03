'use client'

import { Language, LANGUAGE_FLAGS } from '@/types/multilingual'

interface LanguageIndicatorProps {
  availableLanguages: Language[]
  size?: 'sm' | 'md'
  showLabels?: boolean
}

/**
 * Shows which language versions are available for an entity
 * Used in list views to indicate translation status
 */
export function LanguageIndicator({
  availableLanguages,
  size = 'sm',
  showLabels = false
}: LanguageIndicatorProps) {
  const allLanguages: Language[] = ['en', 'ja']

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs'
  }

  return (
    <div className="flex items-center gap-1">
      {allLanguages.map(lang => {
        const isAvailable = availableLanguages.includes(lang)
        const label = lang === 'en' ? 'EN' : 'JP'

        return (
          <span
            key={lang}
            className={`
              ${sizeClasses[size]} rounded font-bold inline-flex items-center gap-0.5
              ${isAvailable
                ? lang === 'en'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-400'
              }
            `}
            title={isAvailable
              ? `${lang === 'en' ? 'English' : 'Japanese'} version available`
              : `${lang === 'en' ? 'English' : 'Japanese'} version not created`
            }
          >
            {showLabels && <span className="text-sm">{LANGUAGE_FLAGS[lang]}</span>}
            {label}
          </span>
        )
      })}
    </div>
  )
}

export default LanguageIndicator
