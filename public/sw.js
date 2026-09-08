/* Ops service worker — PUSH ONLY.
 *
 * Deliberately no fetch handler and no caching: this worker exists so the ops
 * board can receive checkpoint alerts, not to serve stale pages.
 */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Ops', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Ops'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/autoura-logo.png',
      badge: '/autoura-logo.png',
      data: { url: data.url || '/ops' },
      tag: data.tag || 'ops',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/ops'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes('/ops') && 'focus' in w) return w.focus()
      }
      return clients.openWindow(url)
    })
  )
})
