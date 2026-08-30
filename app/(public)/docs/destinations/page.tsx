import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function DestinationsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Destinations</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Destinations</h1>
      <p className="text-gray-600 mb-8">
        <strong>Settings &rarr; Destinations</strong> manages the destinations your itineraries are built for. Autoura ships with <strong>Egypt complete</strong> &mdash; cities, attractions and the full rate vocabulary &mdash; and further destinations are configurable on the same structure.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a Destination Carries</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Identity</strong> &mdash; name and code, shown in pickers and used by the AI prompts</li>
          <li><strong>Cities</strong> &mdash; the places itineraries route between</li>
          <li><strong>Content hooks</strong> &mdash; the writing brief and glossary the AI uses when generating day text for this destination</li>
        </ul>
        <p className="text-gray-600 mt-3">Rates, attractions and suppliers are managed in their own modules (<Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Rates Hub</Link>, <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>) &mdash; the destination is the frame they hang on.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Second Destination</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Create the destination here with its cities</li>
          <li>Enter its rates in the Rates Hub (each rate row carries a city)</li>
          <li>Add its suppliers and attractions</li>
          <li>Generate a test itinerary and review the AI output before selling</li>
        </ol>
        <Tip>Egypt-specific behaviours (Giza attraction rules, cruise handling) are keyed to Egyptian data and simply don&apos;t fire for other destinations &mdash; they don&apos;t need switching off.</Tip>
      </section>
    </div>
  )
}
