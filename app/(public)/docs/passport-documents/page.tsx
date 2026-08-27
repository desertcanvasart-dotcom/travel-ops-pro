import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function PassportDocumentsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Passport &amp; Documents</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Passport &amp; Documents</h1>
      <p className="text-gray-600 mb-8">
        Travellers attach their passport page, and anything else you have asked for, from their
        own portal link. The scans stop arriving by email and living in somebody&rsquo;s inbox.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the traveller does</h2>
        <p className="text-gray-600 mb-3">
          In the <strong>パスポート・書類の添付</strong> section they get two slots:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Passport</strong> &mdash; one document. Attaching a new one replaces the old,
            because a person has one passport and a list of five files called &ldquo;passport&rdquo;
            helps nobody.
          </li>
          <li>
            <strong>Other documents</strong> &mdash; up to six, each with a label the traveller
            writes: a visa application, an insurance certificate, whatever this trip needs.
          </li>
        </ul>
        <p className="text-gray-600 mt-3">
          Accepted formats are PDF, JPEG, PNG, WEBP and HEIC &mdash; HEIC because that is what an
          iPhone produces when somebody photographs their passport. Ten megabytes per file.
        </p>
        <ScreenshotPlaceholder caption="The attachment section on a traveller's page, with the passport slot and other documents" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where you see them</h2>
        <p className="text-gray-600 mb-3">
          Open the booking. A <strong>Traveller documents</strong> panel appears once anything has
          been attached, grouped by traveller. Click <strong>Open</strong> to view a scan.
        </p>
        <p className="text-gray-600">
          Each row shows the date the file will be deleted, so a scan never disappears without
          warning.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How they are stored</h2>
        <p className="text-gray-600 mb-3">
          A passport scan is the most sensitive thing this system holds, so it is not stored like
          a logo or a brochure:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The files live in private storage &mdash; there is no public address for them</li>
          <li>Opening one issues a link that expires after five minutes</li>
          <li>Only managers and administrators can open a scan. Agents can work a booking
            without seeing the document behind it</li>
          <li>Uploads are checked by their actual content, not their filename, so nothing can
            arrive disguised as an image</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">They are deleted after the trip</h2>
        <p className="text-gray-600 mb-3">
          Scans are destroyed automatically once the trip ends. The record that a document was
          held &mdash; and the date it was destroyed &mdash; is kept, along with the passport
          number and expiry the traveller typed. The image itself is gone.
        </p>
        <Tip>
          The deletion date is fixed when the file is uploaded. Moving a booking&rsquo;s dates
          later does not quietly extend how long a passport image is kept.
        </Tip>
        <p className="text-gray-600 mt-3">
          You can also delete a document yourself at any time, from the panel on the booking.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Privacy in a friends-mode party</h2>
        <p className="text-gray-600">
          Each traveller sees and attaches only their own documents. One friend cannot open
          another&rsquo;s passport, exactly as they cannot see another&rsquo;s form. See{' '}
          <Link href="/docs/traveller-portal" className="text-primary-600 hover:underline">
            Traveller Portal
          </Link>.
        </p>
      </section>
    </div>
  )
}
