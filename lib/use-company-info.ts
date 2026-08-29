'use client'

// ============================================
// The operator's letterhead, in a rendered page
// ============================================
// The document pages already fetched company info — but only when GENERATING a
// PDF. What they rendered on screen was a literal, so the preview said
// "Travel2Egypt" while the downloaded file said whatever the operator had
// actually configured. Two answers to the same question, in the same view.
//
// Returns undefined until it resolves, and undefined forever if the fetch
// fails. Callers render nothing in that case: a document with no letterhead is
// unfinished, one with somebody else's is wrong.

import { useEffect, useState } from 'react'
import { fetchCompanyInfo } from '@/lib/company-info-client'
import type { CompanyInfo } from '@/lib/invoice-pdf-generator'

export function useCompanyInfo(): CompanyInfo | undefined {
  const [company, setCompany] = useState<CompanyInfo | undefined>(undefined)
  useEffect(() => {
    let alive = true
    fetchCompanyInfo().then(info => {
      if (alive) setCompany(info)
    })
    return () => {
      alive = false
    }
  }, [])
  return company
}
