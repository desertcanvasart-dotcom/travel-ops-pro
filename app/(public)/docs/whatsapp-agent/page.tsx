import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function WhatsAppAgentDocsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">WhatsApp AI Agent</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">WhatsApp AI Agent</h1>
      <p className="text-gray-600 mb-8">
        The WhatsApp AI Agent is a reply-suggestion engine that is built but <strong>not yet shown anywhere in the
        app</strong>. No screen asks it for a suggestion, no screen shows one, and there is no switch for it in Settings.
        This page says what exists today, so nobody looks for a button that is not there.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What you can use today</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            Every incoming WhatsApp message is also added to <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link>&apos;s
            inbox. Draft replies for WhatsApp customers come from there.
          </li>
          <li>
            In the <Link href="/docs/communication" className="text-primary-600 hover:underline">Unified Inbox</Link>,
            <strong> Translation</strong> and <strong>Generate Itinerary</strong> work on WhatsApp conversations.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What is built but not connected</h2>
        <p className="text-gray-600 mb-3">
          The agent writes one suggested reply to the latest customer message, using read-only lookups in your
          company&apos;s own data:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Search customer trips</strong> &mdash; the linked client&apos;s itineraries and bookings.</li>
          <li><strong>Look up itinerary</strong> &mdash; one trip&apos;s days and pricing.</li>
          <li><strong>Check availability</strong> &mdash; capacity for the dates, and group departures in the range.</li>
          <li><strong>Escalate to human</strong> &mdash; flags complaints, cancellations, refunds, money questions and urgent requests instead of answering them.</li>
        </ul>
        <p className="text-gray-600 mt-3 mb-3">
          A suggestion carries a confidence figure and whether it should be escalated. It is stored on the conversation
          and never sent: it cannot send anything or change any record.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It is off for every company until switched on. The switch exists only as a setting behind the API (admins and managers); there is no screen for it.</li>
          <li>Each request counts against the same AI draft limit as the other suggestion features: 20 per person every 5 minutes.</li>
          <li>Separate services that write several reply options for a WhatsApp or email message, in a chosen tone, exist the same way: built, with no screen that uses them.</li>
        </ul>
        <Tip>
          Until suggestions appear in the inbox, write WhatsApp replies yourself in the Unified Inbox, or start from the
          AI Copilot&apos;s draft.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not show suggestions in the Unified Inbox or the WhatsApp Inbox.</li>
          <li>It does not reply to customers on its own, and there is no automatic WhatsApp reply.</li>
          <li>It cannot be switched on from Settings.</li>
        </ul>
      </section>
    </div>
  )
}
