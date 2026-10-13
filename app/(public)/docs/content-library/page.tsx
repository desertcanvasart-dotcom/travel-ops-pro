import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ContentLibraryPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Content Library</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Content Library</h1>
      <p className="text-gray-600 mb-8">
        The Content Library holds your own descriptions of sites, experiences and other trip content, written once per service tier (for example Budget, Standard, Deluxe, Luxury). When the AI writes a new itinerary, it is given the matching descriptions so the day text uses your facts and wording.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where It Is and Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>In the menu under <strong>Communicate &rarr; Content Library</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/content-library</code>).</li>
          <li>The owner, <strong>Administrators</strong> and <strong>Managers</strong> can open it and change it. Agents and Viewers can&apos;t, in the menu or by typing the address.</li>
          <li>The library belongs to the company you are working in. Each company has its own items, categories and writing rules, and the AI only uses that company&apos;s.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Library Screen</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The header shows &ldquo;N items across M categories&rdquo;, with the <strong>Writing Rules</strong> and <strong>Add Content</strong> buttons.</li>
          <li>The category row has <strong>All</strong> plus one button per category. The counts, like the header&apos;s, are active items only.</li>
          <li>Tick <strong>Include inactive content</strong> to list switched-off items too. They are greyed out and marked <strong>Inactive</strong>.</li>
          <li>Search matches the name, short description and location.</li>
          <li>Each card shows the category, name, location, short description, up to four tags, and the tier status.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tier Status</h2>
        <p className="text-gray-600 mb-3">
          The tiers are your company&apos;s tier ladder (Settings &rarr; <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link>). A tier counts as written only when its <strong>Description</strong> is filled in.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>All Tiers</strong> (green) means every tier on the ladder has a description.</li>
          <li>Otherwise the card shows how many are written out of how many, e.g. <strong>2/4 tiers</strong>.</li>
          <li>The row of letters (B, S, D, L, &hellip;) is coloured for each written tier and grey for each missing one. Hover a letter for its name.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or Editing an Item</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Content</strong>, or a card&apos;s name or pencil icon.</li>
          <li>Under <strong>Basic Information</strong>: the <strong>Active</strong> box (untick it to keep the item but stop the AI using it), <strong>Category</strong> and <strong>Name</strong> (both required), <strong>Slug</strong>, <strong>Short Description</strong>, <strong>Location</strong> and <strong>Tags</strong>. A new item without a slug gets one made from its name.</li>
          <li>For <strong>Sites &amp; Attractions</strong> and <strong>Experiences &amp; Activities</strong> a details panel adds fields such as duration, best time to visit and accessibility.</li>
          <li>Pick a tier tab and write its <strong>Description</strong>. <strong>Title</strong>, <strong>Highlights</strong>, <strong>Inclusions</strong> and <strong>Internal Notes</strong> are optional. The tips box suggests how to write for that tier.</li>
          <li>Click <strong>Save</strong>.</li>
        </ol>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li>Only tiers with a description are saved. Clearing a saved tier&apos;s description deletes that tier.</li>
          <li>The slug must be unique in your company. If it is taken, the save stops with &ldquo;Your company already has content with this slug&rdquo;.</li>
          <li>If any tier can&apos;t be saved, the error is shown and you stay on the page.</li>
          <li>The trash icon on a card deletes the item and all its tiers, after you confirm.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where the Content Is Used</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>AI itinerary generation</strong> (from the WhatsApp parser): the AI is given active, non-cruise items whose tags, location or name match the trip&apos;s cities or interests, in the itinerary&apos;s tier. Up to 5 items per category are used, and the first 200 characters of each description (or the short description when the tier has none).</li>
          <li><strong>Cruise programmes</strong>: for a cruise trip, the generator can take a ready-made day-by-day programme from an active cruise item. Cruise items and their day-by-day plans can&apos;t be created or edited on this screen.</li>
          <li><strong>Writing Rules</strong> guide the wording; see <Link href="/docs/writing-rules" className="text-primary-600 hover:underline">Writing Rules</Link>.</li>
        </ul>
        <Tip>
          Add the city names and themes your clients ask for as tags. Matching uses tags, location and name only, so an item without them is rarely picked.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>There is no screen to add, rename or remove categories.</li>
          <li>The AI Copilot and message templates don&apos;t use the library.</li>
          <li>There is no screen for AI prompt templates. The prompt texts stored for your company are kept but not used.</li>
          <li>Inactive items are left out of the header and category counts, and the AI never uses them.</li>
        </ul>
      </section>
    </div>
  )
}
