import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function CopilotAnalyticsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Copilot Analytics</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Copilot Analytics</h1>
      <p className="text-gray-600 mb-8">
        <strong>Home &rarr; Copilot Analytics</strong> shows how the <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link>&apos;s reply drafts are doing in your workspace: how many it wrote, how many were sent, dismissed or are still waiting, how often people accept and edit them, and which knowledge entries it leans on. Every figure counts <strong>drafts</strong> &mdash; one suggested reply to one incoming message &mdash; not conversations.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can See It</h2>
        <p className="text-gray-700">
          Admins, managers and agents see Copilot Analytics in the Home menu. The workspace owner always does. Viewers do not see the item, and opening the address directly is refused for them.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Choosing a Period</h2>
        <p className="text-gray-700 mb-3">
          The buttons at the top right pick which drafts are counted: <strong>Last 7d</strong>, <strong>Last 30d</strong> (the default), <strong>Last 90d</strong> or <strong>All time</strong>. The periods are rolling: &ldquo;Last 7d&rdquo; means the 7 &times; 24 hours up to now, not seven calendar days. A draft falls in the period by when it was written.
        </p>
        <p className="text-gray-700">
          The screen reads at most the newest 5,000 drafts in the period. When there are more, a note at the top says the figures are based on the newest 5,000 drafts, and older ones are left out of every card and chart.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Four Count Cards</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Drafts generated</strong> &mdash; every draft written in the period, whatever happened to it (expired drafts included).</li>
          <li><strong>Sent to customers</strong> &mdash; drafts that were sent.</li>
          <li><strong>Dismissed</strong> &mdash; drafts someone rejected.</li>
          <li><strong>Pending review</strong> &mdash; drafts nobody has acted on yet.</li>
        </ul>
        <p className="text-gray-700 mt-3">
          Drafts that were approved but not yet sent, and drafts that expired, count only in Drafts generated, so the other three cards need not add up to it.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Four Rate Cards</h2>
        <p className="text-gray-700 mb-3">Hover a card to see its definition.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Accept rate</strong> &mdash; approved and sent drafts, divided by all reviewed drafts (approved + sent + dismissed). Pending and expired drafts are left out.</li>
          <li><strong>Edit rate</strong> &mdash; of the sent drafts, the share someone edited before sending.</li>
          <li><strong>RAG hit rate</strong> &mdash; the share of drafts for which the Copilot found at least one matching entry in your <Link href="/docs/copilot-knowledge" className="text-primary-600 hover:underline">Copilot Knowledge</Link>.</li>
          <li><strong>Pre-generated</strong> &mdash; the share of drafts written in the background before anyone opened the conversation.</li>
        </ul>
        <p className="text-gray-700 mt-3">
          RAG hit rate, Pre-generated and the By tone breakdown can only be measured on drafts written after the app began recording those details. When some drafts in the period are older than that, a line under the cards says how many drafts these figures are measured on (for example &ldquo;measured on 120 of 300 drafts&rdquo;). The older drafts are left out of those three figures rather than counted as zero.
        </p>
        <p className="text-gray-700 mt-3">A rate with nothing to measure shows 0%.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Daily Volume</h2>
        <p className="text-gray-700">
          One bar per day that had drafts. The full bar is drafts generated that day; the green part is the share of them that were sent. Hover a bar for the date and both numbers. Days with no drafts are skipped rather than shown as empty bars, and the chart is hidden when the period has no drafts.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">By Channel, By Tone, Confidence</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>By channel</strong> &mdash; WhatsApp and Email, each with drafts generated and how many were sent. A draft with no channel recorded is counted as WhatsApp.</li>
          <li><strong>By tone</strong> &mdash; how many drafts were written in each tone, on the measured drafts only. A measured draft with no tone recorded shows as Unknown. &ldquo;No data&rdquo; means no measured drafts in the period.</li>
          <li><strong>Confidence</strong> &mdash; how sure the Copilot said it was about each draft: High, Medium, Low, or Unknown when it gave no rating. Counts every draft in the period.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top-Retrieved Knowledge</h2>
        <p className="text-gray-700 mb-3">
          The up to ten knowledge entries the Copilot pulled into drafts most often in the period, with a type badge (faq, policy, tour, custom, whatsapp pair), the entry&apos;s title (or the start of its text when it has no title) and how many drafts used it. An entry that has since been deleted shows as &ldquo;(untitled)&rdquo;.
        </p>
        <p className="text-gray-700">
          The line under the heading counts the active entries in your knowledge base. Long entries split into several pieces count once. It reads &ldquo;Your knowledge base is empty&rdquo; when there are none.
        </p>
        <Tip>A low RAG hit rate, or the same few entries at the top every week, usually points to gaps in <Link href="/docs/copilot-knowledge" className="text-primary-600 hover:underline">Copilot Knowledge</Link>. Adding the answers people keep typing by hand is the fix.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Per-User Activity</h2>
        <p className="text-gray-700">
          One row per team member who reviewed drafts in the period, busiest first. <strong>User</strong> is their email (or name). <strong>Reviewed</strong> is the drafts they acted on, <strong>Sent</strong> how many of those were sent, and <strong>Accept rate</strong> their approved and sent drafts divided by their approved, sent and dismissed drafts. Drafts nobody has reviewed do not appear here, and the table is hidden when there are none.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It counts drafts, not conversations or customers. A busy conversation with many drafts counts many times.</li>
          <li>It covers only your current workspace. A draft whose conversation has not yet been assigned to a workspace is not counted anywhere.</li>
          <li>It reads at most the newest 5,000 drafts per period (see the note above).</li>
          <li>There is no custom date range, no export, and no way to click through from a figure to the drafts behind it.</li>
          <li>Daily volume groups drafts by UTC date, so a draft written in Japan before 9:00 in the morning lands on the previous day&apos;s bar.</li>
        </ul>
      </section>
    </div>
  )
}
