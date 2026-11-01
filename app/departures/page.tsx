'use client'

// ============================================
// /departures — List · Capacity
// ============================================
// The departures list and the capacity month grid (/capacity) as views of
// one page (?view=), each moved as it was into ./_views. Both managers and
// above, as each page was. Each departure keeps /departures/<id> and its
// pricing grid /departures/grid/<template>; /capacity redirects to its view.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import DeparturesListView from './_views/DeparturesListView'
import CapacityView from './_views/CapacityView'

const PAGE = tabbedPage('/departures')

export default function DeparturesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>}>
      <UrlTabs
        page={PAGE}
        render={view => view === 'list' ? <DeparturesListView /> : view === 'capacity' ? <CapacityView /> : null}
      />
    </Suspense>
  )
}
