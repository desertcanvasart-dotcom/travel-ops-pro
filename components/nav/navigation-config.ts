// ============================================
// The app's side menu — groups, items, routes and who sees each
// ============================================
// Its own module so the docs can be checked against it:
// __tests__/app/docs-toc.test.ts requires the docs table of contents
// (app/(public)/docs/toc.ts) to follow these groups in this order and to
// document every item. components/Sidebar.tsx renders it.

import type { UserRole } from '@/hooks/useRole'
import {
  Percent,
  LayoutDashboard,
  Users,
  DollarSign,
  Settings,
  MessageSquare,
  FileText,
  Calendar,
  CheckSquare,
  Truck,
  TrendingUp,
  Hotel,
  UtensilsCrossed,
  Plane,
  Coins,
  ClipboardCheck,
  Ticket,
  Library,
  Receipt,
  Wallet,
  BarChart3,
  CreditCard,
  LayoutTemplate,
  ConciergeBell,
  Train,
  BedDouble,
  Ship,
  Building,
  Shield,
  BookOpen,
  Handshake,
  Route,
  Package,
  Briefcase,
  Tags,
  Globe,
  Mail,
  Droplets,
  Calculator,
  Sparkles,
  CalendarDays,
  CalendarRange,
  Building2,
  ScrollText,
  ReceiptText,
  HandCoins,
  ClipboardPaste,
  ClipboardList as ClipboardListIcon,
} from 'lucide-react'

// Navigation structure with translation keys
export interface NavConfig {
  titleKey: string
  key: string
  roles?: UserRole[]
  items: {
    labelKey: string
    href: string
    icon: any
    roles?: UserRole[]
    children?: { labelKey: string; href: string; icon?: any; roles?: UserRole[] }[]
  }[]
}

