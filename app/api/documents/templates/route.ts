// GET /api/documents/templates
//
// The operator documents the caller's organization has (lib/documents/
// org-templates.ts), so pages offer only those. The document routes check the
// same list themselves; this only decides what is shown.

import { NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import { orgDocumentTemplates } from '@/lib/documents/org-templates'

export async function GET() {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Not authenticated' },
        { status: auth.status }
      )
    }
    const templates = await orgDocumentTemplates(auth.supabase, auth.org_id)
    return NextResponse.json({ success: true, templates })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Could not load the documents') },
      { status: 500 }
    )
  }
}
