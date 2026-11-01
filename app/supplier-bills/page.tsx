'use client'

// ============================================
// /supplier-bills — Bills · Payables
// ============================================
// The supplier bills list (/supplier-invoices) and the payables aging
// (/accounts-payable) as tabs of one page, each moved as it was into
// ./_views. Both managers and above, as each page was. Each bill keeps its
// own address, /supplier-invoices/<id>; the two list addresses redirect to
// their tab.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import BillsView from './_views/BillsView'
import PayablesView from './_views/PayablesView'

const PAGE = tabbedPage('/supplier-bills')

export default function SupplierBillsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>}>
      <UrlTabs
        page={PAGE}
        render={tab => tab === 'bills' ? <BillsView /> : tab === 'payables' ? <PayablesView /> : null}
      />
    </Suspense>
  )
}
