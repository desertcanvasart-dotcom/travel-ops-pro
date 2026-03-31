'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  MessageSquare,
  FileText,
  Users,
  DollarSign,
  Calendar,
  Truck,
  ClipboardList,
  BarChart3,
  Building2,
  ChevronRight,
  Check,
  X,
  Sparkles,
  Zap,
  Globe,
  Shield,
  ArrowRight,
  Play,
  Star,
  MapPin,
  Ship,
  Languages,
  FileSearch,
  Clock,
  Menu,
  XIcon,
  Bot,
  BookOpen,
  Package,
  PieChart,
  Lock,
  UserCheck,
  Timer,
  Mail,
  Inbox,
  Handshake,
  Map,
  GripVertical,
  Bell,
  Banknote,
  RefreshCcw,
  ClipboardCheck
} from 'lucide-react'

// Animation hook for scroll reveal
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}

// Animated section wrapper
function AnimatedSection({ 
  children, 
  className = '', 
  delay = 0 
}: { 
  children: React.ReactNode
  className?: string
  delay?: number 
}) {
  const { ref, isVisible } = useScrollReveal()

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  )
}

// Content data
const heroContent = {
  subheadline: "However your customers reach you, Autoura captures the enquiry and outputs a complete itinerary, calculated pricing, and a ready-to-send PDF — in minutes, not hours.",
  trustSignals: [
    "Built by a tour operator with 30+ years in Egypt tourism",
    "Processing real bookings since 2025"
  ]
}

const platforms = [
  {
    name: 'WhatsApp',
    color: '#25D366',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" className="w-[58%] h-[58%]">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.12 1.52 5.856L0 24l6.335-1.652A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.875 0-3.63-.506-5.14-1.387l-.368-.22-3.821.997 1.02-3.715-.24-.382A9.712 9.712 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/>
      </svg>
    ),
  },
  {
    name: 'LINE',
    color: '#00B900',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" className="w-[58%] h-[58%]">
        <path d="M12 1C5.926 1 1 5.148 1 10.333c0 4.618 4.1 8.49 9.641 9.222.375.08.886.248 1.015.569.117.291.076.746.037 1.041l-.164.984c-.05.3-.232 1.178 1.032.642 1.264-.535 6.819-4.017 9.304-6.876C23.375 14.27 23 12.39 23 10.333 23 5.148 18.074 1 12 1zm-3.26 12.289H6.572a.545.545 0 01-.545-.545V8.572a.545.545 0 011.09 0v3.627h1.623a.545.545 0 010 1.09zm2.087-.545a.545.545 0 01-1.09 0V8.572a.545.545 0 011.09 0v4.172zm4.602 0a.545.545 0 01-.42.531.544.544 0 01-.538-.217L12.73 10.8v1.944a.545.545 0 01-1.09 0V8.572a.545.545 0 01.42-.531.544.544 0 01.538.217l1.741 2.258V8.572a.545.545 0 011.09 0v4.172zm3.325-3.082a.545.545 0 010 1.09h-1.623v1.09h1.623a.545.545 0 010 1.09H16.586a.545.545 0 01-.545-.545V8.572a.545.545 0 01.545-.545h2.168a.545.545 0 010 1.09h-1.623v1.09h1.623z"/>
      </svg>
    ),
  },
  {
    name: 'WeChat',
    color: '#07C160',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" className="w-[58%] h-[58%]">
        <path d="M8.813 11.612a.92.92 0 11.002-1.842.92.92 0 01-.002 1.842zm4.374 0a.92.92 0 11.002-1.842.92.92 0 01-.002 1.842zM9.474 16.88a.77.77 0 11.002-1.54.77.77 0 01-.002 1.54zm3.553 0a.77.77 0 11.001-1.54.77.77 0 01-.001 1.54zM12 2C6.477 2 2 5.813 2 10.5c0 2.65 1.404 5.023 3.6 6.613l-.9 2.687 3.15-1.575c.7.175 1.4.275 2.15.275.35 0 .7-.025 1.05-.063a5.76 5.76 0 01-.15-1.312c0-3.487 3.15-6.325 7.025-6.325.35 0 .7.025 1.038.075C18.6 5.95 15.575 2 12 2zm6.925 9.8c-3.3 0-5.975 2.263-5.975 5.05s2.675 5.05 5.975 5.05c.625 0 1.225-.088 1.8-.238L22.8 22.8l-.675-2.025C23.35 19.587 24 17.988 24 16.85c0-2.787-2.275-5.05-5.075-5.05z"/>
      </svg>
    ),
  },
  {
    name: 'Messenger',
    color: '#0084FF',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" className="w-[58%] h-[58%]">
        <path d="M12 2C6.36 2 1 6.265 1 12.228c0 3.207 1.58 5.965 4.05 7.852V24l3.723-2.04c.993.276 2.046.424 3.227.424 5.64 0 11-4.265 11-10.228C23 6.265 17.64 2 12 2zm1.1 13.777L10.267 12.8 5.2 15.777l5.533-5.88 2.9 2.978 4.997-2.978-5.53 5.88z"/>
      </svg>
    ),
  },
  {
    name: 'Email',
    color: '#EA4335',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" className="w-[58%] h-[58%]">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
      </svg>
    ),
  },
]

