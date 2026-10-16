import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

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

      <div className="mb-6 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-4 text-sm text-amber-800">
        <strong>Hidden from the menu.</strong> Concierge Leads is not in the menu for anyone at the moment. The screen still works at <code className="bg-amber-100 px-1.5 py-0.5 rounded">/concierge-briefs</code>, and briefs keep arriving and appearing in the <Link href="/docs/copilot" className="underline">AI Copilot</Link>. There is no per-company switch.
      </div>
      <p className="text-gray-600 mb-8">
        A concierge brief is a structured trip request sent by the AI Concierge on your website. It already holds the visitor&apos;s details, dates, destinations, interests and constraints. You triage briefs against the reply time the concierge promised, answer them from the Copilot, and turn them into a draft itinerary.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The owner, <strong>Administrators</strong>, <strong>Managers</strong> and <strong>Agents</strong> can open <strong>Concierge Leads</strong>. Viewers can&apos;t.</li>
          <li>You see only the briefs of the company you are working in.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How Briefs Arrive</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The concierge sends each brief to the app, signed with a secret. Each company has its own secret, and the secret that signed a brief decides which company it belongs to. A brief that matches no secret is refused. (An older single shared secret is still accepted; its briefs go to the default company.)</li>
          <li>The app finds the visitor among your clients by email, then phone, or adds them as a new client, and saves their preferences and a note with the brief&apos;s summary.</li>
          <li>Each brief also opens a thread in the AI Copilot (as an email thread), marked as coming from the concierge. It is not drafted automatically.</li>
          <li>When the concierge sends an updated brief (a new revision), the brief is updated and goes back to <strong>Needs Review</strong>. A repeat of the same revision is ignored, and an older revision arriving late is kept in the history without changing the current brief.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Concierge Leads Screen</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Tabs: <strong>Needs Review</strong> (shown first), <strong>In Progress</strong>, <strong>Responded</strong>, <strong>Archived</strong> and <strong>All</strong>. Each count is the number of the company&apos;s briefs with that status.</li>
          <li>The screen lists the newest 200 briefs. When there are more, a line says &ldquo;Showing the newest 200 of N briefs&rdquo;; the counts still include all of them.</li>
          <li>Each card shows the visitor, when the brief arrived, the trip (dates or length, travellers, destinations), interests and constraints, and the reply-time badge.</li>
          <li>If the briefs can&apos;t be loaded, a red message says so (the screen no longer shows an empty list instead).</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reply-Time Badge</h2>
        <p className="text-gray-600 mb-3">
          The concierge tells the visitor when to expect an answer. The badge counts down to that time:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Due in &hellip;</strong> &mdash; more than two hours left (green), or two hours or less (amber)</li>
          <li><strong>Overdue &hellip;</strong> &mdash; the time has passed (red)</li>
          <li>No badge once the brief is Responded or Archived, or when no time was promised</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A card may also show <strong>No contact</strong> (the visitor left no usable email or phone) and <strong>rev N</strong> for an updated brief.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Moving a Brief Along</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Needs Review</strong>: <strong>Start review</strong> or <strong>Archive</strong></li>
          <li><strong>In Progress</strong>: <strong>Mark responded</strong> or <strong>Archive</strong></li>
          <li><strong>Responded</strong>: <strong>Reopen</strong> or <strong>Archive</strong></li>
          <li><strong>Archived</strong>: <strong>Reopen</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>Details</strong> opens a drawer with everything in the brief: Contact, Trip, Preferences, Constraints, Response window (the promised time, in Cairo and visitor time), the chat Transcript and Meta (conversation id, revision, flags).
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Replying and Creating an Itinerary</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Open the brief&apos;s thread in the <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link>. Press <strong>Generate draft reply</strong>, then review, approve and send as usual.</li>
          <li>The same panel has <strong>Create itinerary in &lt;company&gt;</strong>. It creates one draft itinerary in the brief&apos;s company, whichever workspace you are in, and then shows <strong>View itinerary</strong>. Pressing it again never makes a second one.</li>
          <li>The itinerary gets the visitor as client, a trip name from the destinations and length (&ldquo;Egypt trip&rdquo; when the brief has neither), the brief summary as notes, and the company&apos;s default currency. Travellers are the brief&apos;s count (2 if it has none), all as adults. The start date is the brief&apos;s specific date, or 30 days from today if it has none; the length is the brief&apos;s trip length, or 7 days. The price is 0. Check these on the itinerary before you work on it.</li>
        </ul>
        <Tip>
          A placeholder start date or traveller count is not flagged on the itinerary. Compare it with the brief&apos;s <strong>Trip</strong> section.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The brief&apos;s status and the Copilot thread&apos;s status are separate. Sending a reply in the Copilot does not mark the brief Responded, and marking it Responded does not close the thread.</li>
          <li>It does not build the day-by-day plan. Open the itinerary and use the AI tools there.</li>
          <li>Briefs older than the newest 200 are not listed (they still count in the tabs).</li>
          <li>It can&apos;t be switched on or off per company, and it is not in the menu.</li>
        </ul>
      </section>
    </div>
  )
}
