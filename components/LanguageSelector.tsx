'use client'

import { useRef, useState } from 'react'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'
import { useLocale, useTranslations } from 'next-intl'
import { Globe, Check, ChevronDown } from 'lucide-react'
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config'
import { changeLocale } from '@/app/providers/IntlClientProvider'

interface LanguageSelectorProps {
  variant?: 'default' | 'compact' | 'dropdown'
  showLabel?: boolean
  className?: string
  dropdownPosition?: 'above' | 'below'
}

export function LanguageSelector({
  variant = 'default',
  showLabel = true,
  className = '',
  dropdownPosition = 'below'
}: LanguageSelectorProps) {
  const currentLocale = useLocale() as Locale
  const t = useTranslations('settings')
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // Closes on any press outside WITHOUT the old invisible backdrop, which
  // swallowed that press — see lib/use-dismiss-on-outside.ts (AUT-W02).
  useDismissOnOutside(isOpen, rootRef, () => setIsOpen(false))

  const handleSelect = (locale: Locale) => {
    if (locale === currentLocale) {
      setIsOpen(false)
      return
    }

    changeLocale(locale)
  }

  if (variant === 'compact') {
    return (
      <div className={`relative ${className}`} ref={rootRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          title={t('language')}
          aria-label={t('language')}
        >
          {/* The flag ALONE was the label — and Windows does not render
              country-flag emoji, so there the button showed as an empty
              square with a chevron (audit AUT-M02's "icon disappears").
              The locale code is text and renders everywhere. */}
          <span className="text-base" aria-hidden="true">{localeFlags[currentLocale]}</span>
          <span className="text-xs font-medium uppercase">{currentLocale}</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {isOpen && (
          <>
            <div className={`absolute right-0 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 ${dropdownPosition === 'above' ? 'bottom-full mb-1' : 'mt-1'}`}>
              {locales.map((locale) => (
                <button
                  key={locale}
                  type="button"
                  onClick={() => handleSelect(locale)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                    locale === currentLocale ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <span>{localeFlags[locale]}</span>
                  <span className="flex-1 text-left">{localeNames[locale]}</span>
                  {locale === currentLocale && (
                    <Check className="w-4 h-4 text-primary-600" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  if (variant === 'dropdown') {
    return (
      <div className={`relative ${className}`} ref={rootRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{localeFlags[currentLocale]}</span>
            <span>{localeNames[currentLocale]}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              {locales.map((locale) => (
                <button
                  key={locale}
                  type="button"
                  onClick={() => handleSelect(locale)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${
                    locale === currentLocale ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <span className="text-lg">{localeFlags[locale]}</span>
                  <span className="flex-1 text-left">{localeNames[locale]}</span>
                  {locale === currentLocale && (
                    <Check className="w-4 h-4 text-primary-600" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // Default variant - for Settings page
  return (
    <div className={`space-y-2 ${className}`}>
      {showLabel && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            {t('language')}
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('languageDescription')}
          </p>
        </div>
      )}
      <div className="flex gap-2">
        {locales.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => handleSelect(locale)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              locale === currentLocale
                ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-200'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-xl">{localeFlags[locale]}</span>
            <span className="font-medium">{localeNames[locale]}</span>
            {locale === currentLocale && (
              <Check className="w-4 h-4 text-primary-600 ml-1" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default LanguageSelector
