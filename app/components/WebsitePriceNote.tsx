'use client'

// A website order's price is the website's (lib/pricing/website-price): the
// customer agreed to it on the website, and the tour comes with it as sold.
// The page says so calmly — no red "Incomplete price" banner and no list of
// services without a cost rate (operator, 2026-11-02: a website order is
// final, so there is nothing on it to fix).

import { Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function WebsitePriceNote() {
  const t = useTranslations('websitePrice')
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Globe className="w-4 h-4 text-[#647C47]" />{t('title')}
      </p>
      <p className="text-sm text-gray-600 mt-1">{t('body')}</p>
    </div>
  )
}
