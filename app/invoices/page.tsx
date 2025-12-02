'use client'

import { Suspense } from 'react'
import InvoicesContent from './invoices-content'

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
      <InvoicesContent />
    </Suspense>
  )
}