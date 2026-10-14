import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function IntegrationsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Integrations</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Integrations</h1>
      <p className="text-gray-600 mb-4">
        Autoura connects to four kinds of outside service: <strong>Xero or QuickBooks</strong> for your books,{' '}
        <strong>WhatsApp Business</strong> for client messages, <strong>Gmail</strong> for email, and{' '}
        <strong>partner platforms</strong> that exchange departures with you. The first two are on{' '}
        <strong>Home &rsaquo; Settings &rsaquo; Settings &rsaquo; Integrations</strong>, Gmail on the{' '}
        <strong>Email</strong> tab, and partner platforms on <strong>Partner Integrations</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        The Settings menu is shown to the owner, admins and managers. Managers can see every connection; connecting,
        disconnecting and changing them is for admins and the owner, and the buttons are hidden from managers with a
        note saying so. Your own Gmail connection is yours, whatever your role.
      </p>

      {/* Accounting */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accounting: Xero and QuickBooks <span className="text-sm font-medium text-amber-700 align-middle">(beta)</span></h2>
        <p className="text-gray-600 mb-3">
          The connection belongs to the <strong>company</strong>, not to the person who made it. Every admin and manager
          of the company sees the same card, <em>Connected to &lt;the Xero or QuickBooks company&gt;</em>, whoever
          connected it. If you work in two companies, each has its own connection and neither affects the other.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Connect Xero</strong> / <strong>Connect QuickBooks</strong> (admins and the owner) opens the provider&apos;s sign-in. When you come back, the page says which provider is now connected.</li>
          <li><strong>One provider at a time.</strong> A company sends its books to one provider. Connecting the other one asks you to confirm, switches the first one off, and says so on the page.</li>
          <li>Connecting again (you or another admin) replaces the company&apos;s connection to that provider.</li>
          <li><strong>Disconnect</strong> (admins and the owner) removes the company&apos;s connection. Nothing is sent to that provider afterwards.</li>
        </ul>
        <p className="text-gray-600 mb-3">What is sent, as records are created in Autoura:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Invoices</strong> &mdash; client invoices, as accounts-receivable invoices.</li>
          <li><strong>Expenses</strong> &mdash; supplier expenses, as bills.</li>
          <li><strong>Payments</strong> &mdash; invoice payments and paid expenses.</li>
          <li>Customers and suppliers are created as contacts the first time they are needed.</li>
        </ul>
        <Tip>
          The sync is push-only: changes made in Xero or QuickBooks do not come back into Autoura. If the provider
          rejects the stored sign-in when it is refreshed, the connection is switched off and an admin has to connect again.
        </Tip>
      </section>

      {/* WhatsApp */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp Business</h2>
        <p className="text-gray-600 mb-3">
          Each company sends and receives WhatsApp messages on its own number. The number is connected by the{' '}
          <strong>Autoura team</strong>, not from Settings; Company Profile shows it, and an admin&apos;s change to it is refused.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>The <strong>WhatsApp Business</strong> card shows <em>Connected: &lt;number&gt;</em> when the company has a number and the installation&apos;s Twilio account is set up.</li>
          <li><strong>Test Connection</strong> sends a short test message from your number to a phone you enter.</li>
          <li><strong>Configure</strong> (or <strong>WhatsApp status</strong> when not connected) opens the WhatsApp page: the Twilio account, your company&apos;s number, whether booking status messages are on, and the same test.</li>
        </ul>
        <p className="text-gray-600">
          Customers who write to your number reach your company&apos;s WhatsApp inbox, and quotes, invoices, receipts and
          reminders sent from Autoura go out from it.
        </p>
      </section>

      {/* Gmail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Gmail</h2>
        <p className="text-gray-600 mb-3">
          Each person connects their own Gmail with Google&apos;s sign-in, from <strong>Settings &rsaquo; Email</strong> or
          the <strong>Email Settings</strong> page (<code>/settings/email</code>), which agents can open too. A person has
          one Gmail connection, attached to the company they were working in when they connected; connecting again
          from the other company moves it.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Mail you send from Autoura goes out through your own account, so replies come back to your mailbox.</li>
          <li>When a colleague&apos;s mailbox serves the company, you see <em>Shared company mailbox</em>; you cannot disconnect it, but you can connect your own.</li>
          <li><strong>Disconnect</strong> removes only your own connection.</li>
        </ul>
      </section>

      {/* Partners */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Partner Integrations</h2>
        <p className="text-gray-600 mb-3">
          A partner platform can push its departures into your calendar, read your availability, or both. Admins and
          the owner manage the connections; managers see them and their delivery log.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Connect a platform</strong> &mdash; choose the platform, a name, and a direction: <em>Both</em>, <em>Inbound only</em> (they push departures to you) or <em>Outbound only</em> (they read your availability).</li>
          <li>The webhook URL, the signing secret and the API key are shown <strong>once</strong>. Copy them for the partner; the API key is stored only as a hash and cannot be shown again.</li>
          <li><strong>Pause</strong> / <strong>Resume</strong>, and <strong>Rotate API key</strong>, <strong>Rotate signing secret</strong>, <strong>Rotate webhook URL</strong>. A rotation takes effect at once: the old value stops working.</li>
          <li><strong>Recent deliveries</strong> shows what each delivery did: processed or failed, how many departures were created, updated or unchanged, and how many were rejected or conflicted.</li>
          <li><strong>Disconnect</strong> stops the partner&apos;s key and webhook at once. Departures already mirrored are kept, but no longer updated.</li>
        </ul>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Accounting sync does not read anything back from Xero or QuickBooks, and a company cannot send to both at once.</li>
          <li>Accounting needs the installation&apos;s Xero or QuickBooks app credentials; without them, Connect cannot start.</li>
          <li>You cannot set or change your company&apos;s WhatsApp number yourself.</li>
          <li>Autoura does not process card payments, and has no LINE or WeChat connection.</li>
        </ul>
      </section>
    </div>
  )
}
