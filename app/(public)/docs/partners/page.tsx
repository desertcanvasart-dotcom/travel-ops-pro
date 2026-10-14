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
        <strong>People &rarr; Partners</strong> holds your B2B partner accounts &mdash; the agencies and resellers you quote wholesale. A partner carries a default margin (what a quote for them is priced at) and a commission (what is recorded on the trip and booking made for them). The page is for admins and managers; the owner always has access. Partners are private to your company.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Partner</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Partner</strong></li>
          <li>Enter the <strong>company name</strong> (required), contact name, email, phone and country</li>
          <li>The <strong>partner code</strong> can be left blank: it is generated from the company name, the first three letters or digits plus three digits (e.g. <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">KAR-042</code>), and is never the same as another partner&apos;s code in your company. Type your own if you prefer (up to 20 characters). A code your company already uses is refused with a message naming it. Another company using the same code does not matter</li>
          <li>Set the <strong>default margin %</strong> and the <strong>commission %</strong> (each from 0 to 100; leave blank for none)</li>
          <li>Leave <strong>Partner is active</strong> ticked unless you are setting up an account you are not using yet</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The form has only these fields. Currency, credit limit, payment terms, net-rate and cost-breakdown switches and a pricing model are not on the form and nothing in Autoura uses them. Per-variation margin overrides cannot be edited anywhere in the app today.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Margin and Commission</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Margin</strong> is a markup on cost: selling price = cost &times; (1 + margin %). A quote uses the margin you type on the quote first, otherwise the partner&apos;s default margin, otherwise your company default margin. A partner margin of 0 or blank counts as &ldquo;not set&rdquo;, so the company default applies</li>
          <li><strong>Commission</strong> is a separate figure. It does not change any price. When a trip or booking is made for the partner, the partner&apos;s commission % is copied onto it. A partner with no commission set records 0</li>
          <li>The WhatsApp parser&apos;s partner picker shows the same commission %, and its inline <strong>Add New Partner</strong> box sets the commission (not the margin)</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Page</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total</strong> and <strong>Active</strong> count all your partners, whatever the list below is filtered to. <strong>Countries</strong> is the number of different countries. <strong>Avg Margin</strong> averages the default margin of the partners that have one set (a dash if none do)</li>
          <li>The list shows active partners by default; <strong>Show All</strong> adds inactive ones. Search matches company name or partner code</li>
          <li>If the list or a save fails, a red message says so</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deactivating and Deleting</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Deactivate</strong> (edit, untick <em>Partner is active</em>) removes the partner from the calculator, the <Link href="/docs/pricing-grid" className="text-primary-600 hover:underline">Quote Builder</Link> and other pickers, and Autoura refuses to start a new quote, trip or booking for them. Quotes and trips that already exist stay valid and keep working</li>
          <li><strong>Delete</strong> is refused while any quote, trip or booking still uses the partner. The message gives the counts and says to deactivate instead. A partner nothing uses is deleted for good</li>
          <li><Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link> list, filter and export by partner</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Do What</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Admins, managers and the owner open the Partners page and add, edit, deactivate and delete partners</li>
          <li>Agents do not see the page. They can pick partners in the calculator, the Quote Builder&apos;s B2B switch, templates and the WhatsApp parser, and can create a partner from the WhatsApp parser, but cannot edit or delete one</li>
          <li>Viewers have no access</li>
        </ul>
        <Tip>Partner codes end up in filenames and references &mdash; if you type your own, stick to letters, digits and dashes so copy-paste always works.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not calculate or pay commission: the percentage is recorded on the trip and booking, nothing more</li>
          <li>It has no credit limit, payment terms or currency per partner</li>
          <li>It does not edit per-variation margin overrides</li>
          <li>It does not import partners from a file</li>
        </ul>
      </section>
    </div>
  )
}
