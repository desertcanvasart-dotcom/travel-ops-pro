// ============================================
// All navigation, in one place
// ============================================
// The sidebar (components/Sidebar.tsx), the Settings area's menu
// (app/settings/layout.tsx), the ⌘K palette (components/nav/CommandPalette.tsx)
// and the dashboard's link check (lib/dashboard/menu-access.ts) all read this
// file. No other component writes out a list of links.
//
//   MAIN_NAV         the sidebar: the daily work, in pipeline order
//   RATE_GROUPS      the rate sheets, foldable under Suppliers & Rates
//   SETTINGS_NAV     the Settings area: setup, configured once
//   JUMP_ONLY_PAGES  pages only ⌘K lists (reached as a button elsewhere)
//   TABBED_PAGES     pages whose sibling screens are tabs (?tab=, ?view=…),
//                    each tab with the roles of the page it used to be
//
// ROLES ARE THE SERVER'S. Every entry carries exactly the roles middleware.ts
// ROUTE_PERMISSIONS lets onto its page — __tests__/api/menu-page-gates.test.ts
// holds the two together. Moving an item never widens or narrows who sees a
// page: a section's roles are the union of its items', and an item without
// roles takes its section's (neither means everyone).
//
// Labels are keys in the `navigation` messages; Settings descriptions are in
// `settingsArea.desc`. __tests__/app/docs-toc.test.ts requires the docs table
// of contents to follow these groups.

import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '@/hooks/useRole'
import {
  Percent, LayoutDashboard, Users, DollarSign, MessageSquare, FileText, Calendar,
  CheckSquare, Truck, TrendingUp, Hotel, UtensilsCrossed, Plane, Coins, ClipboardCheck,
  Ticket, Library, Receipt, Wallet, BarChart3, CreditCard, LayoutTemplate, ConciergeBell,
  Train, BedDouble, Ship, Building, Shield, BookOpen, Handshake, Route, Package, Briefcase,
  Tags, Globe, Mail, Droplets, Calculator, Sparkles, CalendarDays, CalendarRange, Building2,
  ScrollText, ReceiptText, HandCoins, ClipboardPaste, ClipboardList, User, Bell, Link as LinkIcon,
  Plug, SlidersHorizontal, PenLine, Bot, Hammer, Boxes, BellRing, Smartphone, Upload, Contact,
  PlusCircle, Store, Signature, Phone,
} from 'lucide-react'

const STAFF: UserRole[] = ['admin', 'manager', 'agent']
const AM: UserRole[] = ['admin', 'manager']
const EVERYONE: UserRole[] = ['admin', 'manager', 'agent', 'viewer']

export interface NavItem {
  labelKey: string
  href: string
  icon: LucideIcon
  roles?: UserRole[]
  /** A count shown beside the label (wired by the page that owns it). */
  badge?: string
  /** Other paths that highlight this item (an old page that redirects here). */
  match?: string[]
  /** Old names and synonyms ⌘K also matches. */
  keywords?: string[]
  children?: NavItem[]
}

export interface NavSection {
  key: string
  titleKey: string
  /** Top section: no title, never folded. */
  untitled?: boolean
  roles?: UserRole[]
  items: NavItem[]
}

export interface RateGroup {
  key: string
  labelKey: string
  /** The Rates hub tab for this group (app/rates/page.tsx). */
  href: string
  icon: LucideIcon
  items: NavItem[]
}

export interface SettingsItem extends NavItem {
  /** settingsArea.desc.<key> — the one-line description under the title. */
  descKey: string
  /** Managers open the page read-only; only an admin changes it. */
  adminEdits?: boolean
}

export interface SettingsGroup {
  key: string
  titleKey: string
  items: SettingsItem[]
}

export interface PageTab {
  /** The query value that opens it (?<param>=<value>). */
  value: string
  labelKey: string
  icon: LucideIcon
  /** The roles of the page this tab used to be. */
  roles?: UserRole[]
}

export interface TabbedPage {
  path: string
  /** The query parameter holding the tab: tab, view, channel or type. */
  param: string
  /** The first tab the viewer may see is the default. */
  tabs: PageTab[]
}

export interface JumpPage extends NavItem {
  /** Where the page lives (a navigation key), shown as the hint in ⌘K. */
  hintKey: string
}

