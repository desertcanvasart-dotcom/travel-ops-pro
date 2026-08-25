import { NextRequest, NextResponse } from 'next/server'
import { safeExtension, safeKeySegment } from '@/lib/storage-key'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'supplier-invoices'
const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // Verify the supplier_invoice belongs to this org BEFORE accepting the
    // upload — otherwise a caller could attach a file to another org's row
    // (or worse, scribble over their document_url) using just the id.
    const { data: parentInvoice } = await supabase
      .from('supplier_invoices')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parentInvoice) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PDF, JPG, PNG, WEBP' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const fileExt = safeExtension(file.name, 'pdf')
    const fileName = `${safeKeySegment(id)}-${Date.now()}.${fileExt}`
    const filePath = `documents/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage (auto-create bucket if needed)
    let uploadResult = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: file.type, upsert: true })

    if (uploadResult.error?.message?.includes('Bucket not found')) {
      const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_SIZE,
      })

      if (bucketError && !bucketError.message?.includes('already exists')) {
        throw bucketError
      }

      uploadResult = await supabase.storage
        .from(BUCKET)
        .upload(filePath, buffer, { contentType: file.type, upsert: true })
    }

    if (uploadResult.error) throw uploadResult.error

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath)

    // Update supplier invoice
    const { error: updateError } = await supabase
      .from('supplier_invoices')
      .update({
        document_url: urlData.publicUrl,
        document_filename: file.name,
        document_storage_path: filePath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)

    if (updateError) {
      console.error('Failed to update supplier invoice with document:', updateError)
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      filename: file.name,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}
