import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function BulkCsvPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Bulk Import (CSV)</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Bulk Import (CSV)</h1>
      <p className="text-gray-600 mb-8">
        Several parts of the app let you load many records from a spreadsheet instead of typing
        them one at a time &mdash; suppliers, rates, and tour templates. This page describes the
        rate sheets in detail; the supplier sheet is described on{' '}
        <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sample &rarr; Export &rarr; Import</h2>
        <p className="text-gray-600 mb-3">
          Each rate page (<strong>Home › Suppliers &amp; Rates</strong>, admins and managers;
          owners always) has the same three buttons:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Sample CSV</strong> &mdash; downloads a sheet with the right column headers and one filled-in example row.</li>
          <li><strong>Export</strong> &mdash; downloads every rate of that kind in your company, in the same shape. Edit it and re-import to make changes in bulk.</li>
          <li><strong>Import CSV</strong> &mdash; reads a filled-in sheet back in, after a preview.</li>
        </ul>
        <p className="text-gray-600">
          The <strong>Export view</strong> button on the Rates hub is different: it saves the rows
          the hub&rsquo;s current tab shows, as a quick spreadsheet to read. It is not the import
          shape &mdash; use a rate page&rsquo;s Export for that.
        </p>
        <ScreenshotPlaceholder caption="The Sample / Export / Import buttons in the Tour Templates manager" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Each row is matched on its key</h2>
        <p className="text-gray-600 mb-3">
          A rate row is matched on its key: <strong>service_code</strong> (Nile cruises:{' '}
          <strong>cruise_code</strong>; fixed costs: <strong>cost_type</strong>). If your company
          already has that key the row updates it; if not, the row creates it. Keys are unique{' '}
          <em>within your company</em>: the same code in another company is a different rate and is
          never touched. Every imported row is stamped with your company.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>A row with no key is refused.</li>
          <li>The same key twice in one file: the last row wins.</li>
          <li>The template&rsquo;s example row (an <code>EXAMPLE-</code> code) is skipped, with a note saying so.</li>
          <li>Transport and entrance-fee rows with no validity dates keep the dates the rate already has; a new rate gets today until 31 Dec 2099.</li>
          <li>On hotel, cruise, train and sleeping-train sheets the property (hotel, ship, train) is named, not given by id. It is found by name under the row&rsquo;s supplier, and created if that supplier does not have it yet.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The supplier on a rate row</h2>
        <p className="text-gray-600 mb-3">The row&rsquo;s supplier is found in this order:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>supplier_code</strong> (SUP-####) &mdash; must be one of your company&rsquo;s suppliers, or the row is refused;</li>
          <li>else <strong>supplier_id</strong> &mdash; must be one of your company&rsquo;s suppliers;</li>
          <li>else <strong>supplier_name</strong> &mdash; exact name, capital letters ignored; no match, or several suppliers with that name, refuses the row;</li>
          <li>else the rate has no supplier.</li>
        </ol>
        <Tip>
          Import suppliers <em>before</em> their rates. A rate naming a code your company does not
          have is refused rather than guessed &mdash; import the supplier first (or fix the code),
          then import the rates again.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Preview, then import</h2>
        <p className="text-gray-600 mb-3">
          Choosing a file shows a preview first: <strong>Total Rows</strong>,{' '}
          <strong>Valid</strong>, <strong>Invalid</strong>, and the rows with errors (row number,
          column, reason; up to 100 listed). Every check runs here &mdash; required columns,
          number and date formats, the supplier, a missing key, a vehicle&rsquo;s capacity band
          (transport), and negative or absurd prices. Nothing is written until you press{' '}
          <strong>Import N Rows</strong>.
        </p>
        <p className="text-gray-600 mb-3">
          The import then writes exactly the valid rows the preview counted. Rows with errors are{' '}
          <strong>skipped</strong>: the existing rate with that key (if any) stays as it was. The
          result shows how many rows were inserted and updated, the skipped rows with their
          reasons, and any database error. Fix the skipped rows and import the file again &mdash;
          the rows already imported just update to the same values.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a sheet does and does not carry</h2>
        <p className="text-gray-600 mb-3">
          A flat sheet carries the flat facts &mdash; names, types, durations, contact details,
          prices. It does <strong>not</strong> carry the nested things a spreadsheet cannot hold: a
          tour&rsquo;s day-by-day itinerary, its hotels, or its variations. Importing tour rows
          creates the <em>shells</em>; you build each itinerary in the editor afterwards. Import
          writes only the columns in the sheet, so re-importing a template never wipes an itinerary
          you have already built.
        </p>
        <p className="text-gray-600">
          Hotel and cruise prices live in dated periods, which have their own sheet &mdash; see{' '}
          <Link href="/docs/rate-periods" className="text-primary-600 hover:underline">Rate Periods</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not refuse a whole file for a few bad rows; it imports the rest and lists what it skipped.</li>
          <li>It does not guess a supplier it cannot find.</li>
          <li>It does not delete rates that are missing from the file.</li>
          <li>It does not touch another company&rsquo;s rates, even with the same code.</li>
        </ul>
      </section>
    </div>
  )
}
