'use client'

// ============================================
// /reports — Analytics · Finance · Copilot
// ============================================
// Three pages that were siblings in the menu (/analytics,
// /financial-reports, /copilot-analytics) as tabs of one, each moved as it
// was into ./_views. The old addresses redirect to their tab
// (lib/nav/redirects.js). Each tab keeps its page's roles — Analytics and
// Finance managers and above, Copilot agents and above — and its data keeps
// its own API gate.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import AnalyticsView from './_views/AnalyticsView'
import FinanceView from './_views/FinanceView'
import CopilotView from './_views/CopilotView'

const PAGE = tabbedPage('/reports')

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>}>
      <UrlTabs
        page={PAGE}
        render={tab => tab === 'finance' ? <FinanceView /> : tab === 'copilot' ? <CopilotView /> : tab === 'analytics' ? <AnalyticsView /> : null}
      />
    </Suspense>
  )
}
