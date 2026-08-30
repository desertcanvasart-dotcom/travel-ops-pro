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
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ClipboardList,
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
  Receipt,
  Rocket,
  Settings,
  Sparkles,
  Tag,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  Wand2,
} from 'lucide-react'

export interface DocItem {
  href: string
  icon: typeof Rocket
  title: string
  description: string
  /** Shorter sidebar label where the full title would crowd it. */
  navLabel?: string
}

export interface DocCategory {
  label: string
  items: DocItem[]
}

export const CATEGORIES: DocCategory[] = [
  // ============================================
  // GROUPS MIRROR THE APP SIDEBAR (components/Sidebar.tsx), in its order and
  // with its labels — the Documentation Gap Analysis (2026-08-29) found users
  // getting "different maps of the same product" because the docs invented
  // their own grouping. Docs-only pages that have no sidebar item (Getting
  // Started, the Traveller Portal set) sit in clearly-named extra groups;
  // everything else lives exactly where the operator sees it in the app.
  {
    label: 'Getting Started',
    items: [
      { href: '/docs/getting-started', icon: Rocket, title: 'Getting Started', description: 'Log in, set up your account, and understand your role.' },
      { href: '/docs/workflows', icon: Lightbulb, title: 'Workflows & Tips', description: 'Step-by-step workflows and productivity shortcuts.' },
    ],
  },
  {
    label: 'Main',
    items: [
      { href: '/docs/dashboard', icon: LayoutDashboard, title: 'Dashboard', description: 'Your home base with quick stats, actions, and recent activity.' },
      { href: '/docs/analytics', icon: BarChart, title: 'Analytics', description: 'Visual charts and metrics across bookings, revenue, and team performance.' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { href: '/docs/clients', icon: Users, title: 'Clients', description: 'Add, search, and manage client profiles, notes, and follow-ups.' },
      { href: '/docs/followups-reminders', icon: Bell, title: 'Follow-ups', description: 'Schedule follow-ups, set reminders, and never miss a client touchpoint.' },
      { href: '/docs/calendar', icon: Calendar, title: 'Calendar', description: 'Month, week, and timeline views of all tours. Drag-to-reschedule, resource conflict detection, and team-wide visibility.' },
    ],
  },
  {
    label: 'Communications',
    items: [
      { href: '/docs/communication', icon: MessageCircle, title: 'Unified Inbox', description: 'WhatsApp, email and portal messages in one inbox, with the AI parser.' },
      { href: '/docs/email-inbox', icon: MailPlus, title: 'Email Inbox', description: 'Connect Gmail, read and send email, and understand what lands here versus the Unified Inbox.' },
      { href: '/docs/message-templates', icon: FileInput, title: 'Message Templates', description: 'Create and send pre-designed messages via WhatsApp and email with placeholder auto-fill.' },
      { href: '/docs/whatsapp-agent', icon: Bot, title: 'WhatsApp AI Agent', description: 'Draft-gated AI agent that reads the thread, checks live availability, and suggests a reply for you to approve — it never auto-sends.' },
      { href: '/docs/copilot', icon: Sparkles, title: 'AI Copilot', description: 'Ask questions and draft replies grounded in your own knowledge base (RAG). Agent memory learns your style over time.' },
      { href: '/docs/copilot-knowledge', icon: BookOpen, title: 'Copilot Knowledge', description: 'Manage the knowledge sources that ground every Copilot answer.' },
      { href: '/docs/copilot-analytics', icon: LineChart, title: 'Copilot Analytics', description: 'Measure Copilot conversations by channel, status and time, and use the insights to improve replies.' },
      { href: '/docs/notifications', icon: BellRing, title: 'Notifications', description: 'In-app notifications for tasks, payments, bookings, and team activity.' },
      { href: '/docs/concierge', icon: ConciergeBell, title: 'Concierge Briefs', description: 'Optional module — receive partner concierge briefs, triage them with SLA timers, and promote them into itineraries. Hidden when switched off for your account.' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/docs/suppliers', icon: Truck, title: 'Suppliers', description: 'Manage supplier profiles, contact details, commission rates, and type-specific fields for guides, hotels, and transport.' },
      { href: '/docs/itinerary-creation', icon: Wand2, title: 'Itinerary Creation', description: 'AI-powered itinerary generation from WhatsApp conversations and emails.' },
      { href: '/docs/itineraries', icon: Map, title: 'Itineraries', description: 'Build day-by-day trip plans with drag-and-drop reordering, pricing, services, and PDF export.' },
      { href: '/docs/bookings', icon: CalendarCheck, title: 'Bookings', description: 'Track supplier confirmations, payments, and operational status.' },
      { href: '/docs/departures', icon: CalendarDays, title: 'Departures', description: 'Create and manage scheduled group departures: template or custom, pax limits, and the status lifecycle from Draft to Guaranteed.' },
      { href: '/docs/capacity-departures', icon: Gauge, title: 'Capacity', description: 'Define operator capacity; live availability prevents overbooking.' },
      { href: '/docs/resources-documents', icon: FolderOpen, title: 'Documents', description: 'Manage guides, vehicles, hotels, restaurants, and airport assistants. Generate invoices, contracts, vouchers, and receipts.' },
      { href: '/docs/team-members', icon: UserRound, title: 'Team Members', description: 'Your operational staff directory — roles, departments, task assignment, and how it relates to User Management.' },
      { href: '/docs/departments', icon: GitBranch, title: 'Departments', description: 'Define departments, assign members, and route each service type so generated tasks reach the right team.' },
      { href: '/docs/tasks', icon: CheckSquare, title: 'Tasks', description: 'Kanban board, table, and list views for managing operational tasks with priorities and assignments.' },
    ],
  },
  {
    label: 'Traveller Portal',
    items: [
      { href: '/docs/traveller-portal', icon: Globe, title: 'Traveller Portal', description: 'The page your customers see: a private link per traveller, the form that replaces the posted 申込書, and who is allowed to see what.' },
      { href: '/docs/passport-documents', icon: IdCard, title: 'Passport & Documents', description: 'Travellers attach their passport from their own link. Stored privately, opened by a short-lived link, deleted automatically after the trip.' },
      { href: '/docs/portal-messages', icon: MessagesSquare, title: 'Portal Messages', description: 'Travellers ask questions from their booking page; your team answers from the unified inbox, beside WhatsApp and email.' },
    ],
  },
  {
    label: 'Tours',
    items: [
      { href: '/docs/tour-programs', icon: ClipboardList, title: 'Tour Templates', description: 'Create and manage tour templates, variations, and the template-to-pricing flow.' },
    ],
  },
  {
    label: 'Sales & Pricing',
    items: [
      { href: '/docs/pricing-grid', icon: Calculator, title: 'Pricing Grid', description: 'Interactive pricing calculator for comparing rates across tiers, dates, and group sizes.' },
      { href: '/docs/b2b-pricing', icon: Briefcase, title: 'B2B Pricing', description: 'B2B price calculator with rate sheets, pax tables, and single supplement.' },
      { href: '/docs/b2b-quotes', icon: FileCheck, title: 'B2B Quotes', description: 'Save, manage, and export B2B quotes with PDF generation.' },
      { href: '/docs/quote-revisions', icon: GitBranch, title: 'Quote Revisions', description: 'Versioned B2B quotes — snapshot, compare side-by-side, revert, plus bulk status operations.' },
      { href: '/docs/b2c-pricing', icon: Calculator, title: 'B2C Pricing', description: 'Calculate itinerary pricing with automatic rate lookup and service costing.' },
      { href: '/docs/b2c-quotes', icon: Tag, title: 'B2C Quotes', description: 'Priced offer-wrapper over an itinerary for direct selling, with revision history and a send flow.' },
      { href: '/docs/partners', icon: Users, title: 'Partners', description: 'B2B partner accounts — company details, partner codes, default margins, and linking partners to quotes.' },
    ],
  },
  {
    label: 'Rates',
    items: [
      { href: '/docs/tours-rates', icon: Globe, title: 'Rates Hub', description: 'Comprehensive rate management across 16 categories, plus pre-built tour templates.' },
      { href: '/docs/rate-periods', icon: CalendarRange, title: 'Rate Periods', description: 'Give a hotel or cruise as many dated price periods as its contract has, by hand or from a spreadsheet.' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/docs/payments', icon: Wallet, title: 'Payments', description: 'Record a payment against an invoice or an itinerary — types, methods, references, and how balances update.' },
      { href: '/docs/invoices-payments', icon: FileText, title: 'Invoices', description: 'Create standard, deposit, and final invoices, and see recorded payments against them.' },
      { href: '/docs/receipts', icon: Receipt, title: 'Receipts', description: 'Generate branded receipt PDFs for payments and send them via WhatsApp or email.' },
      { href: '/docs/accounts-receivable', icon: Wallet, title: 'Receivables', description: 'Client-level aging analysis (current, 30, 60, 90+ days), outstanding balances, and payment reminder triggers.' },
      { href: '/docs/accounts-payable', icon: CreditCard, title: 'Payables', description: 'Supplier-level aging reports, expense grouping by supplier, and payment approval workflows.' },
      { href: '/docs/supplier-invoices', icon: FileCheck, title: 'Bills', description: 'Supplier bills with three-way matching: bill → expense → payment. Upload, match, approve, pay, or dispute.' },
      { href: '/docs/expenses-commissions', icon: Wallet, title: 'Expenses & Commissions', description: 'Track expenses by category with supplier linking and receipt uploads, plus receivable/payable commissions auto-generated from itineraries.' },
      { href: '/docs/profit-loss', icon: TrendingUp, title: 'Profit & Loss', description: 'Per-trip and aggregate P&L reports with supplier cost vs. client revenue analysis.' },
      { href: '/docs/financial-reports', icon: BarChart3, title: 'Financial Reports', description: 'Monthly and quarterly revenue, cash flow analysis, tax summaries, commission reports, and year-over-year comparisons.' },
      { href: '/docs/invoice-reminders', icon: BellRing, title: 'Invoice Reminders', description: 'Automated reminder scheduling with escalating urgency at 7, 3, and 0 days before due, plus overdue follow-ups.' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/docs/content-library', icon: BookOpen, title: 'Content Library', description: 'Reusable attraction and activity descriptions with per-tier variations, AI prompts, and writing rules.' },
      { href: '/docs/multi-language', icon: Languages, title: 'Languages', description: 'Copy and translate itineraries and B2B quotes between English and Japanese with one click.' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/docs/activity-log', icon: FileText, title: 'Activity Log', description: 'The audit trail: every change with who, when, what, endpoint and IP — filterable, and never editable.' },
      { href: '/docs/destinations', icon: Globe, title: 'Destinations', description: 'Manage the destinations your itineraries are built for; Egypt ships complete, others are configurable.' },
      { href: '/docs/team-settings', icon: Settings, title: 'Settings', description: 'Company profile and letterhead, invitations, email signatures, and preferences.' },
      { href: '/docs/user-management', icon: Users, title: 'User Management', description: 'Login accounts and access: the Administrator / Manager / Agent / Viewer roles, invitations, activation, and deletion.' },
      { href: '/docs/integrations', icon: Link2, title: 'Integrations', description: 'Connect Xero or QuickBooks for push-only accounting sync. WhatsApp Business and Gmail OAuth setup.' },
    ],
  },
]
