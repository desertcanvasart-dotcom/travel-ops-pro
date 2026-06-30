import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function SuppliersPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Suppliers</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Suppliers</h1>
      <p className="text-gray-600 mb-8">
        The Suppliers directory is your central contact book for every partner you work with &mdash; hotels, transport companies, guides, cruises, restaurants, and more. Each supplier stores contact details, commission terms, and type-specific information used across pricing and bookings.
      </p>

      {/* Supplier types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supplier Types</h2>
        <p className="text-gray-600 mb-3">
          Every supplier has a type that drives its icon, color, and the extra fields it can hold:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Hotels</strong> &mdash; Star rating and property type</li>
          <li><strong>Transport &amp; Drivers</strong> &mdash; Vehicle types served</li>
          <li><strong>Guides</strong> &mdash; Languages spoken</li>
          <li><strong>Cruises</strong> &mdash; Ship name, cabin count, capacity, and routes</li>
          <li><strong>Restaurants</strong> &mdash; Cuisine types</li>
          <li><strong>Local Operators, Tour Operators, Ground Handlers, Activities, Attractions, Shops</strong> and <strong>Other</strong></li>
        </ul>
        <ScreenshotPlaceholder caption="Supplier directory grouped by type with colored badges" />
      </section>

      {/* Adding a supplier */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Supplier</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Supplier</strong> and choose a type</li>
          <li>Enter the core details:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Name</strong> &mdash; Required</li>
              <li><strong>Contact</strong> &mdash; Name, email, phone, second phone, and WhatsApp</li>
              <li><strong>Location</strong> &mdash; Address, city, and country (defaults to Egypt)</li>
              <li><strong>Commission</strong> &mdash; Default commission rate, commission type, and payment terms</li>
              <li><strong>Status</strong> &mdash; Active, Inactive, or Pending</li>
            </ul>
          </li>
          <li>Fill in any type-specific fields, then save</li>
        </ol>
      </section>

      {/* Hierarchy */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Companies &amp; Properties</h2>
        <p className="text-gray-600 mb-3">
          Hotels, restaurants, and cruises support a two-level hierarchy: a parent <strong>company</strong> can own multiple individual <strong>properties</strong>. This lets you model a hotel chain or cruise line with its specific properties or ships underneath.
        </p>
        <Tip>
          Use the hierarchy to keep one company record while still pricing each property or ship separately.
        </Tip>
      </section>

      {/* Browsing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Browsing &amp; Managing</h2>
        <p className="text-gray-600 mb-3">
          The directory offers grid, table, and list views. You can:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Search</strong> across supplier records</li>
          <li><strong>Filter</strong> by type and status</li>
          <li><strong>Sort</strong> by name, type, city, status, or commission</li>
          <li><strong>Export</strong> the list, and view, edit, or delete any supplier</li>
        </ul>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/content-library" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Content Library
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