// ============================================
// Rate sheets
// ============================================
export const RATE_GROUPS: RateGroup[] = [
  {
    key: 'accommodation', labelKey: 'accommodation', href: '/rates#accommodation', icon: Hotel,
    items: [
      { labelKey: 'hotels', href: '/rates/hotels', icon: Hotel },
      { labelKey: 'nileCruises', href: '/rates/cruises', icon: Ship },
      { labelKey: 'sleepingTrains', href: '/rates/sleeping-train', icon: BedDouble },
      { labelKey: 'hotelServices', href: '/rates/hotel-services', icon: ConciergeBell },
    ],
  },
  {
    key: 'transport', labelKey: 'transportTickets', href: '/rates#transport', icon: Truck,
    items: [
      { labelKey: 'transportation', href: '/rates/transportation', icon: Truck },
      { labelKey: 'flights', href: '/rates/flights', icon: Plane },
      { labelKey: 'trains', href: '/rates/trains', icon: Train },
      { labelKey: 'airportServices', href: '/rates/airport-services', icon: Plane },
    ],
  },
  {
    key: 'services', labelKey: 'guidesServices', href: '/rates#services', icon: Users,
    items: [
      { labelKey: 'tourGuides', href: '/rates/guides', icon: Users },
      { labelKey: 'meals', href: '/rates/meals', icon: UtensilsCrossed },
      { labelKey: 'attractions', href: '/rates/attractions', icon: Building },
      { labelKey: 'activities', href: '/rates/activities', icon: Ticket },
    ],
  },
  {
    key: 'costs', labelKey: 'ratesCosts', href: '/rates#costs', icon: DollarSign,
    items: [
      { labelKey: 'tipping', href: '/rates/tipping', icon: DollarSign },
      { labelKey: 'fixedCosts', href: '/rates/fixed-costs', icon: Droplets },
      { labelKey: 'commissionRates', href: '/rates/commissions', icon: Percent },
    ],
  },
]

// ============================================
// Pages made of tabs
// ============================================
// Sibling pages merged into one, each keeping its own address as a tab
// (components/nav/UrlTabs.tsx). The page's middleware gate is the UNION of its
// tabs' roles; a tab the viewer may not see is not offered, and asking for it
// by URL opens the first one they may see. The data behind each tab keeps its
// own API gate. __tests__/api/menu-page-gates.test.ts holds the union to the
// middleware.
export const TABBED_PAGES: TabbedPage[] = [
  // The conversations (/communications), Gmail (/inbox) and WhatsApp
  // (/whatsapp-inbox) inboxes — every staff role's, as each was.
  {
    path: '/inbox', param: 'channel',
    tabs: [
      { value: 'all', labelKey: 'unifiedInbox', icon: MessageSquare, roles: STAFF },
      { value: 'email', labelKey: 'email', icon: Mail, roles: STAFF },
      { value: 'whatsapp', labelKey: 'whatsapp', icon: Phone, roles: STAFF },
    ],
  },
  {
    path: '/reports', param: 'tab',
    tabs: [
      { value: 'analytics', labelKey: 'analytics', icon: TrendingUp, roles: AM },
      { value: 'finance', labelKey: 'financialReports', icon: BarChart3, roles: AM },
      { value: 'copilot', labelKey: 'copilotAnalytics', icon: Sparkles, roles: STAFF },
    ],
  },
]

export function tabbedPage(path: string): TabbedPage {
  const page = TABBED_PAGES.find(p => p.path === path)
  if (!page) throw new Error(`No tabs configured for ${path}`)
  return page
}

