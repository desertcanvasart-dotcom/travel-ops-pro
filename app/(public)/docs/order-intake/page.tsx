import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function OrderIntakePage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Order Intake</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Order Intake</h1>
      <p className="text-gray-600 mb-8">
        An order arrives as free text &mdash; a forwarded booking, a partner brief, a message
        pasted from another system. Order Intake turns that into a structured booking you can act
        on, so the same order does not get re-typed by three different people.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deterministic, not guessy</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Sell &rarr; Order Intake</strong> and paste the order. Where the order
          follows a known shape &mdash; a tour-up.jp brief is the built-in one &mdash; the fields
          are read out deterministically into the same slots every time: traveller, dates, pax,
          services. What was recognised is shown for you to confirm before anything is created.
        </p>
        <ScreenshotPlaceholder caption="A pasted order parsed into structured fields, ready to confirm" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Orders from your website, with no click</h2>
        <p className="text-gray-600 mb-3">
          When your website emails you each order its form receives, connect that mailbox under{' '}
          <Link href="/docs/email-inbox" className="text-primary-600 hover:underline">Email Inbox</Link>.
          After every mailbox sync (every 10 minutes) each new order email is read on its own &mdash;
          package tours and optional tours alike &mdash; and taken through the same steps as a pasted
          order: the programme it names, the customer found by email or created, one priced draft
          quote, and a pending seat hold when you run that date as a departure. Managers are notified
          with a link to the quote.
        </p>
        <p className="text-gray-600 mb-3">
          The order finds its programme by the <strong>website page</strong> it was ordered from, then
          by tour code. Give each programme its page under{' '}
          <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Programs</Link>{' '}
          (the <em>Website page</em> field, or the <em>Website Page</em> column of the CSV) so the
          match never depends on the website&apos;s code being spelled like yours.
        </p>
        <p className="text-gray-600 mb-3">
          The <strong>Website orders</strong> list at the bottom of Order Intake shows what each email
          became. An order that could not be finished &mdash; no programme for its page or code, a
          price that could not be worked out &mdash; is marked <em>Needs attention</em> with the
          reason; <strong>Finish</strong> opens it with the email already filled in. The same order
          sent twice becomes one quote.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The hosted order form</h2>
        <p className="text-gray-600 mb-3">
          There is also a hosted <strong>/order</strong> form you can send to a partner or a
          traveller. What they fill in lands here in the same structured shape as a pasted brief, so
          typed orders and submitted orders meet in one place.
        </p>
        <Tip>
          Order Intake is the front door to the pipeline: a confirmed order becomes an{' '}
          <Link href="/docs/itineraries" className="text-primary-600 hover:underline">itinerary</Link>{' '}
          you price and a <Link href="/docs/bookings" className="text-primary-600 hover:underline">booking</Link>{' '}
          you operate.
        </Tip>
      </section>
    </div>
  )
}
