import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function IntegrationsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Integrations</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Integrations</h1>
      <p className="text-gray-600 mb-8">
        Autoura connects to the tools your team already uses, so conversations, communications, and finances all flow into one system. Three integrations are live today: <strong>WhatsApp Business</strong>, <strong>Gmail</strong>, and accounting sync to <strong>Xero</strong> and <strong>QuickBooks</strong>.
      </p>

      {/* WhatsApp */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp Business</h2>
        <p className="text-gray-600 mb-3">
          Connect your WhatsApp Business account and client messages land in Autoura&rsquo;s unified inbox. AI reads each incoming message and extracts the details that matter:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Unified inbox</strong> &mdash; Receive and reply to client conversations in one place</li>
          <li><strong>AI parsing</strong> &mdash; Client names, dates, and preferences are pulled from every message</li>
          <li><strong>Send out</strong> &mdash; Deliver quotes and documents directly back over WhatsApp</li>
          <li><strong>Full history</strong> &mdash; Every conversation is kept against the client profile</li>
        </ul>
        <ScreenshotPlaceholder caption="WhatsApp conversations in the Autoura unified inbox" />
      </section>

      {/* Gmail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Gmail</h2>
        <p className="text-gray-600 mb-3">
          Connect Gmail with secure OAuth and send professional emails straight from Autoura through your own account. Tokens are refreshed automatically, so the connection stays live without re-authenticating.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Send quotes &amp; itineraries</strong> &mdash; With PDF attachments, from your address</li>
          <li><strong>Invoice delivery</strong> &mdash; Email invoices to clients directly</li>
          <li><strong>Automatic logging</strong> &mdash; Sent mail is recorded on the client profile</li>
        </ul>
        <Tip>
          Because email goes through your own Gmail account, replies arrive in your normal mailbox and your messages keep your sending reputation.
        </Tip>
      </section>

      {/* Accounting */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accounting: Xero &amp; QuickBooks</h2>
        <p className="text-gray-600 mb-3">
          Autoura pushes your financial records into <strong>Xero</strong> or <strong>QuickBooks Online</strong> so your accountant works from their own books without re-keying anything. The sync is <strong>push-only</strong> &mdash; Autoura stays the source of truth and writes out to the accounting platform.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Client invoices</strong> &mdash; Pushed as accounts-receivable invoices</li>
          <li><strong>Supplier expenses</strong> &mdash; Pushed as bills / vendor bills</li>
          <li><strong>Payments</strong> &mdash; Invoice and bill payments synced automatically</li>
          <li><strong>Contacts</strong> &mdash; Customers and vendors created on the fly</li>
          <li><strong>Resilient sync</strong> &mdash; Failed syncs are tracked and retried, with errors visible per record</li>
        </ul>
        <ScreenshotPlaceholder caption="Accounting sync status with retry and error tracking" />
      </section>

      {/* Connecting */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Connecting an Integration</h2>
        <p className="text-gray-600 mb-3">
          Each integration is connected from your settings using a secure OAuth handshake &mdash; you authorise Autoura with the provider and the connection is stored against your account. You can connect one accounting provider at a time, Xero or QuickBooks, alongside WhatsApp and Gmail.
        </p>
        <p className="text-gray-600">
          More channels are on the roadmap, including LINE and WeChat for messaging. Note that Autoura does <strong>not</strong> process card payments itself.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/analytics" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Analytics
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
