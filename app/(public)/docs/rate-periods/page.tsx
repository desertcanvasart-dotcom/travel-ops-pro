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
        Hotels and Nile cruises take the dated price periods the contract has, up to{' '}
        <strong>six</strong> per rate. A property that prices April, May&ndash;September,
        October&ndash;19 December, Christmas and January&ndash;March has five periods and five
        sets of rates &mdash; not three. Admins and managers edit them (the owner always can).
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding periods</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Suppliers &amp; Rates › Accommodation › Hotels</strong> or{' '}
          <strong>Nile Cruises</strong>, edit a rate, and find <strong>Rate periods</strong>.
          Press <strong>Add period</strong> for each dated block on the contract, then give it a
          season word and a name (both optional), a From and a To date, and its rates. From and To
          are both included.
        </p>
        <p className="text-gray-600 mb-3">
          Each period has a block for travellers holding an EU passport and one for everyone else
          (Japanese and all others): per person in a double, the single supplement and the triple
          reduction, plus a price for each supplement the rate carries. All are per person per
          night.
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Guide bed / night</strong> is the property&apos;s rate for a throughout guide
          travelling with the group. Blank means not given: the bed is flagged as unpriced on the
          quote. 0 means the supplier gives it free: it is priced as a 0 line.
        </p>
        <p className="text-gray-600 mb-3">
          Dates carry the year. A contract for 2026 does not silently price 2027 travel, because
          contracts are re-issued each year with the dates moved.
        </p>
        <p className="text-gray-600">
          A seventh period, a period that ends before it starts, or a negative price is refused
          when you save, with the reason. Removing every period and saving leaves the rate with no
          periods and no price; the old Low, High and Peak season columns do not come back.
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
        <p className="text-gray-600 mb-3">
          A night that no period covers has <strong>no rate</strong>: it is an unpriced hole on the
          quote, never priced at another period. A template priced with no travel date uses the
          first period.
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Rate Card Validity</strong> (Valid From and Valid To, below the periods) says
          when the rate sheet as a whole applies. When the engine picks a hotel or ship by itself,
          it prefers a rate whose validity covers the travel date and which has a period covering
          it, then one whose validity covers it, then the newest of the rest. So next
          year&apos;s contract can be filed as a new rate while this year&apos;s still prices this
          year&apos;s dates. A blank Valid From or Valid To is open on that side.
        </p>
        <Tip>
          The editor warns you about overlaps and about gaps no period covers. Neither stops you
          saving: an overlap is often deliberate, and a gap may be a period you have not typed
          yet. They are shown because they are also what a mistyped year looks like.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supplements</h2>
        <p className="text-gray-600 mb-3">
          A property often charges extras on top of the room, per person per night: a view, an
          upper floor, a meal plan; on a ship, a deck or a balcony. The list of extras is
          yours &mdash; <strong>Settings &rarr; Vocabulary &rarr; Hotel supplements</strong> and
          <strong> Cruise supplements</strong> &mdash; and the note on each entry (View, Room,
          Meal Plan) groups the dropdown on the rate form.
        </p>
        <p className="text-gray-600 mb-3">
          On a hotel or cruise rate, pick the supplements that property prices. Each one you pick
          gets a price box in <em>every</em> rate period, for each passport group, so a Nile view
          can cost more at Christmas than in July.
        </p>
        <p className="text-gray-600">
          To sell one, mark it on the programme day: the day editor in the tour manager and the
          B2B calculator offers the supplements for that night. The engine prices each at the
          property&apos;s rate for that night and includes it in the price. A property that does
          not price a supplement the day asks for is reported as an unpriced hole &mdash; the
          customer asked for it, so it is never quietly dropped or quietly free.
        </p>
        <p className="text-gray-600 mt-3">
          After the sale, the same supplements appear in the booking&apos;s extras catalogue under
          <strong> Upgrades at this trip&apos;s hotels and ship</strong>: each one the trip&apos;s
          own properties carry, priced per person for the stay at each night&apos;s period, offered
          as an upgrade the customer can accept. A night the property has no price for leaves the
          item unpriced with the reason.
        </p>
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
        <p className="text-gray-600 mt-3">
          The sheet also carries your supplements: two columns per entry in your vocabulary, one
          per passport group, with the per-person-per-night price for the period. The column
          header shows the entry&apos;s key in brackets, so a renamed word still loads. A
          supplement priced in any period of a property is put on that property; one left blank
          everywhere is taken off it. A sheet with no supplement columns leaves the lists alone.
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
        <p className="text-gray-600 mt-3">
          The hotel sheet has a <strong>Tier</strong> column, because the engine picks a hotel by
          city and tier. Write a tier from your vocabulary, by its key or its word; an unknown
          tier is reported in the preview and the row is not imported. A blank Tier keeps the
          tier a hotel already has, and gives a new hotel your default tier. A blank Property Type
          keeps the current one, or is <em>hotel</em> for a new row. The hotel sheet also carries
          the Rate Card Validity (Rate Valid From, Rate Valid To).
        </p>
        <p className="text-gray-600 mt-3">
          The periods sheet refuses a property with more than six periods, a row that ends before
          it starts, and a price that is not a number.
        </p>
        <Tip>
          Sheets exported before this change still import. Their old season-price columns are
          simply ignored &mdash; the periods are what price your quotes.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not block overlapping periods or gaps between them; the editor only warns.</li>
          <li>It does not price a night outside every period at the nearest period.</li>
          <li>It does not drop an expired rate card from the automatic pick when it is the only rate there; it ranks it last.</li>
          <li>A cruise period has no Suite price: a suite is priced as its own rate with Cabin Type Suite.</li>
        </ul>
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
