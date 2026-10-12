// ============================================
// The docs table of contents — ONE list, two renderers
// ============================================
// The index page (/docs) and the sidebar (layout.tsx) each carried their own
// copy of this list. They drifted, as two copies do: the sidebar was flat and
// in a different order than the index's groups, with entries the other did
// not have — which an external audit filed as "the sidebar omits several
// entries the index shows" (AUT-L04). Same cure as lib/suppliers/fields.ts:
// one vocabulary, every renderer reads it.
//
// __tests__/app/docs-toc.test.ts pins this list to the page directories on
// disk, in both directions — a new doc page must be added here, and an entry
// here must have a page.

import {
  BarChart,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Bot,
  Briefcase,
  Bus,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  ClipboardPaste,
  ConciergeBell,
  CreditCard,
  FileCheck,
  FileInput,
  FileText,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe,
  IdCard,
  Languages,
  LayoutDashboard,
  Lightbulb,
  LineChart,
  Link2,
  MailPlus,
  Map,
  MessageCircle,
  MessagesSquare,
  Package,
  PenLine,
  Receipt,
  Rocket,
  Settings,
  Sparkles,
  Tag,
  TrendingUp,
  Truck,
  Upload,
  UserRound,
  Users,
  Wallet,
  Wand2,
} from 'lucide-react'

export interface DocItem {
  href: string
  icon: typeof Rocket
  title: string
  /** One sentence. Also the page's search description, so keep it short. */
  description: string
  /** Shorter sidebar label where the full title would crowd it. */
  navLabel?: string
  /** The app menu routes this page documents (components/nav/navigation-config.ts). */
  covers?: string[]
}

export interface DocCategory {
  label: string
  /** The app menu group's key. Absent only for docs-only groups (Getting Started). */
  menuSection?: string
  items: DocItem[]
}

