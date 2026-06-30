import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function ConciergeBriefsDocsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Concierge Briefs</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Concierge Briefs</h1>
      <p className="text-gray-600 mb-8">
        Concierge Briefs are structured trip requests that arrive from an AI concierge or partner channel. Each brief carries the traveller details, dates, destinations, interests, and constraints already captured &mdash; so instead of re-keying an enquiry, you triage it against a response deadline and promote it straight into a conversation thread or an itinerary.
      </p>

      {/* The Briefs Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Briefs Inbox</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Concierge Briefs</strong> to see incoming requests as cards. Each brief includes:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Visitor details</strong> &mdash; Name, email, phone, and preferred contact method</li>
          <li><strong>Trip shape</strong> &mdash; Traveller count, dates or date window, trip length, origin, and nationality</li>
          <li><strong>Preferences</strong> &mdash; Destinations, interests, must-see and must-avoid, and comfort level</li>
          <li><strong>Constraints</strong> &mdash; Dietary, mobility, religious, and medical notes</li>
          <li><strong>Summary &amp; flags</strong> &mdash; A short brief summary and any flags that need attention</li>
        </ul>
        <ScreenshotPlaceholder caption="Concierge Briefs inbox with brief cards grouped by review status" />
      </section>

      {/* SLA Triage */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">SLA Triage</h2>
        <p className="text-gray-600 mb-3">
          When the AI concierge takes a brief, it commits a <strong>response deadline</strong> to the visitor. Autoura turns that deadline into a clear urgency indicator on every card, so you always know what to answer first:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Due in &hellip;</strong> &mdash; Time remaining before the committed response time</li>
          <li><strong>Soon</strong> &mdash; Two hours or less remaining</li>
          <li><strong>Overdue</strong> &mdash; The deadline has passed</li>
          <li><strong>Responded</strong> &mdash; The commitment was honoured</li>
        </ul>
        <Tip>
          The SLA indicator is driven by the deadline the concierge actually promised the visitor &mdash; not an internal guess &mdash; so your follow-up matches what the customer was told.
        </Tip>
      </section>

      {/* Review Workflow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Review Workflow</h2>
        <p className="text-gray-600 mb-3">
          Briefs move through a simple status flow. Open a brief in the detail drawer to read everything, then advance it:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Needs Review</strong> &rarr; Start review</li>
          <li><strong>In Progress</strong> &rarr; Mark responded</li>
          <li><strong>Responded</strong> or <strong>Archived</strong> &mdash; Reopen any time if the request comes back</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Updated briefs arrive as <strong>revisions</strong>: a newer revision reopens the review automatically, replays of the same revision are ignored, and a late-arriving older revision is filed without disturbing the current one.
        </p>
        <ScreenshotPlaceholder caption="Brief detail drawer with full request fields and status actions" />
      </section>

      {/* Promoting a Brief */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Promoting a Brief</h2>
        <p className="text-gray-600 mb-3">
          A reviewed brief doesn&apos;t stay a dead end. You can promote it in two directions:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Into a conversation thread</strong> &mdash; The brief surfaces in the Copilot inbox alongside your WhatsApp and email threads, so you can reply in the same place</li>
          <li><strong>Into an itinerary</strong> &mdash; A new itinerary is created with the brief&apos;s client, dates, pax, and trip name already filled in, ready to open in the editor and build out day by day</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A matching client prospect is found or created automatically from the brief&apos;s email or phone, and the provenance chain &mdash; brief &rarr; thread &rarr; itinerary &mdash; stays linked so you can trace where a booking came from. Promotion is idempotent: a brief maps to at most one thread and one itinerary.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/copilot" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: AI Copilot &amp; Knowledge Base
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
