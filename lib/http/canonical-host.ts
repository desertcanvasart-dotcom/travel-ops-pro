// ============================================
// One address for the app: www.<domain> → <domain>
// ============================================
// The app answered on both autoura.net and www.autoura.net. Anything bound to
// one address broke on the other: Google returns a Gmail connect to
// GOOGLE_REDIRECT_URI (autoura.net), and the connect cookie set on
// www.autoura.net never reached it — every attempt from www ended in "the
// connect session expired". Sign-in cookies are per address too. So the www
// address sends every request to the app's own address (NEXT_PUBLIC_APP_URL).
// Only that exact pair: any other host (Railway's, localhost, a preview) is
// left alone.

/** The origin to send this request to, or null when it is already there. */
export function canonicalRedirectOrigin(requestHost: string | null | undefined, appUrl: string | undefined): string | null {
  if (!requestHost || !appUrl) return null
  let canonical: URL
  try {
    canonical = new URL(appUrl)
  } catch {
    return null
  }
  const host = requestHost.split(',')[0].trim().toLowerCase()
  if (host !== `www.${canonical.host.toLowerCase()}`) return null
  return `${canonical.protocol}//${canonical.host}`
}
