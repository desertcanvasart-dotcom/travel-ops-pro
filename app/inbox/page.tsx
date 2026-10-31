'use client'

// ============================================
// /inbox — All · Email · WhatsApp
// ============================================
// The three inboxes as tabs of one page (?channel=), each moved as it was
// into ./_views: All was /communications, Email was this page, WhatsApp was
// /whatsapp-inbox. The old addresses redirect to their tab and keep their
// query (?conversation=, ?awaiting_reply=, ?gmail=), which each view still
// reads from the address. Every tab is agent-and-above, as each page was.
//
// The views fill the screen: under the tab strip, the chrome above them is
// the top bar plus the strip.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import AllView from './_views/AllView'
import EmailView from './_views/EmailView'
import WhatsAppView from './_views/WhatsAppView'

const PAGE = tabbedPage('/inbox')

export default function InboxPage() {
  return (
    <div style={{ '--app-chrome': 'calc(var(--top-bar) + var(--tab-strip))' } as React.CSSProperties}>
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>}>
        <UrlTabs
          page={PAGE}
          render={tab => tab === 'all' ? <AllView /> : tab === 'email' ? <EmailView /> : tab === 'whatsapp' ? <WhatsAppView /> : null}
        />
      </Suspense>
    </div>
  )
}
