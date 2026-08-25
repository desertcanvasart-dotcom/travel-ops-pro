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

// The stored extension is derived from the VALIDATED MIME type, never from the
// caller-supplied filename — file.name and file.type are both attacker-set, and
// a mismatched extension is how a script gets served with an image content-type
// or vice versa.
const EXT_FOR_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// First bytes of each accepted type — a cheap sniff so a caller cannot upload an
// executable under an image content-type. Checked against the real bytes below.
function sniffType(buf: Buffer): string | null {
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

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

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // The actual bytes must match the claimed type — reject a spoofed
    // content-type (e.g. a script announced as image/png).
    const sniffed = sniffType(buffer)
    if (sniffed !== file.type) {
      return NextResponse.json(
        { error: 'File content does not match its declared type.' },
        { status: 400 }
      )
    }

    // Extension from the validated type; filename never reaches the storage key.
    const fileExt = EXT_FOR_TYPE[file.type] || 'bin'
    const fileName = `${safeKeySegment(id)}-${Date.now()}.${fileExt}`
    const filePath = `documents/${fileName}`

    // Upload to Supabase Storage (auto-create bucket if needed)
    let uploadResult = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: file.type, upsert: true })

    if (uploadResult.error?.message?.includes('Bucket not found')) {
      // PRIVATE — the document is served through a signed URL
      // (app/api/supplier-invoices/[id]/document), never a public link.
      const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
        public: false,
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

    // document_url points at the app's own signed-URL route, not the object —
    // the bucket is private, so a raw storage link would 403.
    const { error: updateError } = await supabase
      .from('supplier_invoices')
      .update({
        document_url: `/api/supplier-invoices/${id}/document`,
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
      url: `/api/supplier-invoices/${id}/document`,
      filename: file.name,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}
