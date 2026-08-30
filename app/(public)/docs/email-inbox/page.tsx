import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function EmailInboxPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Email Inbox</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Email Inbox</h1>
      <p className="text-gray-600 mb-8">
        <strong>Communications &rarr; Email Inbox</strong> is your connected Gmail inside Autoura: read, reply and compose without leaving the app. Until an account is connected, the page shows <strong>Connect Your Gmail</strong>, which routes to Settings &rarr; Email.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Connecting Gmail</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Settings &rarr; Email</strong> (or click Connect Gmail here)</li>
          <li>Approve the Google OAuth prompt &mdash; Autoura stores the connection encrypted</li>
          <li>All outbound email (quotes, invoices, reminders) now sends through this account, and inbound mail syncs to the shared inboxes</li>
        </ol>
        <Tip>When email stops sending, check this connection first &mdash; an expired Google authorisation is the most common cause, and reconnecting fixes it.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Inbox vs Unified Inbox</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Email Inbox</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Unified Inbox</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr>
                <td className="px-3 py-2 align-top">Your own mailbox, live from Gmail &mdash; everything in the account, including mail that is nobody else&apos;s business.</td>
                <td className="px-3 py-2 align-top">The team&apos;s shared view of <em>correspondence</em>: customer and supplier threads beside WhatsApp and portal messages. Automated mail (verification codes, newsletters) never enters it.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mt-3">Threads you hide stay visible only to you, the mailbox owner &mdash; hiding is how personal mail is kept personal.</p>
      </section>
    </div>
  )
}
