import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function DeparturesPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Departures</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Departures</h1>
      <p className="text-gray-600 mb-4">
        <strong>Operate &rsaquo; Departures</strong> is where you schedule group departures &mdash; a dated run of a programme that
        travellers book seats on &mdash; price each date, and see who holds seats on it.
      </p>
      <p className="text-gray-600 mb-8">
        The menu shows it to the owner, Administrators and Managers. Agents and Viewers do not see it.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How seats are counted</h2>
        <p className="text-gray-600 mb-3">Every screen counts a date&apos;s seats the same way:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Booked outside the app</strong> &mdash; seats you sold some other way (phone, an agent&apos;s allotment). You type this number on the departure&apos;s page.</li>
          <li><strong>Held, confirmed</strong> &mdash; web-order holds you confirmed.</li>
          <li><strong>Held, pending</strong> &mdash; web-order holds still waiting for you.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>Taken</strong> is the three added together. <strong>Free</strong> is the seats (max pax) minus taken, never below 0.
          The list, the grid, the departure&apos;s page, the availability check, the WhatsApp assistant and Order Intake all use this
          figure. A released hold no longer counts.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <p className="text-gray-600 mb-3">
          The page is titled <strong>Tour Departures</strong>. It shows one row per programme: every active tour template, plus a
          <strong> Custom</strong> row for departures with no template. The filter starts on <strong>Upcoming</strong> (dates from your
          today on); the other choices are All, Open, Limited, Full, Guaranteed and Cancelled. The search box matches the programme
          name or code.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The code, &ldquo;N days&rdquo; and how many departures are shown, with the next and last date (cancelled dates are skipped).</li>
          <li>Chips for how many dates are guaranteed, full and cancelled.</li>
          <li><strong>taken/seats taken</strong> over the shown dates that are not cancelled, with a bar, and &ldquo;N held seats pending&rdquo; when web orders are waiting.</li>
          <li><strong>Dates &amp; prices</strong> opens the programme&apos;s grid; <strong>Add dates</strong> opens it with the date generator.</li>
          <li>A Custom row has <strong>Show dates</strong>: each date links to its page and has a status select, <strong>Clone</strong> (the create form pre-filled, date blank) and <strong>Delete</strong>.</li>
        </ul>
        <p className="text-gray-600 mt-3">The list reads every matching date, however many there are, so the totals cover all of them.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a departure</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Departure</strong>.</li>
          <li>Pick a <strong>Tour Template</strong>, or leave it blank and type a <strong>Tour Name</strong> and <strong>Duration (days)</strong>.</li>
          <li>Set the <strong>Start Date</strong>, <strong>Max Pax</strong> (default 20) and <strong>Min Pax</strong> (default 2). Min Pax cannot be more than Max Pax.</li>
          <li>Optionally a <strong>Price per Person</strong>. It is in your company&apos;s own currency (Settings), shown in the label; a clone keeps its source&apos;s currency.</li>
          <li>Choose <strong>Draft</strong> (not visible) or <strong>Open</strong> (accepting bookings), then <strong>Create Departure</strong>.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The end date is the start date plus the duration, less one day. A second departure of the same programme on the same date
          is refused: &ldquo;A departure for this tour on this date already exists&rdquo;.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The grid (Dates &amp; prices)</h2>
        <p className="text-gray-600 mb-3">
          Every date of one programme, each priced by the engine at its own date. Prices are per person in your company&apos;s
          currency. If your rates are in another currency, LND is converted at the app&apos;s exchange rate; type a rate in the
          <strong> FX</strong> box to use your own. If the app has no rate for the pair, the grid says so and asks you for one.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Controls: programme, tier, pax basis (default 2), passport (Non-EU or EU), guide language and mode (Spot or Throughout), FX, and the class view (Economy, Business, One-way business or All classes, remembered by your browser).</li>
          <li><strong>Departure</strong> &mdash; the dates; click one to open its page.</li>
          <li><strong>Taken / Seats</strong> &mdash; taken as above (an amber tag shows pending held seats; hover for the split). Seats are editable but cannot go below what is taken.</li>
          <li><strong>Status</strong>, <strong>燃油 Fuel</strong> (typed), <strong>LND</strong> (the engine&apos;s per-person gross, domestic flights included).</li>
          <li>Per class: <strong>AIR</strong> (typed), <strong>合計 Total</strong> (AIR + fuel + LND) and <strong>Website</strong> (the total rounded up to end in 999 unless you type your own).</li>
          <li><strong>Generate dates</strong> makes dates from a weekday pattern, a fixed interval or hand-picked days, skips dates that exist, and refuses more than 366 at a time with a message.</li>
          <li><strong>Export CSV</strong> writes every class plus booked outside, held confirmed, held pending, seats taken and seats.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A departure&apos;s page: seats and holds</h2>
        <p className="text-gray-600 mb-3">
          Open a date from the grid or a Custom row. The page shows Seats, Booked outside the app, Held confirmed, Held pending and
          Free.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Change <strong>Seats (max pax)</strong> and <strong>Booked outside the app</strong>, then <strong>Save seats</strong>. Seats cannot go below what is taken; this is checked in the database at the moment of saving, so a web order arriving at the same time cannot slip past it.</li>
          <li><strong>Seat holds</strong> lists every hold with client, pax, status, the order note (it names the quote) and the date placed.</li>
          <li><strong>Confirm</strong> moves a pending hold to confirmed. <strong>Release</strong> cancels a hold and frees its seats.</li>
          <li><strong>Delete</strong> works once no hold is pending or confirmed. Otherwise the message names the holds to release first.</li>
        </ul>
        <Tip>Web orders hold seats only on Open, Limited and Guaranteed dates, and only when the whole party fits. Draft and Full dates take no holds.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Statuses</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">What it does</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr><td className="px-3 py-2 font-medium">Draft</td><td className="px-3 py-2">Being prepared. Takes no web-order holds and is not offered by the availability check.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Open</td><td className="px-3 py-2">Takes holds while seats are free.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Limited</td><td className="px-3 py-2">Same as Open; a label for &ldquo;few seats left&rdquo;. You set it by hand.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Full</td><td className="px-3 py-2">Closed by you. Takes no new holds. It is not set automatically when seats run out.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Guaranteed</td><td className="px-3 py-2">Will run. Takes holds while seats are free. You set it by hand.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Cancelled</td><td className="px-3 py-2">Will not run. Its pending holds are released at once; confirmed holds stay until you release them. You are asked to confirm first.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Departures from an integration</h2>
        <p className="text-gray-600">
          A departure a partner integration keeps in sync shows a notice on its page. Its dates, seats, booked count, status and
          price are changed at the partner, so changes to those fields are refused and it cannot be deleted here. Fuel, AIR and
          website rates on the grid stay editable, and you can still confirm and release holds on it.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not set Full, Limited or Guaranteed for you; seat counts never change the status.</li>
          <li>It does not release a hold when its quote is declined or deleted &mdash; release it on the departure&apos;s page.</li>
          <li>It does not rehome confirmed holds of a cancelled departure.</li>
          <li>The price per person is not shown on the list or the grid.</li>
          <li>The website rate always rounds up to end in 999, the yen rule, whatever the currency.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Holds come from <Link href="/docs/order-intake" className="text-primary-600 hover:underline">Order Intake</Link>. How many
          groups you can run each day is set on <Link href="/docs/capacity-departures" className="text-primary-600 hover:underline">Capacity</Link>.
        </p>
      </section>
    </div>
  )
}