// Single platform item renderer
function PlatformItem({ platform }: { platform: typeof platforms[number] }) {
  return (
    <span className="flex items-center gap-[10px] whitespace-nowrap">
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: '0.72em',
          height: '0.72em',
          borderRadius: '0.16em',
          background: platform.color,
        }}
      >
        {platform.icon}
      </span>
      <span className="font-extrabold text-[#111710]">{platform.name}</span>
    </span>
  )
}

// Cycling platform slot — crossfade approach (no track shifting)
function PlatformSlot() {
  const [current, setCurrent] = useState(0)
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'entering'>('visible')
  const [slotWidth, setSlotWidth] = useState<number | null>(null)
  const widthsRef = useRef<number[]>([])
  const containerRef = useRef<HTMLSpanElement>(null)
  const nextRef = useRef(0)

  // Measure each item's natural width using a hidden measurer
  useEffect(() => {
    const headline = document.querySelector('.hero-headline')
    if (!headline) return

    const cs = getComputedStyle(headline)
    const measurer = document.createElement('div')
    measurer.style.cssText = `position:absolute;top:-9999px;left:-9999px;visibility:hidden;display:flex;align-items:center;gap:10px;white-space:nowrap;font-size:${cs.fontSize};font-family:${cs.fontFamily};font-weight:800;letter-spacing:${cs.letterSpacing};`
    document.body.appendChild(measurer)

    const widths: number[] = []
    platforms.forEach(p => {
      measurer.innerHTML = ''
      // Create icon placeholder + text span
      const icon = document.createElement('span')
      icon.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:0.72em;height:0.72em;border-radius:0.16em;background:${p.color};flex-shrink:0;`
      const text = document.createElement('span')
      text.style.cssText = 'font-weight:800;'
      text.textContent = p.name
      measurer.appendChild(icon)
      measurer.appendChild(text)
      widths.push(measurer.getBoundingClientRect().width)
    })

    document.body.removeChild(measurer)
    widthsRef.current = widths
    if (widths.length > 0) setSlotWidth(widths[0])
  }, [])

  // Cycle: visible → exiting → (swap index) → entering → visible
  useEffect(() => {
    const interval = setInterval(() => {
      // Phase 1: start exit (fade out + slide up)
      setPhase('exiting')

      // Phase 2: after exit completes, swap to next and enter
      setTimeout(() => {
        const next = (nextRef.current + 1) % platforms.length
        nextRef.current = next
        setCurrent(next)
        if (widthsRef.current.length > 0) {
          setSlotWidth(widthsRef.current[next])
        }
        setPhase('entering')

        // Phase 3: settle into visible
        setTimeout(() => {
          setPhase('visible')
        }, 30) // one frame to apply entering styles, then transition to visible
      }, 350) // matches exit duration
    }, 2200) // total dwell time (visible portion)

    return () => clearInterval(interval)
  }, [])

  const itemStyle: React.CSSProperties =
    phase === 'visible'
      ? {
          opacity: 1,
          transform: 'translateY(0)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }
      : phase === 'exiting'
      ? {
          opacity: 0,
          transform: 'translateY(-40%)',
          transition: 'opacity 0.35s ease, transform 0.35s ease',
        }
      : {
          // 'entering' — start position (below, invisible), no transition yet
          opacity: 0,
          transform: 'translateY(40%)',
          transition: 'none',
        }

  return (
    <span
      ref={containerRef}
      className="inline-block align-bottom relative overflow-hidden"
      style={{
        height: '1.15em',
        width: slotWidth ? `${slotWidth}px` : 'auto',
        transition: 'width 0.45s cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}
    >
      <span
        className="absolute inset-0 flex items-center"
        style={itemStyle}
      >
        <PlatformItem platform={platforms[current]} />
      </span>
    </span>
  )
}

const painPoints = [
  "Client inquiries arrive on WhatsApp. You screenshot them into a folder, then forget which folder.",
  "Your pricing lives in an Excel file that three people edited last month. No one knows which version is correct.",
  "Creating a 7-day itinerary takes 3 hours because you're copying attraction descriptions from old documents.",
  "A Japanese client messages at 2 AM. By the time you translate and respond, they've booked with someone faster.",
  "Your accountant asks for Q3 revenue by tour type. You spend two days pulling invoices from email attachments.",
  "A guide calls in sick. You scroll through 200 WhatsApp messages trying to find which clients are affected.",
  "Supplier rates changed last month. Half your quotes are still using old prices."
]

const pillars = [
  {
    icon: Sparkles,
    title: "Conversation to Priced Itinerary",
    description: "Paste a WhatsApp message and the AI instantly extracts the essentials\u2014dates, destinations, attractions, and group size. It then builds a complete day-by-day itinerary with transport, guides, entrance fees, and margins automatically calculated. Ready in minutes instead of hours.",
    color: "from-emerald-500 to-teal-600"
  },
  {
    icon: Inbox,
    title: "All Communication, One Place",
    description: "WhatsApp messages, emails, quotes, invoices, supplier vouchers, and client history\u2014everything organized in one clear dashboard. No more jumping between apps, phones, or spreadsheets to track conversations, documents, and trip details across your entire workflow.",
    color: "from-amber-500 to-orange-600"
  },
  {
    icon: BarChart3,
    title: "Every Number, Always Accurate",
    description: "Supplier costs, client prices, margins, commissions, tipping, and currency conversion\u2014all calculated instantly in real time. Update a single rate and every quote adjusts automatically, so you always know the true profit before the tour even begins.",
    color: "from-violet-500 to-purple-600"
  }
]

const steps = [
  {
    title: "Client Messages You",
    description: "The conversation appears in your Autoura inbox. AI extracts their name, dates, group size, and interests automatically.",
    icon: MessageSquare
  },
  {
    title: "Generate Itinerary",
    description: "Select the tier, click generate. Autoura builds a day-by-day itinerary with correct fees and calculated margins.",
    icon: Sparkles
  },
  {
    title: "Send Professional Quote",
    description: "One click creates a branded PDF. Send directly via WhatsApp or email from the platform.",
    icon: FileText
  },
  {
    title: "Operations Begin",
    description: "Guides, vehicles, and hotels are assigned. Supplier vouchers generate automatically.",
    icon: Calendar
  },
  {
    title: "Track & Close",
    description: "Record payments, see profit margins update in real-time. Archive when complete.",
    icon: BarChart3
  }
]

// Updated modules array with 11 total modules (6 existing + 5 new)
const modules = [
  {
    id: "whatsapp-inbox",
    title: "WhatsApp Business Inbox",
    shortTitle: "WhatsApp",
    icon: MessageSquare,
    badge: "AI-Powered",
    badgeColor: "bg-emerald-100 text-emerald-700",
    category: "SALES",
    before: [
      "Scroll through 50+ chats to find that client",
      "Screenshot conversations to remember details",
      "Miss messages when you're guiding a tour",
      "No idea which team member last spoke to a client"
    ],
    after: [
      "All conversations in one searchable inbox",
      "Assign chats to team members with alerts",
      "AI extracts client details automatically",
      "Full history linked to client profile"
    ]
  },
  {
    id: "lead-processing",
    title: "Lead Processing",
    shortTitle: "Leads",
    icon: Bot,
    badge: "AI-Powered",
    badgeColor: "bg-emerald-100 text-emerald-700",
    category: "SALES",
    highlight: "30 sec vs 15 min",
    before: [
      "Reading through long WhatsApp threads",
      "Manually extracting dates, pax, budget",
      "Typing everything into spreadsheets",
      "Missing details buried in messages",
      "Inconsistent data across team members"
    ],
    after: [
      "Paste any WhatsApp conversation",
      "AI extracts name, dates, pax, budget, nationality",
      "Auto-created client profile instantly",
      "Confidence scores show accuracy",
      "Consistent structure every single time"
    ]
  },
  {
    id: "itinerary-builder",
    title: "Smart Itinerary Builder",
    shortTitle: "Itinerary",
    icon: FileText,
    badge: "AI-Powered",
    badgeColor: "bg-emerald-100 text-emerald-700",
    category: "SALES",
    before: [
      "Copy-paste from old Word documents",
      "Manually look up entrance fees",
      "Calculate pricing in Excel, hope it's right",
      "3-4 hours to create one itinerary"
    ],
    after: [
      "AI generates day-by-day itineraries",
      "Entrance fees auto-populate by nationality",
      "Costs and margins calculated instantly",
      "Edit and regenerate in minutes"
    ]
  },
  {
    id: "content-library",
    title: "Content Library",
    shortTitle: "Content",
    icon: BookOpen,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "SALES",
    highlight: "Your voice, always",
    before: [
      "Generic descriptions that sound like everyone else",
      "Inconsistent tone across itineraries",
      "Copy-pasting from old documents",
      "No tier differentiation — luxury sounds like budget",
      "Hours rewriting AI-generated content"
    ],
    after: [
      "Your own descriptions for sites, hotels, experiences",
      "4 tier variations — Budget to Luxury, each unique",
      "Writing rules enforce your brand voice",
      "AI uses YOUR content — not generic output",
      "Consistent quality across every itinerary"
    ]
  },
  {
    id: "crm",
    title: "Client Management",
    shortTitle: "CRM",
    icon: Users,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "SALES",
    before: [
      "Client info scattered everywhere",
      "No record of past trips or preferences",
      "Repeat clients treated like new inquiries",
      "Can't segment clients by any attribute"
    ],
    after: [
      "Complete client profiles with all details",
      "Full booking history and communication log",
      "VIP flagging and preferences saved",
      "Search and filter by any attribute"
    ]
  },
  {
    id: "pricing-engine",
    title: "Rate Database & Pricing",
    shortTitle: "Pricing",
    icon: DollarSign,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    before: [
      "Rates in multiple Excel files",
      "Seasonal changes require manual updates",
      "Entrance fees change — you find out late",
      "No single source of truth"
    ],
    after: [
      "Centralized rates for everything",
      "Seasonal pricing with auto date selection",
      "Entrance fees with EU and non-EU rates",
      "Update once, reflected everywhere"
    ]
  },
  {
    id: "resource-assignment",
    title: "Resource Assignment",
    shortTitle: "Resources",
    icon: Package,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    highlight: "1 click vs 10+ msgs",
    before: [
      "Calling guides and drivers one by one",
      "Individual messages to each supplier",
      "No confirmation if they saw it",
      "Hotel bookings in separate sheets",
      "Last-minute confusion about assignments"
    ],
    after: [
      "Assign all resources directly to itinerary",
      "One-click WhatsApp with full details",
      "Confirmation tracking — know who's confirmed",
      "All assignments visible in one place",
      "Staff included — airport, hotel, all covered"
    ]
  },
  {
    id: "supplier-management",
    title: "Supplier Management",
    shortTitle: "Suppliers",
    icon: Building2,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    before: [
      "Contacts saved in personal phones",
      "No record of which supplier served which booking",
      "Contracts lost in email",
      "Payables tracked manually"
    ],
    after: [
      "Supplier directory with contacts and rates",
      "Link suppliers to each itinerary",
      "Track payables per booking",
      "Upload contracts to supplier profile"
    ]
  },
  {
    id: "invoicing",
    title: "Invoicing & Payments",
    shortTitle: "Invoicing",
    icon: FileSearch,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "FINANCE",
    before: [
      "Create invoices manually in Word",
      "Track payments in spreadsheets",
      "No connection to the itinerary",
      "Chase payments from memory"
    ],
    after: [
      "Generate invoices from itineraries",
      "Record deposits and balances",
      "Automatic payment status tracking",
      "Send reminders via WhatsApp"
    ]
  },
  {
    id: "financial-management",
    title: "Financial Management",
    shortTitle: "Finance",
    icon: PieChart,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "FINANCE",
    highlight: "Know daily",
    before: [
      "Paper receipts in a shoebox",
      "Trip profitability unknown until months later",
      "Chasing clients for overdue payments",
      "Forgetting to pay suppliers on time",
      "Hours building monthly reports"
    ],
    after: [
      "Expenses linked to itineraries instantly",
      "P&L per trip before departure",
      "AR aging reports (30/60/90 days)",
      "Payment scheduling for suppliers",
      "One-click financial reports"
    ]
  },
  {
    id: "team-security",
    title: "Team Management & Security",
    shortTitle: "Team",
    icon: Shield,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "FINANCE",
    highlight: "Secure",
    before: [
      "Everyone using same credentials",
      "Can't control who sees what",
      "No record of who made changes",
      "Onboarding takes days",
      "No way to revoke access quickly"
    ],
    after: [
      "4 roles: Admin, Manager, Agent, Viewer",
      "Each person sees only what they need",
      "Full audit log of every action",
      "1-click invites for new team members",
      "Instant deactivation when staff leave"
    ]
  },
  {
    id: "email-integration",
    title: "Gmail Integration",
    shortTitle: "Email",
    icon: Mail,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "SALES",
    before: [
      "Switching between Gmail and your CRM constantly",
      "Client emails lost in overflowing inboxes",
      "No link between email threads and bookings",
      "Sending quotes from personal email"
    ],
    after: [
      "Gmail connected via OAuth — send and receive inside Autoura",
      "Email conversations linked to client profiles",
      "Send quotes, invoices, and contracts without leaving the platform",
      "Full email history alongside WhatsApp in one unified view"
    ]
  },
  {
    id: "unified-inbox",
    title: "Unified Conversations",
    shortTitle: "Inbox",
    icon: Inbox,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "SALES",
    highlight: "1 inbox for everything",
    before: [
      "WhatsApp on your phone, email on your laptop",
      "Client history split across platforms",
      "No single view of all communications",
      "Team members don't know what's been said where"
    ],
    after: [
      "WhatsApp + Email in one unified inbox",
      "Complete conversation history per client",
      "Every message linked to the right booking",
      "Team-wide visibility — no more 'did anyone reply?'"
    ]
  },
  {
    id: "b2b-system",
    title: "B2B Partner System",
    shortTitle: "B2B",
    icon: Handshake,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "SALES",
    highlight: "Partner pricing",
    before: [
      "Different pricing for each partner in separate spreadsheets",
      "Manually adjusting margins per B2B client",
      "No way to generate partner-specific quotes quickly",
      "Can't track which partners bring which bookings"
    ],
    after: [
      "Partner profiles with custom pricing rules",
      "B2B quotes with partner-specific margins",
      "Calculator tool for instant partner pricing",
      "Convert any itinerary to a B2B quote in one click"
    ]
  },
  {
    id: "tour-templates",
    title: "Tour Templates & Builder",
    shortTitle: "Tours",
    icon: Map,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    before: [
      "Rebuilding the same Cairo 3-day itinerary over and over",
      "No standardized product catalog",
      "Pricing recalculated from scratch each time",
      "Variations scattered across old documents"
    ],
    after: [
      "Pre-built tour templates with auto-pricing",
      "Visual tour builder for custom packages",
      "Instantly generate quotes from any template",
      "Manage and update tour catalog in one place"
    ]
  },
  {
    id: "calendar-tasks",
    title: "Calendar, Tasks & Reminders",
    shortTitle: "Calendar",
    icon: Calendar,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    before: [
      "Tour dates tracked in Google Calendar separately",
      "Follow-up reminders in your head",
      "Tasks assigned verbally — no record",
      "Missed deadlines because nothing is linked"
    ],
    after: [
      "Calendar view of all tours and bookings",
      "Auto-generated tasks from itineraries",
      "Reminders and follow-ups with notifications",
      "Everything linked — task, booking, client, supplier"
    ]
  },
  {
    id: "commissions",
    title: "Commissions Tracking",
    shortTitle: "Commissions",
    icon: Banknote,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "FINANCE",
    before: [
      "Agent commissions calculated manually at month end",
      "No visibility into who earned what",
      "Disputes over commission amounts",
      "Spreadsheets that nobody trusts"
    ],
    after: [
      "Auto-calculated commissions per booking",
      "Transparent breakdown for each team member",
      "Real-time commission dashboard",
      "Linked to actual payments received"
    ]
  }
]

const differentiators = [
  {
    icon: Shield,
    title: "Built by a Tour Operator",
    description: "The founder has run Egypt tours since 1993. Every feature solved a real problem."
  },
  {
    icon: MessageSquare,
    title: "WhatsApp-Native",
    description: "AI reads conversations and starts building itineraries before you finish your coffee."
  },
  {
    icon: DollarSign,
    title: "Pricing That Works",
    description: "EU vs non-EU rates. Seasonal pricing. Child discounts. The math you actually do."
  },
  {
    icon: Globe,
    title: "Multi-Language",
    description: "Parse messages and generate documents in multiple languages including Japanese, French, and Spanish."
  },
  {
    icon: Zap,
    title: "No Feature Bloat",
    description: "30 things you need, built to work together. Not 500 features you'll never use."
  },
  {
    icon: BarChart3,
    title: "Transparent Margins",
    description: "Real profit on every booking. Not estimated. Not averaged. The actual number."
  },
  {
    icon: RefreshCcw,
    title: "Live Currency Conversion",
    description: "Real-time exchange rates. Quote in EUR, USD, GBP, or JPY — prices update automatically."
  },
  {
    icon: ClipboardCheck,
    title: "Itemized Tipping System",
    description: "Tips calculated per role — guide, driver, boat crew, porter. No more guessing or forgetting."
  },
  {
    icon: GripVertical,
    title: "Drag & Drop Itinerary Editing",
    description: "Reorder days, move services, restructure trips visually. Changes recalculate pricing instantly."
  },
  {
    icon: Clock,
    title: "Rate Audit Trail",
    description: "Every rate change is logged. Know who changed what, when, and what the old value was."
  },
  {
    icon: Map,
    title: "Interactive Map View",
    description: "See your itinerary on a map. Every city, every stop, every route — visualized for clients."
  }
]

const egyptFeatures = [
  {
    icon: MapPin,
    title: "Egypt Entrance Fees Built In",
    description: "Pyramids, Luxor Temple, Valley of the Kings, Abu Simbel — with EU and non-EU rates."
  },
  {
    icon: Ship,
    title: "Nile Cruise Integration",
    description: "Pre-built Luxor-Aswan itineraries. Select ship, cabin type, get instant pricing."
  },
  {
    icon: Building2,
    title: "Local Supplier Database",
    description: "Connect your guides, drivers, hotels. Rate cards for Cairo, Luxor, Aswan, Alexandria."
  },
  {
    icon: Languages,
    title: "Multilingual Documents",
    description: "Generate client-facing documents in English, Japanese, French, and Spanish. Built for international tour operators."
  }
]

const testimonials = [
  {
    quote: "I used to spend 3-4 hours building one itinerary. Now I generate a draft in 5 minutes and spend my time actually selling.",
    author: "Islam Hussein",
    role: "Founder",
    company: "Travel2Egypt"
  },
  {
    quote: "The WhatsApp integration changed everything. Clients message at midnight, AI extracts what they want, and I wake up with a draft ready.",
    author: "Operations Manager",
    role: "DMC",
    company: "Cairo Tour Operator"
  },
  {
    quote: "Finally, I know my actual margin on each tour. Not what I thought it was. What it actually is.",
    author: "Finance Director",
    role: "Finance",
    company: "Regional Travel Agency"
  }
]

export default function AutouraHomepage() {
  const [activeModule, setActiveModule] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [videoModalOpen, setVideoModalOpen] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  // Close video modal on Escape key
  useEffect(() => {
    if (!videoModalOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVideoModalOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [videoModalOpen])

  return (
    <div className="min-h-screen bg-[#F5F3EF] overflow-x-hidden">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#F5F3EF]/82 backdrop-blur-[14px] border-b border-[#D6D2CA]/45">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-[10px]">
            <img src="/autoura-logo.png" alt="Autoura" className="w-12 h-12 object-contain" />
            <span className="text-[19px] font-bold text-[#111710] tracking-[-0.3px]">Autoura</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">How It Works</a>
            <Link href="/integrations" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">Integrations</Link>
            <Link href="/docs" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">Docs</Link>
            <Link href="/about" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">About</Link>
            <a
              href="https://calendly.com/autoura"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-[9px] bg-[#3B5E2E] text-white text-sm font-semibold rounded-[9px] hover:bg-[#2F4C24] transition-all hover:shadow-[0_4px_16px_rgba(59,94,46,0.22)]"
            >
              Book a Free Demo
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-stone-600 hover:text-stone-900"
          >
            {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden px-6 pt-4 pb-2 border-t border-[#D6D2CA] space-y-3">
            <a href="#features" className="block text-sm text-[#555] hover:text-[#111710] py-2">Features</a>
            <a href="#how-it-works" className="block text-sm text-[#555] hover:text-[#111710] py-2">How It Works</a>
            <Link href="/integrations" className="block text-sm text-[#555] hover:text-[#111710] py-2">Integrations</Link>
            <Link href="/docs" className="block text-sm text-[#555] hover:text-[#111710] py-2">Docs</Link>
            <Link href="/about" className="block text-sm text-[#555] hover:text-[#111710] py-2">About</Link>
            <a
              href="https://calendly.com/autoura"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-2 bg-[#3B5E2E] text-white text-sm font-semibold rounded-[9px] text-center hover:bg-[#2F4C24]"
            >
              Book a Free Demo
            </a>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-40 sm:pt-44 pb-16 sm:pb-20 px-6 text-center max-w-[860px] mx-auto">
        <div
          className={`transition-all duration-1000 ease-out ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-[7px] bg-white border border-[#D6D2CA] rounded-full mb-8">
            <span className="w-[7px] h-[7px] rounded-full bg-[#4D7C3F]" />
            <span className="text-[13px] font-medium text-[#3B5E2E]">AI-Powered Travel Operations</span>
          </div>

          {/* Headline with cycling platform */}
          <h1 className="hero-headline text-[36px] sm:text-[46px] md:text-[56px] font-extrabold text-[#111710] leading-[1.12] tracking-[-1.8px] mb-7">
            Turn a message on<br />
            <PlatformSlot /> into a fully-priced tour.
          </h1>

          {/* Subheadline */}
          <p className="text-[18px] leading-[1.65] text-[#5A5A52] max-w-[640px] mx-auto mb-10">
            {heroContent.subheadline}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[14px] mb-10">
            <a
              href="https://calendly.com/autoura"
              target="_blank"
              rel="noopener noreferrer"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-[6px] px-7 py-[14px] bg-[#3B5E2E] text-white text-[15px] font-semibold rounded-[9px] hover:bg-[#2F4C24] transition-all hover:shadow-[0_6px_24px_rgba(59,94,46,0.25)] hover:-translate-y-px"
            >
              Book a Free Demo
              <span className="group-hover:translate-x-[3px] transition-transform">→</span>
            </a>
            <button
              onClick={() => setVideoModalOpen(true)}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-[14px] bg-white text-[#111710] text-[15px] font-semibold rounded-[9px] border border-[#D6D2CA] hover:border-[#bbb] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:-translate-y-px"
            >
              <span className="text-[#3B5E2E] text-sm">▷</span>
              See How It Works
            </button>
          </div>

          {/* Trust bar */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-8 text-sm text-[#6B6B63]">
            {heroContent.trustSignals.map((signal, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[#4D7C3F] font-bold text-[15px]">✓</span>
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-stone-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-red-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto relative">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
                Your Current Stack Is Held Together by <span className="text-red-400">Copy-Paste</span>
              </h2>
              <p className="text-stone-400 text-base sm:text-lg max-w-2xl mx-auto">
                Sound familiar? Every tour operator knows these problems.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 max-w-5xl mx-auto">
            {painPoints.map((point, i) => (
              <AnimatedSection key={i} delay={i * 50}>
                <div className="group p-4 sm:p-5 bg-stone-800/50 backdrop-blur border border-stone-700/50 rounded-xl hover:bg-stone-800 transition-all hover:border-red-500/30">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/30 transition-colors">
                      <X className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="text-stone-300 leading-relaxed text-sm sm:text-base">{point}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={400}>
            <p className="text-center text-lg sm:text-xl text-stone-300 mt-12 sm:mt-16 max-w-3xl mx-auto px-2">
              You didn't start a travel business to be a <span className="text-white font-semibold">data entry specialist</span>. 
              Autoura handles the operations so you can focus on the travel.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Platform Overview */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                One Message Becomes a <span className="text-[#647C47]">Complete Business</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                A client sends you a WhatsApp message. Minutes later, you have a priced itinerary, a branded PDF, and a clear profit margin — all from one dashboard.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {pillars.map((pillar, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="group relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${pillar.color} rounded-2xl blur-xl opacity-0 group-hover:opacity-20 transition-opacity`} />
                  <div className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-lg border border-stone-100 hover:shadow-xl hover:border-stone-200 transition-all h-full">
                    <div className={`w-12 sm:w-14 h-12 sm:h-14 rounded-xl bg-gradient-to-br ${pillar.color} flex items-center justify-center mb-4 sm:mb-6 shadow-lg`}>
                      <pillar.icon className="w-6 sm:w-7 h-6 sm:h-7 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900 mb-2 sm:mb-3">{pillar.title}</h3>
                    <p className="text-stone-600 leading-relaxed text-sm sm:text-base">{pillar.description}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-stone-100 to-stone-50">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                From Inquiry to Invoice in <span className="text-[#647C47]">One Flow</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                See how a typical booking moves through Autoura — from first contact to completed tour.
              </p>
            </div>
          </AnimatedSection>

          <div className="relative max-w-4xl mx-auto">
            {/* Connecting line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#647C47] via-[#647C47]/50 to-transparent hidden md:block" />

            <div className="space-y-6 sm:space-y-8">
              {steps.map((step, i) => (
                <AnimatedSection key={i} delay={i * 100}>
                  <div className="flex items-start gap-4 sm:gap-6 group">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-xl sm:rounded-2xl bg-white shadow-lg border border-stone-200 flex items-center justify-center group-hover:shadow-xl group-hover:border-[#647C47]/30 transition-all">
                        <step.icon className="w-5 sm:w-7 h-5 sm:h-7 text-[#647C47]" />
                      </div>
                      <div className="absolute -top-1 sm:-top-2 -right-1 sm:-right-2 w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-[#647C47] text-white text-xs font-bold flex items-center justify-center shadow-md">
                        {i + 1}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-stone-100 flex-1 group-hover:shadow-lg transition-shadow min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-stone-900 mb-1 sm:mb-2">{step.title}</h3>
                      <p className="text-stone-600 text-sm sm:text-base">{step.description}</p>
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core Modules - Before/After - NOW WITH 11 MODULES */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                Every Module Built for <span className="text-[#647C47]">Real Operations</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                See the before and after for each part of your workflow.
              </p>
            </div>
          </AnimatedSection>

          {/* Module Tabs - Updated for 11 modules with better scrolling */}
          <div className="flex overflow-x-auto pb-2 mb-8 sm:mb-12 gap-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center scrollbar-hide">
            {modules.map((module, i) => (
              <button
                key={module.id}
                onClick={() => setActiveModule(i)}
                className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeModule === i 
                    ? 'bg-[#647C47] text-white shadow-lg shadow-[#647C47]/30' 
                    : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300'
                }`}
              >
                <module.icon className="w-4 h-4" />
                <span className="sm:hidden">{module.shortTitle}</span>
                <span className="hidden sm:inline">{module.title}</span>
              </button>
            ))}
          </div>

          {/* Active Module Content */}
          <AnimatedSection key={activeModule}>
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-stone-200 overflow-hidden max-w-5xl mx-auto">
              <div className="p-4 sm:p-6 bg-stone-50 border-b border-stone-200 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-[#647C47] flex items-center justify-center">
                    {(() => {
                      const IconComponent = modules[activeModule].icon
                      return <IconComponent className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                    })()}
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900">{modules[activeModule].title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${modules[activeModule].badgeColor}`}>
                        {modules[activeModule].badge}
                      </span>
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-stone-100 text-stone-600">
                        {modules[activeModule].category}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Highlight badge for new modules */}
                {modules[activeModule].highlight && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#647C47] text-white rounded-full text-sm font-medium">
                    <Timer className="w-4 h-4" />
                    {modules[activeModule].highlight}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200">
                {/* Before */}
                <div className="p-4 sm:p-8 bg-red-50/30">
                  <div className="flex items-center gap-2 mb-4 sm:mb-6">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                      <X className="w-4 h-4 text-red-600" />
                    </div>
                    <h4 className="font-semibold text-red-700 uppercase text-sm tracking-wide">Before Autoura</h4>
                  </div>
                  <ul className="space-y-3 sm:space-y-4">
                    {modules[activeModule].before.map((point, i) => (
                      <li key={i} className="flex items-start gap-3 text-stone-600 text-sm sm:text-base">
                        <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* After */}
                <div className="p-4 sm:p-8 bg-gradient-to-br from-[#647C47]/5 to-transparent">
                  <div className="flex items-center gap-2 mb-4 sm:mb-6">
                    <div className="w-8 h-8 rounded-lg bg-[#647C47]/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#647C47]" />
                    </div>
                    <h4 className="font-semibold text-[#647C47] uppercase text-sm tracking-wide">With Autoura</h4>
                  </div>
                  <ul className="space-y-3 sm:space-y-4">
                    {modules[activeModule].after.map((point, i) => (
                      <li key={i} className="flex items-start gap-3 text-stone-700 text-sm sm:text-base">
                        <Check className="w-5 h-5 text-[#647C47] flex-shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Differentiators */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-[#647C47] to-[#4a5c35] relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto relative">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
                Why Tour Operators Choose Autoura
              </h2>
              <p className="text-white/70 text-base sm:text-lg max-w-2xl mx-auto">
                This isn't generic SaaS. It's built for the specific chaos of travel operations.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {differentiators.map((item, i) => (
              <AnimatedSection key={i} delay={i * 50}>
                <div className="group bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 sm:p-6 hover:bg-white/20 transition-all">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-white/30 transition-colors">
                    <item.icon className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-white/70 text-sm sm:text-base">{item.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Egypt-Specific Features */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="flex items-center justify-center gap-4 mb-12 sm:mb-16">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 rounded-full mb-4 sm:mb-6">
                  <MapPin className="w-4 h-4 text-amber-700" />
                  <span className="text-sm font-medium text-amber-700">Made for Egypt</span>
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                  Egypt-Specific Features <span className="text-amber-600">Built In</span>
                </h2>
                <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                  Not adapted from generic software — built from the ground up for Egyptian tour operators.
                </p>
              </div>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {egyptFeatures.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="group bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 sm:p-6 border border-amber-200/50 hover:shadow-lg transition-all">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <feature.icon className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-stone-900 mb-1 sm:mb-2">{feature.title}</h3>
                      <p className="text-stone-600 text-sm sm:text-base">{feature.description}</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-stone-100">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                What Operators Are Saying
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {testimonials.map((testimonial, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-lg border border-stone-200 h-full flex flex-col">
                  <div className="flex items-center gap-1 mb-4 sm:mb-6">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 sm:w-5 h-4 sm:h-5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <blockquote className="text-stone-700 text-base sm:text-lg leading-relaxed mb-4 sm:mb-6 flex-1">
                    "{testimonial.quote}"
                  </blockquote>
                  <div className="border-t border-stone-100 pt-4 sm:pt-6">
                    <p className="font-semibold text-stone-900">{testimonial.author}</p>
                    <p className="text-sm text-stone-500">{testimonial.role}, {testimonial.company}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <div className="relative bg-gradient-to-br from-stone-900 to-stone-800 rounded-2xl sm:rounded-3xl p-8 sm:p-12 md:p-16 overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#647C47]/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
              </div>

              <div className="relative text-center">
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
                  Your Competitors Are Still Using Spreadsheets
                </h2>
                <p className="text-stone-300 text-base sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
                  While they're copying entrance fees by hand and scrolling through WhatsApp looking for passport details, 
                  you could be sending quotes in minutes and tracking real profit margins.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a 
                    href="https://calendly.com/autoura"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-[#647C47] text-white font-semibold rounded-xl hover:bg-[#5a7040] transition-all hover:shadow-xl hover:shadow-[#647C47]/30 flex items-center justify-center gap-2"
                  >
                    Book a Free Demo
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-12 px-4 sm:px-6 border-t border-stone-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/autoura-logo.png" alt="Autoura" className="w-14 h-14 object-contain" />
            </div>
            <div className="flex items-center gap-6 sm:gap-8 text-sm text-stone-500">
              <Link href="/about" className="hover:text-stone-700 transition-colors">About</Link>
              <Link href="/docs" className="hover:text-stone-700 transition-colors">Docs</Link>
              <Link href="/integrations" className="hover:text-stone-700 transition-colors">Integrations</Link>
              <Link href="/privacy" className="hover:text-stone-700 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-stone-700 transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-stone-700 transition-colors">Contact</Link>
            </div>
            <p className="text-sm text-stone-400">
              © {new Date().getFullYear()} Autoura. Built in Cairo.
            </p>
          </div>
        </div>
      </footer>

      {/* Video Modal */}
      {videoModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={() => setVideoModalOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          {/* Modal content */}
          <div
            className="relative w-full max-w-4xl mx-4 aspect-video rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setVideoModalOpen(false)}
              className="absolute -top-10 right-0 sm:-top-12 sm:-right-0 text-white/80 hover:text-white transition-colors z-10 flex items-center gap-1 text-sm"
            >
              <XIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Close</span>
            </button>

            {/* YouTube embed */}
            <iframe
              src="https://www.youtube.com/embed/a9yu2rMaAso?autoplay=1&rel=0&modestbranding=1"
              title="See How Autoura Works"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  )
}