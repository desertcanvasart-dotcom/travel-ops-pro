import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function TourProgramsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tour Programs Manager</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Tour Programs Manager</h1>
      <p className="text-gray-600 mb-4">
        This is your company&rsquo;s catalogue of tour programmes. A <strong>template</strong> is the programme
        itself: its name, code, type, length, cities, descriptions and day-by-day plan. A <strong>variation</strong> is
        one tier of it (for example Standard or Luxury, private or shared) that you price and quote.
      </p>
      <p className="text-gray-600 mb-8">
        Open it from <strong>Tours &rsaquo; Tour Manager</strong>. The page title reads <strong>Tour Programs Manager</strong>.
        Admins and managers see this item, and the owner always does. Agents use <strong>Tours &rsaquo; Ready-made
        Packages</strong> instead. Every change on this screen (save, import, export, duplicate, delete, new
        variations) needs an admin, a manager or the owner.
      </p>

      {/* Header */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Header buttons</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Add Template</strong> opens the form described below.</li>
          <li><strong>Sample CSV</strong> downloads the column headers and one example row (code <code>EXAMPLE-DAY-001</code>). Rows whose code starts with <code>EXAMPLE-</code> are skipped on import.</li>
          <li><strong>Export</strong> downloads <code>tour-templates-YYYY-MM-DD.csv</code> with all your company&rsquo;s templates, sorted by code.</li>
          <li><strong>Import</strong> reads a CSV in the same shape (see <strong>Bulk CSV</strong> below).</li>
          <li><strong>Browse Tours</strong> goes to the tour inventory (<code>/tours</code>). <strong>&larr; Resources</strong> goes to the rates hub.</li>
        </ul>
      </section>

      {/* Stats + list */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <p className="text-gray-600 mb-3">Four cards count your whole catalogue. They do not follow the search or the filters.</p>
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr><th className="text-left px-3 py-2 border-b">Card</th><th className="text-left px-3 py-2 border-b">What it counts</th></tr>
            </thead>
            <tbody className="text-gray-700">
              <tr><td className="px-3 py-2 border-b"><strong>Templates</strong></td><td className="px-3 py-2 border-b">All templates, active and inactive</td></tr>
              <tr><td className="px-3 py-2 border-b"><strong>Variations</strong></td><td className="px-3 py-2 border-b">The variations of all those templates, added up</td></tr>
              <tr><td className="px-3 py-2 border-b"><strong>Active</strong></td><td className="px-3 py-2 border-b">Templates switched on</td></tr>
              <tr><td className="px-3 py-2"><strong>Featured</strong></td><td className="px-3 py-2">Templates marked Featured</td></tr>
            </tbody>
          </table>
        </div>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Search by name, code, or city...</strong>, <strong>All Themes</strong> and <strong>All Types</strong> filter the list. Themes and types are your own words from Settings &rsaquo; Vocabulary.</li>
          <li>The status toggle reads <strong>Active</strong> while inactive templates are hidden and <strong>Show inactive</strong> while they are shown.</li>
          <li>Views: <strong>Table</strong>, <strong>Card</strong> and <strong>Compact</strong>.</li>
          <li>The status line reads &ldquo;Showing N of M templates &bull; K attractions loaded&rdquo;.</li>
        </ul>
        <p className="text-gray-600 mb-3">
          Table columns: Template (name, code, and an <strong>Auto</strong> badge when the template has day-builder
          activities), Created, Type, Duration, Cities (the first three, then +n), Variations, Lang (which of the EN and
          JA versions exist), Status, and the actions <strong>Edit</strong>, <strong>Duplicate</strong> and <strong>Delete</strong>.
        </p>
        <p className="text-gray-600">
          Expand a row to see its variations. Each shows its tier, name, group type and min&ndash;max travellers, with
          <strong> Options</strong> (the upgrades it sells) and <strong>Price</strong> (the B2B price calculator).
          <strong> + Add Variation</strong> adds tiers. You cannot edit or delete a variation on this screen.
        </p>
      </section>

      {/* Form */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding and editing a template</h2>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Basic Info</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Template Name *</strong>, <strong>Theme</strong>, <strong>Tour Type *</strong>, <strong>Duration (Days) *</strong>, <strong>Duration (Nights)</strong>, <strong>Physical Level</strong>, <strong>Cities Covered</strong>, <strong>Short Description</strong>. Changing the days suggests a tour type from each type&rsquo;s day range.</li>
          <li><strong>Template Code</strong>. Leave it empty and the server makes one when you create the template: the first city&rsquo;s first three letters, the type&rsquo;s first three, and three random digits (for example <code>CAI-DAY-482</code>). If that code is already taken in your company, it draws another. A code you type yourself is never changed; if another template already has it, you are told so and nothing is saved. Codes are unique within your company. Clearing the code while editing keeps the stored one.</li>
          <li><strong>Website page</strong> is the address of this programme on your website. Website orders carry it, and it links an order to this programme.</li>
          <li><strong>Featured</strong> and <strong>Active</strong>.</li>
          <li><strong>&#9889; Auto-Pricing</strong> is saved as the template&rsquo;s pricing mode. Ticked, the pricing engine works out the template&rsquo;s &ldquo;from&rdquo; price in the tour inventory. Unticked, it does not, even when the template has day-builder activities, and the inventory card shows no engine price. It does not stop you pricing a variation on the calculator.</li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Details</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Highlights</strong>, <strong>Inclusions</strong>, <strong>Exclusions</strong> and <strong>Best For</strong>.</li>
          <li><strong>Main Attractions</strong> lists your active entrance fees that are not add-ons, with the EU-passport and non-EU price. Each fee is converted from the currency it was entered in to your display currency. If you have more fees than the list can load at once (1,000), it says so and searches all of them once you type two letters.</li>
          <li><strong>Day-by-Day Itinerary</strong>. Each day has a title, city, description and meals, plus <strong>&#128674; Cruise Transport Package</strong>, the tickets the engine charges, night supplements, a named hotel or ship, a flight, train or sleeper leg, and the day&rsquo;s transport list. <strong>Edit</strong> and <strong>Delete</strong> work per day; Delete asks first.</li>
          <li>The transport list shows the engine&rsquo;s own lines and their cost for 2 travellers in your company&rsquo;s rate currency. It reads the tour type on the form the way <strong>Calculate Price</strong> does: a Day Tour, Half Day or Stopover is priced as a day trip, with no airport transfers.</li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Variations (new templates only)</h3>
        <p className="text-gray-600 mb-3">
          Pick tiers from your tier ladder, each Private or Shared. Tiers you added in Settings &rsaquo; Vocabulary
          work like the built-in ones and start from Standard&rsquo;s defaults. The footer counts the variations, and the
          button reads <strong>Create Template &amp; Variations</strong> (<strong>Update Template</strong> when editing).
        </p>
        <p className="text-gray-600 mb-3">
          The template is saved first. If its variations then fail, you see an error, the form closes and the template
          stays; add the tiers with <strong>+ Add Variation</strong>. Because the form closes, a second click cannot
          make a second copy of the template.
        </p>
        <Tip>
          Saving an edit sends only the fields on this form. Fields the form does not show, such as Meals Included and
          Pickup Required from a CSV import, keep their stored values. Each save also refreshes the template&rsquo;s
          English version, so <strong>Copy &amp; Translate</strong> on the tour page translates the current text.
        </Tip>
      </section>

      {/* Add variations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Variations</h2>
        <p className="text-gray-600">
          <strong>+ Add Variation</strong> on an existing template lists your tier ladder. Tiers the template already
          has are greyed out as <strong>Already exists</strong>; a template has at most one variation per tier. Each
          tier shows its default travellers, vehicle and Private or Shared. <strong>Create Variations</strong> makes
          them. If anything fails, the error is shown and the button can be used again.
        </p>
      </section>

      {/* Duplicate */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Duplicate</h2>
        <p className="text-gray-600 mb-3">
          <strong>Duplicate</strong> copies the whole programme as &ldquo;Name (Copy)&rdquo;: the template, its language
          versions, its day activities, and every variation with its costed services, day plan, prices and translations.
          The copy gets a new code built from the original&rsquo;s first city and tour type. Each variation code takes
          the new template code in place of the old one.
        </p>
        <p className="text-gray-600">
          The copy does not take the original&rsquo;s quotes, departures, trips or partner prices, and it has no
          cached &ldquo;from&rdquo; price until prices are refreshed. If any step fails, the half-made copy is removed and
          you see the error.
        </p>
      </section>

      {/* Delete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Delete and Deactivate</h2>
        <p className="text-gray-600 mb-3">
          Only admins, managers and the owner can delete. A template is deleted, with its variations and day plan,
          only when nothing uses it. If any quote (of any status), departure, trip, partner price or seat hold refers
          to the template or one of its variations, the delete is refused. The dialog says what uses it, for example
          &ldquo;used by 3 quotes, 2 departures&rdquo;, and offers <strong>Deactivate</strong>.
        </p>
        <p className="text-gray-600">
          Deactivate switches the template off. It leaves the catalogue lists and pickers, and every quote, departure
          and trip that uses it keeps it. A catalogue delete never deletes a sales record.
        </p>
      </section>

      {/* Bulk CSV */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Bulk CSV</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Columns:</strong> Code, Name, Name (JA), Type, Theme, Duration Days, Duration Nights, Physical Level, Cities, Best For, Highlights, Main Attractions, Inclusions, Exclusions, Meals Included, Short Description, Long Description, Image URL, Website Page, Pickup Required, Featured, Active.</li>
          <li><strong>Required:</strong> Code, Name, Type and Duration Days (1 or more). Rows without them are skipped and counted.</li>
          <li><strong>Format:</strong> separate list items with <code>;</code> or <code>|</code>. Theme, Type and Physical Level take vocabulary keys.</li>
          <li><strong>Matching:</strong> on Code, within your company only, ignoring upper and lower case. <code>cai-day-001</code> updates <code>CAI-DAY-001</code> and keeps that spelling. A blank cell never clears a value. The itinerary, variations and translations are left alone.</li>
          <li><strong>New codes</strong> create a template with the metadata only, plus its English version. Updated templates get their English version refreshed. <strong>Name (JA)</strong> goes to the Japanese version.</li>
          <li>The same code twice in one file is refused. The result reads &ldquo;Imported: N created, M updated, K skipped&rdquo;.</li>
        </ul>
        <Tip>
          The shared rules for Sample, Export and Import are in{' '}
          <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>.
        </Tip>
      </section>

      {/* From WhatsApp / Pricing Grid */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Templates made from a trip</h2>
        <p className="text-gray-600 mb-3">
          The WhatsApp Parser in B2B mode and the Pricing Grid&rsquo;s B2B save turn a trip into a template named after
          the trip, with the description &ldquo;Custom tour created from WhatsApp inquiry&rdquo;, and one variation at the
          chosen tier. The template and its variation are made together; if the variation cannot be made, the template
          is removed again.
        </p>
        <p className="text-gray-600">
          When an admin, manager or the owner does this, the template is active. When an agent does it, the template
          is created <strong>inactive</strong> for a manager to review: it can be priced on the calculator straight
          away, but it stays out of the catalogue and pickers until someone switches it to Active here. Use
          <strong> Show inactive</strong> to find these.
        </p>
      </section>

      {/* Company separation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Company separation</h2>
        <p className="text-gray-600">
          Templates, variations, codes, day plans, linked content, transport and hotel previews and the pickers all
          come from the signed-in company. Two companies may use the same code. Another company&rsquo;s template is
          &ldquo;not found&rdquo;.
        </p>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not edit or delete a single variation. Variations are added here and priced from <strong>Price</strong>.</li>
          <li>It does not delete a template that any sales record uses. Deactivate it instead.</li>
          <li>The stats cards do not follow the search or filters.</li>
          <li>The transport preview uses 2 travellers and the Standard tier; the calculator prices the real group.</li>
          <li>The CSV import does not carry the day-by-day itinerary, hotels or variations.</li>
          <li>Duplicate does not copy partner prices, quotes, departures or trips.</li>
        </ul>
      </section>
    </div>
  )
}
