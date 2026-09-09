import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function RatePeriodsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Rate Periods</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Rate Periods</h1>
      <p className="text-gray-600 mb-8">
        Hotels and Nile cruises take as many dated price periods as the contract has. A property
        that prices April, May&ndash;September, October&ndash;19 December, Christmas and
        January&ndash;March has five periods and five sets of rates &mdash; not three.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding periods</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Rates &rarr; Hotels</strong> or <strong>Rates &rarr; Nile Cruises</strong>,
          edit a rate, and find <strong>Rate periods</strong>. Press <strong>Add period</strong>
          for each dated block on the contract, then give it a name, a From and To date, and its
          rates.
        </p>
        <p className="text-gray-600">
          Dates carry the year. A contract for 2026 does not silently price 2027 travel, because
          contracts are re-issued each year with the dates moved.
        </p>
        <ScreenshotPlaceholder caption="The rate periods editor with several dated periods on one hotel" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How a departure is priced</h2>
        <p className="text-gray-600 mb-3">
          Each night is priced in the period its own date falls in, so a stay that crosses a
          season boundary is charged correctly rather than at the rate of the night it started.
        </p>
        <p className="text-gray-600 mb-3">
          Where two periods overlap &mdash; a Christmas window sitting inside a broad high season,
          which is how contracts are usually written &mdash; the <strong>shorter</strong> period
          wins on the days they share. That matches how you would read the contract yourself.
        </p>
        <Tip>
          The editor warns you about overlaps and about gaps no period covers. Neither stops you
          saving: an overlap is often deliberate, and a gap may be a period you have not typed
          yet. They are shown because they are also what a mistyped year looks like.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Loading a contract from a spreadsheet</h2>
        <p className="text-gray-600 mb-3">
          A contract usually arrives as a table of periods, so there is a sheet shaped the same
          way: one row per dated block, as many rows per property as you need.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Press <strong>Sample Periods</strong> to get a file with the right columns and two
            example rows</li>
          <li>Replace the example rows with the contract &mdash; the Service Code column must
            match a rate that already exists</li>
          <li>Press <strong>Import Periods</strong> and check the preview</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The preview says exactly which properties change and from how many periods to how many.
          Nothing is written until you confirm.
        </p>
        <Tip>
          Importing <strong>replaces</strong> the periods of every property named in the file. A
          new contract supersedes the old one. Properties not named in the file are untouched.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The other spreadsheet</h2>
        <p className="text-gray-600 mb-3">
          The <strong>Import CSV</strong> on the same page is a different thing, and the two do
          not overlap. It carries the property or the ship itself &mdash; code, name, category,
          route, nights, supplier, contacts &mdash; and it is the right tool for loading many
          properties at once, because it is the only sheet that can <em>create</em> rates.
        </p>
        <p className="text-gray-600">
          It carries no prices at all. Pricing for hotels and cruises comes from dated periods,
          so a rate arrives in two steps: create it with <strong>Import CSV</strong>, then price
          it with <strong>Import Periods</strong>.
        </p>
        <Tip>
          Sheets exported before this change still import. Their old season-price columns are
          simply ignored &mdash; the periods are what price your quotes.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Not the same as seasonal premiums</h2>
        <p className="text-gray-600">
          Rate periods are what a <em>supplier</em> charges you, and they sit before your margin.
          Your own high dates &mdash; Golden Week, Obon, New Year &mdash; are a separate premium
          added to the selling price, under <strong>Settings &rarr; Seasonal Premiums</strong>.
        </p>
      </section>
    </div>
  )
}
