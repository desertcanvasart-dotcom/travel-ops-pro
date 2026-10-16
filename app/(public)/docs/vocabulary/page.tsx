import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

const GROUPS: Array<[string, string[]]> = [
  ['General', ['Service tiers', 'Supplier types', 'Rate seasons']],
  ['Tours', ['Tour themes', 'Tour types', 'Physical levels', 'Best for']],
  ['Hotels & cruises', ['Board basis', 'Cruise cabin types', 'Accommodation types', 'Hotel service levels', 'Hotel classes', 'Ship categories', 'Hotel supplements', 'Cruise supplements']],
  ['Transport & tickets', ['Vehicle types', 'Sleeping-train cabins', 'Train classes', 'Transport service types', 'Flight types', 'Flight cabins', 'Flight frequencies', 'Airport service levels', 'Airports', 'Airlines', 'Airport directions']],
  ['Guides & tipping', ['Tipping roles', 'Tipping contexts', 'Tipping units', 'Guide grades', 'Guide day types', 'Guide modes', 'Guide languages']],
  ['Meals', ['Meal types', 'Cuisines', 'Restaurant types', 'Dietary options']],
  ['Attractions & activities', ['Attraction categories', 'Entrance fee types', 'Activity categories', 'Activity types', 'Activity durations', 'Activity units', 'Activity pricing types']],
]

export default function VocabularyPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Vocabulary</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Vocabulary</h1>
      <p className="text-gray-600 mb-4">
        <strong>Your vocabulary</strong> holds the lists behind the app&apos;s dropdowns: service tiers, supplier types,
        vehicle types, meal types and so on. Rename an entry, hide what you never use, or add what is missing, and every
        dropdown that reads that list follows. Open it from <strong>Home &rsaquo; Settings &rsaquo; Vocabulary</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        The menu shows it to the owner, admins and managers. Only the owner and admins of the company you are working
        in can change it; a manager sees the lists with the note &ldquo;You can read these lists but not change
        them&rdquo; and no edit buttons. Each company has its own vocabulary.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The lists</h2>
        <p className="text-gray-600 mb-3">
          There are <strong>44 lists in 7 groups</strong>. The groups fold open and closed in the left column, and{' '}
          <strong>Find a list&hellip;</strong> searches them. Each list shows how many active entries it has.
        </p>
        <div className="space-y-2">
          {GROUPS.map(([group, lists]) => (
            <p key={group} className="text-gray-700">
              <strong>{group}</strong> ({lists.length}): {lists.join(', ')}.
            </p>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">An entry</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Your word</strong> &mdash; the English label, required.</li>
          <li><strong>日本語</strong> &mdash; the Japanese label, optional. Someone using the app in Japanese sees it; without it they see the English label.</li>
          <li><strong>Key</strong> &mdash; the value stored on records. It is made from your word unless you type one: lowercase letters, digits and underscores, unique within the list.</li>
          <li><strong>Note</strong> &mdash; optional, shown under the entry.</li>
        </ul>
        <p className="text-gray-600 mb-3">Some lists carry one more thing:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Supplier types</strong> &mdash; <em>Behaves as</em> a built-in kind (hotel, transport company, guide, cruise line and so on), which decides the tabs and rate pickers the supplier gets.</li>
          <li><strong>Vehicle types</strong> &mdash; a passenger range. Rate bands are re-stamped when you change it.</li>
          <li><strong>Tour types</strong> &mdash; a range of days.</li>
          <li><strong>Transport service types</strong> &mdash; whether the service needs a destination city.</li>
          <li><strong>Airlines</strong> &mdash; an IATA code. <strong>Airports</strong> &mdash; an IATA code, the city served and the country.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What you can do (owner and admins)</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Add to &lt;list&gt;</strong> &mdash; a new entry. A key already used in the list is refused.</li>
          <li><strong>Rename</strong> (pencil) &mdash; change the labels and the list&apos;s extra fields. The key does not change, so records filed under the entry stay filed under it.</li>
          <li><strong>Hide from dropdowns</strong> (eye) &mdash; the entry stays on old records but is no longer offered. A list cannot go below its minimum (for example, two service tiers).</li>
          <li><strong>Delete</strong> &mdash; records already filed under the entry keep the word until you re-file them. Deleting a vehicle type that rates still use asks you to confirm first.</li>
          <li><strong>Move up / Move down</strong> &mdash; the order the dropdowns show.</li>
          <li><strong>Reset to defaults</strong> &mdash; replaces everything in that one list with the default preset. Other lists are untouched.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Linked pages</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Manage destinations</strong> &mdash; cities are not a vocabulary list; they live on <Link href="/docs/destinations" className="text-primary-600 hover:underline">Destinations</Link>.</li>
          <li><strong>Manage seasons</strong> &mdash; the dates you charge more on are on <Link href="/docs/seasonal-premiums" className="text-primary-600 hover:underline">Seasonal Premiums</Link>. The <em>Rate seasons</em> list here is only the season tag on a supplier&apos;s rate.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not rename menu items, page titles or buttons; it changes the entries of these lists.</li>
          <li>It does not translate itinerary or quote content.</li>
          <li>Changing a key is not possible; add a new entry and re-file records instead.</li>
        </ul>
        <Tip>
          To copy and translate an itinerary between English and Japanese, use{' '}
          <Link href="/docs/multi-language" className="text-primary-600 hover:underline">Languages</Link>.
        </Tip>
      </section>
    </div>
  )
}
