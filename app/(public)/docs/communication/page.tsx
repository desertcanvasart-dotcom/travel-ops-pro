import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function CommunicationPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Unified Inbox</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Unified Inbox</h1>
      <p className="text-gray-600 mb-8">
        <strong>Communicate &rsaquo; Unified Inbox</strong> lists your company&apos;s customer conversations from four
        channels in one place: WhatsApp, email, portal messages and trip chats. You read and answer each one in the
        panel on the right. Admins, managers and agents see it (the owner always does); viewers do not.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What is in the list</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>WhatsApp</strong> &mdash; chats with your company&apos;s WhatsApp number.</li>
          <li><strong>Email</strong> &mdash; threads from the Gmail addresses connected for your company. Each company has its own mailboxes: one company never sees the other&apos;s mail. A disconnected address&apos;s threads are kept but leave the list until the address is connected again. Automated mail (codes, newsletters, notifications) is not imported as a conversation.</li>
          <li><strong>Portal</strong> &mdash; travellers writing from their booking page. See <Link href="/docs/portal-messages" className="text-primary-600 hover:underline">Portal Messages</Link>.</li>
          <li><strong>Trip chat</strong> &mdash; travellers writing from a trip&apos;s share link. One conversation per trip, built from your company&apos;s latest 1,000 trip messages.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The list is sorted by the latest message. Each channel contributes at most 50 conversations, and the list
          shows the newest 50 of those. It refreshes every 30 seconds; the open conversation refreshes every 15 seconds.
          While a Gmail mailbox is connected for you (your own or the company&apos;s), the page also checks Gmail for new mail every 2 minutes.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tabs, search and filters</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>All / WhatsApp / Email / Portal / Trip chat</strong> &mdash; the number on each tab is how many conversations that channel has under the current search and filters, whichever tab is open.</li>
          <li><strong>Search</strong> &mdash; WhatsApp by phone number or name; email by address, name or subject; portal by traveller name or booking code; trip chats by client name, trip code or trip name.</li>
          <li><strong>Unread only</strong> &mdash; conversations with unread customer messages.</li>
          <li><strong>Awaiting reply</strong> &mdash; email conversations where the customer wrote after your last reply. The badge shows how long they have waited and turns red after 24 hours. No-reply and service addresses never count as waiting.</li>
          <li><strong>Unassigned</strong> &mdash; WhatsApp and email conversations nobody holds. Portal and trip conversations cannot be assigned, so they are not listed here.</li>
          <li><strong>Status</strong> &mdash; <strong>Active</strong> (the default), <strong>Archived</strong>, <strong>Spam</strong> or <strong>All statuses</strong>. Portal and trip conversations have no status: they show under Active and All statuses only.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>Clear filters</strong> (shown when nothing matches) puts everything back to All and Active.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Answering</h2>
        <p className="text-gray-600 mb-3">
          Type in the box under the conversation and send. A WhatsApp reply goes from your company&apos;s number, an email
          reply from the mailbox the thread came from, and a portal or trip reply is shown to the traveller on their page
          with an email telling them a reply is waiting. When a send fails, or the traveller could not be emailed, a
          yellow notice under the conversation says why.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Translation</strong> &mdash; translate incoming messages to English and write in English to send in the customer&apos;s language.</li>
          <li><strong>Generate Itinerary</strong> &mdash; opens the Pricing Grid with the conversation, the client and their contact details filled in.</li>
          <li><strong>View Client</strong> / <strong>Create Client</strong> &mdash; open the linked client, or start a new one pre-filled with the phone number (WhatsApp), the address (email) or the booking&apos;s client email (portal and trip chats).</li>
          <li><strong>Not a lead</strong> &mdash; on an email that was made a lead automatically, removes the lead.</li>
          <li><strong>Mark as read / Mark as unread</strong> &mdash; changes the unread count in this list; for email it also changes the thread in Gmail.</li>
          <li><strong>Archive</strong> (email) &mdash; moves the conversation to Archived here and archives the thread in Gmail. Open it under Status &rsaquo; Archived and use <strong>Move to inbox</strong> to bring it back. A new message in the thread brings it back on its own.</li>
          <li><strong>Delete</strong> &mdash; a WhatsApp conversation is hidden and comes back when the customer writes again. An email conversation goes to the Trash here and in Gmail.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The compose button at the bottom of the list writes a new email.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Assigning conversations</h2>
        <p className="text-gray-600 mb-3">
          WhatsApp and email conversations can be assigned to an agent from the conversation header. The person assigned a
          conversation gets a notification that opens it here, unless they assigned it to themselves. The list shows each agent&apos;s number of open
          chats: active, not deleted WhatsApp conversations assigned to them, counted live. There is no cap per agent.
        </p>
        <p className="text-gray-600 mb-3">
          The <strong>Manage Agents</strong> button lists your company&apos;s team members. Admins and managers can add and
          deactivate agents; anyone can switch their own availability between Available and Away. Only available agents
          are offered for assignment.
        </p>
        <p className="text-gray-600">
          When you add an agent with the email address of someone who logs in to this company, the agent is linked to that
          login. An agent without a login can still be assigned conversations, but nobody sees them as their own.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Trash</h2>
        <p className="text-gray-600 mb-3">
          The trash icon at the top of the list shows deleted email conversations. <strong>Restore</strong> brings one back
          here and in Gmail. The Trash is the company&apos;s: everyone who can open the Unified Inbox sees the same Trash,
          as they see the same conversations. Mail hidden to keep it private is never listed there.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sync Emails</h2>
        <p className="text-gray-600">
          The download icon syncs <em>your own</em> connected Gmail now. The company&apos;s connected mailboxes also sync on
          their own every 10 minutes. If you have no Gmail of your own connected, the button says so; connecting Gmail is
          done in Settings &rsaquo; Email, which only admins and managers can open.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The WhatsApp-only inbox</h2>
        <p className="text-gray-600">
          A separate WhatsApp Inbox page (<code>/whatsapp-inbox</code>, not in the menu) shows the same WhatsApp
          conversations with <strong>All / Mine / Unassigned</strong> filters, <strong>Claim for myself</strong> and an
          activity log of assignments and replies. Mine and Claim work for a person whose login is linked to an agent
          (see above). It refreshes every 15 seconds.
        </p>
        <Tip>
          Add every person who answers customers as an agent with their login email. Then assignments notify them, and
          Mine shows them their own chats.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not page through older conversations: only the newest 50 are listed. Use search to find an older one. A notification link still opens its conversation, however old.</li>
          <li>Portal and trip conversations cannot be assigned, archived or deleted here.</li>
          <li>Suggested AI replies are not shown in this inbox. See <Link href="/docs/whatsapp-agent" className="text-primary-600 hover:underline">WhatsApp AI Agent</Link>.</li>
          <li>Nothing in the app marks a conversation as spam yet, so the Spam status filter is normally empty. Gmail&apos;s own spam folder is in the <Link href="/docs/email-inbox" className="text-primary-600 hover:underline">Email Inbox</Link>.</li>
        </ul>
      </section>
    </div>
  )
}