export const navigationConfig: NavConfig[] = [
  // Grouping mirrors autoura-saas: the operator's pipeline, front to back.
  // Section roles are the UNION of their items' roles and each item keeps its
  // own roles, so regrouping never widens or narrows who sees a page.
  {
    titleKey: 'home',
    key: 'home',
    items: [
      { labelKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
      { labelKey: 'analytics', href: '/analytics', icon: TrendingUp, roles: ['admin', 'manager'] },
      { labelKey: 'financialReports', href: '/financial-reports', icon: BarChart3, roles: ['admin', 'manager'] },
      // How the Copilot is doing is analytics, not a Copilot setting.
      { labelKey: 'copilotAnalytics', href: '/copilot-analytics', icon: BarChart3, roles: ['admin', 'manager', 'agent'] },
    ]
  },
  // The channels, and the library that feeds the words the Copilot and the
  // itinerary writer use. Second, right after Home: the inbox is where the
  // day starts (operator, 2026-10-10).
  {
    titleKey: 'communicate',
    key: 'communication',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { labelKey: 'unifiedInbox', href: '/communications', icon: MessageSquare },
      { labelKey: 'emailInbox', href: '/inbox', icon: Mail },
      { labelKey: 'messageTemplates', href: '/templates', icon: FileText },
      { labelKey: 'aiCopilot', href: '/copilot', icon: Sparkles },
      { labelKey: 'copilotKnowledge', href: '/copilot-knowledge', icon: BookOpen },
      { labelKey: 'contentLibrary', href: '/content-library', icon: Library, roles: ['admin', 'manager'] },
      { labelKey: 'writingRules', href: '/content-library/rules', icon: BookOpen, roles: ['admin', 'manager'] },
      // Concierge leads hidden while unused (2026-08-26); page + webhook live.
      // { labelKey: 'conciergeLeads', href: '/concierge-briefs', icon: ConciergeBell },
    ]
  },
  // The sale's lifecycle in one place: price it, save it as a quote, it lands
  // in an itinerary, gets booked, shows on the calendar. Extras & Seasonal
  // Premiums are selling-side (what you CHARGE), so they live here, not with the
  // buying rates.
  {
    titleKey: 'sell',
    key: 'sell',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { labelKey: 'pricingGrid', href: '/pricing-grid', icon: Calculator, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'b2cQuotes', href: '/b2c/quotes', icon: FileText, roles: ['admin', 'manager'] },
      { labelKey: 'b2bQuotes', href: '/b2b/quotes', icon: FileText, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'orderIntake', href: '/intake/order', icon: ClipboardPaste, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'itineraries', href: '/itineraries', icon: Route, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'bookings', href: '/bookings', icon: Briefcase, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'calendar', href: '/calendar', icon: Calendar, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'extras', href: '/rates/extras', icon: Sparkles, roles: ['admin', 'manager'] },
    ]
  },
  // Running what was sold: the to-dos, the departures and capacity per date,
  // the client touchpoints, the paperwork.
  {
    titleKey: 'operate',
    key: 'operate',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { labelKey: 'tasks', href: '/tasks', icon: CheckSquare, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'departures', href: '/departures', icon: Calendar, roles: ['admin', 'manager'] },
      { labelKey: 'capacity', href: '/capacity', icon: CalendarDays, roles: ['admin', 'manager'] },
      { labelKey: 'followups', href: '/followups', icon: CheckSquare, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'documents', href: '/documents', icon: FileText, roles: ['admin', 'manager'] },
      { labelKey: 'guestSurveys', href: '/surveys', icon: ClipboardListIcon, roles: ['admin', 'manager'] },
    ]
  },
  // The catalogue: tour templates, the ready-made packages, the transport
  // packages that price them. Agents browse the ready-made tours (the
  // dashboard links them there); building templates and pricing packages
  // stays with managers.
  {
    titleKey: 'tours',
    key: 'tours',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { labelKey: 'tourTemplates', href: '/tours/manage', icon: LayoutTemplate, roles: ['admin', 'manager'] },
      { labelKey: 'readyMadePackages', href: '/tours', icon: Package, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'pricingRules', href: '/b2b/pricing-rules', icon: Tags, roles: ['admin', 'manager'] },
    ]
  },
  // What you buy and what it costs: the supplier roster, then the buying rates
  // in four subgroups (collapsed until needed).
  {
    titleKey: 'suppliersRates',
    key: 'rates',
    roles: ['admin', 'manager'],
    items: [
      { labelKey: 'suppliers', href: '/suppliers', icon: Building },
      { labelKey: 'ratesHub', href: '/rates', icon: Coins },
      { labelKey: 'ratesCheck', href: '/rates/check', icon: ClipboardCheck },
      {
        labelKey: 'accommodation', href: '/rates#accommodation', icon: Hotel,
        children: [
          { labelKey: 'hotels', href: '/rates/hotels', icon: Hotel },
          { labelKey: 'nileCruises', href: '/rates/cruises', icon: Ship },
          { labelKey: 'sleepingTrains', href: '/rates/sleeping-train', icon: BedDouble },
          { labelKey: 'hotelServices', href: '/rates/hotel-services', icon: ConciergeBell },
        ],
      },
      {
        labelKey: 'transportTickets', href: '/rates#transport', icon: Truck,
        children: [
          { labelKey: 'transportation', href: '/rates/transportation', icon: Truck },
          { labelKey: 'flights', href: '/rates/flights', icon: Plane },
          { labelKey: 'trains', href: '/rates/trains', icon: Train },
          { labelKey: 'airportServices', href: '/rates/airport-services', icon: Plane },
        ],
      },
      {
        labelKey: 'guidesServices', href: '/rates#services', icon: Users,
        children: [
          { labelKey: 'tourGuides', href: '/rates/guides', icon: Users },
          { labelKey: 'meals', href: '/rates/meals', icon: UtensilsCrossed },
          { labelKey: 'attractions', href: '/rates/attractions', icon: Building },
          { labelKey: 'activities', href: '/rates/activities', icon: Ticket },
        ],
      },
      {
        labelKey: 'ratesCosts', href: '/rates#costs', icon: DollarSign,
        children: [
          { labelKey: 'tipping', href: '/rates/tipping', icon: DollarSign },
          { labelKey: 'fixedCosts', href: '/rates/fixed-costs', icon: Droplets },
          { labelKey: 'commissionRates', href: '/rates/commissions', icon: Percent },
        ],
      },
    ]
  },
  // The people and organisations the agency deals with.
  {
    titleKey: 'people',
    key: 'crm',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { labelKey: 'clients', href: '/clients', icon: Users, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'partners', href: '/b2b/partners', icon: Handshake, roles: ['admin', 'manager'] },
      { labelKey: 'teamMembers', href: '/team-members', icon: Users, roles: ['admin', 'manager'] },
      { labelKey: 'departments', href: '/departments', icon: Building2, roles: ['admin', 'manager'] },
    ]
  },
  {
    titleKey: 'finance',
    key: 'finance',
    // Section = union of its items. Invoices and Payments are agent-visible:
    // reservation staff issue invoices and record customer payments.
    roles: ['admin', 'manager', 'agent'],
    items: [
      { labelKey: 'payments', href: '/payments', icon: DollarSign, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'invoices', href: '/invoices', icon: FileText, roles: ['admin', 'manager', 'agent'] },
      { labelKey: 'receipts', href: '/receipts', icon: Receipt, roles: ['admin', 'manager'] },
      { labelKey: 'receivables', href: '/accounts-receivable', icon: Wallet, roles: ['admin', 'manager'] },
      { labelKey: 'payables', href: '/accounts-payable', icon: CreditCard, roles: ['admin', 'manager'] },
      { labelKey: 'supplierInvoices', href: '/supplier-invoices', icon: ReceiptText, roles: ['admin', 'manager'] },
      { labelKey: 'expenses', href: '/expenses', icon: HandCoins, roles: ['admin', 'manager'] },
      { labelKey: 'commissions', href: '/commissions', icon: Handshake, roles: ['admin', 'manager'] },
      { labelKey: 'profitLoss', href: '/profit-loss', icon: TrendingUp, roles: ['admin', 'manager'] },
    ]
  },
  // Configured once.
  {
    titleKey: 'settings',
    key: 'settings',
    // admin + manager: a manager sees every page, Settings included (the
    // middleware page gates agree — middleware.ts ROUTE_PERMISSIONS). What a
    // manager cannot do is administer the organisation: invite, change a
    // role, edit the vocabulary or the company identity. Those are gated on
    // the API and inside the pages, which render read-only for non-admins.
    roles: ['admin', 'manager'],
    items: [
      { labelKey: 'settings', href: '/settings', icon: Settings, roles: ['admin', 'manager'] },
      { labelKey: 'vocabulary', href: '/settings/vocabulary', icon: BookOpen, roles: ['admin', 'manager'] },
      { labelKey: 'destinations', href: '/settings/destinations', icon: Globe, roles: ['admin', 'manager'] },
      { labelKey: 'seasonalPremiums', href: '/rates/seasons', icon: CalendarRange, roles: ['admin', 'manager'] },
      { labelKey: 'activityLog', href: '/activity', icon: ScrollText, roles: ['admin', 'manager'] },
      { labelKey: 'userManagement', href: '/users', icon: Shield, roles: ['admin', 'manager'] },
    ]
  }
]

