import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function SeasonalPremiumsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Seasonal Premiums</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Seasonal Premiums</h1>
      <p className="text-gray-600 mb-8">
        A seasonal premium is a percentage you add to the price of trips that depart on your own high
        dates, such as Golden Week, Obon or New Year. It is your commercial decision on top of the
        selling price. It does not change any supplier rate. Open it from{' '}
        <strong>Home &rsaquo; Settings &rsaquo; Seasonal Premiums</strong>. The page title is
        &ldquo;Seasonal Premiums&rdquo;, and a <strong>Rates</strong> link at the top goes back to the
        Rates hub.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who can use it</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The owner, admins and managers see the page in their menu and can add, change and delete seasons.</li>
          <li>Agents and viewers do not have it in their menu and cannot open the page.</li>
          <li>Agents still get the premium: their Pricing Grid reads the calendar to show it.</li>
          <li>Changes are saved through the server only. Nobody can change the calendar directly from a browser, whatever their role.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Seasons and their dates</h2>
        <p className="text-gray-600 mb-3">A season has:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Season name</strong>: unique in your company, up to 80 characters.</li>
          <li><strong>Premium</strong>: a percentage from 0 to 200, in steps of 0.5. Zero is allowed for a season you want to name and watch without charging for it.</li>
          <li><strong>Colour</strong>: used only to tell seasons apart on this page.</li>
          <li><strong>Active</strong> or <strong>Inactive</strong>: click the badge on the card to switch it.</li>
          <li>Any number of dated periods. Each period has a <strong>First day</strong>, a <strong>Last day</strong> and a <strong>Label (optional)</strong> of up to 120 characters. Both days are included.</li>
        </ul>
        <p className="text-gray-600 mb-3">
          The percentage belongs to the season, not to each period. All periods of a season charge the
          same premium. The dates carry the year, so this year&rsquo;s Golden Week does not apply to next
          year&rsquo;s. Add next year&rsquo;s dates when you know them.
        </p>
        <p className="text-gray-600 mb-3">
          Each card shows the premium as &ldquo;+N%&rdquo; and the number of periods (&ldquo;N periods&rdquo;).
          A season with no dates shows the warning &ldquo;This season has no dates, so it never changes a
          price.&rdquo; Periods that have ended are dimmed and tagged <strong>Past</strong>.
        </p>
        <p className="text-gray-600 mb-3">The buttons:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Add Season</strong> opens the form for a new season.</li>
          <li><strong>Add dates</strong> adds a period to a season.</li>
          <li><strong>Duplicate</strong> opens the add form filled in from the season, with &ldquo;(copy)&rdquo; after the name. It does not copy the dates.</li>
          <li><strong>Edit</strong> (the pencil) changes the name, premium and colour.</li>
          <li><strong>Delete</strong> asks &ldquo;Delete &ldquo;name&rdquo; and its dates? Prices already quoted are unaffected.&rdquo; That is true: a quote stores the money it was charged, not a link to the season.</li>
          <li>The bin icon on a period deletes that period. A period cannot be edited; delete it and add it again.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A name or label that is too long is refused with a message that gives the limit.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How the premium is charged</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>The departure date decides it.</strong> A trip that runs into a season without departing in it is priced as an ordinary departure. The date you quote on does not matter: a Christmas trip quoted in July still gets the December premium.</li>
          <li><strong>The highest premium wins.</strong> Where two seasons cover the same day, the higher percentage applies. Premiums are never added together.</li>
          <li><strong>It applies to the whole tour price after your margin</strong>, tips and entrance fees included. Airport tax, visas and insurance are invoice lines, not tour services, so they are untouched.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The premium is the selling price &times; the percentage &divide; 100, rounded like the rest of the
          price, and it is shown as its own line next to the margin. For example, 408.75 at 15% adds 61.31.
        </p>
        <p className="text-gray-600 mt-3">
          Inactive seasons are ignored everywhere, including the Pricing Grid&rsquo;s on-screen total.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where it applies</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The B2B calculator and B2B quotes made from an itinerary</li>
          <li>B2C quotes</li>
          <li>The Pricing Grid, both the total on screen and the saved trip</li>
          <li>Automatic pricing: tour template auto-pricing, the departures grid and order intake</li>
        </ul>
        <p className="text-gray-600 mt-3">
          This is different from a{' '}
          <Link href="/docs/rate-periods" className="text-primary-600 hover:underline">rate period</Link>,
          which changes what a hotel or cruise <em>costs</em> on a date. A rate period is the
          supplier&rsquo;s price; a seasonal premium is yours.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">In the Activity Log</h2>
        <p className="text-gray-600">
          Every saved change appears in the{' '}
          <Link href="/docs/activity-log" className="text-primary-600 hover:underline">Activity Log</Link>{' '}
          with the values before and after: a new or deleted season with its premium, a change of name,
          premium or active status (for example &ldquo;Golden Week: Premium 15% &rarr; 18%&rdquo;), and
          periods added or deleted with their dates.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not give each period its own percentage.</li>
          <li>It does not repeat dates every year. Each period is for the dates you enter.</li>
          <li>It does not change supplier costs or rates.</li>
          <li>It does not reprice trips already quoted or saved.</li>
          <li>It does not look at the days after departure. Only the departure date counts.</li>
          <li>Seasonal premium changes are not part of the rate-change digest notification. Use the Activity Log to see them.</li>
        </ul>
        <Tip>
          Switch a season to <strong>Inactive</strong> rather than deleting it when you want to stop
          charging it for now. Its dates stay, and you can switch it back on.
        </Tip>
      </section>
    </div>
  )
}
