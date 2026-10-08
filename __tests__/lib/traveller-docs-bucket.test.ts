// The private traveller-documents bucket was created only by an archived
// migration a new install never replays, so passport uploads failed on a fresh
// database. The upload route now creates it on first use.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ALLOWED_TYPES,
  MAX_DOCUMENT_BYTES,
  TRAVELLER_DOCS_BUCKET,
  ensureTravellerDocsBucket,
  resetTravellerDocsBucketCache,
} from '@/lib/portal/traveller-documents'

function storage(error: string | null) {
  const created: { id: string; opts: Record<string, unknown> }[] = []
  return {
    created,
    db: {
      storage: {
        createBucket: async (id: string, opts: Record<string, unknown>) => {
          created.push({ id, opts })
          return { error: error ? { message: error } : null }
        },
      },
    },
  }
}

beforeEach(() => resetTravellerDocsBucketCache())

describe('ensureTravellerDocsBucket', () => {
  it('creates it private, with the size and type ceilings, once', async () => {
    const s = storage(null)
    await ensureTravellerDocsBucket(s.db)
    await ensureTravellerDocsBucket(s.db)
    expect(s.created).toHaveLength(1)
    expect(s.created[0]).toEqual({
      id: TRAVELLER_DOCS_BUCKET,
      opts: { public: false, fileSizeLimit: MAX_DOCUMENT_BYTES, allowedMimeTypes: ALLOWED_TYPES },
    })
  })

  it('treats an existing bucket as ready', async () => {
    await expect(ensureTravellerDocsBucket(storage('The resource already exists').db)).resolves.toBeUndefined()
  })

  it('fails, and tries again next time, on any other error', async () => {
    const bad = storage('permission denied')
    await expect(ensureTravellerDocsBucket(bad.db)).rejects.toThrow(/permission denied/)
    const good = storage(null)
    await ensureTravellerDocsBucket(good.db)
    expect(good.created).toHaveLength(1)
  })
})
