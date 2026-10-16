import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ExtrasPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Extras</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Extras</h1>
      <p className="text-gray-600 mb-8">
        Extras are the paid things you sell alongside a trip that no rate table covers: airport fast-track, extra
        luggage, a late check-out. You list them once here. The B2B calculator and a booking&rsquo;s &ldquo;add extra&rdquo;
        picker offer them. Upgrades that belong to one programme are set on its variation, under Tours &rsaquo; Options.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where to find it and who can use it</h2>
        <p className="text-gray-600">
          Open it from <strong>Sell &rsaquo; Extras</strong>. The menu and the page are for owners, admins and managers.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <p className="text-gray-600 mb-3">
          The table has the columns <strong>Name</strong> (with the description under it), <strong>Category</strong>,{' '}
          <strong>Cost</strong>, <strong>Price</strong> and <strong>Charged</strong> (<strong>Per person</strong> or{' '}
          <strong>Per booking</strong>). Each row has <strong>Duplicate</strong>, <strong>Edit</strong> and <strong>Delete</strong>;
          delete asks you to confirm.
        </p>
        <p className="text-gray-600 mb-3">
          An extra that one of your saved B2B quotes sells cannot be deleted. The page says how many quotes use it and
          names the newest five, and offers <strong>Deactivate</strong> instead: the extra is no longer offered, and
          those quotes keep it. A quote counts when its saved services include that extra, whatever the quote&rsquo;s
          status.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Amounts show as &ldquo;currency amount&rdquo;: the row&rsquo;s own currency, else your company&rsquo;s rate currency.</li>
          <li>A blank amount shows <strong>Not priced</strong>, never 0.</li>
          <li>An extra you no longer offer is dimmed.</li>
          <li>The search box filters by name, description or category.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or editing an extra</h2>
        <p className="text-gray-600 mb-3">
          <strong>Add extra</strong> opens <strong>New extra</strong>; the pencil opens <strong>Edit extra</strong>. The fields:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Name</strong> (required) &mdash; unique in your company. A second extra with the same name is refused: &ldquo;An extra named &hellip; already exists&rdquo;.</li>
          <li><strong>Description</strong> and <strong>Category</strong> &mdash; free text.</li>
          <li><strong>Charged</strong> &mdash; Per person or Per booking.</li>
          <li><strong>What it costs us</strong> &mdash; leave blank if the supplier has not quoted yet. Blank means not priced, not free.</li>
          <li><strong>What we charge</strong> &mdash; when set, this is what the customer pays, with no margin added. Leave it blank to price the extra from its cost plus the margin.</li>
          <li><strong>Rate currency</strong> &mdash; <strong>Organisation default</strong> means your company&rsquo;s rate currency.</li>
          <li><strong>Offer this extra</strong> &mdash; untick it to stop offering it without deleting it.</li>
        </ul>
        <p className="text-gray-600">
          Saving refuses a negative or non-numeric cost or price, a charge other than per person or per booking, and a
          currency other than USD, EUR, GBP, EGP or JPY. The message says which.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How an extra is priced</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>A per-person extra is multiplied by the number of travellers; a per-booking extra is charged once.</li>
          <li>A cost or price of 0 counts as not priced.</li>
          <li>In the <strong>B2B calculator</strong>, an extra with only a cost joins the quote&rsquo;s cost and takes the quote&rsquo;s margin. An extra with a price is sold at that price, and its margin is price minus cost; the quote&rsquo;s margin is not added on top.</li>
          <li>In a <strong>booking&rsquo;s add-extra picker</strong>, the amount is converted to the booking&rsquo;s currency at today&rsquo;s rate, and the margin is your company&rsquo;s default.</li>
        </ul>
        <Tip>
          An extra already added to a booking keeps its own copy of name and price, so changing or deleting the extra here does
          not change that booking.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not attach extras to itineraries; they are offered by the B2B calculator and on bookings.</li>
          <li>It does not hold per-programme upgrades; those are set on the tour variation.</li>
        </ul>
      </section>
    </div>
  )
}
