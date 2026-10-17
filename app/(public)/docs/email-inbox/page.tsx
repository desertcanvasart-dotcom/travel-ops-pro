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
        <strong>Communicate &rsaquo; Email Inbox</strong> is a Gmail mailbox inside Autoura, read live from Gmail: read,
        reply, compose and file mail without leaving the app. Admins, managers and agents see it (the owner always does);
        viewers do not.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Which mailbox you see</h2>
        <p className="text-gray-600 mb-3">
          Mailboxes belong to a company. A Gmail connection serves the company it was connected in, and each company sees
          only its own.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>If you connected your own Gmail in the company you are working in, you see that mailbox.</li>
          <li>Otherwise you see the company&apos;s mailbox: the longest-standing connection in the company. The header then says <strong>Mailbox: address (shared)</strong>.</li>
          <li>If you belong to two companies, switching company switches the mailbox.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The same company mailbox sends the system&apos;s own email (quotes, invoices, reminders).
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Connecting Gmail</h2>
        <p className="text-gray-600 mb-3">
          When no mailbox is connected for you, the page shows <strong>Connect Your Gmail</strong>. Admins and managers get
          a <strong>Connect Gmail</strong> button that opens Settings &rsaquo; Email; agents are asked to have an admin or
          manager connect it, because Settings is not open to them.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>In <strong>Settings &rsaquo; Email</strong>, click <strong>Connect Gmail</strong>.</li>
          <li>On Google&apos;s screen, tick every permission (read, send and manage email) and finish within 10 minutes in the same tab.</li>
          <li>You land on the Unified Inbox. The connection is stored encrypted and serves the company you were working in.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          <strong>Disconnect</strong> (in Settings &rsaquo; Email) stops showing that address&apos;s mail in the Unified
          Inbox, on client pages and on the dashboard. The mail is kept: connect the same address again to bring it back.
        </p>
        <Tip>When email stops sending, check this connection first. An expired Google authorisation is the most common cause, and reconnecting fixes it.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Using the inbox</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Folders</strong> &mdash; Inbox (with its unread count), Sent, Drafts, Spam and Trash, plus your Gmail labels.</li>
          <li><strong>All Mail / Unread / Starred</strong> &mdash; narrow the folder you are in. <strong>Search emails</strong> searches the mailbox.</li>
          <li><strong>New mail</strong> &mdash; the page checks Gmail every 2 minutes and shows &ldquo;N new emails received&rdquo; with <strong>Refresh to view</strong>. <strong>Refresh</strong> reloads now.</li>
          <li><strong>Archive</strong> takes mail out of the Inbox. In Spam the same button is <strong>Not spam</strong>, in Trash it is <strong>Restore</strong>.</li>
          <li><strong>Delete</strong> moves mail to Trash. In Trash it is <strong>Delete forever</strong>, which asks first and cannot be undone.</li>
          <li><strong>Mark as read / unread</strong>, <strong>Move to folder</strong> (your Gmail labels), and select several messages to act on them together.</li>
          <li><strong>Parse to Itinerary</strong> &mdash; opens the Pricing Grid with the email. A website order form goes to Order Intake instead (or to the quote it already became).</li>
          <li><strong>Compose</strong>, <strong>Reply</strong> and <strong>Forward</strong> with formatting, attachments and images.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Everything you do here happens in Gmail itself, so Gmail on your phone shows the same result.
        </p>
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
                <td className="px-3 py-2 align-top">One mailbox, live from Gmail: everything in it, automated mail included.</td>
                <td className="px-3 py-2 align-top">Stored conversations from all the company&apos;s connected mailboxes, beside WhatsApp, portal and trip chats. Automated mail is not imported. Conversations can be assigned, archived and restored from Trash there.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mt-3">
          See <Link href="/docs/communication" className="text-primary-600 hover:underline">Unified Inbox</Link> for archiving
          and Trash on stored conversations; both also change the thread in Gmail.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It shows one mailbox at a time. A company with several connected addresses sees the others&apos; mail in the Unified Inbox, not here.</li>
          <li>Agents cannot connect or disconnect Gmail.</li>
          <li>Conversations are not assigned here; assignment is in the Unified Inbox.</li>
        </ul>
      </section>
    </div>
  )
}
