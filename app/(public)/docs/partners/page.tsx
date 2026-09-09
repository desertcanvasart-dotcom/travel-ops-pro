import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function PartnersPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Partners</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Partners</h1>
      <p className="text-gray-600 mb-8">
        <strong>People &rarr; Partners</strong> holds your B2B partner accounts &mdash; the agencies and resellers you quote wholesale. A partner carries its own default margin, so quoting for them starts from the commercial terms you agreed rather than your walk-in pricing.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Partner</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Partner</strong></li>
          <li>Enter the company name, contact person, email and country</li>
          <li>The <strong>partner code</strong> is generated from the company name (letters and digits, e.g. <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">KAR-042</code>) or set your own</li>
          <li>Set the <strong>default margin %</strong> &mdash; the starting margin whenever this partner is selected on a quote</li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Partners in the Quoting Flow</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>In the <Link href="/docs/pricing-grid" className="text-primary-600 hover:underline">Quote Builder</Link>, switching to <strong>B2B</strong> lets you pick the partner; the saved quote and itinerary carry the partner and the commission percentage</li>
          <li><Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link> list, filter and export by partner</li>
          <li>Deactivating a partner keeps history but removes them from pickers</li>
        </ul>
        <Tip>Partner codes end up in filenames and references &mdash; if you type your own, stick to letters, digits and dashes so copy-paste always works.</Tip>
      </section>
    </div>
  )
}
