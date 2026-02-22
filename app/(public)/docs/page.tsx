import Link from 'next/link'
import {
  Rocket,
  LayoutDashboard,
  Users,
  Map,
  CalendarCheck,
  FileText,
  Wallet,
  MessageCircle,
  Globe,
  FolderOpen,
  Settings,
  Lightbulb,
  MailPlus,
} from 'lucide-react'

const SECTIONS = [
  {
    href: '/docs/getting-started',
    icon: Rocket,
    title: 'Getting Started',
    description: 'Log in, set up your account, and understand your role.',
  },
  {
    href: '/docs/dashboard',
    icon: LayoutDashboard,
    title: 'Dashboard',
    description: 'Your home base with quick stats, actions, and recent activity.',
  },
  {
    href: '/docs/communication',
    icon: MessageCircle,
    title: 'Communication',
    description: 'WhatsApp inbox, AI parser, and email management.',
  },
  {
    href: '/docs/clients',
    icon: Users,
    title: 'Clients (CRM)',
    description: 'Add, search, and manage client profiles, notes, and follow-ups.',
  },
  {
    href: '/docs/itineraries',
    icon: Map,
    title: 'Itineraries',
    description: 'Build day-by-day trip plans with pricing, services, and PDF export.',
  },
  {
    href: '/docs/bookings',
    icon: CalendarCheck,
    title: 'Bookings',
    description: 'Track supplier confirmations, payments, and operational status.',
  },
  {
    href: '/docs/invoices-payments',
    icon: FileText,
    title: 'Invoices & Payments',
    description: 'Create invoices, record payments, and send reminders.',
  },
  {
    href: '/docs/expenses-commissions',
    icon: Wallet,
    title: 'Expenses & Commissions',
    description: 'Log trip costs, track commissions, and view profit & loss.',
  },
  {
    href: '/docs/tours-rates',
    icon: Globe,
    title: 'Tours & Rates',
    description: 'Pre-built tour templates and comprehensive rate management.',
  },
  {
    href: '/docs/resources-documents',
    icon: FolderOpen,
    title: 'Resources & Documents',
    description: 'Manage guides, vehicles, hotels, and generate documents.',
  },
  {
    href: '/docs/message-templates',
    icon: MailPlus,
    title: 'Message Templates',
    description: 'Create and send pre-designed messages via WhatsApp and email.',
  },
  {
    href: '/docs/team-settings',
    icon: Settings,
    title: 'Team & Settings',
    description: 'Invite team members, assign roles, and configure preferences.',
  },
  {
    href: '/docs/workflows',
    icon: Lightbulb,
    title: 'Workflows & Tips',
    description: 'Step-by-step workflows and productivity shortcuts.',
  },
]

export default function DocsHub() {
  return (
    <>
      {/* Hero Section */}
      <section className="pt-16 pb-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Documentation
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Everything you need to know about using Autoura. From getting started to advanced workflows, find step-by-step guides for every feature.
          </p>
        </div>
      </section>

      {/* Cards Grid */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <Link
                key={section.href}
                href={section.href}
                className="group border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-primary-300 transition-all duration-200"
              >
                <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-colors">
                  <Icon className="w-5 h-5 text-primary-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">
                  {section.title}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {section.description}
                </p>
              </Link>
            )
          })}
        </div>
      </section>
    </>
  )
}
