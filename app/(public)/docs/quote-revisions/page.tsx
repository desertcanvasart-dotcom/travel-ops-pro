import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

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
        Every <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B quote</Link> and{' '}
        <Link href="/docs/b2c-quotes" className="text-primary-600 hover:underline">B2C offer</Link> keeps a numbered
        history of itself. The <strong>Revision history</strong> panel is in the side column of the quote&apos;s page.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">When a revision is taken</h2>
        <p className="text-gray-600 mb-3">A copy of the whole quote is saved as the next version when:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>a B2B quote is made (saved from the calculator, made from a trip on the Pricing Grid, or made by Order Intake), or a B2C offer is made;</li>
          <li>it is edited on its page (status, notes, valid-until date, and for a B2C offer a re-price);</li>
          <li>its status is changed in bulk from the B2B list;</li>
          <li>a B2C offer is sent by email or WhatsApp;</li>
          <li>it is reverted to an earlier version.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The list is newest first. Each entry shows its version number, the reason (for example &ldquo;Marked
          accepted&rdquo; or &ldquo;Sent via email&rdquo;), when, and who did it. The person is always the one signed
          in. The latest is marked <strong>current</strong>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Comparing</h2>
        <p className="text-gray-600 mb-3">
          The compare button on an older version lists the fields that differ from the current one, with both values.
          Only changed fields are shown.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>B2B</strong>: status, trip name, client name, travel date, adults, children, total cost, margin % and
            amount, selling price, price per person, currency, tour leader (included and cost), single supplement, EUR
            passport, season, season name, season premium % and amount, valid until, services and notes.
          </li>
          <li>
            <strong>B2C</strong>: status, travellers, tier, total cost, margin % and amount, selling price, price per
            person, currency, valid until, internal notes and client notes.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reverting</h2>
        <p className="text-gray-600 mb-3">
          The revert button on an older version puts the quote back as it was in that version, after you confirm:
          prices, season premium, status, client details, services and notes. The revert is itself saved as a new
          version, so nothing is lost.
        </p>
        <Tip>
          Reverting is for managers and above. It is refused for a B2B quote that has been converted to an itinerary or
          booked, and for a B2C offer that has been booked: those quotes are the record of the price that was sold.
          Anyone who can open the quote can see its history and compare versions.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Bulk changes on the B2B list</h2>
        <p className="text-gray-600">
          Tick quotes on the B2B Quotes list to set their status or delete them together (managers and above). Each
          quote whose status changes gets its own revision. Converted and booked quotes are skipped by both actions, and
          an offer past its valid-until date is not set to Accepted; the page says how many were skipped.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Two older versions cannot be compared with each other; each is compared with the current one.</li>
          <li>A revision cannot be edited or deleted.</li>
          <li>Changes to a B2B quote&apos;s language versions (titles, translated notes) are not in its revisions.</li>
          <li>Converting a quote to an itinerary does not add a revision; the quote&apos;s Converted status and link show it.</li>
        </ul>
      </section>
    </div>
  )
}
