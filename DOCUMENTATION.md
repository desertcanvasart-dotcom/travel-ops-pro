# Travel Ops Pro - Technical Documentation

> AI-powered travel operations management platform for Egyptian travel agencies.
> Automates the workflow from WhatsApp inquiry to PDF invoice.

**Version:** 0.1.1
**Framework:** Next.js 16 (App Router) + TypeScript + React 19
**Database:** Supabase (PostgreSQL)
**Deployment:** Vercel

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Database Schema & Entities](#5-database-schema--entities)
6. [Page Routes](#6-page-routes)
7. [API Reference](#7-api-reference)
8. [Components](#8-components)
9. [Library Utilities](#9-library-utilities)
10. [Multilingual System](#10-multilingual-system)
11. [Rates & Pricing Engine](#11-rates--pricing-engine)
12. [AI Features](#12-ai-features)
13. [Integrations](#13-integrations)
14. [PDF Generation](#14-pdf-generation)
15. [Environment Variables](#15-environment-variables)
16. [Migrations](#16-migrations)

---

## 1. Architecture Overview

```
Client Browser
      │
      ▼
┌─────────────────────────────────┐
│         Next.js 16 App          │
│  ┌──────────┐  ┌─────────────┐  │
│  │  Pages    │  │  API Routes │  │
│  │ (React)  │  │ (Server)    │  │
│  └──────────┘  └──────┬──────┘  │
└────────────────────────┼────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
    │  Supabase │  │ Claude  │  │  External  │
    │ (DB+Auth) │  │ (AI)    │  │  Services  │
    └───────────┘  └─────────┘  └───────────┘
                                     │
                         ┌───────────┼───────────┐
                         │           │           │
                    Twilio       Gmail       OpenAI
                  (WhatsApp)   (Email)   (Translation)
```

### Request Flow

1. **Client-side** pages use `fetch()` to call API routes
2. **API routes** interact with Supabase (database), AI services, and external APIs
3. **Middleware** handles authentication, role-based access, and i18n locale detection
4. **Supabase** provides PostgreSQL database with Row-Level Security and real-time subscriptions

---

## 2. Tech Stack

### Core Framework
| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.x | Full-stack React framework (App Router) |
| React | 19.x | UI library |
| TypeScript | Latest | Type safety |
| Tailwind CSS | Latest | Utility-first styling |

### Database & Auth
| Technology | Version | Purpose |
|-----------|---------|---------|
| Supabase | 2.74+ | PostgreSQL database + authentication |
| @supabase/ssr | 0.7+ | Server-side rendering support |

### AI & NLP
| Technology | Version | Purpose |
|-----------|---------|---------|
| @anthropic-ai/sdk | 0.68+ | Claude AI for parsing, generation, translation |
| OpenAI | 6.8+ | GPT-4o for translations |

### Communication
| Technology | Version | Purpose |
|-----------|---------|---------|
| Twilio | 5.10+ | WhatsApp Business API |
| Nodemailer | 7.0+ | Email sending |
| googleapis | 166+ | Gmail API integration |

### PDF & Documents
| Technology | Version | Purpose |
|-----------|---------|---------|
| jsPDF | 3.0+ | Client-side PDF generation |
| jspdf-autotable | 5.0+ | PDF table layouts |
| pdf-lib | 1.17+ | PDF manipulation |
| @react-pdf/renderer | 4.3+ | React-based PDF rendering |
| Puppeteer | 24.33+ | Server-side PDF via headless browser |

### UI Components
| Technology | Version | Purpose |
|-----------|---------|---------|
| Lucide React | 0.553+ | Icon library |
| Recharts | 3.4+ | Charts and analytics |
| TipTap | 3.11+ | Rich text editor |
| @dnd-kit | 6.3+ | Drag-and-drop functionality |

### Internationalization
| Technology | Version | Purpose |
|-----------|---------|---------|
| next-intl | 4.8+ | i18n framework (English + Japanese) |

### Validation
| Technology | Version | Purpose |
|-----------|---------|---------|
| Zod | 4.1+ | Runtime schema validation |

---

## 3. Project Structure

```
travel-ops-pro/
├── app/                          # Next.js App Router
│   ├── (public)/                 # Public marketing pages
│   ├── api/                      # API routes (server-side)
│   ├── components/               # App-specific components
│   ├── [module]/                 # Feature pages (see §6)
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── supabase.ts               # Server-side Supabase client
├── components/                   # Shared UI components
│   ├── multilingual/             # Language tabs, indicators
│   ├── unified/                  # Unified inbox components
│   └── email/                    # Email editor components
├── lib/                          # Utility libraries
│   ├── ai/                       # AI-related utilities
│   ├── constants/                # Static data (cities, etc.)
│   ├── content-library/          # Content schemas
│   ├── supabase/                 # Supabase server client
│   └── templates/                # Document templates
├── types/                        # TypeScript type definitions
├── messages/                     # i18n translation files
│   ├── en.json                   # English translations
│   └── ja.json                   # Japanese translations
├── migrations/                   # SQL migration files
├── i18n/                         # i18n configuration
├── middleware.ts                  # Auth + i18n middleware
├── next.config.js                # Next.js configuration
├── tailwind.config.ts            # Tailwind configuration
└── package.json                  # Dependencies
```

---

## 4. Authentication & Authorization

### Authentication Provider
- **Supabase Auth** with JWT tokens
- **Methods:** Email/password, Google OAuth
- **Session:** Managed via cookies with `@supabase/ssr`

### Role-Based Access Control (RBAC)

| Role | Description |
|------|-------------|
| `admin` | Full system access including settings, users, rates, and financials |
| `manager` | Rates, financial reports, team, clients, itineraries, invoices, tours |
| `agent` | Clients, itineraries, invoices, payments, tasks, tours, inbox, WhatsApp |
| `viewer` | Read-only: dashboard, analytics, calendar, notifications |

### Route Permissions

```
Admin Only:           /settings, /users
Admin + Manager:      /rates, /team-members, /financial-reports, /profit-loss,
                      /accounts-receivable, /accounts-payable
Admin + Manager + Agent: /clients, /itineraries, /invoices, /payments,
                         /tasks, /tours, /expenses, /inbox, /whatsapp-inbox,
                         /whatsapp-parser, /contacts, /followups, /reminders
All Authenticated:    /dashboard, /analytics, /calendar, /notifications
Public:               /, /login, /signup, /forgot-password, /reset-password,
                      /invite/accept, /about, /contact, /privacy, /terms
```

### Middleware Flow
1. Check if route is public → allow
2. Verify Supabase session → redirect to `/login` if missing
3. Fetch user profile and role from `user_profiles` table
4. Check if user is active → redirect with error if deactivated
5. Validate role against `ROUTE_PERMISSIONS` map → 403 if unauthorized
6. Detect and set locale from `preferred_language` cookie

---

## 5. Database Schema & Entities

### Core Entities

#### Client Management
| Table | Description |
|-------|-------------|
| `clients` | Client master records (name, email, phone, nationality, passport type) |
| `client_profiles` | Travel preferences, dietary restrictions, accessibility needs |
| `client_contacts` | Emergency contacts, travel companions, billing contacts |
| `communication_history` | WhatsApp, email, SMS, phone, meeting records |
| `client_notes` | Internal notes (preferences, complaints, compliments, warnings) |
| `client_followups` | Sales/operational follow-up tasks linked to clients |
| `client_documents` | Passports, visas, insurance, flight tickets, contracts |

#### Itinerary Management
| Table | Description |
|-------|-------------|
| `itineraries` | Trip quotes (client, dates, passengers, cost, status, inclusions, exclusions) |
| `itinerary_days` | Day-by-day breakdown (day number, date, city, title, description) |
| `itinerary_services` | Services per day (type, name, quantity, rates, cost, notes) |
| `itinerary_versions` | Multilingual itinerary content (per language) |
| `itinerary_day_versions` | Multilingual day content (per language) |
| `itinerary_service_versions` | Multilingual service names/notes (per language) |

#### Booking Management
| Table | Description |
|-------|-------------|
| `bookings` | Confirmed reservations (deposit, balance, status, resource assignments) |
| `booking_supplier_status` | Per-supplier confirmation tracking (status, confirmation number) |
| `booking_payments` | Payment records (type: deposit/partial/final/refund, amount, date) |

#### Tour Templates
| Table | Description |
|-------|-------------|
| `tour_templates` | Base tour packages (name, duration, category, destination) |
| `tour_variations` | Pricing tiers per template (Budget/Standard/Deluxe/Luxury) |
| `variation_pricing` | Price per group size with single supplements |
| `tour_categories` | Classification system for tours |
| `tour_template_versions` | Multilingual template content |

#### Rates & Pricing
| Table | Description |
|-------|-------------|
| `accommodation_rates` | Hotel rates by city, tier, and per-person |
| `transportation_rates` | Transport rates by service type, group size, passport type |
| `entrance_fees` | Attraction entrance fees (Euro vs non-Euro passport) |
| `entrance_fee_versions` | Multilingual attraction names |
| `meal_rates` | Meal rates by tier (budget/standard/deluxe) |
| `activity_rates` | Optional activity pricing |
| `cruise_rates` | Cruise rates by line, cabin type |
| `airport_services` | Airport meet & greet, lounge access |
| `hotel_services` | Hotel-specific services |
| `sleeping_train_rates` | Sleeper train pricing by tier |
| `train_rates` | Regular train rates |
| `flight_rates` | Domestic/international flight rates |
| `tipping_rates` | Tipping guidelines by service type |

#### Financial
| Table | Description |
|-------|-------------|
| `invoices` | Billing documents (number, amount, status, due date) |
| `payments` | Client payment records |
| `expenses` | Business expenses (supplier costs, operational costs) |
| `commissions` | Receivable (from partners) and payable (to suppliers) |
| `receipts` | Financial receipt records |

#### Resources
| Table | Description |
|-------|-------------|
| `guides` | Tour guides (languages, specialties, certifications, daily/hourly rates) |
| `resources_transportation` | Transport suppliers (companies, vehicles, drivers) |
| `resources_hotels` | Hotel contact information |
| `resources_restaurants` | Restaurant information |
| `resources_attractions` | Attraction contact details |
| `resources_airport_staff` | Airport service personnel |

#### Operations
| Table | Description |
|-------|-------------|
| `tasks` | Team tasks (title, priority, status, due date, assignee, linked entities) |
| `team_members` | Staff profiles with roles |
| `departments` | Organizational departments |
| `user_profiles` | User accounts and roles |
| `user_preferences` | Individual user settings |

#### Communication
| Table | Description |
|-------|-------------|
| `whatsapp_conversations` | WhatsApp chat threads (Twilio) |
| `whatsapp_messages` | Individual WhatsApp messages |
| `email_conversations` | Email threads (Gmail integration) |
| `message_templates` | Pre-written messages for suppliers/clients |
| `email_signatures` | Branded email signatures |

#### B2B
| Table | Description |
|-------|-------------|
| `b2b_partners` | Corporate travel clients/resellers |
| `b2b_quotes` | Partner-specific quotes with custom pricing |
| `pricing_rules` | Partner-specific discount and commission structures |
| `transport_packages` | Pre-configured transport solutions |

#### Content Library
| Table | Description |
|-------|-------------|
| `content_library` | Reusable content entries (descriptions, itineraries, emails) |
| `content_variations` | Variations of content entries |
| `content_categories` | Content categorization |
| `content_writing_rules` | AI writing style rules |
| `content_prompts` | AI prompt templates |

---

## 6. Page Routes

### Public Pages
| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | User login |
| `/signup` | User registration |
| `/forgot-password` | Password recovery |
| `/reset-password` | Password reset |
| `/auth/reset-password` | Auth reset password callback |
| `/invite/accept` | Team invitation acceptance |
| `/about` | About page |
| `/contact` | Contact page |
| `/integrations` | Integrations showcase |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

### Dashboard & Analytics
| Route | Description |
|-------|-------------|
| `/dashboard` | Main dashboard with KPIs and overview |
| `/analytics` | Detailed analytics and charts |
| `/calendar` | Calendar view of itineraries and tasks |
| `/notifications` | Notification center |

### Client Management
| Route | Description |
|-------|-------------|
| `/clients` | Client list with search and filters |
| `/clients/new` | Create new client |
| `/clients/[id]` | Client detail page (timeline, documents, contacts) |
| `/clients/[id]/edit` | Edit client information |
| `/contacts` | Contact directory |
| `/followups` | Follow-up task management |

### Itinerary Management
| Route | Description |
|-------|-------------|
| `/itineraries` | Itinerary list with status filters |
| `/itineraries/new` | Create new itinerary |
| `/itineraries/[id]` | View itinerary details (multilingual, day-by-day, services) |
| `/itineraries/[id]/edit` | Edit itinerary (days, services, pricing, inclusions/exclusions) |

### Bookings
| Route | Description |
|-------|-------------|
| `/bookings` | Booking list |
| `/bookings/[id]` | Booking detail (supplier status, payments, operations) |

### Financial
| Route | Description |
|-------|-------------|
| `/invoices` | Invoice list |
| `/invoices/[id]` | Invoice detail with payment tracking |
| `/payments` | Payment records |
| `/payments/new` | Record new payment |
| `/payments/record` | Quick payment recording |
| `/payments/[id]` | Payment detail |
| `/payments/[id]/edit` | Edit payment |
| `/expenses` | Expense list |
| `/expenses/[id]` | Expense detail |
| `/commissions` | Commission tracking (receivable and payable) |
| `/financial-reports` | Financial reporting dashboard |
| `/profit-loss` | Profit & loss overview |
| `/profit-loss/[id]` | Per-itinerary P&L |
| `/accounts-receivable` | Client payment tracking |
| `/accounts-payable` | Supplier payment tracking |
| `/receipts` | Receipt management |

### Tours & Templates
| Route | Description |
|-------|-------------|
| `/tours` | Tour template browsing |
| `/tours/[code]` | Tour template detail with variations |
| `/tours/manage` | Tour template management (CRUD) |
| `/tour-builder` | Visual tour builder |
| `/templates` | Message template management |

### Rates Management
| Route | Description |
|-------|-------------|
| `/rates` | Rates overview dashboard |
| `/rates/hotels` | Hotel/accommodation rates |
| `/rates/transportation` | Transport rates by service type and group size |
| `/rates/guides` | Guide daily/hourly rates |
| `/rates/attractions` | Entrance fees (Euro/non-Euro) |
| `/rates/meals` | Meal rates by tier |
| `/rates/activities` | Activity and add-on rates |
| `/rates/cruises` | Cruise rates by line and cabin type |
| `/rates/airport-services` | Airport service rates |
| `/rates/hotel-services` | Hotel service rates |
| `/rates/sleeping-train` | Sleeping train rates |
| `/rates/trains` | Regular train rates |
| `/rates/flights` | Flight rates |
| `/rates/tipping` | Tipping guidelines |

### Communication
| Route | Description |
|-------|-------------|
| `/inbox` | Unified email inbox (Gmail integration) |
| `/whatsapp-inbox` | WhatsApp conversation management |
| `/whatsapp-parser` | AI-powered WhatsApp message parser |
| `/communications` | Communication history |

### Resources
| Route | Description |
|-------|-------------|
| `/resources` | Resource directory (guides, vehicles, hotels, etc.) |
| `/restaurants` | Restaurant directory |
| `/airport-staff` | Airport staff management |
| `/suppliers` | Supplier management |

### Documents
| Route | Description |
|-------|-------------|
| `/documents` | Document management hub |
| `/documents/invoice/[id]` | Invoice document view |
| `/documents/contract/[id]` | Contract document view |
| `/documents/receipt/[id]` | Receipt document view |
| `/documents/supplier` | Supplier document list |
| `/documents/supplier/[id]` | Supplier document detail |
| `/documents/supplier/[id]/edit` | Edit supplier document |

### B2B / Partners
| Route | Description |
|-------|-------------|
| `/b2b/partners` | B2B partner management |
| `/b2b/pricing-rules` | Partner-specific pricing rules |
| `/b2b/quotes` | B2B quote list |
| `/b2b/quotes/[id]` | B2B quote detail |
| `/b2b/calculator/[id]` | B2B price calculator |

### Content Library
| Route | Description |
|-------|-------------|
| `/content-library` | Content entries list |
| `/content-library/[id]` | Content entry detail |
| `/content-library/prompts` | AI prompt management |
| `/content-library/rules` | Writing rules management |

### Administration
| Route | Description |
|-------|-------------|
| `/settings` | System settings |
| `/settings/profile` | User profile settings |
| `/settings/email` | Email settings |
| `/settings/whatsapp` | WhatsApp settings |
| `/users` | User management |
| `/team-members` | Team member management |
| `/tasks` | Task management (Kanban/Table/List views) |
| `/reminders` | Reminder management |

---

## 7. API Reference

### AI Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/parse-whatsapp` | Parse WhatsApp conversation to extract client info |
| POST | `/api/ai/generate-itinerary` | AI-generate a day-by-day itinerary |
| POST | `/api/ai/build-quote` | Build a priced quote from itinerary data |
| POST | `/api/translate` | Translate text between English and Japanese |

### Itinerary Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/itineraries` | List all itineraries |
| POST | `/api/itineraries` | Create new itinerary |
| GET | `/api/itineraries/[id]` | Get itinerary with versions |
| PUT | `/api/itineraries/[id]` | Update itinerary |
| DELETE | `/api/itineraries/[id]` | Delete itinerary and related data |
| GET | `/api/itineraries/[id]/days` | Get days with services (`?language=` for translations) |
| POST | `/api/itineraries/[id]/days` | Add a day |
| GET/PUT/DELETE | `/api/itineraries/[id]/days/[dayId]` | Manage specific day |
| GET/POST | `/api/itineraries/[id]/days/[dayId]/services` | Manage day services |
| PUT/DELETE | `/api/itineraries/[id]/days/[dayId]/services/[serviceId]` | Manage specific service |
| GET/PUT | `/api/itineraries/[id]/days/[dayId]/services/[serviceId]/versions/[lang]` | Service translations |
| POST | `/api/itineraries/[id]/versions` | Create language version |
| PUT | `/api/itineraries/[id]/versions/[lang]` | Update language version |
| POST | `/api/itineraries/[id]/versions/copy-translate` | Copy and auto-translate to target language |
| POST | `/api/itineraries/[id]/calculate-pricing` | Recalculate itinerary pricing |
| POST | `/api/itineraries/[id]/generate-commissions` | Generate commission records |
| POST | `/api/itineraries/[id]/generate-documents` | Generate PDF documents |
| POST | `/api/itineraries/[id]/generate-tasks` | AI-generate operational tasks |
| PUT | `/api/itineraries/[id]/mark-sent` | Mark itinerary as sent to client |
| GET | `/api/itineraries/[id]/template-data` | Get template placeholder data |
| GET/POST | `/api/itinerary-resources` | Manage guide/vehicle assignments |
| GET | `/api/itinerary-resources/conflicts` | Check resource scheduling conflicts |

### Client Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clients` | List clients |
| POST | `/api/clients` | Create client |
| GET/PUT/DELETE | `/api/clients/[id]` | Manage specific client |
| GET | `/api/clients/[id]/template-data` | Get client template data |

### Booking Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bookings` | List bookings |
| POST | `/api/bookings` | Create booking |
| GET/PUT/DELETE | `/api/bookings/[id]` | Manage specific booking |
| GET/POST | `/api/bookings/[id]/payments` | Booking payments |
| GET/PUT | `/api/bookings/[id]/suppliers` | Supplier status tracking |
| POST | `/api/bookings/[id]/sync-suppliers` | Sync suppliers from itinerary |

### Invoice Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices` | List invoices |
| POST | `/api/invoices` | Create invoice |
| GET/PUT/DELETE | `/api/invoices/[id]` | Manage specific invoice |
| GET/POST | `/api/invoices/[id]/payments` | Invoice payment records |
| DELETE | `/api/invoices/[id]/payments/[paymentId]` | Delete payment |
| POST | `/api/invoices/[id]/reminder` | Send payment reminder |
| PUT | `/api/invoices/[id]/pause` | Pause/resume reminders |
| GET/POST | `/api/invoices/reminders` | Reminder management |
| GET | `/api/invoices/reminders/history` | Reminder history |

### Payment Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments` | List payments |
| POST | `/api/payments` | Record payment |
| GET/PUT/DELETE | `/api/payments/[id]` | Manage specific payment |

### Expense Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | List expenses |
| POST | `/api/expenses` | Create expense |
| GET/PUT/DELETE | `/api/expenses/[id]` | Manage specific expense |

### Commission Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/commissions` | List commissions |
| POST | `/api/commissions` | Create commission |
| GET/PUT/DELETE | `/api/commissions/[id]` | Manage specific commission |

### Rate Endpoints

Each rate type follows the same pattern:
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rates/[type]` | List rates |
| POST | `/api/rates/[type]` | Create rate |
| GET/PUT/DELETE | `/api/rates/[type]/[id]` | Manage specific rate |

**Rate types:** `hotels`, `transportation`, `guides`, `attractions`, `meals`, `activities`, `cruises`, `airport-services`, `hotel-services`, `sleeping-trains`, `trains`, `flights`, `tipping`

Additional rate endpoints:
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rates` | Rate overview/summary |
| GET | `/api/rates/available` | Available rate types |
| GET | `/api/rates/entrance-fees` | Legacy entrance fees endpoint |

### Tour Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tours/browse` | Browse tour catalog |
| POST | `/api/tours/save` | Save tour configuration |
| POST | `/api/tours/calculate` | Calculate tour pricing |
| POST | `/api/tours/export-pdf` | Export tour as PDF |
| POST | `/api/tours/recalculate-prices` | Bulk recalculate all tour prices |
| GET | `/api/tours/categories` | List tour categories |
| GET/POST | `/api/tours/templates` | Manage tour templates |
| GET/PUT/DELETE | `/api/tours/templates/[id]` | Specific template |
| POST | `/api/tours/templates/[id]/auto-price` | Auto-price a template |
| GET/POST | `/api/tours/templates/[id]/days` | Template daily itinerary |
| POST | `/api/tours/templates/[id]/versions` | Create template version |
| PUT | `/api/tours/templates/[id]/versions/[lang]` | Update template version |
| GET/PUT/DELETE | `/api/tours/[code]` | Tour by code |
| POST | `/api/tours/[code]/versions` | Tour code versions |
| POST | `/api/tours/[code]/versions/copy-translate` | Copy and translate tour |
| GET/POST | `/api/tours/variations` | Manage variations |
| GET/PUT/DELETE | `/api/tours/variations/[id]` | Specific variation |
| GET/PUT | `/api/tours/variations/[id]/services` | Variation services |
| GET/POST | `/api/tours/activities` | Tour activities |
| GET/PUT/DELETE | `/api/tours/activities/[id]` | Specific activity |
| GET/PUT/DELETE | `/api/tours/days/[id]` | Daily itinerary |
| POST | `/api/tours/days` | Create daily itinerary |

### Communication Endpoints

#### WhatsApp
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/whatsapp/conversations` | Manage conversations |
| POST | `/api/whatsapp/conversations/assign` | Assign conversation to agent |
| GET/POST | `/api/whatsapp/messages` | Send/receive messages |
| POST | `/api/whatsapp/webhook` | Twilio webhook (incoming messages) |
| POST | `/api/whatsapp/status-callback` | Message delivery status |
| GET | `/api/whatsapp/activity` | WhatsApp activity log |
| GET | `/api/whatsapp/agents` | Available agents |
| POST | `/api/whatsapp/send-quote` | Send quote via WhatsApp |
| POST | `/api/whatsapp/send-invoice` | Send invoice via WhatsApp |
| POST | `/api/whatsapp/send-contract` | Send contract via WhatsApp |
| POST | `/api/whatsapp/send-receipt` | Send receipt via WhatsApp |
| POST | `/api/whatsapp/send-reminder` | Send payment reminder |
| POST | `/api/whatsapp/send-status` | Send status update |
| POST | `/api/whatsapp/send-thankyou` | Send thank-you message |
| POST | `/api/whatsapp/notify-guide` | Notify assigned guide |
| POST | `/api/whatsapp/notify-resource` | Notify a resource/supplier |

#### Email (Gmail)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gmail/connect` | Connect Gmail account |
| GET | `/api/gmail/emails` | Fetch emails |
| GET | `/api/gmail/labels` | Gmail labels |
| GET | `/api/gmail/attachments` | Email attachments |
| POST | `/api/gmail/send` | Send email |
| POST | `/api/gmail/actions` | Email actions (archive, label, etc.) |
| GET | `/api/gmail/poll` | Poll for new emails |
| POST | `/api/send-email` | Send email via Nodemailer |

#### Unified Communications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/unified/conversations` | Unified inbox (WhatsApp + Email) |
| GET | `/api/unified/client/[clientId]` | Client communication history |
| GET | `/api/email/conversations` | Email conversation threads |
| GET | `/api/email/messages` | Email messages |
| GET | `/api/email/links` | Email link tracking |
| GET | `/api/email/sync` | Sync email |
| GET/PUT | `/api/email/signatures` | Email signatures |
| GET/POST | `/api/email/templates` | Email templates |

### B2B Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/b2b/partners` | Manage B2B partners |
| GET/PUT/DELETE | `/api/b2b/partners/[id]` | Specific partner |
| GET/POST | `/api/b2b/pricing-rules` | Pricing rules |
| GET/PUT/DELETE | `/api/b2b/pricing-rules/[id]` | Specific pricing rule |
| GET/POST | `/api/b2b/quotes` | B2B quotes |
| GET/PUT/DELETE | `/api/b2b/quotes/[id]` | Specific B2B quote |
| POST | `/api/b2b/quotes/[id]/convert` | Convert B2B quote to itinerary |
| POST | `/api/b2b/quotes/[id]/pdf` | Generate B2B quote PDF |
| POST | `/api/b2b/quotes/[id]/versions` | Create language version |
| PUT | `/api/b2b/quotes/[id]/versions/[lang]` | Update version |
| POST | `/api/b2b/quotes/[id]/versions/copy-translate` | Copy and translate |
| POST | `/api/b2b/calculate-price` | Calculate B2B price |
| POST | `/api/b2b/test-pricing` | Test pricing rules |
| GET/POST | `/api/b2b/transport-packages` | Transport packages |
| GET/PUT/DELETE | `/api/b2b/transport-packages/[id]` | Specific package |

### Resource Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resources` | List all resource types |
| GET/POST | `/api/resources/[type]` | Manage resources by type |
| GET/PUT/DELETE | `/api/resources/[type]/[id]` | Specific resource |
| GET | `/api/resources/vehicles` | Vehicle list |
| GET/POST | `/api/guides` | Guide management |
| GET/PUT/DELETE | `/api/guides/[id]` | Specific guide |
| GET/POST | `/api/suppliers` | Supplier management |
| GET/PUT/DELETE | `/api/suppliers/[id]` | Specific supplier |
| GET | `/api/supplier-rates` | Supplier rate lookup |

**Resource types:** `hotels`, `restaurants`, `attractions`, `transportation`, `airport-staff`, `hotel-staff`

### Content Library Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/content-library` | Content entries |
| GET/PUT/DELETE | `/api/content-library/[id]` | Specific entry |
| GET/POST | `/api/content-library/[id]/variations` | Content variations |
| GET | `/api/content-library/categories` | Content categories |
| GET/POST | `/api/content-library/prompts` | AI prompts |
| GET/POST | `/api/content-library/writing-rules` | Writing style rules |

### Administration Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/tasks` | Task management |
| GET/PUT/DELETE | `/api/tasks/[id]` | Specific task |
| GET/POST | `/api/team-members` | Team member management |
| GET/PUT/DELETE | `/api/team-members/[id]` | Specific team member |
| GET | `/api/departments` | Department list |
| GET/PUT | `/api/profile` | Current user profile |
| GET/POST | `/api/profiles` | All profiles |
| GET/PUT | `/api/profiles/[id]` | Specific profile |
| GET/PUT | `/api/user-preferences` | User preferences |
| GET/PUT | `/api/user/preferences` | User preferences (alt) |
| POST | `/api/invitations` | Send team invitation |
| POST | `/api/invitations/verify` | Verify invitation token |
| GET | `/api/notifications` | List notifications |
| PUT | `/api/notifications/[id]` | Mark notification read |
| POST | `/api/notifications/mark-all-read` | Mark all read |
| POST | `/api/avatar/upload` | Upload profile avatar |

### Utility Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics` | Dashboard analytics data |
| GET | `/api/financial-reports` | Financial report data |
| GET | `/api/profit-loss` | Profit/loss data |
| GET | `/api/accounts-payable` | Accounts payable data |
| GET | `/api/accounts-receivable` | Accounts receivable data |
| GET | `/api/exchange-rates` | Currency exchange rates |
| POST | `/api/pdf/generate` | Server-side PDF generation |
| GET | `/api/partners` | Partner list |
| GET | `/api/partners/[id]/template-data` | Partner template data |
| GET | `/api/reminders/history` | Reminder history |
| GET/POST | `/api/supplier-documents` | Supplier documents |
| GET/PUT/DELETE | `/api/supplier-documents/[id]` | Specific document |
| GET/POST | `/api/templates` | Message templates |
| GET/PUT/DELETE | `/api/templates/[id]` | Specific template |
| POST | `/api/templates/[id]/use` | Use a template |
| GET | `/api/templates/placeholders` | Available placeholders |
| POST | `/api/templates/send` | Send template message |
| GET/POST | `/api/settings/notifications` | Notification settings |
| GET | `/api/cruises` | Cruise data |
| GET/PUT/DELETE | `/api/cruises/[id]` | Specific cruise |
| GET | `/api/auth/google/callback` | Google OAuth callback |

### Cron Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron/send-reminders` | Automated invoice reminders |
| GET | `/api/cron/task-reminders` | Automated task due date reminders |

---

## 8. Components

### App Components (`app/components/`)
| Component | Description |
|-----------|-------------|
| `Navigation.tsx` | Main sidebar navigation with role-based menu items |
| `GenerateDocumentsButton.tsx` | Button to generate PDF documents for itineraries |
| `ItineraryExpenses.tsx` | Expense tracking within itinerary context |
| `ItineraryPL.tsx` | Per-itinerary profit & loss calculation |
| `ResourceAssignmentV2.tsx` | Guide and vehicle assignment interface |
| `ResourceSummaryCard.tsx` | Resource assignment summary display |
| `whatsapp/whatsapp-button.tsx` | WhatsApp quick-send button |

### Shared Components (`components/`)
| Component | Description |
|-----------|-------------|
| `Sidebar.tsx` | Application sidebar layout |
| `ConfirmDialog.tsx` | Reusable confirmation dialog with alert/confirm modes |
| `NotificationBell.tsx` | Real-time notification indicator |
| `LanguageSelector.tsx` | Language switcher dropdown |
| `TranslationPanel.tsx` | Side panel for translating content |
| `ClientFilters.tsx` | Advanced client search and filter UI |
| `ClientTimeline.tsx` | Client activity timeline visualization |
| `ClientLinkButton.tsx` | Quick link to client profile |
| `AddExpenseFromItinerary.tsx` | Add expense linked to itinerary |
| `AddFollowupModal.tsx` | Create follow-up task modal |
| `AddNoteModal.tsx` | Create internal note modal |
| `AttachmentList.tsx` | File attachment display |
| `LogCommunicationModal.tsx` | Log communication record modal |
| `PackageTypeSelector.tsx` | Tour package tier selector |
| `QuickSendButton.tsx` | Quick message send button |
| `ItineraryPL.tsx` | Shared P&L component |

### Multilingual Components (`components/multilingual/`)
| Component | Description |
|-----------|-------------|
| `LanguageTabs.tsx` | Language tab switcher + CreateVersionPrompt |
| `LanguageIndicator.tsx` | Language badge/indicator |

### Unified Inbox Components (`components/unified/`)
| Component | Description |
|-----------|-------------|
| `UnifiedConversationList.tsx` | Combined WhatsApp + Email conversation list |
| `UnifiedMessageThread.tsx` | Threaded message display |
| `ChannelBadge.tsx` | Communication channel indicator |

### Email Components (`components/email/`)
| Component | Description |
|-----------|-------------|
| `RichTextEditor.tsx` | TipTap-based rich text editor for email composition |

---

## 9. Library Utilities

### AI Utilities (`lib/ai/`)
| File | Description |
|------|-------------|
| `content-library-utils.ts` | Content library helper functions |
| `content-library.ts` | Content library AI integration |
| `cruise-detection.ts` | Detect cruise-related services in itineraries |
| `cruise-pricing.ts` | Cruise pricing calculation logic |
| `egypt-glossary.ts` | Egyptian tourism terminology glossary for AI |
| `parsing-utils.ts` | WhatsApp message parsing utilities |
| `prompt-builder.ts` | Dynamic AI prompt construction |
| `service-creation.ts` | AI-assisted service creation |
| `task-generation.ts` | AI-generated task creation from itinerary data |

### Core Utilities (`lib/`)
| File | Description |
|------|-------------|
| `auto-pricing-service.ts` | Automatic pricing engine (fetches rates, calculates costs) |
| `rate-lookup-service.ts` | Rate matching and lookup logic |
| `tourCalculator.ts` | Tour cost calculation engine |
| `transport-rate-utils.ts` | Transport-specific rate calculations |
| `tour-matcher-service.ts` | Match client requests to tour templates |
| `inclusions-builder.ts` | Build inclusion/exclusion lists from services |
| `currency-service.ts` | Currency conversion utilities |
| `communication-utils.ts` | WhatsApp message formatting, link generation |
| `template-placeholders.ts` | Template variable replacement engine |
| `validation.ts` | Input validation utilities |
| `rate-limit.ts` | API rate limiting |

### PDF Generators (`lib/`)
| File | Description |
|------|-------------|
| `pdf-generator.ts` | Main itinerary PDF generator |
| `invoice-pdf-generator.ts` | Invoice PDF layout |
| `contract-pdf-generator.ts` | Contract document generator |
| `receipt-pdf-generator.ts` | Receipt PDF generator |
| `supplier-document-pdf.ts` | Supplier document PDF |

### Supabase (`lib/`)
| File | Description |
|------|-------------|
| `supabase.ts` | Client-side Supabase client |
| `supabase-secure.ts` | Server-side Supabase client with service role |
| `supabase/server.ts` | SSR-compatible Supabase client |

### Communication (`lib/`)
| File | Description |
|------|-------------|
| `twilio-whatsapp.ts` | Twilio WhatsApp API wrapper |
| `gmail.ts` | Gmail API integration |
| `email-cache.ts` | Email response caching |
| `use-email-polling.ts` | React hook for email polling |

### Translation (`lib/`)
| File | Description |
|------|-------------|
| `translation-utils.ts` | Translation field configs and utility functions |
| `translate.ts` | Translation service integration |

### Other (`lib/`)
| File | Description |
|------|-------------|
| `package-types.ts` | Tour package type definitions |

---

## 10. Multilingual System

### Supported Languages
| Code | Name | Flag |
|------|------|------|
| `en` | English | 🇬🇧 |
| `ja` | Japanese (日本語) | 🇯🇵 |

### Architecture

The multilingual system uses a **version table pattern**:

```
Base Table (e.g., itineraries)
  └── Version Table (e.g., itinerary_versions)
       ├── language: 'en' → English content
       └── language: 'ja' → Japanese content
```

Each version table has a **UNIQUE constraint** on `(entity_id, language)`.

### Translatable Entities

| Entity | Version Table | Translatable Fields |
|--------|--------------|-------------------|
| Itinerary | `itinerary_versions` | trip_name, notes, pickup_location, guide_notes, vehicle_notes, inclusions, exclusions |
| Itinerary Day | `itinerary_day_versions` | title, description, city, overnight_city |
| Itinerary Service | `itinerary_service_versions` | service_name, notes |
| Entrance Fee | `entrance_fee_versions` | attraction_name, notes |
| Tour Template | `tour_template_versions` | template_name, short_description, long_description, highlights, main_attractions, best_for, inclusions, exclusions |
| Tour Variation | (variation versions) | variation_name, inclusions, exclusions, optional_extras |
| B2B Quote | (quote versions) | title, notes, terms_conditions, special_requests |

### Translation Flow

1. **UI Language:** Controlled by `preferred_language` cookie, detected in middleware
2. **Content Language:** Each page reads the cookie and passes `?language=` to API calls
3. **API Merging:** APIs fetch base record + version for requested language, merge with version taking precedence
4. **Fallback:** If no version exists for requested language, base (English) content is shown
5. **Copy & Translate:** One-click translation uses OpenAI GPT-4o to translate all fields from English to target language

### i18n UI Translations

UI labels (button text, form labels, navigation) use `next-intl` with message files:
- `messages/en.json` — English UI strings
- `messages/ja.json` — Japanese UI strings

**Translation namespaces** (78 total): `aiPrompts`, `analytics`, `auth`, `b2bCalculator`, `bookings`, `calendar`, `clients`, `commissions`, `common`, `dashboard`, `expenses`, `invoices`, `itineraries`, `navigation`, `notifications`, `payments`, `rates`, `settings`, `tasks`, `teamMembers`, `templates`, `tours`, and 56 more.

---

## 11. Rates & Pricing Engine

### Rate Categories

| Category | Table | Key Fields |
|----------|-------|------------|
| Hotels | `accommodation_rates` | City, tier, per-person rates |
| Transportation | `transportation_rates` | Service type, group size tiers, passport type |
| Guides | `guides` | Daily rate, hourly rate, languages, specialties |
| Entrance Fees | `entrance_fees` | Attraction, Euro/non-Euro pricing |
| Meals | `meal_rates` | Tier (budget/standard/deluxe), per-person |
| Activities | `activity_rates` | Per-activity pricing |
| Cruises | `cruise_rates` | Line, cabin type, per-person |
| Airport Services | `airport_services` | Service type pricing |
| Hotel Services | `hotel_services` | Service type pricing |
| Sleeping Train | `sleeping_train_rates` | Tier-based pricing |
| Trains | `train_rates` | Route-based pricing |
| Flights | `flight_rates` | Route-based pricing |
| Tipping | `tipping_rates` | Per-service guidelines |

### Pricing Engine Components

1. **`lib/auto-pricing-service.ts`** — Main pricing engine
   - Fetches all relevant rates from database
   - Matches services to rates
   - Calculates per-person and total costs
   - Applies group size discounts
   - Handles Euro vs non-Euro passport differentiation

2. **`lib/rate-lookup-service.ts`** — Rate matching
   - Fuzzy matching of service names to rate entries
   - Tier-based rate selection
   - City-based rate lookup

3. **`lib/tourCalculator.ts`** — Tour cost calculation
   - End-to-end tour pricing
   - Variation-specific pricing
   - Markup application

4. **`lib/transport-rate-utils.ts`** — Transport pricing
   - Group size tier calculation
   - Service type matching (day tour, airport transfer, inter-city)

### Pricing Modes

Itineraries support two cost modes:
- **`auto`** — Prices calculated automatically from rates database
- **`manual`** — Prices entered manually per service

### Markup System
- Global markup percentage via `MARKUP_PERCENTAGE` env var
- Can be overridden per tour variation or B2B pricing rule

---

## 12. AI Features

### WhatsApp Parsing (`/api/ai/parse-whatsapp`)
- **Model:** Claude Sonnet 3.5
- Extracts from WhatsApp conversation: client name, nationality, travel dates, number of travelers, preferences, budget, special requests
- Uses Egypt tourism glossary for context

### Itinerary Generation (`/api/ai/generate-itinerary`)
- **Model:** Claude Sonnet 3.5
- Generates complete day-by-day itinerary based on client preferences
- Matches services from rates database
- Creates daily activities with timing and descriptions
- Suggests appropriate hotels, transport, and activities per tier

### Quote Building (`/api/ai/build-quote`)
- Assembles parsed data + generated itinerary into priced quote
- Applies rates from database
- Calculates totals with markup

### Task Generation (`/api/itineraries/[id]/generate-tasks`)
- Analyzes itinerary services and generates operational tasks
- Assigns to departments (operations, transport, accommodation, guides)
- Sets priorities and due dates based on trip dates

### Translation (`/api/translate`)
- **Model:** OpenAI GPT-4o
- Translates between English and Japanese
- Specialized for Egyptian travel terminology
- Supports single text and batch translation

### Content Library AI
- AI-assisted content generation for tour descriptions
- Writing rules enforce brand voice and style
- Prompt templates for consistent output

---

## 13. Integrations

### Twilio (WhatsApp Business)
- **Inbound:** Webhook at `/api/whatsapp/webhook` receives messages
- **Outbound:** Send quotes, invoices, contracts, reminders, status updates
- **Features:** Media support, template messages, delivery tracking
- **Agent Assignment:** Conversations can be assigned to team members

### Gmail
- **OAuth Connection:** `/api/gmail/connect` initiates Google OAuth
- **Email Sync:** `/api/gmail/poll` polls for new emails
- **Send:** Compose and send emails with rich text
- **Labels:** Gmail label management
- **Attachments:** View and download email attachments

### Google APIs
- **OAuth:** Authentication flow at `/api/auth/google/callback`
- **Calendar:** (Integration available)
- **Sheets/Docs:** (Integration available)

### Supabase
- **Database:** PostgreSQL with full CRUD operations
- **Authentication:** Email/password + Google OAuth
- **Row-Level Security:** Per-user data access policies
- **Real-time:** Live subscription support for notifications

---

## 14. PDF Generation

### Document Types
| Type | Generator | Description |
|------|-----------|-------------|
| Itinerary Quote | `lib/pdf-generator.ts` | Client-facing itinerary with day-by-day details, pricing, inclusions/exclusions |
| Invoice | `lib/invoice-pdf-generator.ts` | Professional invoice with line items, payment terms |
| Contract | `lib/contract-pdf-generator.ts` | Booking contract with terms and conditions |
| Receipt | `lib/receipt-pdf-generator.ts` | Payment receipt |
| Supplier Document | `lib/supplier-document-pdf.ts` | Supplier-facing operational documents |

### Generation Methods
- **Client-side:** jsPDF + jspdf-autotable (instant, no server round-trip)
- **Server-side:** Puppeteer headless browser (for complex layouts)
- **React PDF:** @react-pdf/renderer (for transport vouchers and specialized layouts)

---

## 15. Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side, bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | Application URL (e.g., https://autoura.net) |
| `ANTHROPIC_API_KEY` | Claude AI API key |
| `OPENAI_API_KEY` | OpenAI API key (for translations) |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_API_KEY` | Twilio API key |
| `TWILIO_API_SECRET` | Twilio API secret |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender number (Twilio format) |
| `TWILIO_WHATSAPP_NUMBER` | WhatsApp business number |
| `GMAIL_USER` | Gmail address for email integration |
| `GMAIL_APP_PASSWORD` | Gmail app password |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL |
| `BUSINESS_EMAIL` | Business email address |
| `BUSINESS_NAME` | Business display name |
| `BUSINESS_WEBSITE` | Business website URL |
| `BUSINESS_WHATSAPP` | Business WhatsApp number |
| `MARKUP_PERCENTAGE` | Default pricing markup percentage |
| `DEFAULT_CURRENCY` | Default currency code (EUR) |
| `CRON_SECRET` | Secret for cron job authentication |
| `ENABLE_WHATSAPP_AUTO_SEND` | Enable automatic WhatsApp sends |
| `ENABLE_WHATSAPP_STATUS_UPDATES` | Enable WhatsApp status updates |

---

## 16. Migrations

| File | Description |
|------|-------------|
| `20260203_add_language_versions.sql` | Create version tables for multilingual support |
| `20260203_migrate_existing_to_en.sql` | Migrate existing content to English versions |
| `20260205_cruise_pricing_overhaul.sql` | Restructure cruise rate tables |
| `20260205_transportation_rates_restructure.sql` | Restructure transport rate tables |
| `20260206_add_inclusions_exclusions.sql` | Add inclusions/exclusions arrays to itineraries |
| `20260206_create_user_invitations.sql` | Create user invitation system |
| `20260206_fix_transportation_legacy_constraints.sql` | Fix transport table constraints |
| `20260207_hotel_rates_per_person.sql` | Change hotel rates to per-person pricing |
| `20260208_add_inclusions_to_versions.sql` | Add inclusions/exclusions to version tables |
| `20260216_whatsapp_conversation_trigger.sql` | Auto-create conversations on incoming messages |
| `20260217_create_departments.sql` | Create departments table |
| `20260220_add_entrance_fee_versions.sql` | Multilingual entrance fee names |
| `20260220_add_service_versions.sql` | Multilingual itinerary service names |
| `20260204_add_b2b_land_operator_templates.sql` | B2B land operator template support |
| `20260201_add_cached_pricing_columns.sql` | Cached pricing for performance |
| `20260204_add_is_cruise_day_column.sql` | Flag cruise days in itineraries |
| `20260203_add_num_infants_column.sql` | Infant count support (ages 0-3, free except flights) |
| `20260202_add_partner_to_itineraries.sql` | Link itineraries to B2B partners |
| `20260129_add_preferred_language.sql` | User language preference |
| `20260202_add_supplier_message_templates.sql` | Supplier-specific message templates |
| `20260201_create_bookings_tables.sql` | Booking management tables |
| `20260201_create_user_preferences_table.sql` | User preferences storage |

---

## Type Definitions

| File | Description |
|------|-------------|
| `types/bookings.ts` | Booking, payment, and supplier status types |
| `types/content-library.ts` | Content library entity types |
| `types/crm.ts` | CRM entity types (clients, contacts, notes, followups, documents) |
| `types/multilingual.ts` | Language type, version types, translation configs |
| `types/resources.ts` | Resource entity types (guides, vehicles, hotels, etc.) |
| `types/unified.ts` | Unified inbox conversation and message types |

---

*Last updated: February 2026*
