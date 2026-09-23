import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    // The legacy XSS auditor is gone from every current browser, and where it
    // survives, "block" mode could itself be abused to blank pages. Current
    // guidance (OWASP, MDN) is to turn it off and rely on CSP.
    key: 'X-XSS-Protection',
    value: '0',
  },
  {
    // A deliberately CONSERVATIVE policy: the directives below cannot break
    // the app's scripts, styles, fonts, images or API calls, but they close
    // plugin content (<object>/<embed>), <base>-tag hijacking and framing by
    // other sites (the CSP twin of X-Frame-Options). A full script-src policy
    // needs nonces threaded through the app and is a separate piece of work.
    key: 'Content-Security-Policy',
    value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
]

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // (serverActions.bodySizeLimit: '60mb' removed — it applies ONLY to Server
  // Actions, and this app has none; the file imports it was added for are API
  // routes, which it never governed.)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default withNextIntl(nextConfig)