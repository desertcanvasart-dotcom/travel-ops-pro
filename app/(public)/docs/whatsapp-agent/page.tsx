import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

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
        The WhatsApp AI Agent composes a <strong>suggested reply</strong> to an incoming WhatsApp message by looking up your real data &mdash; the customer&apos;s trips, a specific itinerary, or live availability. It is <strong>draft-gated</strong>: the suggestion is stored for a human operator to review and send. The agent never sends a message on its own.
      </p>

      {/* Draft-Gated Safety Model */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Draft-Gated: Human Stays in the Loop</h2>
        <p className="text-gray-600 mb-3">
          Every reply the agent produces is a <strong>draft suggestion</strong>, not an outgoing message. It is saved against the conversation and waits for your approval.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The agent uses <strong>read-only</strong> tools &mdash; it can look things up but cannot change records or send anything</li>
          <li>Mutating and sending actions are intentionally left out of the toolset</li>
          <li>The feature is <strong>off by default</strong> and must be explicitly enabled per organization</li>
        </ul>
        <Tip>
          <strong>No surprise messages.</strong> The operator always reviews and presses send. The agent&apos;s job ends at proposing a well-grounded draft.
        </Tip>
        <ScreenshotPlaceholder caption="WhatsApp conversation with the agent's suggested reply awaiting operator review" />
      </section>

      {/* What the Agent Can Look Up */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the Agent Can Look Up</h2>
        <p className="text-gray-600 mb-3">
          The agent is <strong>tool-calling</strong>: before writing, it can query your organization&apos;s data (scoped to your records only) to ground the reply in fact. Its tools are:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Search customer trips</strong> &mdash; The linked client&apos;s itineraries and bookings, with dates and status</li>
          <li><strong>Look up itinerary</strong> &mdash; The day-by-day details and pricing of one specific trip</li>
          <li><strong>Check availability</strong> &mdash; Whether you have <strong>capacity</strong> for the travel dates, and optionally any scheduled group <strong>departures</strong> in the range</li>
          <li><strong>Escalate to human</strong> &mdash; Flag the conversation for an operator on complaints, cancellations, refunds, money questions, or anything urgent</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Because availability is checked against real capacity and departures, the draft won&apos;t promise dates you can&apos;t actually serve.
        </p>
      </section>

      {/* Confidence & Escalation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Confidence &amp; Escalation</h2>
        <p className="text-gray-600 mb-3">
          Each suggestion comes with a <strong>confidence</strong> signal and the agent&apos;s reasoning, so you can see how sure it is and which tools it used. When a message is sensitive &mdash; a complaint, a refund, a same-day request, or anything financial it&apos;s unsure about &mdash; the agent escalates to a human instead of guessing.
        </p>
      </section>

      {/* Multi-Variant Reply Suggestions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Multi-Variant Reply Suggestions</h2>
        <p className="text-gray-600 mb-3">
          Beyond the single tool-using agent, Autoura can generate <strong>several distinct draft options</strong> for a single message across both <strong>WhatsApp and email</strong>, so you can pick the wording that fits. These variants:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Are grounded in your knowledge base via the same semantic retrieval as the Copilot</li>
          <li>Respect a chosen <strong>tone</strong> and can follow a short instruction you provide</li>
          <li>Adapt to the recipient&apos;s preferred language</li>
          <li>Are written as drafts &mdash; like everything here, nothing is sent automatically</li>
        </ul>
        <ScreenshotPlaceholder caption="Multiple suggested reply options for one message, ready to pick and edit" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/concierge" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Concierge Briefs
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
