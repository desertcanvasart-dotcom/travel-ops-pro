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
      <p className="text-gray-600 mb-4">
        <strong>Destinations</strong> lists the countries and cities the agency operates. Every city dropdown in Rates
        and Suppliers reads this list. Open it from <strong>Home &rsaquo; Settings &rsaquo; Destinations</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        The menu shows it to the owner, admins and managers. Only the owner and admins can change it; a manager sees
        the countries, cities and AI notes read-only, with a note saying so. Each company has its own destinations.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A country</h2>
        <p className="text-gray-600 mb-3">
          Each country row shows its two-letter code, its name and Japanese name, a <strong>Default</strong> badge on the
          company&apos;s default, and how many active cities it has. Click the row to open it.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Make default</strong> &mdash; quoting and new itineraries start from the default. There is always exactly one: the new default is set first, then the old one is cleared.</li>
          <li><strong>Active</strong> &mdash; an inactive country is shown dashed here and left out of the dropdowns.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Cities</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>New city name</strong>, <strong>日本語名</strong> (optional) and <strong>Codes/aliases (comma-sep)</strong>, such as airport codes and shorthand the WhatsApp Parser learns, then <strong>Add</strong>.</li>
          <li>If a city of the same name already exists in another of your countries, a warning says so: rates match cities by name, so both countries&apos; rates will answer for it.</li>
          <li>The tick on a city chip (<strong>Toggle active</strong>) switches it on or off. An inactive city is shown dashed and left out of the dropdowns.</li>
          <li>The bin (<strong>Delete city</strong>) deletes a city, but only while none of your rates name it. Otherwise you are told how many rates use it and asked to switch it off instead.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Generation brief &amp; glossary</h2>
        <p className="text-gray-600 mb-3">
          Two notes per country tell the AI how to write that destination&apos;s itinerary text: a <strong>brief</strong> (tone
          and framing) and a <strong>glossary</strong> (local terms). Both load with their saved text.{' '}
          <strong>Save brief &amp; glossary</strong> saves only the box you changed, so saving one never clears the other.
        </p>
        <p className="text-gray-600">
          The brief is added to every generation prompt for that country. A glossary (one abbreviation per line, such
          as &ldquo;AMM = Amman (Queen Alia Airport)&rdquo;) replaces the built-in glossary for that country. Left empty,
          Egypt keeps its built-in glossary and framing, and other countries get minimal framing built from their city list.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a country</h2>
        <p className="text-gray-600 mb-3">
          Under <strong>Add a country</strong>, enter a two-letter code and a name (and optionally a Japanese name), then{' '}
          <strong>Create</strong>. A code can be used once per company. Then add its cities, enter its rates in the{' '}
          <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Rates Hub</Link>, add its{' '}
          <Link href="/docs/suppliers" className="text-primary-600 hover:underline">suppliers</Link>, and review a test
          itinerary before selling.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not hold rates, attractions or suppliers; those are entered on their own screens.</li>
          <li>A country cannot be deleted, only switched off. A city that rates still name cannot be deleted.</li>
          <li>Cities and countries cannot be renamed on this page.</li>
        </ul>
        <Tip>
          Egypt-specific behaviour (Giza attraction rules, cruise handling) is keyed to Egyptian data and does not fire
          for other countries; there is nothing to switch off.
        </Tip>
      </section>
    </div>
  )
}
