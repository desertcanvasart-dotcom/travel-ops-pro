// ============================================
// Customer/supplier PDFs we hand to Twilio — PRIVATE, signed, short-lived
// ============================================
// Invoices, contracts and supplier documents sent by WhatsApp used to go into
// the PUBLIC `documents` bucket (it also holds the org logos, which must stay
// public) and were never deleted: a permanent, unauthenticated URL to a
// customer's name, trip and balance for anyone the link ever reached. Twilio
// only needs to fetch the file once, when the message is sent — WhatsApp keeps
// its own copy — so a private bucket and a signed URL that expires is enough.

export const OUTBOUND_DOCS_BUCKET = 'outbound-documents'
/** Long enough for Twilio's fetch and its retries; short enough not to be a link. */
export const OUTBOUND_URL_TTL_SECONDS = 24 * 60 * 60

type StorageClient = {
  storage: {
    createBucket: (id: string, opts: { public: boolean }) => Promise<{ error: { message: string } | null }>
    from: (bucket: string) => {
      upload: (path: string, body: Uint8Array | Buffer, opts: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>
      createSignedUrl: (path: string, ttl: number) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>
    }
  }
}

let bucketReady: Promise<void> | null = null

/** Create the private bucket on first use (a fresh or self-hosted install has
 *  no dashboard step for it). "Already exists" is success. */
function ensureBucket(db: StorageClient): Promise<void> {
  if (!bucketReady) {
    bucketReady = db.storage.createBucket(OUTBOUND_DOCS_BUCKET, { public: false }).then(({ error }) => {
      if (error && !/exist/i.test(error.message)) {
        bucketReady = null
        throw new Error(`Could not create storage bucket ${OUTBOUND_DOCS_BUCKET}: ${error.message}`)
      }
    })
  }
  return bucketReady
}

/** Upload a PDF privately and return a signed URL Twilio can fetch. */
export async function uploadOutboundPdf(db: StorageClient, path: string, bytes: Uint8Array | Buffer): Promise<string> {
  await ensureBucket(db)
  const bucket = db.storage.from(OUTBOUND_DOCS_BUCKET)
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw new Error(`Failed to upload PDF: ${uploadError.message}`)
  const { data, error } = await bucket.createSignedUrl(path, OUTBOUND_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) throw new Error(`Failed to sign PDF link: ${error?.message ?? 'no URL'}`)
  return data.signedUrl
}

/** Test hook: forget the cached bucket check. */
export function resetOutboundBucketCache(): void {
  bucketReady = null
}
