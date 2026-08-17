'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Inter } from "next/font/google"
import "./globals.css"
import Sidebar from "@/components/Sidebar"
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
  const pathname = usePathname()
  
  // Pages that should NOT show the sidebar (public pages)
  const publicPages = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/terms', '/privacy', '/contact', '/integrations', '/about']
  // Prefixed public sections, matched by prefix because their paths are dynamic.
  // /share/[token] is a CLIENT-facing page: a traveller must never be shown the
  // operator's sidebar and navigation.
  // '/portal/' is the same: the traveller's own page for a booking. It also
  // ACCEPTS input, which makes showing them the operator's navigation worse
  // than merely untidy.
  const publicPrefixes = ['/share/', '/portal/']
  const isPublicPage =
    publicPages.includes(pathname) || publicPrefixes.some(p => pathname.startsWith(p))

  // A CUSTOMER page — token-gated, no session, never will have one. It mounts
  // none of the operator providers, because AuthProvider and
  // PreferencesProvider fetch /api/notifications, /api/user-preferences and
  // /api/exchange-rates on mount. With no session those 401 in a loop: noise in
  // the operator's logs, needless requests from a traveller's phone, and enough
  // re-rendering to make the page feel broken.
  //
  // The marketing pages keep the providers — some of them use translations.
  const isCustomerPage = publicPrefixes.some(p => pathname.startsWith(p))

  if (isCustomerPage) {
    return (
      <html lang={pathname.startsWith('/portal/') ? 'ja' : 'en'} suppressHydrationWarning>
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
                // App pages - with sidebar
                <div className="flex h-screen overflow-hidden bg-gray-50">
                  <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
                  <main
                    className={`flex-1 overflow-y-auto transition-all duration-300 ${
                      isCollapsed ? 'lg:ml-16' : 'lg:ml-56'
                    }`}
                  >
                    {children}
                  </main>
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