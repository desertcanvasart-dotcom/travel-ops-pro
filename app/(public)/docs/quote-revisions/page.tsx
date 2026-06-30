import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function QuoteRevisionsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Quote Revisions</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Quote Revisions</h1>
      <p className="text-gray-600 mb-8">
        Every B2B quote keeps a complete, versioned revision history. Each time a quote changes, the system snapshots the full quote as a new version &mdash; so you can review what changed, compare any two versions side&#8209;by&#8209;side, and revert to an earlier one without losing anything.
      </p>

      {/* How revisions are captured */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How Revisions Are Captured</h2>
        <p className="text-gray-600 mb-3">
          A new revision is recorded automatically whenever a quote is edited or its status changes. Each snapshot is numbered sequentially and stores the entire quote at that point in time, including:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Pricing</strong> &mdash; Total cost, margin percent &amp; amount, selling price, and price per person</li>
          <li><strong>Trip &amp; Client</strong> &mdash; Trip name, client name, travel date, adults and children</li>
          <li><strong>Terms</strong> &mdash; Currency, season, EUR passport flag, single supplement, tour leader, and valid&#8209;until date</li>
          <li><strong>Service Snapshot</strong> &mdash; The complete services breakdown as calculated at that version</li>
          <li><strong>Audit Trail</strong> &mdash; Who made the change, when, and a change reason or summary</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The most recent revision is flagged as <strong>current</strong>, and the version list is shown newest&#8209;first.
        </p>
        <ScreenshotPlaceholder caption="Revision history panel showing version numbers, editor, and change reason" />
      </section>

      {/* Comparing revisions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Comparing Two Revisions</h2>
        <p className="text-gray-600 mb-3">
          Pick any two versions to see a clean, field&#8209;level diff. The comparison highlights only the fields that actually changed and reports the total number of changes &mdash; so a partner&#8209;facing price revision is easy to explain. Compared fields include:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Status</strong> and <strong>valid&#8209;until</strong> date</li>
          <li><strong>Trip name</strong>, <strong>client name</strong>, and <strong>travel date</strong></li>
          <li><strong>Adults</strong> and <strong>children</strong></li>
          <li><strong>Total cost</strong>, <strong>margin %</strong>, <strong>margin amount</strong>, <strong>selling price</strong>, and <strong>price per person</strong></li>
          <li><strong>Currency</strong>, <strong>season</strong>, <strong>EUR passport</strong>, <strong>single supplement</strong>, and <strong>tour leader</strong></li>
          <li><strong>Services</strong> and <strong>notes</strong></li>
        </ul>
        <ScreenshotPlaceholder caption="Side-by-side revision comparison with changed fields highlighted" />
      </section>

      {/* Reverting */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reverting to an Earlier Version</h2>
        <p className="text-gray-600 mb-3">
          If a change was a mistake &mdash; or a partner prefers the previous offer &mdash; you can restore any earlier version in one step. Reverting:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Restores the live quote to the chosen version&apos;s data</li>
          <li>Records the revert itself as a <strong>new revision</strong>, so nothing is overwritten or lost</li>
          <li>Captures an optional revert reason for the audit trail</li>
        </ul>
        <Tip>
          <strong>Permissions:</strong> Reverting overwrites the live quote, so it is restricted to <strong>Manager</strong> role and above. Anyone can view the history and compare versions.
        </Tip>
      </section>

      {/* Bulk operations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Bulk Quote Operations</h2>
        <p className="text-gray-600 mb-3">
          When you are managing many quotes at once, select multiple quotes from the list and act on them together:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Bulk Status Update</strong> &mdash; Move a batch of quotes to a new status (for example, Sent or Expired) in one action. Each affected quote still gets its own revision snapshot recording the bulk change.</li>
          <li><strong>Bulk Delete</strong> &mdash; Remove several quotes at once to keep your list clean.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Bulk actions also require <strong>Manager</strong> role or higher.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/b2c-quotes" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: B2C Quotes
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
