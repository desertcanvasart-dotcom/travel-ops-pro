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
