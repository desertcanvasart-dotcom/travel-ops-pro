'use client'

import { useEffect, useRef } from 'react'

interface UseCopilotPollerOptions {
  userId: string | null
  enabled: boolean
  intervalMs?: number
  staleThresholdMs?: number
}

/**
 * Frontend poller that detects draft_pending inbox messages older than
 * the stale threshold and triggers draft generation. Idempotent — the
 * draft generation endpoint checks for existing drafts before generating.
 *
 * This replaces fire-and-forget internal fetch which is fragile in
 * serverless environments (cold starts, silent failures, no retry).
 */
export function useCopilotPoller({
  userId,
  enabled,
  intervalMs = 10000,
  staleThresholdMs = 15000,
}: UseCopilotPollerOptions) {
  const isRunningRef = useRef(false)

  useEffect(() => {
    if (!enabled || !userId) return

    const poll = async () => {
      if (isRunningRef.current) return
      isRunningRef.current = true

      try {
        // Fetch threads that might have stale draft_pending messages
        const res = await fetch('/api/copilot/threads?limit=10')
        const data = await res.json()

        if (!data.success || !data.threads) return

        const now = Date.now()

        for (const thread of data.threads) {
          const inbox = thread.latest_inbox
          if (!inbox) continue

          // Only process draft_pending messages that are older than threshold
          if (inbox.status !== 'draft_pending') continue

          const createdAt = new Date(inbox.created_at).getTime()
          const age = now - createdAt

          if (age < staleThresholdMs) continue

          // Trigger draft generation (idempotent — API checks for existing drafts)
          try {
            await fetch('/api/copilot/drafts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                inbox_message_id: inbox.id,
                thread_id: thread.id,
                user_id: userId,
              }),
            })
          } catch (err) {
            console.error('Copilot poller: draft generation failed for', inbox.id, err)
          }
        }
      } catch (err) {
        // Silent failure — poller will retry on next interval
        console.error('Copilot poller error:', err)
      } finally {
        isRunningRef.current = false
      }
    }

    // Initial poll after a short delay
    const timeout = setTimeout(poll, 2000)
    const interval = setInterval(poll, intervalMs)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [enabled, userId, intervalMs, staleThresholdMs])
}
