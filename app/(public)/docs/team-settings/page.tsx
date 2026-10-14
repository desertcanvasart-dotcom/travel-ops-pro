import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function TeamSettingsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Settings</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Settings</h1>
      <p className="text-gray-600 mb-4">
        Settings holds your own account details and your company&apos;s configuration. Open it from{' '}
        <strong>Home &rsaquo; Settings &rsaquo; Settings</strong>. The page has seven tabs:{' '}
        <strong>Profile</strong>, <strong>Email</strong>, <strong>Notifications</strong>, <strong>Preferences</strong>,{' '}
        <strong>Integrations</strong>, <strong>Partner Integrations</strong> and <strong>Organization</strong>.
      </p>

      {/* Who */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who can see and change what</h2>
        <p className="text-gray-600 mb-3">
          The Settings group of the menu is shown to the owner, admins and managers. Agents and viewers do not have it,
          and an agent or viewer who opens a Settings address is sent to the dashboard, with two exceptions for agents:
          their own <strong>Preferences</strong> page (<code>/settings/preferences</code>) and their own{' '}
          <strong>Email Settings</strong> page (<code>/settings/email</code>). Viewers have no Settings page.
        </p>
        <p className="text-gray-600 mb-3">
          A manager can open every tab. Where the server refuses a manager&apos;s change, the form is shown read-only
          with a short note saying who can change it. The rules are:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Your own data, any role that can open the page:</strong> Profile, password, Notifications, Preferences, your Gmail connection and your signatures.</li>
          <li><strong>Managers and above:</strong> the office email addresses (Email Settings page).</li>
          <li><strong>Admins (and the owner):</strong> Company Profile, the accounting connection, Partner Integrations, inviting people and cancelling invitations, Vocabulary and Destinations.</li>
          <li><strong>The owner only:</strong> Payment Terms, renaming the company (on the Organization page and in Company Profile), and removing another member.</li>
          <li><strong>The Autoura team only:</strong> your company&apos;s WhatsApp number.</li>
        </ul>
      </section>

      {/* Profile */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Change Photo</strong> &mdash; JPG, PNG, GIF or WebP, up to 2&nbsp;MB.</li>
          <li><strong>Full Name</strong> and <strong>Phone</strong> &mdash; saved with <strong>Save Changes</strong>.</li>
          <li><strong>Email</strong> &mdash; shown read-only. It is the address you sign in with.</li>
          <li><strong>Role</strong> &mdash; shown read-only. It is your role in the company you are working in; an admin changes it under User Management.</li>
          <li><strong>Language</strong> &mdash; English or Japanese for the whole interface. It applies as soon as you pick it.</li>
        </ul>
        <p className="text-gray-600">
          <strong>Change your password</strong> opens the profile page (<code>/settings/profile</code>). Enter your
          current password and the new one twice; the new password needs at least 8 characters and must differ from
          the current one. The change is made on your sign-in account straight away, and a wrong current password
          changes nothing.
        </p>
      </section>

      {/* Email */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Gmail Integration</strong> shows <em>Connected as &lt;address&gt;</em> or <em>Not connected</em>. <strong>Connect Gmail</strong> starts Google&apos;s sign-in; <strong>Disconnect</strong> removes your own connection.</li>
          <li><strong>Shared company mailbox</strong> appears when a colleague&apos;s mailbox serves the company. It is not yours to disconnect; you can still connect your own.</li>
          <li><strong>Manage signatures</strong> opens Email Settings on its Signatures tab.</li>
        </ul>
        <p className="text-gray-600 mb-3">
          The <strong>Email Settings</strong> page (<code>/settings/email</code>) has three tabs: <strong>Connection</strong>,{' '}
          <strong>Signatures</strong> and <strong>Templates</strong>. Signatures are yours and belong to the company you
          are working in: if you work in two companies, each has its own signatures and its own default. The default
          signature is added to the emails you write from the Email Inbox and Compose. Owners, admins and managers also
          see the <strong>Office addresses</strong> card there.
        </p>
      </section>

      {/* Notifications */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Notifications</h2>
        <p className="text-gray-600">
          <strong>Email Notifications</strong> turns email delivery on or off. Below it, <strong>Task Assigned</strong>,{' '}
          <strong>Task Due Soon</strong> and <strong>Task Overdue</strong> choose which task notices you get. These are
          stored for you in the company you are working in.
        </p>
      </section>

      {/* Preferences */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Preferences</h2>
        <p className="text-gray-600 mb-3">
          Your defaults for new trips and prices, stored for you in the company you are working in. Agents reach the
          same form at <strong>/settings/preferences</strong> (the WhatsApp Parser links to it).
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Default Service Tier</strong> &mdash; one card per tier in your <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link>.</li>
          <li><strong>Default Profit Margin</strong> &mdash; a slider from 0 to 50% in steps of 5. While <strong>Follow the company&apos;s default margin</strong> is ticked, you use the company&apos;s default margin (Company Profile, or 25% if the company has none) and later changes to it reach you. Moving the slider gives you a margin of your own; ticking the box again goes back to the company&apos;s.</li>
          <li><strong>Default Currency</strong> &mdash; USD, EUR, GBP, EGP or JPY. Until you choose, it is the company&apos;s billing currency.</li>
        </ul>
      </section>

      {/* Integrations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Integrations and Partner Integrations</h2>
        <p className="text-gray-600">
          The <strong>Integrations</strong> tab holds the company&apos;s Xero or QuickBooks connection and the WhatsApp
          Business status; <strong>Partner Integrations</strong> connects partner platforms. Both are described on{' '}
          <Link href="/docs/integrations" className="text-primary-600 hover:underline">Integrations</Link>.
        </p>
      </section>

      {/* Organization */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Organization</h2>
        <p className="text-gray-600 mb-3">
          <strong>Open organization settings</strong> leads to the Organization page: the company name, the number of
          members and pending invitations, the <strong>Members</strong> table (Name, Email, Role, Joined) and{' '}
          <strong>Pending invitations</strong> (Email, Role, Sent, Expires).
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Invite</strong> (admins and the owner) takes an email and a role: admin, manager, agent or viewer. The link is valid for 7 days. If the email cannot be sent, the link is shown for you to copy.</li>
          <li><strong>Cancel invitation</strong> &mdash; admins and the owner.</li>
          <li><strong>Rename</strong> and removing another member &mdash; the owner only.</li>
          <li><strong>Leave</strong> (the bin icon on your own row) &mdash; admins and the owner; the last owner cannot leave.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Company Profile</h3>
        <p className="text-gray-600 mb-3">
          What customer documents and the customer portal print. Admins and the owner save it; everyone else sees it
          read-only.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Upload logo</strong> &mdash; PNG, JPEG or WebP, up to 2&nbsp;MB. SVG is refused.</li>
          <li><strong>Company name</strong> &mdash; only the owner can change it.</li>
          <li><strong>Tagline</strong>, <strong>Phone</strong>, <strong>Email</strong>, <strong>Website</strong>, <strong>Address</strong>.</li>
          <li><strong>WhatsApp number</strong> &mdash; set by the Autoura team; an admin&apos;s change is refused.</li>
          <li><strong>Billing currency</strong> &mdash; JPY, EUR, USD, GBP, EGP or Not set. What the company invoices in, and the currency colleagues inherit until they choose their own.</li>
          <li><strong>Rate currency</strong> &mdash; USD, EUR, GBP, EGP or JPY: what supplier rates are entered in. Any other code is refused by the server.</li>
          <li><strong>Default margin (%)</strong> &mdash; 0 to 100; blank means none, and 25% applies.</li>
          <li><strong>VAT rate (%)</strong> &mdash; 14 unless you change it; blank goes back to 14 and a value outside 0&ndash;100 is refused. It is added on top of the net price when <strong>Apply VAT</strong> is ticked on a B2B quote, a B2C offer or an invoice, on everything except extras and insurance. Each document keeps the rate it was issued with.</li>
          <li><strong>Rate-change alerts</strong> &mdash; In the app, In the app + e-mail, or Off.</li>
          <li><strong>Country you operate in</strong> and <strong>Governing law</strong> &mdash; printed on travel contracts.</li>
          <li><strong>Offices (letterhead)</strong> &mdash; up to 10, each with a label, postal code, address, TEL and FAX.</li>
          <li><strong>Document header contacts</strong> &mdash; Emergency contact (Japan) and Cairo office.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Payment terms</h3>
        <p className="text-gray-600 mb-4">
          The deposit percentage, how many days after booking the deposit is due, and how many days before departure
          the balance is due. A blank field uses the standing rule shown in grey. Only the owner can change them;
          changes apply to bookings created afterwards.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Licence</h3>
        <p className="text-gray-600">
          Read-only: who the installation is licensed to, the licence ID, the valid-until date, the domains and the
          included features. One licence covers the whole installation, so every company on it sees the same card.
        </p>
      </section>

      {/* Elsewhere */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Other pages in the Settings group</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link> &mdash; the agency&apos;s own words for every list in the app.</li>
          <li><Link href="/docs/destinations" className="text-primary-600 hover:underline">Destinations</Link> &mdash; the countries and cities you operate.</li>
          <li><Link href="/docs/seasonal-premiums" className="text-primary-600 hover:underline">Seasonal Premiums</Link> &mdash; the dates you charge more on.</li>
        </ul>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>There is no auto-reply for email, and no Default Cost Mode setting on screen.</li>
          <li>Your sign-in email cannot be changed from Settings.</li>
          <li>Agents cannot open the Profile page or change their password from Settings; viewers have no Settings page at all.</li>
          <li>The licence does not count or limit seats.</li>
        </ul>
        <Tip>
          The interface language is chosen on the Profile tab. Translating an itinerary&apos;s content is a different
          feature: see <Link href="/docs/multi-language" className="text-primary-600 underline hover:text-primary-700">Languages</Link>.
        </Tip>
      </section>
    </div>
  )
}
