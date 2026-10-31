'use client'

// ============================================
// /quotes — B2C · B2B
// ============================================
// The two quote lists as tabs of one page, each moved as it was into
// ./_views. B2C is managers and above, B2B agents and above, as each list
// was; each quote still opens at its own address (/b2c/quotes/<id>,
// /b2b/quotes/<id>). The old list addresses redirect to their tab.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import B2CQuotesView from './_views/B2CQuotesView'
import B2BQuotesView from './_views/B2BQuotesView'

const PAGE = tabbedPage('/quotes')

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>}>
      <UrlTabs
        page={PAGE}
        render={tab => tab === 'b2c' ? <B2CQuotesView /> : tab === 'b2b' ? <B2BQuotesView /> : null}
      />
    </Suspense>
  )
}
