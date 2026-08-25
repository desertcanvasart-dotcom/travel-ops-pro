// ============================================
// GET /api/supplier-invoices/[id]/document
// ============================================
// Streams the invoice document via a short-lived SIGNED URL instead of a public
// bucket link. The supplier-invoices bucket is private (P5b), so the stored
// object is not world-readable by URL; this route is the only way to it, and it
// is org-scoped and ownership-checked first.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const BUCKET = 'supplier-invoices'
const SIGNED_URL_TTL_SECONDS = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // Ownership + the storage path, in one org-scoped read.
    const { data: invoice } = await supabase
      .from('supplier_invoices')
      .select('document_storage_path')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    const path = invoice?.document_storage_path as string | undefined
    if (!path) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

    if (error || !data?.signedUrl) {
      console.error('Failed to sign supplier-invoice document URL:', error)
      return NextResponse.json({ error: 'Could not access document' }, { status: 500 })
    }

    // 302 to the signed URL — the <a> on the page can link here directly.
    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    console.error('Error in supplier-invoices document GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
