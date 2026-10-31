'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Inter } from "next/font/google"
import "./globals.css"
import Sidebar from "@/components/Sidebar"
import TopBar from "@/components/nav/TopBar"
import { isSettingsPath, rememberAppPage } from "@/lib/nav/settings-return"
import { AuthProvider } from './contexts/AuthContext'
import { PreferencesProvider } from './contexts/PreferencesContext'
import { ConfirmDialogProvider } from '@/components/ConfirmDialog'
import { IntlClientProvider } from './providers/IntlClientProvider'

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()
  // Settings has its own menu in place of the sidebar (app/settings/layout.tsx).
  const inSettings = isSettingsPath(pathname)

  // Every page outside Settings is where Settings' "Back to app" returns to.
  useEffect(() => {
    rememberAppPage(pathname + window.location.search)
    setMobileNavOpen(false)
  }, [pathname])
  
  // Pages that should NOT show the sidebar (public pages)
  const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/terms', '/privacy', '/contact', '/integrations', '/about', '/blog']
  // The blog's posts (/blog/<slug>): marketing pages, so they keep the providers.
  const marketingPrefixes = ['/blog/']
  // Prefixed public sections, matched by prefix because their paths are dynamic.
  // /share/[token] is a CLIENT-facing page: a traveller must never be shown the
  // operator's sidebar and navigation.
  // '/portal/' is the same: the traveller's own page for a booking. It also
  // ACCEPTS input, which makes showing them the operator's navigation worse
  // than merely untidy.
  const publicPrefixes = ['/share/', '/portal/']
  // '/order' is the hosted order form: like /share and /portal a CUSTOMER
  // page, but at a fixed path rather than behind a token.
  const customerPages = ['/order']
  const isPublicPage =
    publicPages.includes(pathname) || customerPages.includes(pathname) || publicPrefixes.some(p => pathname.startsWith(p)) || marketingPrefixes.some(p => pathname.startsWith(p))

  // A CUSTOMER page — token-gated, no session, never will have one. It mounts
  // none of the operator providers, because AuthProvider and
  // PreferencesProvider fetch /api/notifications, /api/user-preferences and
  // /api/exchange-rates on mount. With no session those 401 in a loop: noise in
  // the operator's logs, needless requests from a traveller's phone, and enough
  // re-rendering to make the page feel broken.
  //
  // The marketing pages keep the providers — some of them use translations.
  const isCustomerPage = customerPages.includes(pathname) || publicPrefixes.some(p => pathname.startsWith(p))

  // The two-factor screens (/two-factor, /two-factor/setup): signed in, but
  // not yet allowed any API — the middleware refuses them until the code is
  // entered. So they mount translations only, never the providers that fetch
  // /api/notifications and friends on mount (those would 401 in a loop).
  if (pathname === '/two-factor' || pathname.startsWith('/two-factor/')) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className} suppressHydrationWarning>
          <IntlClientProvider>
            <main className="min-h-screen">{children}</main>
          </IntlClientProvider>
        </body>
      </html>
    )
  }

  if (isCustomerPage) {
    return (
      <html lang={pathname.startsWith('/portal/') || customerPages.includes(pathname) ? 'ja' : 'en'} suppressHydrationWarning>
        <body className={inter.className} suppressHydrationWarning>
          <main className="min-h-screen">{children}</main>
        </body>
      </html>
    )
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <IntlClientProvider>
          <AuthProvider>
            <PreferencesProvider>
              <ConfirmDialogProvider>
              {isPublicPage ? (
                // Public pages - no sidebar
                <main className="min-h-screen">
                  {children}
                </main>
              ) : (
                // App pages: the top bar over the sidebar (or, in Settings,
                // the Settings menu) and the page.
                <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
                  <TopBar
                    showMenuButton={!inSettings}
                    menuOpen={mobileNavOpen}
                    onMenuToggle={() => setMobileNavOpen(o => !o)}
                  />
                  <div className="flex flex-1 min-h-0">
                    {!inSettings && (
                      <Sidebar
                        isCollapsed={isCollapsed}
                        setIsCollapsed={setIsCollapsed}
                        mobileOpen={mobileNavOpen}
                        onMobileClose={() => setMobileNavOpen(false)}
                      />
                    )}
                    <main className="flex-1 min-w-0 overflow-y-auto">
                      {children}
                    </main>
                  </div>
                </div>
              )}
            </ConfirmDialogProvider>
            </PreferencesProvider>
          </AuthProvider>
        </IntlClientProvider>
      </body>
    </html>
  )
}