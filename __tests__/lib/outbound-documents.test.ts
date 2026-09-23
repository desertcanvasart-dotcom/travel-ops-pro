// Invoice/contract PDFs sent by WhatsApp went to the PUBLIC documents bucket,
// never deleted — permanent unauthenticated links to customer data.
import { describe, it, expect, beforeEach } from 'vitest'
import { uploadOutboundPdf, resetOutboundBucketCache, OUTBOUND_DOCS_BUCKET, OUTBOUND_URL_TTL_SECONDS } from '@/lib/storage/outbound-documents'

const log: unknown[][] = []
function client(bucketError: string | null = null) {
  return {
    storage: {
      createBucket: async (id: string, opts: { public: boolean }) => { log.push(['createBucket', id, opts]); return { error: bucketError ? { message: bucketError } : null } },
      from: (bucket: string) => ({
        upload: async (path: string) => { log.push(['upload', bucket, path]); return { error: null } },
        createSignedUrl: async (path: string, ttl: number) => { log.push(['sign', bucket, path, ttl]); return { data: { signedUrl: `https://s/${path}?token=t` }, error: null } },
      }),
    },
  }
}
beforeEach(() => { log.length = 0; resetOutboundBucketCache() })

describe('uploadOutboundPdf', () => {
  it('uploads to a PRIVATE bucket and returns an expiring signed URL', async () => {
    const url = await uploadOutboundPdf(client(), 'invoices/a.pdf', new Uint8Array([1]))
    expect(log[0]).toEqual(['createBucket', OUTBOUND_DOCS_BUCKET, { public: false }])
    expect(log).toContainEqual(['upload', OUTBOUND_DOCS_BUCKET, 'invoices/a.pdf'])
    expect(log).toContainEqual(['sign', OUTBOUND_DOCS_BUCKET, 'invoices/a.pdf', OUTBOUND_URL_TTL_SECONDS])
    expect(url).toContain('token=')
    expect(log.some(l => l[1] === 'documents')).toBe(false)
  })
  it('an existing bucket is fine', async () => {
    await expect(uploadOutboundPdf(client('The resource already exists'), 'x.pdf', new Uint8Array())).resolves.toBeTruthy()
  })
  it('any other bucket error fails the send rather than falling back to public', async () => {
    await expect(uploadOutboundPdf(client('permission denied'), 'x.pdf', new Uint8Array())).rejects.toThrow(/permission denied/)
  })
})
