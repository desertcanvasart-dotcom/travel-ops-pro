'use client'
// Which operator documents this org has (GET /api/documents/templates), for
// pages deciding which buttons to show. One request per page load, shared by
// every caller. Until it answers, and if it fails, nothing is offered: the
// routes refuse an org without the document anyway.

import { useEffect, useState } from 'react'
import type { OrgDocumentTemplate } from './org-templates'

let pending: Promise<OrgDocumentTemplate[]> | null = null

function load(): Promise<OrgDocumentTemplate[]> {
  if (!pending) {
    pending = fetch('/api/documents/templates')
      .then(r => (r.ok ? r.json() : null))
      .then(body => (Array.isArray(body?.templates) ? (body.templates as OrgDocumentTemplate[]) : []))
      .catch(() => [] as OrgDocumentTemplate[])
      .then(list => {
        // A failed read is not remembered: the next page tries again.
        if (!list.length) pending = null
        return list
      })
  }
  return pending
}

export function useOrgDocumentTemplates(): ReadonlySet<OrgDocumentTemplate> {
  const [templates, setTemplates] = useState<ReadonlySet<OrgDocumentTemplate>>(() => new Set())
  useEffect(() => {
    let live = true
    load().then(list => { if (live) setTemplates(new Set(list)) })
    return () => { live = false }
  }, [])
  return templates
}
