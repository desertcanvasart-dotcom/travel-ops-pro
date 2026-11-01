'use client'

// ============================================
// /payments — Payments · Receipts
// ============================================
// The payments list and the receipts list (/receipts) as tabs of one page,
// each moved as it was into ./_views. Payments is agents and above (they
// record customer payments), Receipts managers and above, as each page was.
// Each payment keeps /payments/<id> (and /payments/new, /payments/record);
// /receipts redirects to ?tab=receipts.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import PaymentsView from './_views/PaymentsView'
import ReceiptsView from './_views/ReceiptsView'

const PAGE = tabbedPage('/payments')

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>}>
      <UrlTabs
        page={PAGE}
        render={tab => tab === 'payments' ? <PaymentsView /> : tab === 'receipts' ? <ReceiptsView /> : null}
      />
    </Suspense>
  )
}
