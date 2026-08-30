import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ActivityLogPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Activity Log</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Activity Log</h1>
      <p className="text-gray-600 mb-8">
        <strong>Settings &rarr; Activity Log</strong> is the audit trail: a record of every change made through the application &mdash; who made it, when, what it touched, and from where. It is admin-only, and its records cannot be edited or deleted from the app.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What Each Entry Records</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Timestamp</strong> and the <strong>user&apos;s email</strong></li>
          <li><strong>Action</strong> &mdash; Create, Update or Delete</li>
          <li><strong>Target</strong> &mdash; the resource and its internal ID (an itinerary, a rate, an invoice&hellip;)</li>
          <li><strong>Endpoint</strong> &mdash; the HTTP method and API path that made the change</li>
          <li><strong>Source IP</strong> &mdash; where the request came from</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Finding Things</h2>
        <p className="text-gray-600 mb-3">Filter by user, area, action type and date range. Typical questions it answers:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>&ldquo;Who changed this rate, and when?&rdquo; &mdash; filter the area to rates and search the record</li>
          <li>&ldquo;What did this account do last Tuesday?&rdquo; &mdash; filter by user and date</li>
          <li>&ldquo;What was deleted this month?&rdquo; &mdash; filter action to Delete</li>
        </ul>
        <Tip>Rate changes additionally reach managers as a digest notification, so pricing edits are visible without anyone reading the log.</Tip>
      </section>
    </div>
  )
}
