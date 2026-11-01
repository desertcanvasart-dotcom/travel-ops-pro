'use client'

// ============================================
// /invoices — All · Unpaid
// ============================================
// The invoice list and the receivables aging (/accounts-receivable) as tabs
// of one page, each moved as it was into ./_views. All is agents and above
// (reservation staff issue invoices); Unpaid managers and above, as each
// page was, and its data keeps its own API gate. Each invoice keeps
// /invoices/<id>; /accounts-receivable redirects to ?tab=unpaid.

import { Suspense } from 'react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import InvoicesView from './_views/InvoicesView'
import ReceivablesView from './_views/ReceivablesView'

const PAGE = tabbedPage('/invoices')

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
    </div>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UrlTabs
        page={PAGE}
        render={tab => tab === 'all' ? <InvoicesView /> : tab === 'unpaid' ? <ReceivablesView /> : null}
      />
    </Suspense>
  )
}