export const CATEGORIES: DocCategory[] = [
  // ============================================
  // GROUPS MIRROR THE APP SIDE MENU (components/nav/navigation-config.ts):
  // same groups, same order, same labels — Home · Communicate · Sell ·
  // Operate · Tours · Suppliers & Rates · People · Finance · Settings — so the
  // operator reads one map in both places. Getting Started is the one
  // docs-only group. `menuSection` names the menu group; `covers` lists the
  // menu routes a page documents. __tests__/app/docs-toc.test.ts holds both
  // to the menu: every item an operator can open is covered by a page in its
  // own group.
  {
    label: 'Getting Started',
    items: [
      { href: '/docs/getting-started', icon: Rocket, title: 'Getting Started', description: 'Log in, set up your account, and understand your role.' },
      { href: '/docs/workflows', icon: Lightbulb, title: 'Workflows & Tips', description: 'End-to-end workflows across the sidebar pipeline — Sell, Operate, Suppliers & Rates, Finance — and the shortcuts that speed each one.' },
    ],
  },
  {
    label: 'Home',
    menuSection: 'home',
    items: [
      { href: '/docs/dashboard', icon: LayoutDashboard, title: 'Dashboard', description: 'Your home base with quick stats, actions, and recent activity.', covers: ['/dashboard'] },
      { href: '/docs/analytics', icon: BarChart, title: 'Analytics', description: 'Visual charts and metrics across bookings, revenue, and team performance.', covers: ['/analytics'] },
      { href: '/docs/financial-reports', icon: BarChart3, title: 'Financial Reports', description: 'Monthly and quarterly revenue, cash flow analysis, tax summaries, commission reports, and year-over-year comparisons.', covers: ['/financial-reports'] },
      { href: '/docs/copilot-analytics', icon: LineChart, title: 'Copilot Analytics', description: 'Measure Copilot conversations by channel, status and time, and use the insights to improve replies.', covers: ['/copilot-analytics'] },
    ],
  },
  {
    label: 'Communicate',
    menuSection: 'communication',
    items: [
      { href: '/docs/communication', icon: MessageCircle, title: 'Unified Inbox', description: 'WhatsApp, email and portal messages in one inbox, with the AI parser.', covers: ['/communications'] },
      { href: '/docs/portal-messages', icon: MessagesSquare, title: 'Portal Messages', description: 'Travellers ask questions from their booking page; your team answers from the unified inbox, beside WhatsApp and email.' },
      { href: '/docs/email-inbox', icon: MailPlus, title: 'Email Inbox', description: 'Connect Gmail, read and send email, and understand what lands here versus the Unified Inbox.', covers: ['/inbox'] },
      { href: '/docs/message-templates', icon: FileInput, title: 'Message Templates', description: 'Create and send pre-designed messages via WhatsApp and email with placeholder auto-fill.', covers: ['/templates'] },
      { href: '/docs/whatsapp-agent', icon: Bot, title: 'WhatsApp AI Agent', description: 'Draft-gated AI agent that reads the thread, checks live availability, and suggests a reply for you to approve — it never auto-sends.' },
      { href: '/docs/copilot', icon: Sparkles, title: 'AI Copilot', description: 'Ask questions and draft replies grounded in your own knowledge base (RAG). Agent memory learns your style over time.', covers: ['/copilot'] },
      { href: '/docs/copilot-knowledge', icon: BookOpen, title: 'Copilot Knowledge', description: 'Manage the knowledge sources that ground every Copilot answer.', covers: ['/copilot-knowledge'] },
      { href: '/docs/content-library', icon: BookOpen, title: 'Content Library', description: 'Reusable attraction and activity descriptions with per-tier variations, AI prompts, and writing rules.', covers: ['/content-library'] },
      { href: '/docs/writing-rules', icon: PenLine, title: 'Writing Rules', description: 'TODO', covers: ['/content-library/rules'] },
      { href: '/docs/multi-language', icon: Languages, title: 'Languages', description: 'Copy and translate itineraries and B2B quotes between English and Japanese with one click — and relabel the product in your own words with Vocabulary.' },
      { href: '/docs/notifications', icon: BellRing, title: 'Notifications', description: 'In-app notifications for tasks, payments, bookings, and team activity.' },
      { href: '/docs/concierge', icon: ConciergeBell, title: 'Concierge Briefs', description: 'Optional module — receive partner concierge briefs, triage them with SLA timers, and promote them into itineraries. Hidden when switched off for your account.', covers: ['/concierge-briefs'] },
    ],
  },
  {
    label: 'Sell',
    menuSection: 'sell',
    items: [
      { href: '/docs/pricing-grid', icon: Calculator, title: 'Quote Builder', description: 'The one pricing engine — compare rates across tiers, dates and group sizes, pick a package type, and price a whole itinerary at once.', covers: ['/pricing-grid'] },
      { href: '/docs/b2c-pricing', icon: Calculator, title: 'B2C Pricing', description: 'Calculate itinerary pricing with automatic rate lookup and service costing.' },
      { href: '/docs/b2c-quotes', icon: Tag, title: 'B2C Quotes', description: 'Priced offer-wrapper over an itinerary for direct selling, with revision history and a send flow.', covers: ['/b2c/quotes'] },
      { href: '/docs/b2b-pricing', icon: Briefcase, title: 'B2B Pricing', description: 'B2B rate-sheet calculator with pax tables (1–40) and single supplement, reached from the Quote Builder and B2B Quotes.' },
      { href: '/docs/b2b-quotes', icon: FileCheck, title: 'B2B Quotes', description: 'Save, manage, and export B2B quotes with PDF generation.', covers: ['/b2b/quotes'] },
      { href: '/docs/quote-revisions', icon: GitBranch, title: 'Quote Revisions', description: 'Versioned B2B quotes — snapshot, compare side-by-side, revert, plus bulk status operations.' },
      { href: '/docs/order-intake', icon: ClipboardPaste, title: 'Order Intake', description: 'Turn an incoming order — a tour-up.jp brief or a pasted request — into a structured booking with the deterministic intake and the hosted order form.', covers: ['/intake/order'] },
      { href: '/docs/itinerary-creation', icon: Wand2, title: 'Itinerary Creation', description: 'AI-powered itinerary generation from WhatsApp conversations and emails.' },
      { href: '/docs/itineraries', icon: Map, title: 'Itineraries', description: 'Build day-by-day trip plans with drag-and-drop reordering, pricing, services, and PDF export.', covers: ['/itineraries'] },
      { href: '/docs/bookings', icon: CalendarCheck, title: 'Bookings', description: 'Track supplier confirmations, payments, and operational status.', covers: ['/bookings'] },
      { href: '/docs/traveller-portal', icon: Globe, title: 'Traveller Portal', description: 'The page your customers see: a private link per traveller, the form that replaces the posted 申込書, and who is allowed to see what.' },
      { href: '/docs/passport-documents', icon: IdCard, title: 'Passport & Documents', description: 'Travellers attach their passport from their own link. Stored privately, opened by a short-lived link, deleted automatically after the trip.' },
      { href: '/docs/calendar', icon: Calendar, title: 'Calendar', description: 'Month, week, and timeline views of all tours. Drag-to-reschedule, resource conflict detection, and team-wide visibility.', covers: ['/calendar'] },
      { href: '/docs/extras', icon: Sparkles, title: 'Extras & Upgrades', description: 'Add-ons, upgrades and options offered on top of a trip — priced off-margin, per-row currency, and attached from the itinerary.', covers: ['/rates/extras'] },
    ],
  },
  {
    label: 'Operate',
    menuSection: 'operate',
    items: [
      { href: '/docs/tasks', icon: CheckSquare, title: 'Tasks', description: 'Kanban board, table, and list views for managing operational tasks with priorities and assignments.', covers: ['/tasks'] },
      { href: '/docs/departures', icon: CalendarDays, title: 'Departures', description: 'Create and manage scheduled group departures: template or custom, pax limits, and the status lifecycle from Draft to Guaranteed.', covers: ['/departures'] },
      { href: '/docs/capacity-departures', icon: Gauge, title: 'Capacity', description: 'Define operator capacity; live availability prevents overbooking.', covers: ['/capacity'] },
      { href: '/docs/followups-reminders', icon: Bell, title: 'Follow-ups', description: 'Schedule follow-ups, set reminders, and never miss a client touchpoint.', covers: ['/followups'] },
      { href: '/docs/resources-documents', icon: FolderOpen, title: 'Documents', description: 'Manage guides, vehicles, hotels, restaurants, and airport assistants. Generate invoices, contracts, vouchers, and receipts.', covers: ['/documents'] },
      { href: '/docs/guest-surveys', icon: ClipboardCheck, title: 'Guest Surveys', description: "Read guest satisfaction surveys, sent automatically by email and WhatsApp when a trip ends, and see each guest's ratings and comments.", covers: ['/surveys'] },
    ],
  },
  {
    label: 'Tours',
    menuSection: 'tours',
    items: [
      { href: '/docs/tour-programs', icon: ClipboardList, title: 'Tour Templates', description: 'Create tour templates one at a time or bulk-create them from a Sample CSV, manage variations, and feed the template into pricing.', covers: ['/tours/manage'] },
      { href: '/docs/tour-inventory', icon: Package, title: 'Tour Inventory', description: 'TODO', covers: ['/tours'] },
      { href: '/docs/transport-packages', icon: Bus, title: 'Transport Packages', description: 'TODO', covers: ['/b2b/pricing-rules'] },
    ],
  },
  {
    label: 'Suppliers & Rates',
    menuSection: 'rates',
    items: [
      { href: '/docs/suppliers', icon: Truck, title: 'Suppliers', description: 'Supplier profiles with contact details and a portable SUP-#### code, CSV import/export, and the type-specific fields for guides, hotels and transport.', covers: ['/suppliers'] },
      { href: '/docs/tours-rates', icon: Globe, title: 'Rates Hub', description: 'Rate management across every category — hotels, cruises, transport, guides and more — with per-rate CSV import and your own vocabulary on the labels.', covers: ['/rates', '/rates#accommodation', '/rates/hotels', '/rates/cruises', '/rates/sleeping-train', '/rates/hotel-services', '/rates#transport', '/rates/transportation', '/rates/flights', '/rates/trains', '/rates/airport-services', '/rates#services', '/rates/guides', '/rates/meals', '/rates/attractions', '/rates/activities', '/rates#costs', '/rates/tipping', '/rates/fixed-costs', '/rates/commissions'] },
      { href: '/docs/rate-periods', icon: CalendarRange, title: 'Rate Periods', description: 'Give a hotel or cruise as many dated price periods as its contract has, by hand or from a spreadsheet.' },
      { href: '/docs/bulk-csv', icon: Upload, title: 'Bulk Import (CSV)', description: 'The shared CSV pattern — download a sample, fill a row per record, import. How it upserts by code, what it never overwrites, and why an unknown supplier code is skipped.' },
    ],
  },
  {
    label: 'People',
    menuSection: 'crm',
    items: [
      { href: '/docs/clients', icon: Users, title: 'Clients', description: 'Add, search, and manage client profiles, notes, and follow-ups.', covers: ['/clients'] },
      { href: '/docs/partners', icon: Users, title: 'Partners', description: 'B2B partner accounts — company details, partner codes, default margins, and linking partners to quotes.', covers: ['/b2b/partners'] },
      { href: '/docs/team-members', icon: UserRound, title: 'Team Members', description: 'Your operational staff directory — roles, departments, task assignment, and how it relates to User Management.', covers: ['/team-members'] },
      { href: '/docs/departments', icon: GitBranch, title: 'Departments', description: 'Define departments, assign members, and route each service type so generated tasks reach the right team.', covers: ['/departments'] },
    ],
  },
  {
    label: 'Finance',
    menuSection: 'finance',
    items: [
      { href: '/docs/payments', icon: Wallet, title: 'Payments', description: 'Record a payment against an invoice or an itinerary — types, methods, references, and how balances update.', covers: ['/payments'] },
      { href: '/docs/invoices-payments', icon: FileText, title: 'Invoices', description: 'Create standard, deposit, and final invoices, and see recorded payments against them.', covers: ['/invoices'] },
      { href: '/docs/receipts', icon: Receipt, title: 'Receipts', description: 'Generate branded receipt PDFs for payments and send them via WhatsApp or email.', covers: ['/receipts'] },
      { href: '/docs/accounts-receivable', icon: Wallet, title: 'Receivables', description: 'Client-level aging analysis (current, 30, 60, 90+ days), outstanding balances, and payment reminder triggers.', covers: ['/accounts-receivable'] },
      { href: '/docs/accounts-payable', icon: CreditCard, title: 'Payables', description: 'Supplier-level aging reports, expense grouping by supplier, and payment approval workflows.', covers: ['/accounts-payable'] },
      { href: '/docs/supplier-invoices', icon: FileCheck, title: 'Bills', description: 'Supplier bills with three-way matching: bill → expense → payment. Upload, match, approve, pay, or dispute.', covers: ['/supplier-invoices'] },
      { href: '/docs/expenses-commissions', icon: Wallet, title: 'Expenses & Commissions', description: 'Track expenses by category with supplier linking and receipt uploads, plus receivable/payable commissions auto-generated from itineraries.', covers: ['/expenses', '/commissions'] },
      { href: '/docs/profit-loss', icon: TrendingUp, title: 'Profit & Loss', description: 'Per-trip and aggregate P&L reports with supplier cost vs. client revenue analysis.', covers: ['/profit-loss'] },
      { href: '/docs/invoice-reminders', icon: BellRing, title: 'Invoice Reminders', description: 'Automated reminder scheduling with escalating urgency at 7, 3, and 0 days before due, plus overdue follow-ups.' },
    ],
  },
  {
    label: 'Settings',
    menuSection: 'settings',
    items: [
      { href: '/docs/team-settings', icon: Settings, title: 'Settings', description: 'Company profile and letterhead, invitations, email signatures, and the preferences that reach across the app — Vocabulary, Destinations, Seasonal Premiums and Extras.', covers: ['/settings'] },
      { href: '/docs/vocabulary', icon: BookOpen, title: 'Vocabulary', description: 'Relabel the product in your own words — 35 kinds of built-in term, English and Japanese — without renaming anything under the hood.', covers: ['/settings/vocabulary'] },
      { href: '/docs/destinations', icon: Globe, title: 'Destinations', description: 'Manage the destinations your itineraries are built for; Egypt ships complete, others are configurable.', covers: ['/settings/destinations'] },
      { href: '/docs/seasonal-premiums', icon: CalendarRange, title: 'Seasonal Premiums', description: 'Your high-demand dates as a premium on the whole price after margin — set the dated windows once and every quote in them lifts automatically.', covers: ['/rates/seasons'] },
      { href: '/docs/activity-log', icon: FileText, title: 'Activity Log', description: 'The audit trail: every change with who, when, what, endpoint and IP — filterable, and never editable.', covers: ['/activity'] },
      { href: '/docs/integrations', icon: Link2, title: 'Integrations', description: 'Connect Xero or QuickBooks for push-only accounting sync. WhatsApp Business and Gmail OAuth setup.' },
      { href: '/docs/user-management', icon: Users, title: 'User Management', description: 'Login accounts and access: the Administrator / Manager / Agent / Viewer roles, invitations, activation, and deletion.', covers: ['/users'] },
    ],
  },
]

/** Every page in reading order: down each group, groups in menu order. */
export const DOC_PAGES: (DocItem & { group: string })[] = CATEGORIES.flatMap(c =>
  c.items.map(item => ({ ...item, group: c.label }))
)

/** The pages either side of `href` in reading order, for the pager at the
 *  foot of each page. Pages used to hand-code these links; they followed an
 *  old menu order, with stale titles and a loop (tasks ⇄ notifications). */
export function adjacentDocs(href: string): { prev: DocItem | null; next: DocItem | null } | null {
  const i = DOC_PAGES.findIndex(p => p.href === href)
  if (i === -1) return null
  return { prev: DOC_PAGES[i - 1] ?? null, next: DOC_PAGES[i + 1] ?? null }
}
