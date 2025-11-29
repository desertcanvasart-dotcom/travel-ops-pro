/**
 * Email Caching Utilities
 * 
 * Provides local caching for emails to improve performance
 * Uses IndexedDB for persistent storage in the browser
 */

const DB_NAME = 'autoura-email-cache'
const DB_VERSION = 1
const STORE_NAME = 'emails'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export interface CachedEmail {
  id: string
  threadId: string
  userId: string
  folder: string
  snippet: string
  from: string
  to: string
  subject: string
  date: string
  body?: string
  attachments?: Array<{
    id: string
    filename: string
    mimeType: string
    size: number
  }>
  labelIds: string[]
  isUnread: boolean
  isStarred: boolean
  cachedAt: number
}

interface CacheMetadata {
  userId: string
  folder: string
  lastFetch: number
  historyId?: string
  totalCount?: number
}

let db: IDBDatabase | null = null

/**
 * Initialize the IndexedDB database
 */
export async function initEmailCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve() // SSR - skip
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    
    request.onsuccess = () => {
      db = request.result
      resolve()
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Create emails store
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('userId', 'userId', { unique: false })
        store.createIndex('folder', 'folder', { unique: false })
        store.createIndex('userId_folder', ['userId', 'folder'], { unique: false })
        store.createIndex('cachedAt', 'cachedAt', { unique: false })
      }

      // Create metadata store
      if (!database.objectStoreNames.contains('metadata')) {
        const metaStore = database.createObjectStore('metadata', { keyPath: ['userId', 'folder'] })
        metaStore.createIndex('userId', 'userId', { unique: false })
      }
    }
  })
}

/**
 * Get cached emails for a folder
 */
export async function getCachedEmails(
  userId: string,
  folder: string,
  options: {
    limit?: number
    offset?: number
    filter?: 'all' | 'unread' | 'starred'
  } = {}
): Promise<{ emails: CachedEmail[]; fromCache: boolean; isStale: boolean }> {
  if (!db) await initEmailCache()
  if (!db) return { emails: [], fromCache: false, isStale: true }

  const { limit = 50, offset = 0, filter = 'all' } = options

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME, 'metadata'], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const metaStore = transaction.objectStore('metadata')

    // Check metadata for staleness
    const metaRequest = metaStore.get([userId, folder])
    
    metaRequest.onsuccess = () => {
      const metadata = metaRequest.result as CacheMetadata | undefined
      const isStale = !metadata || (Date.now() - metadata.lastFetch > CACHE_DURATION)

      // Get emails
      const index = store.index('userId_folder')
      const range = IDBKeyRange.only([userId, folder])
      const request = index.getAll(range)

      request.onsuccess = () => {
        let emails = request.result as CachedEmail[]

        // Apply filter
        if (filter === 'unread') {
          emails = emails.filter(e => e.isUnread)
        } else if (filter === 'starred') {
          emails = emails.filter(e => e.isStarred)
        }

        // Sort by date descending
        emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        // Apply pagination
        emails = emails.slice(offset, offset + limit)

        resolve({
          emails,
          fromCache: emails.length > 0,
          isStale
        })
      }

      request.onerror = () => reject(request.error)
    }

    metaRequest.onerror = () => reject(metaRequest.error)
  })
}

/**
 * Cache emails
 */
export async function cacheEmails(
  userId: string,
  folder: string,
  emails: CachedEmail[],
  historyId?: string
): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME, 'metadata'], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const metaStore = transaction.objectStore('metadata')

    const now = Date.now()

    // Add/update each email
    for (const email of emails) {
      store.put({
        ...email,
        userId,
        folder,
        cachedAt: now
      })
    }

    // Update metadata
    metaStore.put({
      userId,
      folder,
      lastFetch: now,
      historyId,
      totalCount: emails.length
    } as CacheMetadata)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Get a single cached email by ID
 */
export async function getCachedEmail(emailId: string): Promise<CachedEmail | null> {
  if (!db) await initEmailCache()
  if (!db) return null

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(emailId)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Update a cached email (e.g., after marking read/starred)
 */
export async function updateCachedEmail(
  emailId: string,
  updates: Partial<CachedEmail>
): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    
    const getRequest = store.get(emailId)
    
    getRequest.onsuccess = () => {
      const email = getRequest.result
      if (email) {
        store.put({ ...email, ...updates, cachedAt: Date.now() })
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Remove emails from cache
 */
export async function removeCachedEmails(emailIds: string[]): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    for (const id of emailIds) {
      store.delete(id)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Clear all cached emails for a user
 */
export async function clearEmailCache(userId?: string): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME, 'metadata'], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const metaStore = transaction.objectStore('metadata')

    if (userId) {
      // Clear only specific user's cache
      const index = store.index('userId')
      const range = IDBKeyRange.only(userId)
      const request = index.openCursor(range)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          store.delete(cursor.primaryKey)
          cursor.continue()
        }
      }

      // Clear metadata for user
      const metaIndex = metaStore.index('userId')
      const metaRequest = metaIndex.openCursor(IDBKeyRange.only(userId))

      metaRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          metaStore.delete(cursor.primaryKey)
          cursor.continue()
        }
      }
    } else {
      // Clear everything
      store.clear()
      metaStore.clear()
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Get cache metadata
 */
export async function getCacheMetadata(
  userId: string,
  folder: string
): Promise<CacheMetadata | null> {
  if (!db) await initEmailCache()
  if (!db) return null

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction(['metadata'], 'readonly')
    const store = transaction.objectStore('metadata')
    const request = store.get([userId, folder])

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Clean up old cache entries
 */
export async function cleanupOldCache(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
  if (!db) await initEmailCache()
  if (!db) return

  const cutoff = Date.now() - maxAge

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('cachedAt')
    const range = IDBKeyRange.upperBound(cutoff)
    const request = index.openCursor(range)

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor) {
        store.delete(cursor.primaryKey)
        cursor.continue()
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