// ============================================
// The sidebar
// ============================================
export const MAIN_NAV: NavSection[] = [
  {
    key: 'home', titleKey: 'home', untitled: true,
    items: [
      { labelKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
      // Analytics · Finance · Copilot as tabs; each tab keeps its old roles.
      { labelKey: 'reports', href: '/reports', icon: TrendingUp, roles: STAFF, match: ['/analytics', '/financial-reports', '/copilot-analytics'], keywords: ['analytics'] },
    ],
  },
  // Where the day starts (operator, 2026-10-10). Message templates is here AND
  // in Settings › Messaging, on purpose: it is used daily and set up once.
  {
    key: 'communication', titleKey: 'communicate', roles: STAFF,
    items: [
      // One /inbox page, three tabs — and a link to each, every day's work.
      { labelKey: 'unifiedInbox', href: '/inbox?channel=all', icon: MessageSquare, match: ['/communications'], keywords: ['inbox', 'conversations'] },
      { labelKey: 'email', href: '/inbox?channel=email', icon: Mail, badge: 'email', keywords: ['gmail', 'email inbox'] },
      { labelKey: 'whatsapp', href: '/inbox?channel=whatsapp', icon: Phone, badge: 'whatsapp', match: ['/whatsapp-inbox'], keywords: ['whatsapp inbox'] },
      { labelKey: 'aiCopilot', href: '/copilot', icon: Sparkles, keywords: ['drafts'] },
      { labelKey: 'messageTemplates', href: '/settings/message-templates', icon: FileText, match: ['/templates'] },
    ],
  },
  // The sale's lifecycle: price it, quote it, it becomes an itinerary, gets
  // booked, shows on the calendar.
  {
    key: 'sell', titleKey: 'sell', roles: STAFF,
    items: [
      { labelKey: 'pricingGrid', href: '/pricing-grid', icon: Calculator, roles: STAFF, keywords: ['pricing grid'] },
      { labelKey: 'b2cQuotes', href: '/b2c/quotes', icon: FileText, roles: AM },
      { labelKey: 'b2bQuotes', href: '/b2b/quotes', icon: FileText, roles: STAFF },
      { labelKey: 'orderIntake', href: '/intake/order', icon: ClipboardPaste, roles: STAFF },
      { labelKey: 'itineraries', href: '/itineraries', icon: Route, roles: STAFF },
      { labelKey: 'bookings', href: '/bookings', icon: Briefcase, roles: STAFF },
      { labelKey: 'calendar', href: '/calendar', icon: Calendar, roles: STAFF },
    ],
  },
  {
    key: 'operate', titleKey: 'operate', roles: STAFF,
    items: [
      { labelKey: 'tasks', href: '/tasks', icon: CheckSquare, roles: STAFF },
      { labelKey: 'followups', href: '/followups', icon: CheckSquare, roles: STAFF },
      { labelKey: 'departures', href: '/departures', icon: Calendar, roles: AM },
      { labelKey: 'capacity', href: '/capacity', icon: CalendarDays, roles: AM },
      { labelKey: 'documents', href: '/documents', icon: FileText, roles: AM, keywords: ['vouchers'] },
      { labelKey: 'guestSurveys', href: '/surveys', icon: ClipboardList, roles: AM },
    ],
  },
  // What you sell, ready-made. Agents browse the inventory ("Quote this tour");
  // building templates and pricing packages stays with managers.
  {
    key: 'tours', titleKey: 'products', roles: STAFF,
    items: [
      { labelKey: 'tourTemplates', href: '/tours/manage', icon: LayoutTemplate, roles: AM, keywords: ['tours'] },
      { labelKey: 'readyMadePackages', href: '/tours', icon: Package, roles: STAFF, keywords: ['inventory', 'packages'] },
      { labelKey: 'pricingRules', href: '/b2b/pricing-rules', icon: Tags, roles: AM },
      { labelKey: 'extras', href: '/rates/extras', icon: Sparkles, roles: AM, keywords: ['add-ons', 'upgrades', 'options'] },
    ],
  },
  // What you buy and what it costs; the rate sheets fold underneath.
  {
    key: 'rates', titleKey: 'suppliersRates', roles: AM,
    items: [
      { labelKey: 'suppliers', href: '/suppliers', icon: Building, match: ['/airport-staff'], keywords: ['airport staff'] },
      { labelKey: 'ratesHub', href: '/rates', icon: Coins, keywords: ['rates overview'] },
      { labelKey: 'ratesCheck', href: '/rates/check', icon: ClipboardCheck },
      ...RATE_GROUPS.map(g => ({ labelKey: g.labelKey, href: g.href, icon: g.icon, children: g.items })),
    ],
  },
  {
    key: 'crm', titleKey: 'contacts', roles: STAFF,
    items: [
      { labelKey: 'clients', href: '/clients', icon: Users, roles: STAFF, keywords: ['crm'] },
      { labelKey: 'partners', href: '/b2b/partners', icon: Handshake, roles: AM },
      { labelKey: 'team', href: '/settings/staff-directory', icon: Contact, roles: AM, match: ['/team-members'], keywords: ['team members'] },
    ],
  },
  {
    key: 'finance', titleKey: 'finance', roles: STAFF,
    items: [
      { labelKey: 'invoices', href: '/invoices', icon: FileText, roles: STAFF },
      { labelKey: 'receivables', href: '/accounts-receivable', icon: Wallet, roles: AM },
      { labelKey: 'payments', href: '/payments', icon: DollarSign, roles: STAFF },
      { labelKey: 'receipts', href: '/receipts', icon: Receipt, roles: AM },
      { labelKey: 'supplierInvoices', href: '/supplier-invoices', icon: ReceiptText, roles: AM, keywords: ['supplier bills'] },
      { labelKey: 'payables', href: '/accounts-payable', icon: CreditCard, roles: AM },
      { labelKey: 'expenses', href: '/expenses', icon: HandCoins, roles: AM },
      { labelKey: 'commissions', href: '/commissions', icon: Handshake, roles: AM },
      { labelKey: 'profitLoss', href: '/profit-loss', icon: TrendingUp, roles: AM, keywords: ['p&l'] },
    ],
  },
]

/** The pinned link at the foot of the sidebar. Its roles are the Profile
 *  page's: everyone who can open any Settings page can open that one. */
export const SETTINGS_HOME: NavItem = { labelKey: 'settings', href: '/settings/profile', icon: SlidersHorizontal, roles: STAFF }

// ============================================
// The Settings area
// ============================================
// Roles: '/settings' is admin + manager in the middleware; the pages an agent
// opens (their own profile, email, defaults, and the shared templates and
// Copilot pages) have their own entries before it.
export const SETTINGS_NAV: SettingsGroup[] = [
  {
    key: 'account', titleKey: 'account',
    items: [
      { labelKey: 'profile', descKey: 'profile', href: '/settings/profile', icon: User, roles: STAFF, keywords: ['password', 'two-factor', 'language'] },
      { labelKey: 'emailSignature', descKey: 'email', href: '/settings/email', icon: Signature, roles: STAFF, keywords: ['gmail', 'signatures', 'email templates'] },
      { labelKey: 'notifications', descKey: 'notifications', href: '/settings/notifications', icon: Bell, roles: AM },
    ],
  },
  {
    key: 'organization', titleKey: 'organization',
    items: [
      { labelKey: 'company', descKey: 'company', href: '/settings/company', icon: Building2, roles: AM, adminEdits: true, keywords: ['payment terms', 'licence', 'brand'] },
      { labelKey: 'departments', descKey: 'departments', href: '/settings/departments', icon: Building2, roles: AM, match: ['/departments'] },
      { labelKey: 'teamRoles', descKey: 'users', href: '/settings/users', icon: Shield, roles: AM, adminEdits: true, match: ['/users'], keywords: ['user management', 'invite', 'logins'] },
      { labelKey: 'staffDirectory', descKey: 'staffDirectory', href: '/settings/staff-directory', icon: Contact, roles: AM, match: ['/team-members'], keywords: ['team members', 'guides', 'drivers'] },
      { labelKey: 'accounting', descKey: 'accounting', href: '/settings/accounting', icon: LinkIcon, roles: AM, adminEdits: true, keywords: ['xero', 'quickbooks', 'integrations'] },
      { labelKey: 'partnerIntegrations', descKey: 'partnerIntegrations', href: '/settings/integrations', icon: Plug, roles: AM, adminEdits: true, keywords: ['api key', 'integrations'] },
      { labelKey: 'activityLog', descKey: 'activityLog', href: '/settings/activity-log', icon: ScrollText, roles: AM, match: ['/activity'], keywords: ['audit'] },
    ],
  },
  {
    key: 'pricing', titleKey: 'pricing',
    items: [
      { labelKey: 'pricingDefaults', descKey: 'pricingDefaults', href: '/settings/preferences', icon: SlidersHorizontal, roles: STAFF, keywords: ['preferences', 'margin', 'tier', 'currency'] },
      { labelKey: 'seasonalPremiums', descKey: 'seasonalPremiums', href: '/settings/seasonal-premiums', icon: CalendarRange, roles: AM, match: ['/rates/seasons'], keywords: ['seasons', 'peak dates'] },
    ],
  },
  {
    key: 'catalog', titleKey: 'catalog',
    items: [
      { labelKey: 'destinations', descKey: 'destinations', href: '/settings/destinations', icon: Globe, roles: AM, adminEdits: true, keywords: ['countries', 'cities'] },
      { labelKey: 'vocabulary', descKey: 'vocabulary', href: '/settings/vocabulary', icon: BookOpen, roles: AM, adminEdits: true, keywords: ['words', 'dropdowns', 'tiers'] },
    ],
  },
  {
    key: 'messaging', titleKey: 'messaging',
    items: [
      { labelKey: 'messageTemplates', descKey: 'messageTemplates', href: '/settings/message-templates', icon: FileText, roles: STAFF, match: ['/templates'] },
      { labelKey: 'whatsapp', descKey: 'whatsapp', href: '/settings/whatsapp', icon: Smartphone, roles: AM },
    ],
  },
  {
    key: 'contentAi', titleKey: 'contentAi',
    items: [
      { labelKey: 'contentLibrary', descKey: 'contentLibrary', href: '/settings/content-library', icon: Library, roles: AM, match: ['/content-library'] },
      { labelKey: 'writingRules', descKey: 'writingRules', href: '/settings/content-library/rules', icon: PenLine, roles: AM },
      { labelKey: 'copilotKnowledge', descKey: 'copilotKnowledge', href: '/settings/copilot-knowledge', icon: BookOpen, roles: STAFF, match: ['/copilot-knowledge'] },
      { labelKey: 'copilotSettings', descKey: 'copilotSettings', href: '/settings/copilot', icon: Bot, roles: STAFF, match: ['/copilot/settings'] },
    ],
  },
]

// ============================================
// Pages only ⌘K lists
// ============================================
// Pages reached from a button or a link on another page, and tabs of a page
// under their old names. Listing them here keeps them findable. Roles follow
// the middleware like everything else — no entry there means every signed-in
// member, viewer included.
export const JUMP_ONLY_PAGES: JumpPage[] = [
  // Tabs of a page, findable by their old names.
  { labelKey: 'analytics', href: '/reports?tab=analytics', icon: TrendingUp, roles: AM, hintKey: 'reports' },
  { labelKey: 'financialReports', href: '/reports?tab=finance', icon: BarChart3, roles: AM, hintKey: 'reports' },
  { labelKey: 'copilotAnalytics', href: '/reports?tab=copilot', icon: BarChart3, roles: STAFF, hintKey: 'reports' },
  { labelKey: 'newItinerary', href: '/itineraries/new', icon: PlusCircle, roles: STAFF, hintKey: 'itineraries' },
  { labelKey: 'conciergeLeads', href: '/concierge-briefs', icon: ConciergeBell, roles: STAFF, hintKey: 'communicate', keywords: ['leads', 'briefs'] },
  { labelKey: 'whatsappParser', href: '/whatsapp-parser', icon: MessageSquare, roles: STAFF, hintKey: 'communicate' },
  { labelKey: 'contacts', href: '/contacts', icon: Contact, roles: STAFF, hintKey: 'contacts' },
  { labelKey: 'paymentReminders', href: '/reminders', icon: BellRing, roles: STAFF, hintKey: 'invoices' },
  { labelKey: 'importItinerary', href: '/b2b/import', icon: Upload, roles: EVERYONE, hintKey: 'b2bQuotes' },
  { labelKey: 'restaurants', href: '/restaurants', icon: Store, roles: AM, hintKey: 'suppliersRates' },
  { labelKey: 'resources', href: '/resources', icon: Boxes, roles: EVERYONE, hintKey: 'suppliersRates' },
  { labelKey: 'tourBuilder', href: '/tour-builder', icon: Hammer, roles: EVERYONE, hintKey: 'products' },
  { labelKey: 'opsBoard', href: '/ops', icon: Route, roles: EVERYONE, hintKey: 'operate' },
  { labelKey: 'notifications', href: '/notifications', icon: Bell, roles: EVERYONE, hintKey: 'home' },
  { labelKey: 'organizationMembers', href: '/settings/organization', icon: Building2, roles: AM, hintKey: 'company', keywords: ['members', 'invitations'] },
]

// ============================================
// Flattened views
// ============================================

export interface NavEntry {
  source: 'main' | 'rates' | 'settings' | 'jump'
  item: NavItem
  /** The roles that see it: its own, else its section's; null = everyone. */
  roles: UserRole[] | null
  /** The navigation key of the group it sits in. */
  groupKey: string
}

/** Every link in every menu, rate groups' hub anchors left out (they fold,
 *  they do not navigate). */
export function navEntries(): NavEntry[] {
  const out: NavEntry[] = []
  for (const section of MAIN_NAV) {
    for (const item of section.items) {
      const roles = item.roles ?? section.roles ?? null
      if (item.children) {
        for (const child of item.children) out.push({ source: 'rates', item: child, roles: child.roles ?? roles, groupKey: item.labelKey })
      } else {
        out.push({ source: 'main', item, roles, groupKey: section.titleKey })
      }
    }
  }
  for (const group of SETTINGS_NAV) {
    for (const item of group.items) out.push({ source: 'settings', item, roles: item.roles ?? null, groupKey: group.titleKey })
  }
  for (const item of JUMP_ONLY_PAGES) out.push({ source: 'jump', item, roles: item.roles ?? null, groupKey: item.hintKey })
  return out
}

/** Every Settings page, with its group. */
export function settingsItems(): Array<SettingsItem & { groupKey: string; groupTitleKey: string }> {
  return SETTINGS_NAV.flatMap(g => g.items.map(i => ({ ...i, groupKey: g.key, groupTitleKey: g.titleKey })))
}
