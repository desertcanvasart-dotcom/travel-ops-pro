# 🗺️ Travel2Egypt Operations System - Developer Handover

**Project Name:** Travel2Egypt Operations System  
**Version:** 1.0.0  
**Handover Date:** November 12, 2025  
**Developer:** Islam Mohamed  
**Tech Stack:** Next.js 14, TypeScript, Supabase, Tailwind CSS, Anthropic Claude AI

---

## 📑 Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Features & Modules](#features--modules)
6. [API Routes](#api-routes)
7. [File Structure](#file-structure)
8. [Environment Variables](#environment-variables)
9. [Installation & Setup](#installation--setup)
10. [Deployment](#deployment)
11. [Testing Guide](#testing-guide)
12. [Maintenance & Updates](#maintenance--updates)
13. [Known Issues & Future Enhancements](#known-issues--future-enhancements)
14. [Support & Documentation](#support--documentation)

---

## 1. Project Overview

### Purpose
An AI-powered operations management system for Travel2Egypt travel agency that automates the quote generation process from WhatsApp conversations to professional PDF quotes.

### Key Business Value
- **Time Savings:** Reduces quote generation from 30+ minutes to ~2 minutes (95% faster)
- **Cost Efficiency:** €0.06 per quote vs manual labor costs
- **Consistency:** Standardized professional output every time
- **Scalability:** Handles unlimited volume with no additional staffing

### Core Functionality
1. **AI WhatsApp Parser:** Extracts client requirements from conversations
2. **AI Itinerary Generator:** Creates detailed day-by-day trip plans
3. **PDF Quote Generator:** Produces professional branded quotes
4. **Tour Database:** Flexible multi-tier pricing system
5. **Dashboard & Analytics:** Business insights and performance tracking

---

## 2. System Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Browser)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Next.js 14 Application                      │
│  ┌──────────────┬──────────────┬──────────────────────┐    │
│  │   UI Layer   │  API Routes  │  Server Components   │    │
│  └──────────────┴──────────────┴──────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 ↓                         ↓
┌──────────────────────────┐  ┌──────────────────────────┐
│   Supabase (Database)    │  │   Anthropic Claude AI    │
│  - PostgreSQL            │  │  - Natural Language      │
│  - Real-time subscriptions│  │  - JSON extraction       │
│  - Row Level Security    │  │  - Content generation    │
└──────────────────────────┘  └──────────────────────────┘
```

### Data Flow
```
WhatsApp Message → AI Parser → Extracted Data → AI Generator → 
Itinerary → PDF Generator → Quote → Send (WhatsApp/Email)
```

---

## 3. Technology Stack

### Frontend
- **Framework:** Next.js 14.2.16 (App Router)
- **Language:** TypeScript 5.x
- **Styling:** Tailwind CSS 3.4.1
- **UI Components:** Custom components (no UI library)
- **State Management:** React Hooks (useState, useEffect)

### Backend
- **Runtime:** Node.js (Next.js API Routes)
- **Database:** Supabase (PostgreSQL)
- **ORM:** Supabase JS Client 2.x
- **AI Provider:** Anthropic Claude (Sonnet 3.5)

### Additional Libraries
- **PDF Generation:** jsPDF 2.5.2
- **HTTP Client:** Native Fetch API
- **Routing:** Next.js App Router
- **Date Handling:** Native JavaScript Date

### Development Tools
- **Package Manager:** npm
- **Version Control:** Git
- **Code Editor:** VS Code (recommended)
- **Linting:** ESLint (Next.js config)

---

## 4. Database Schema

### ERD Overview
```
┌─────────────────┐         ┌──────────────────┐
│  itineraries    │────────>│  itinerary_days  │
│                 │    1:N  │                  │
└─────────────────┘         └──────────────────┘
                                     │
                                     │ N:M
                                     ↓
┌─────────────────┐         ┌──────────────────┐
│  services       │<────────│  day_services    │
│                 │         │                  │
└─────────────────┘         └──────────────────┘

┌──────────────────┐        ┌──────────────────────┐
│ tour_templates   │───────>│  tour_variations     │
│                  │   1:N  │                      │
└──────────────────┘        └──────────────────────┘
        │                            │
        │ N:1                        │ 1:N
        ↓                            ↓
┌──────────────────┐        ┌──────────────────────┐
│  destinations    │        │  variation_pricing   │
└──────────────────┘        └──────────────────────┘
        │
        │ N:1
        ↓
┌──────────────────┐
│ tour_categories  │
└──────────────────┘
```

### Core Tables

#### **itineraries**
Primary table for storing client trip quotes.
```sql
CREATE TABLE itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    itinerary_code VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    trip_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER NOT NULL,
    num_adults INTEGER DEFAULT 2,
    num_children INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'EUR',
    total_cost DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft',
    notes TEXT,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_itineraries_status ON itineraries(status);
CREATE INDEX idx_itineraries_client_name ON itineraries(client_name);
CREATE INDEX idx_itineraries_created_at ON itineraries(created_at DESC);
```

**Status Values:**
- `draft` - Created but not sent
- `sent` - Sent to client
- `confirmed` - Client confirmed booking
- `completed` - Trip completed
- `cancelled` - Booking cancelled

#### **itinerary_days**
Day-by-day breakdown of the trip.
```sql
CREATE TABLE itinerary_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    itinerary_id UUID REFERENCES itineraries(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    day_title VARCHAR(255) NOT NULL,
    day_description TEXT,
    city VARCHAR(255),
    overnight_city VARCHAR(255),
    breakfast_included BOOLEAN DEFAULT false,
    lunch_included BOOLEAN DEFAULT false,
    dinner_included BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_itinerary_days_itinerary_id ON itinerary_days(itinerary_id);
```

#### **services**
Master list of all available services.
```sql
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(255) NOT NULL,
    service_category VARCHAR(50) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    unit_type VARCHAR(50) NOT NULL,
    base_cost DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Service Categories
-- 'accommodation', 'transportation', 'guide', 'entrance', 
-- 'meal', 'activity', 'transfer'
```

#### **day_services**
Junction table linking services to specific days.
```sql
CREATE TABLE day_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day_id UUID REFERENCES itinerary_days(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id),
    quantity INTEGER DEFAULT 1,
    unit_cost DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### **tour_templates**
Base tour packages.
```sql
CREATE TABLE tour_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_code VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    destination_id UUID REFERENCES destinations(id),
    category_id UUID REFERENCES tour_categories(id),
    duration_days INTEGER NOT NULL,
    duration_nights INTEGER NOT NULL,
    short_description TEXT,
    long_description TEXT,
    highlights TEXT[],
    main_attractions TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### **tour_variations**
Different pricing tiers for each template.
```sql
CREATE TABLE tour_variations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES tour_templates(id) ON DELETE CASCADE,
    variation_code VARCHAR(50) UNIQUE NOT NULL,
    variation_name VARCHAR(255) NOT NULL,
    tier VARCHAR(20) NOT NULL, -- 'budget', 'standard', 'luxury'
    group_type VARCHAR(20) NOT NULL, -- 'private', 'shared'
    min_pax INTEGER NOT NULL,
    max_pax INTEGER NOT NULL,
    inclusions TEXT[],
    exclusions TEXT[],
    optional_extras TEXT[],
    guide_type VARCHAR(50),
    guide_languages VARCHAR(10)[],
    vehicle_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### **variation_pricing**
Price per group size for each variation.
```sql
CREATE TABLE variation_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variation_id UUID REFERENCES tour_variations(id) ON DELETE CASCADE,
    min_pax INTEGER NOT NULL,
    max_pax INTEGER NOT NULL,
    price_per_person DECIMAL(10,2) NOT NULL,
    single_supplement DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Features & Modules

### 5.1 Dashboard (`/dashboard`)

**Purpose:** Central hub with quick stats and actions.

**Features:**
- Real-time statistics (quotes, tours, conversions)
- Quick action buttons
- Recent activity feed
- System status indicators

**Files:**
- `app/dashboard/page.tsx`

**Key Metrics Displayed:**
- Total Quotes
- Tours Available
- Quotes Sent
- Confirmed Bookings

---

### 5.2 AI WhatsApp Parser (`/whatsapp-parser`)

**Purpose:** Extract client requirements from WhatsApp conversations.

**Features:**
- Multi-language support (Spanish, English, French, etc.)
- AI-powered information extraction
- Editable extracted data
- Sample conversation loader
- Confidence scoring

**Files:**
- `app/whatsapp-parser/page.tsx`
- `app/api/ai/parse-whatsapp/route.ts`

**AI Model:** Claude Sonnet 3.5

**Extracted Fields:**
- Client name, email, phone
- Tour requested
- Start date & duration
- Number of adults/children
- Language preference
- Interests & special requests
- Hotel information (if mentioned)
- Budget level

**Sample API Request:**
```typescript
POST /api/ai/parse-whatsapp
{
  "conversation": "Client: Hi, we want to visit Egypt..."
}
```

**Sample Response:**
```json
{
  "success": true,
  "data": {
    "client_name": "John Smith",
    "client_email": "john@example.com",
    "tour_requested": "Cairo & Luxor",
    "start_date": "2025-03-15",
    "duration_days": 7,
    "num_adults": 2,
    "confidence_score": 0.95
  }
}
```

---

### 5.3 AI Itinerary Generator (`/api/ai/generate-itinerary`)

**Purpose:** Create complete day-by-day trip plans.

**Features:**
- Intelligent service selection
- Cost optimization
- Multi-day planning
- Meal inclusion logic
- Transportation routing

**Files:**
- `app/api/ai/generate-itinerary/route.ts`

**AI Model:** Claude Sonnet 3.5

**Input:**
```typescript
{
  client_name: string
  tour_requested: string
  start_date: string
  duration_days: number
  num_adults: number
  num_children: number
  language: string
  interests: string[]
  budget_level: string
}
```

**Output:**
- Complete itinerary saved to database
- Itinerary ID returned
- Services linked to each day
- Total cost calculated

---

### 5.4 Itinerary Management (`/itineraries`)

**Purpose:** View and manage all client quotes.

**Features:**
- List view with filtering
- Status tracking (6 statuses)
- Search functionality
- Quick stats cards
- Bulk operations (future)

**Files:**
- `app/itineraries/page.tsx`
- `app/itineraries/new/page.tsx`
- `app/itineraries/[id]/page.tsx`
- `app/itineraries/[id]/edit/page.tsx`

**Status Flow:**
```
Draft → Sent → Confirmed → Completed
              ↓
           Cancelled
```

---

### 5.5 Tour Database Browser (`/tours`)

**Purpose:** Browse and search available tour packages.

**Features:**
- Grid view with tour cards
- Search by name/destination
- Filter by tier (Budget/Standard/Luxury)
- Filter by category
- Price display
- Detail pages (optional)

**Files:**
- `app/tours/page.tsx`
- `app/tours/tours-browser-page.tsx`
- `app/tours/[code]/page.tsx` (detail page)
- `app/api/tours/browse/route.ts`
- `app/api/tours/[code]/route.ts`

**Sample Tours:**
- Cairo Pyramids (Day Tour)
- Luxor Temples (Day Tour)
- Nile Cruise (4 Nights)
- White Desert Safari (2 Days)
- Alexandria (Day Tour)

---

### 5.6 Analytics Dashboard (`/analytics`)

**Purpose:** Business intelligence and performance tracking.

**Features:**
- Revenue tracking
- Conversion rate calculation
- Quote status breakdown
- Popular tours ranking
- AI-powered insights

**Files:**
- `app/analytics/page.tsx`

**Key Metrics:**
- Total Revenue (confirmed only)
- Conversion Rate (sent → confirmed, excludes cancelled)
- Average Quote Value
- Total Quotes
- Cancellation Rate

**Insights Provided:**
- Performance assessment
- Opportunity identification
- Cancellation analysis

---

### 5.7 PDF Quote Generator

**Purpose:** Generate professional branded PDF quotes.

**Features:**
- Company branding
- Day-by-day breakdown
- Service itemization
- Cost summary
- Terms & conditions
- Multi-page support

**Files:**
- `app/itineraries/[id]/generate-pdf.ts` (client-side)

**Library:** jsPDF

**PDF Sections:**
1. Header with logo
2. Client information
3. Trip overview
4. Daily itinerary
5. Inclusions/Exclusions
6. Cost breakdown
7. Terms & conditions
8. Contact information

---

### 5.8 Sending System

**Purpose:** Deliver quotes to clients via WhatsApp or Email.

**Features:**
- WhatsApp direct link (pre-filled message)
- Email integration (mailto)
- PDF attachment handling
- Status update on send

**Files:**
- `app/itineraries/[id]/page.tsx` (send buttons)

**WhatsApp Integration:**
```javascript
const message = `Hi ${clientName}, here's your Egypt travel quote...`
const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
```

---

## 6. API Routes

### API Structure
```
app/api/
├── itineraries/
│   ├── route.ts                    # GET (list), POST (create)
│   └── [id]/
│       └── route.ts                # GET (single), PUT (update)
├── ai/
│   ├── parse-whatsapp/
│   │   └── route.ts                # POST - Parse conversation
│   └── generate-itinerary/
│       └── route.ts                # POST - Generate trip
└── tours/
    ├── browse/
    │   └── route.ts                # GET - List tours
    └── [code]/
        └── route.ts                # GET - Tour detail
```

### Endpoint Documentation

#### **GET /api/itineraries**
List all itineraries.

**Query Parameters:**
- `status` (optional): Filter by status
- `limit` (optional): Number of results
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "itinerary_code": "EGYPT-2025-001",
      "client_name": "John Smith",
      "trip_name": "Classic Egypt",
      "total_cost": 2450.00,
      "status": "sent"
    }
  ]
}
```

---

#### **POST /api/itineraries**
Create new itinerary.

**Request Body:**
```json
{
  "client_name": "John Smith",
  "client_email": "john@example.com",
  "trip_name": "Classic Egypt - 7 Days",
  "start_date": "2025-03-15",
  "end_date": "2025-03-21",
  "num_adults": 2,
  "currency": "EUR"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "itinerary_code": "EGYPT-2025-001"
  }
}
```

---

#### **POST /api/ai/parse-whatsapp**
Parse WhatsApp conversation.

**Request:**
```json
{
  "conversation": "Full conversation text..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "client_name": "John Smith",
    "client_email": "john@example.com",
    "tour_requested": "Pyramids tour",
    "start_date": "2025-03-15",
    "duration_days": 1,
    "num_adults": 4,
    "confidence_score": 0.92
  }
}
```

---

#### **POST /api/ai/generate-itinerary**
Generate complete itinerary with AI.

**Request:**
```json
{
  "client_name": "John Smith",
  "tour_requested": "Cairo Pyramids",
  "start_date": "2025-03-15",
  "duration_days": 1,
  "num_adults": 4,
  "language": "English"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "itinerary_id": "uuid",
    "itinerary_code": "EGYPT-2025-001"
  }
}
```

---

#### **GET /api/tours/browse**
List all tour variations.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "template_code": "CAIRO-PYRAMIDS",
      "template_name": "Cairo: Pyramids, Sphinx & Museum",
      "destination_name": "Cairo",
      "duration_days": 1,
      "variation_code": "CAIRO-PYRAMIDS-STANDARD-PRIVATE",
      "tier": "standard",
      "group_type": "private",
      "price_from": 85
    }
  ]
}
```

---

## 7. File Structure
```
travel-ops-pro/
├── app/
│   ├── analytics/
│   │   └── page.tsx                    # Analytics dashboard
│   ├── api/
│   │   ├── ai/
│   │   │   ├── generate-itinerary/
│   │   │   │   └── route.ts           # AI itinerary generator
│   │   │   └── parse-whatsapp/
│   │   │       └── route.ts           # AI WhatsApp parser
│   │   ├── itineraries/
│   │   │   ├── [id]/
│   │   │   │   └── route.ts           # Single itinerary CRUD
│   │   │   └── route.ts               # Itineraries list
│   │   └── tours/
│   │       ├── [code]/
│   │       │   └── route.ts           # Tour detail
│   │       └── browse/
│   │           └── route.ts           # Tours list
│   ├── components/
│   │   └── Navigation.tsx              # Main navigation bar
│   ├── dashboard/
│   │   └── page.tsx                    # Main dashboard
│   ├── itineraries/
│   │   ├── [id]/
│   │   │   ├── edit/
│   │   │   │   └── page.tsx           # Edit itinerary
│   │   │   └── page.tsx               # View itinerary
│   │   ├── new/
│   │   │   └── page.tsx               # Create itinerary
│   │   └── page.tsx                    # Itineraries list
│   ├── tours/
│   │   ├── [code]/
│   │   │   └── page.tsx               # Tour detail page
│   │   ├── page.tsx                    # Tours wrapper
│   │   └── tours-browser-page.tsx      # Tours browser component
│   ├── whatsapp-parser/
│   │   └── page.tsx                    # WhatsApp parser
│   ├── favicon.ico
│   ├── globals.css                     # Global styles
│   ├── layout.tsx                      # Root layout
│   ├── page.tsx                        # Home (redirects to dashboard)
│   └── supabase.ts                     # Supabase client
├── public/                             # Static assets
├── .env.local                          # Environment variables
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## 8. Environment Variables

### Required Variables

Create `.env.local` file in project root:
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Anthropic AI Configuration
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional: Email Configuration (if implementing email send)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Optional: WhatsApp Business API (future)
WHATSAPP_API_TOKEN=your-token-here
```

### Getting API Keys

**Supabase:**
1. Go to https://supabase.com
2. Create new project
3. Go to Settings → API
4. Copy Project URL and anon/public key

**Anthropic Claude:**
1. Go to https://console.anthropic.com
2. Create account
3. Go to API Keys
4. Generate new key
5. Copy API key

---

## 9. Installation & Setup

### Prerequisites
- Node.js 18.x or higher
- npm or yarn
- Supabase account
- Anthropic API account

### Step-by-Step Installation

#### 1. Clone Repository
```bash
git clone <repository-url>
cd travel-ops-pro
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Set Up Environment Variables
```bash
cp .env.example .env.local
# Edit .env.local with your keys
```

#### 4. Set Up Database

Run these SQL commands in Supabase SQL Editor:

**A. Create Tables:**
```sql
-- Run database schema from Section 4
-- (All CREATE TABLE statements)
```

**B. Insert Sample Data:**
```sql
-- Run sample data script
-- (See database_seed.sql)
```

#### 5. Run Development Server
```bash
npm run dev
```

Open http://localhost:3000

#### 6. Test the System
1. Visit `/dashboard`
2. Click "Parse WhatsApp"
3. Load sample conversation
4. Analyze with AI
5. Generate itinerary
6. View generated quote
7. Download PDF

---

## 10. Deployment

### Deployment Options

#### Option A: Vercel (Recommended)

**Why Vercel:**
- Built by Next.js creators
- Zero configuration
- Automatic HTTPS
- Edge functions
- Free tier available

**Steps:**
1. Push code to GitHub
2. Go to https://vercel.com
3. Import repository
4. Add environment variables
5. Deploy

**Commands:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod
```

#### Option B: Netlify

**Steps:**
1. Push code to GitHub
2. Go to https://netlify.com
3. New site from Git
4. Add environment variables
5. Deploy

#### Option C: Self-Hosted (VPS)

**Requirements:**
- Ubuntu 22.04 or similar
- Node.js 18+
- Nginx
- SSL certificate

**Steps:**
```bash
# On server
git clone <repo>
cd travel-ops-pro
npm install
npm run build

# Use PM2 for process management
npm install -g pm2
pm2 start npm --name "travel-ops" -- start
pm2 save
pm2 startup
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 11. Testing Guide

### Manual Testing Checklist

#### Dashboard Tests
- [ ] Dashboard loads correctly
- [ ] Stats show accurate numbers
- [ ] Quick actions work
- [ ] Recent activity displays
- [ ] Navigation links work

#### WhatsApp Parser Tests
- [ ] Can paste conversation
- [ ] Sample loads correctly
- [ ] AI extraction works
- [ ] Can edit extracted data
- [ ] Generate button works
- [ ] Multi-language support

#### Itinerary Management Tests
- [ ] List displays all itineraries
- [ ] Search works
- [ ] Status filter works
- [ ] Can create new itinerary
- [ ] Can edit itinerary
- [ ] Can view itinerary details
- [ ] Status changes update

#### Tours Browser Tests
- [ ] All tours display
- [ ] Search filters work
- [ ] Tier filter works
- [ ] Category filter works
- [ ] Detail pages load
- [ ] Pricing displays correctly

#### PDF Generation Tests
- [ ] PDF generates without errors
- [ ] All sections present
- [ ] Branding correct
- [ ] Formatting clean
- [ ] Download works

#### Analytics Tests
- [ ] Revenue calculates correctly
- [ ] Conversion rate accurate
- [ ] Charts display
- [ ] Popular tours show
- [ ] Insights display

### Test Data

**Sample Client:**
- Name: John Smith
- Email: john@example.com
- Phone: +1-555-0123

**Sample Conversation:**
```
Client: Hi, we want to visit Egypt next month
Agent: Great! How many people?
Client: 4 adults
Agent: When exactly?
Client: March 15-22
Client: We want to see pyramids and Luxor
```

**Expected Result:**
- Duration: 8 days
- Adults: 4
- Start: March 15, 2025
- Interests: Pyramids, Luxor

---

## 12. Maintenance & Updates

### Regular Maintenance Tasks

#### Daily
- Monitor error logs
- Check API usage (Anthropic credits)
- Review new quotes

#### Weekly
- Database backup
- Performance review
- User feedback review

#### Monthly
- Update dependencies
- Security patches
- Feature review
- Analytics review

### Backup Strategy

**Database Backups:**
```sql
-- Supabase has automatic backups
-- Manual backup via SQL:
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql
```

**Code Backups:**
- Git repository (primary)
- GitHub/GitLab (remote)
- Local backups

### Update Process
```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Update Next.js
npm install next@latest react@latest react-dom@latest

# Update Supabase
npm install @supabase/supabase-js@latest

# Test after updates
npm run dev
# Run manual tests

# Deploy
git commit -m "Update dependencies"
git push
```

---

## 13. Known Issues & Future Enhancements

### Known Issues

1. **PDF Generation Performance**
   - Large itineraries (10+ days) take 2-3 seconds
   - Solution: Move to server-side generation

2. **AI Response Time**
   - Claude API can take 5-10 seconds for complex itineraries
   - Solution: Add loading states, consider caching

3. **Mobile Responsiveness**
   - Some tables need horizontal scroll on mobile
   - Solution: Consider mobile-first redesign

### Planned Enhancements

#### Short Term (1-2 months)
- [ ] Email sending integration
- [ ] WhatsApp Business API integration
- [ ] Client portal (view quotes online)
- [ ] Payment integration
- [ ] Booking confirmation system

#### Medium Term (3-6 months)
- [ ] Multi-user support (agents, managers)
- [ ] Role-based permissions
- [ ] Advanced analytics (cohort analysis)
- [ ] Automated follow-ups
- [ ] CRM integration
- [ ] Calendar integration

#### Long Term (6-12 months)
- [ ] Mobile app (React Native)
- [ ] AI chatbot for clients
- [ ] Inventory management
- [ ] Supplier management
- [ ] Multi-language UI
- [ ] White-label solution

### Feature Requests

**From Users:**
1. Duplicate itinerary function
2. Bulk email sending
3. Client history view
4. Quote comparison
5. Template library

---

## 14. Support & Documentation

### Internal Documentation

**Location:** `/docs` folder (to be created)

**Recommended Docs:**
- User Manual (for staff)
- API Documentation
- Database Schema Diagram
- Workflow Diagrams
- Training Videos

### External Resources

**Next.js:**
- Docs: https://nextjs.org/docs
- Learn: https://nextjs.org/learn

**Supabase:**
- Docs: https://supabase.com/docs
- Dashboard: https://app.supabase.com

**Anthropic Claude:**
- Docs: https://docs.anthropic.com
- Console: https://console.anthropic.com

**Tailwind CSS:**
- Docs: https://tailwindcss.com/docs

### Getting Help

**Technical Issues:**
1. Check error logs
2. Review documentation
3. Search GitHub issues
4. Contact developer

**Business Logic:**
1. Review user manual
2. Watch training videos
3. Contact support

### Contact Information

**Developer:** Islam Mohamed  
**Email:** [your-email]  
**Phone:** [your-phone]  
**GitHub:** [your-github]

---

## 15. Quick Reference

### Common Commands
```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run start           # Start production server
npm run lint            # Run linter

# Database
psql -h db.xxx.supabase.co -U postgres  # Connect to DB

# Deployment
vercel                  # Deploy to Vercel
git push                # Deploy (if auto-deploy enabled)
```

### Common URLs
```
Development:     http://localhost:3000
Dashboard:       /dashboard
Parse:           /whatsapp-parser
Quotes:          /itineraries
Tours:           /tours
Analytics:       /analytics
```

### Important File Locations
```
Environment:     .env.local
Config:          next.config.js
Styles:          app/globals.css
Supabase:        app/supabase.ts
Navigation:      app/components/Navigation.tsx
```

### Database Connection
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
```

### AI API Usage
```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    messages: [{ role: 'user', content: 'Your prompt' }]
  })
})
```

---

## 16. Performance Metrics

### Current System Performance

**Speed:**
- Dashboard load: < 1 second
- AI parsing: 3-8 seconds
- AI generation: 5-15 seconds
- PDF generation: 1-3 seconds
- Database queries: < 100ms

**Scalability:**
- Concurrent users: 50+ (current)
- Quotes per day: Unlimited
- Database size: Unlimited (Supabase)
- API rate limits: 1000 requests/min (Anthropic)

**Cost per Quote:**
- AI API: €0.04
- Database: €0.00 (free tier)
- Hosting: €0.00 (free tier)
- Total: **€0.04 per quote**

**Time Savings:**
- Traditional: 30-45 minutes per quote
- With system: 2-3 minutes per quote
- **Savings: 93% faster**

---

## 17. Security Considerations

### Current Security Measures

1. **Environment Variables**
   - API keys in .env.local (not committed)
   - Server-side only variables

2. **Database Security**
   - Supabase Row Level Security (RLS)
   - API keys not exposed to client

3. **API Protection**
   - Server-side API calls only
   - No client-side API key exposure

4. **Input Validation**
   - Form validation
   - SQL injection prevention (Supabase)

### Recommended Additional Security

1. **Authentication**
   - Add user login system
   - Use Supabase Auth
   - Role-based access control

2. **Rate Limiting**
   - Implement API rate limits
   - Prevent abuse

3. **Data Encryption**
   - Enable database encryption
   - Use HTTPS only

4. **Audit Logging**
   - Log all quote changes
   - Track user actions

---

## 18. Troubleshooting

### Common Issues & Solutions

#### Issue: "Module not found"
**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

#### Issue: "Supabase connection failed"
**Solution:**
1. Check .env.local has correct URL
2. Verify anon key is correct
3. Test connection in Supabase dashboard

#### Issue: "AI API error"
**Solution:**
1. Verify Anthropic API key
2. Check API credits balance
3. Review request format

#### Issue: "PDF not generating"
**Solution:**
1. Check jsPDF installed
2. Verify browser compatibility
3. Check console for errors

#### Issue: "Navigation not showing"
**Solution:**
1. Verify Navigation.tsx exists
2. Check import path
3. Clear browser cache

---

## 19. Changelog

### 2026-08-23 (session 5) — Margin as a company fact; the notification system was hollow; rate-change alerts; the crons never ran

Six PRs (#157–#161, #163), merged, deployed, proven on production; handover #162. Four migrations applied
(`20260823_org_default_margin`, `20260823_notifications_by_user`,
`20260823_rate_change_digest`, `20260823_cron_locks`).

- ✅ **Margin is an org default, like the currencies** (#157). It was a per-user
  preference with a hard-coded 25 behind it, so two offices could quote the same trip at
  different margins and a new colleague quoted at a constant in a file. Now
  `organizations.default_margin_percent` (NULL = not configured, CHECK 0–100, backfilled
  by member vote, ties to the owner) sits under every user: resolution is **request →
  user preference → org default → 25**, everywhere — B2B calculate-price and
  quote-from-itinerary (partner override still on top), B2C quotes, template auto-price,
  pricing-grid save, the user-preferences API (whose PUT had turned a real 0 into 25)
  and AI generation. One resolver, `lib/org-default-margin.ts`. Company Profile gains
  *Default margin (%)* (EN/JA). The backfill exposed the drift it exists to catch: A.T.S
  owner = 30, the two admins and the agent = 25, so the org default became 25 by
  majority — **the operator should set the real company margin on Company Profile.**
- ✅ **"When a rate changes, owners & managers get a notification."** Investigating it
  found the in-app notification system had **never delivered a row in production**
  (`notifications` = 0 rows, ever): rows were addressed to `team_members` — the old
  WhatsApp-inbox roster (7 rows, 1 active, 1 linked to a login) that nothing creates for
  a colleague; the bell and `/notifications` listed *every* row to *every* viewer; and
  `notifyOrgManagers` filtered `team_members` by an `org_id` column that table never had
  (query errored, error swallowed — the portal change-request alert from #133 never
  fired).
  - #158 + #159: `notifications.user_id` (→ auth.users) is the address; roster entries
    linked to logins by e-mail (3 of A.T.S's 7 now linked — the owner's roster row uses
    info@travel2egypt.org, not the login e-mail; change it in Team to link); legacy rows
    follow their link; CHECK that a row has an address. GET / mark-read / delete /
    mark-all-read scoped to the signed-in user (`lib/notifications-scope.ts`); foreign
    rows → 404. `notifyOrgManagers` reads `organization_members` (owner/admin/manager),
    excludes the actor. **Gotcha fixed in #159:** PostgREST rejected the `or=(user_id…)`
    scope on PATCH/DELETE (42703) while accepting it on GET — mutations now target ids
    resolved by a scoped SELECT. Prod-proven 6/6.
  - #160: **rate-change digest** — `/api/cron/rate-change-digest` reads the
    trigger-written `rate_audit_log` since its watermark (`cron_watermarks`), groups by
    **editor × table**, and tells each org's owners/admins/managers **once per group**;
    the editor is not told about their own change; a 79-row import is one notice
    (「料金変更: 入場料 79件 — Rate change: 79 entrance fees」 + first three changes + link
    to the rates page). Reads the audit log, so imports and SQL-editor edits count too.
    Company Profile → *Rate-change alerts*: in the app / + e-mail / off
    (`organizations.rate_change_alerts`). **Attribution:** `changed_by` was NULL on all
    597 audit rows (service-role writes). `lib/supabase-actor.ts` sends the
    middleware-verified user as an `x-tops-actor` header; PostgREST exposes request
    headers to SQL and `fn_rate_audit_actor()` reads it when `auth.uid()` is NULL (garbage
    → NULL, never an aborted write; a real `auth.uid()` wins). 22 rate routes +
    `lib/supabase-server` use it. Prod-proven 8/8: create/update/delete via the API → all
    three audit rows name the editor; one digest run → each A.T.S manager got exactly one
    notice, editor none, no e-mail, watermark advanced.
- ✅ **The scheduled jobs never ran** (#161). Railway's only cron key is
  `deploy.cronSchedule`, which runs a *service's start command* on a schedule (a separate
  cron service); it does not read `[[cron]]` tables, and the project has one service. So
  the nightly `process-agent-memory` (02:00) and `data-invariants` (03:15) entries in
  `railway.toml` had **never fired** — proven: the digest watermark did not move across
  the 23:00 UTC slot. `instrumentation.ts` now arms an in-process scheduler
  (`lib/cron/scheduler.ts`: minute tick, 5-field cron matcher, a `cron_locks` claim per
  job × slot so two containers never double-run, handlers invoked in-process with the
  `CRON_SECRET` bearer). Guard: only with `RAILWAY_SERVICE_NAME` or `CRON_IN_PROCESS=true`
  (dev/CI never run jobs against the shared DB). The registry in `scheduler.ts` is the
  single source of truth; `railway.toml` keeps a pointer. **This makes the two nightly
  jobs run for the first time** — `data-invariants` e-mails `BUSINESS_EMAIL` when it finds
  problems. **Self-run proof:** the container logged `[cron] in-process scheduler armed`
  at 23:00:42 UTC; at 23:15:01 it claimed slot 23:15:00 in `cron_locks` and the digest
  watermark advanced — nobody triggered it. Before #161 the watermark had sat still
  across the 23:00 slot.

**Lessons**
- A "notify X" feature is only as real as its address. Anything keyed to the legacy
  `team_members` roster reaches nobody; address logins (`user_id`) and take recipients
  from `organization_members`.
- Never put `.or()` on a PostgREST mutation; resolve ids with a SELECT and mutate by id.
  Batch inserts need identical keys per row (PGRST102).
- Never trust a config file for scheduling. Prove a schedule by watching a DB row
  (`cron_locks`, `cron_watermarks`) advance **without** a manual trigger. New scheduled
  jobs go in `CRON_JOBS`, not in `railway.toml`.
- `timeout` does not exist on macOS (the grep silently never ran); `railway logs` streams
  and never returns — use the DB, not the logs, as the proof.

**Settings decided and applied the same day (operator's decisions, applied by the agent
through the service key against the same columns the Company Profile / Team forms write)**
- **Company margin = 30** (`organizations.default_margin_percent`). The three other
  members' personal margins (two admins, one agent — each an explicit 25) were
  **cleared** so they inherit the company's 30; the owner keeps their own 30. This
  exposed #163: the user-preferences GET folded the company margin in only for users
  with *no* preferences row, so a cleared row came back `null`, Settings showed 25 and a
  save would have re-pinned 25 — fixed and prod-proven (cleared user under a 33 org →
  GET returns 33).
- **Rate-change alerts = in-app + e-mail** (`organizations.rate_change_alerts =
  'in_app_email'`). E-mails go to the managers' profile addresses (owner +
  two admins), minus whoever made the change; the in-app notice stands even if a mail
  bounces.
- **Owner's roster row linked to the login**: `team_members` "Islam Mohamed" re-pointed
  from info@travel2egypt.org to travel2egypt69@gmail.com and `user_id` set to the org
  owner, so task/trip assignments reach the owner's bell. 4 of 7 roster rows are now
  linked; Manal, Hind Galal and Sayed Adly have no login to link to. Note: the Team
  page's edit form changes the e-mail only and never sets `user_id` — a future e-mail
  change from the UI needs the link made separately.
- **Both nightly jobs stay on** (`process-agent-memory` 02:00 UTC, `data-invariants`
  03:15 UTC); their first real runs are the night of 2026-08-23.

### 2026-08-22 (session 4) — No euro assumption left anywhere

Two PRs (#152, #153), merged, deployed, proven on production. No migration.

- ✅ **The hotel and cruise rate forms name their currency** (#152). After the USD cut-over
  the operator opened the hotel form and saw "EU passport holders" with no currency
  anywhere — which reads as "EUR". Season blocks now read "Low / High / Peak Season Rates
  (USD)"; the price tiers are worded as what they are — "Travellers holding an EU
  passport" / "Travellers without an EU passport (Japanese and all others)" — and the
  two single-column list headers that shared the tier label read "Rate (USD)". EN + JA.
- ✅ **The billing side** (#153): ~130 literal `€` across reports, payables, receivables,
  payments, invoices, analytics, calendar, the client timeline, quote PDFs, B2B pricing
  notes, WhatsApp messages, vouchers and the pricing-grid AI catalogue. Each amount now
  carries the right currency by one of three rules: **its record's own** (invoice,
  payment, expense, trip, quote, supplier document, voucher → `formatMoney(amount,
  record.currency)`); **the company's billing currency** for reporting figures (financial
  reports — the API already converted into one reporting currency but the page
  defaulted it to EUR, it now asks for the org's; analytics; calendar revenue); **the
  org's rate currency** for rate amounts quoted in text (B2B pricing notes, "from $X"
  service summaries, tour export PDF, the catalogue the pricing-grid AI reads). Tiles
  that summed across currencies (accounts payable API + page, calendar revenue) now keep
  per-currency totals, as receivables and payments already did; the AP aging bar shows
  shares by magnitude, never a summed amount.
- ✅ Found in passing: the payments page's CSV export called `toLocaleString()` on
  per-currency totals and would have written "[object Object]". Fixed.
- ✅ **Guard widened to the whole app** (`__tests__/lib/no-hardcoded-rate-currency.test.ts`):
  no `€` in front of an amount and no conversion from a literal `'EUR'` anywhere in
  `app/`, `components/`, `lib/templates`, the WhatsApp sender and the template
  placeholders. Exempt on purpose: currency pickers, symbol tables, the supplier-invoice
  parser (which legitimately recognises euro symbols), engine debug logs.

**Lessons**
- "EU" reads as "EUR" to this operator. Put the currency on every block of amounts and
  spell passport tiers out as travellers, never as a two-letter code.
- A converted figure renders in the **user's** display currency; when proving "no €",
  set the user's preference as well as the org's setting, and match CSS-uppercased
  headers case-insensitively.
- Sweep scripts: character classes must admit digits (`days60`) and dotted paths; never
  insert an import inside a multi-line `import {` block or a hook inside `function X({`
  prop destructuring.

### 2026-08-22 (session 3) — The rate currency is a setting; A.T.S's rates are now USD

Three PRs (#148, #149, #150), all merged, deployed and proven on production; one
migration applied; one data cut-over executed (fully audited, reversible).

**The money model (operator, 2026-08-22):** A.T.S buys hotels and Nile cruises in USD,
buys transport/tips/meals/assistants in EGP but enters them as USD equivalents, and
**bills in JPY**. They sell to Japanese clients only.

**Why this was not a rename.** "EUR" meant three different things: (A) the
`_eur` / `_non_eur` column PAIRS are **EU-passport / non-EU-passport price tiers**,
not currencies (~120 of 140 EUR-named columns); (B) the engine's base currency —
rate tables hold plain numbers and the engine stamped `'EUR'` on every result;
(C) presentation, which already converted per user preference. Renaming 140 columns
would have changed nothing about (A) and (C). Instead:

- ✅ **`organizations.rate_currency`** (#148, `20260822_org_rate_currency.sql`; default
  `EUR`, A.T.S → `USD`, editable on the Company Profile card) — "what my supplier rates
  are in", distinct from `default_currency` ("what I bill in"). The engine labels every
  result with it; service creation (land **and** cruise — the cruise path had been writing
  rate-currency numbers under the trip's currency label with `exchange_rate_used: 1`)
  converts rate currency → trip currency; B2B calculate-price and quote-from-itinerary
  follow it. **The rule "a Euro-passport traveller forces the trip currency to EUR" is
  gone** — billing currency is the org's/user's choice; passport selects the tier only.
- ✅ **Every rate-side screen** (#149): `useCurrency()` exposes `rateCurrency` /
  `rateSymbol`; 17 display sites convert from the setting instead of a literal `'EUR'`;
  ~110 hard-coded `€` replaced; passport tiers relabelled "EU passport / non-EU passport"
  everywhere (22 i18n keys EN+JA); CSV templates say "(EU passport) / (non-EU passport)"
  (import matches on column *name*, old files still load). Guard test
  `no-hardcoded-rate-currency.test.ts` keeps the euro from creeping back on the rate side.
  The billing side (invoices, payments, reports) formats with each record's own currency
  and was deliberately not touched.
- ✅ **Cut-over** (#150, `scripts/convert-rate-currency.mjs`): every non-null, non-zero
  amount in every rate table multiplied by **1.16819** (that day's EUR→USD; the rates had
  been typed Nov 2025 – Jun 2026 and FX history only begins 11 Aug 2026, so a
  "rate-when-typed" option did not exist). **281 rows, 1,137 amounts, Σ 180,756.76 →
  211,158.19.** Each change is in `rate_audit_log` with `full_old_record` /
  `full_new_record` and `notes = "EUR→USD cut-over 2026-08-22 (factor 1.16819, today's
  EUR→USD)"` — the trigger covers 13 rate tables; the tool writes the identical row for
  the five it does not (hotel_contacts, restaurant_contacts, service_fees,
  b2b_pricing_rules, fixed_daily_costs). Verified: sampled cells moved by exactly the
  factor, 0 of 281 rows deviate, the live engine prices a template in USD. Trip snapshots
  (`itinerary_services`, `itinerary_resources`) were never touched.
  **To reverse:** `node scripts/convert-rate-currency.mjs --factor 0.85602513 --apply --note "revert cut-over"`.
  **Note:** rate tables are global (no `org_id`), so the E2E org now sees USD figures under
  EUR labels — harmless for the smoke suite, which uses its own fixtures.

**Lessons**
- Before touching a "rename X to Y" request, find out how many meanings X has. Here one
  of three was a passport tier that had nothing to do with currency.
- A converted figure displays in the **user's** preference currency, so "€0.00" inside a
  form on a USD org is correct when the user prefers EUR. Proofs that assert "no €" must
  set both the org's rate currency and the user's display currency.
- Sweep scripts: never insert an import inside a multi-line `import {` block, nor a hook
  line inside `function X({` prop destructuring — both compile-looking, both wrong.

### 2026-08-22 (session 2) — Suppliers simplified, commissions modelled, and four production-only defects found by probing

10 PRs (#137–#146), all merged to `main`, deployed to production via Railway, and each
proven live against production on throwaway data (created and deleted in the same run).
Four migrations applied. Started from a full check of everything shipped 08-18 → 08-22.

**The check that opened the session**
- ✅ Every PR #89–#135 confirmed merged, CI-green, and serving on prod; 25 of 26 migration
  artefacts present. The one missing — `organizations.default_currency`
  (`20260820_org_default_currency.sql`) — had left **`GET /api/organization/branding`
  answering 500 since 08-20** (the Company Profile card could neither load nor save).
  Applied by the operator; A.T.S backfilled to JPY, E2E org to EUR.

**Health probe (#137)**
- ✅ `/api/health/system` classified every refused anon read as an *error* (supabase-js's
  head-count path returns `{message:''}` on 42501), so 168 clean denials showed as 168
  blank probe errors and a real failure could hide among them. Probe is now a raw GET
  that keeps the SQLSTATE; `deniedCount: 168, probeErrors: []` on prod, and the E2E test
  asserts `probeErrors` is empty **and** `deniedCount > 0`.

**Suppliers and commissions (operator decisions)**
- ✅ **Supplier form = contact + location only (#138).** Name, roles, status, contact
  person, email, phone, WhatsApp, website, city, address, notes — the same for every
  role. Nine per-role extras removed (vehicle types, routes, ship name, cabin count,
  star rating, property type, cuisine, capacity, languages, daily rate), plus the unused
  company→property hierarchy (0 of 96 suppliers linked). The assistants' "Daily Rate"
  had been in *neither* API whitelist — shown, never saved. `lib/suppliers/fields.ts` is
  the one vocabulary shared by the form and both API routes. Retired columns keep their
  data; no migration.
- ✅ Details moved to the rates area: guide **languages** edited on Guide Rates
  (`GuideLanguagesEditor`, shown when a guide is selected); new **Rates › Commissions**
  page (direction + rate per supplier); vehicle types on the resources view derived
  from the supplier's rate rows.
- ✅ **Two commission directions (#140).** *We receive* = rate × the supplier's price
  (shops). *We pay* = rate × **our profit** on the service (client price − supplier
  cost), e.g. a guide who sold an optional tour; no commission on a loss
  (`no_profit`, `no_client_price` skips). Before this the generator computed every
  commission off supplier cost regardless of direction. `cost_amount` now written on
  every row.
- ✅ **"Sold by" (#141).** `itinerary_services.sold_by_supplier_id` names the guide who
  sold a third party's tour; a second, payable commission to the seller at the seller's
  rate × the same profit, category `optional_tour`. Editor has a "🧭 Sold by" picker per
  service row. Migration `20260822_service_sold_by.sql` (PGlite-tested) — it is the
  **second FK from itinerary_services to suppliers**, so every embed must name its
  column (`suppliers!supplier_id`); a source-scanning test now enforces that.
- ✅ **Sleeping-train cabins are Single and Half Twin only (#146)** — one vocabulary in
  `lib/rates/sleeping-train-cabins.ts`, enforced by the form, filter, both API routes
  (400 + normaliser) and the CSV importer. Column has no CHECK; table had 0 rows.

**Production-only defects found by probing, and fixed**
- ✅ `/api/itineraries/[id]/days/[dayId]/services/[serviceId]` GET/PUT/DELETE filtered
  on `day_id` — a column that does not exist — so they **400'd on every call since
  written** (#142). The client force-delete cascade had the same column, never checked
  its errors, and reported success while leaving every trip's days and services behind.
  Service route now checks the full chain itinerary ∈ org → day ∈ itinerary → service
  ∈ day. Guard test: no query may filter itinerary services on `day_id`.
- ✅ **Every trip created from a client's page arrived unlinked.** `INSERT` into
  `itineraries` returned `client_id: null` under every role; `UPDATE` kept it. Cause:
  `auto_link_client_trigger`, a `BEFORE INSERT` trigger **present only in production**
  (in no migration, sibling migration, or historical `.sql`) whose
  `SELECT … INTO NEW.client_id` assigns NULL on no match — overwriting the client the
  app had set. Identified from the operator's `pg_trigger` output after this machine's
  introspection options were exhausted. App-side safeguard first (#143: re-assert by
  UPDATE at all five insert sites, a no-op on a healthy DB), then the root cause
  (#144, `20260822_itineraries_client_triggers.sql`): never overwrite a given
  `client_id`, fill a missing one only on an unambiguous email/name match. **All five
  unversioned `itineraries` triggers are now in the repo**; the two duplicate
  status-upgrade triggers folded into one.
- ✅ **Client booking count = confirmed trips (#145,
  `20260822_client_booking_stats_confirmed.sql`).** The stats columns had two writers —
  the 08-21 invoice-based recompute and a prod-only `+1`-per-insert trigger that counted
  drafts and never decremented. Now one writer: `total_bookings_count` = trips with
  status confirmed/completed, **recomputed** on insert, status/client change and delete;
  revenue stays invoice-based; the `+1` trigger is dropped; all clients backfilled.
- ✅ Dead roster links (#139, with the other session): `/guides`, `/guides/new`,
  `/hotels`, `/hotel-staff`, `/follow-ups`, `/b2b` repointed; a guard test scans every
  static `href` (incl. ternary branches) against `app/**/page.tsx`.

**Migrations applied to production this session** (all PGlite-tested first, all verified
live): `20260820_org_default_currency`; `20260822_service_sold_by`;
`20260822_itineraries_client_triggers`; `20260822_client_booking_stats_confirmed`.

**Lessons**
- A green CI and a matching `/api/version` SHA still do not prove the running route
  code — but a *behavioural* read-only signal does (new i18n text in a page payload, a
  new 409 from a delete guard). Use those before suspecting a stale build.
- A proof script can be the bug: a string-replace that padded bulk-insert rows also
  matched *inside* `sold_by_supplier_id: …`, creating a duplicate key whose later
  `null` won. Check replace counts against expectations before trusting a FAIL.
- The PostgREST API exposes only `public`/`graphql_public`, `pg_graphql` is off and no
  RPC runs dynamic SQL: **triggers, rules and function bodies can only be read by the
  operator in the SQL editor.** When behaviour is unexplained by any `.sql` in the repo,
  ask for `pg_trigger` output early.
- Production carried objects no migration defined (five triggers on `itineraries`).
  Anything found there goes into a versioned, PGlite-tested migration the same day.

### 2026-08-22 — Security hardening, rates/supplier fixes, and the multi-traveller portal

20 PRs (#116–#135), all merged to `main` and deployed to production (autoura.net via
Railway), each verified live against production on throwaway data.

**CI**
- ✅ `next build` now runs on every PR (#116). Tests + `tsc` were green while a
  production-only failure (a client `useSearchParams()` without Suspense) broke a
  deploy; the build step catches that class at PR time. NOTE: `next build` does NOT
  type-check here (`next.config.ts` has `ignoreBuildErrors: true`), so the separate
  `tsc --noEmit` job is load-bearing — keep both.

**Security (the audit `next build` flushed out)**
- ✅ Views were bypassing RLS — `guides`/`airport_staff`/`itineraries_with_languages`/
  `tour_templates_with_languages`/`client_summary` were anon-readable (#117). Cause:
  `CREATE OR REPLACE VIEW` drops `security_invoker`. Guard test replays the migration
  timeline; any view left at definer rights fails CI.
- ✅ Full-surface lockdown (#118): of 171 PostgREST resources, 47 served real rows to
  the anon key (whatsapp_messages, contacts, cost structure, content library…).
  Schema-wide `REVOKE … FROM anon` + RLS + `security_invoker` + `ALTER DEFAULT
  PRIVILEGES` so new tables are born locked. `/api/health/system` rewritten
  deny-by-default (enumerates the surface, fails on any anon-visible row).
- ✅ Repointed 3 dead assignment FKs to `suppliers` and retired the `_deprecated_*`
  rosters (#119) — guide/airport/hotel-assistant assignment had been impossible.
- ✅ Service-role client fails loudly instead of silently degrading to the anon key
  (#120); OAuth `state` refuses an empty signing key (#121).

**Rates & suppliers**
- ✅ "Not priced" vs "no rate" (#122): staff `rate_eur` nullable; forms no longer save
  €0. ✅ Editing a supplier-less rate 500'd — PUT passed `supplier_id: ''` to a uuid
  column (#123). ✅ `updated_at` now actually updates via a trigger on every table with
  the column (#124). ✅ Hotel assistance now prices from the full-service row — it had
  NEVER priced (#125). ✅ Supplier bulk delete with a reference guard (#127). ✅
  Creating a supplier 500'd — the multi-type CHECK's own `types` column was stripped by
  the field whitelist (#128). ✅ Pagination "page" label no longer clipped (#129).

**UX**
- ✅ Every `window.confirm` (32 across 24 files) replaced with the app's centred dialog
  (#126 rates, #130 the rest) via a `useConfirm()` adapter.

**Multi-traveller portal (the feature)** — friends each fill their own passport/medical
data privately; families keep the one-link flow. All prod-verified.
- ✅ Phase 1 (#131): per-traveller private links, gated on each person's name + DOB,
  read/write scoped to their own row. `booking_portal_links.passenger_id`, booking
  `portal_mode`.
- ✅ Phase 2 (#132): operator coordinator on the booking page — roster, send/resend/
  copy/revoke, "N of M submitted". `booking_portal_links.last_sent_at`.
- ✅ Phase 3 (#133): re-price guard — adding beyond booked count is an operator-approved
  change request, never silent. `booking_change_requests`.
- ✅ Lead coordinator inside the portal (#134): the lead runs the party from their own
  link; gated to the lead's link on a friends booking; sees no passport/medical.
  Shared `lib/portal-links.ts` so operator + lead surfaces can't drift.
- ✅ Auto-reprice on approve (#135): extends the customer's AGREED per-person rate
  (`newTotal = oldTotal/oldPax × newPax`), preserves payments, falls back to manual when
  there's no priced base. Deliberately NOT an engine re-run — the booking total is a
  negotiated quote price and passport type isn't stored on bookings.

**Migrations applied to production this session** (all verified live): view
`security_invoker`; schema-wide anon lockdown; deprecated-roster retirement + FK
repoint; staff-rate nullability; `updated_at` triggers (schema-wide); portal
`passenger_id` + `bookings.portal_mode`; portal `last_sent_at`; `booking_change_requests`.

**⚠️ Operational lesson — Railway can serve a STALE build behind a fresh SHA.** After
merging #132, `/api/version` reported the new SHA and `railway deployment list` showed it
SUCCESS+active, but the container ran the PREVIOUS commit's compiled app (reused
`next build` cache layer). Green CI + a matching `/api/version` SHA is NOT proof the
running code matches. To confirm: PUT a field only the new code writes and read it back;
if it doesn't persist, the deploy is stale. Fix: `railway up -c` from clean `main` forces
a fresh CLI-upload build (its deploy shows commitHash `(cli-upload)`, not the git SHA);
an empty retrigger commit does NOT rebuild (zero-diff).

**Tooling note:** migrations with procedural logic (DO blocks, triggers, schema walks)
are now executed in PGlite (Postgres-in-WASM) before hand-off, since there is no local
Postgres on the build machine.


### Version 1.0.0 (November 12, 2025)

**Initial Release**

**Features:**
- ✅ AI WhatsApp Parser
- ✅ AI Itinerary Generator
- ✅ PDF Quote Generator
- ✅ Itinerary Management (CRUD)
- ✅ Tour Database (10 sample tours)
- ✅ Tours Browser with search/filter
- ✅ Dashboard with analytics
- ✅ Analytics page
- ✅ Navigation system
- ✅ Status tracking (6 statuses)
- ✅ WhatsApp/Email sending

**Database:**
- 10 tables created
- Sample data populated
- Indexes optimized

**UI/UX:**
- Responsive design
- Professional branding
- Consistent navigation
- Intuitive workflows

---

## 20. License & Credits

### Technology Credits

**Built With:**
- Next.js by Vercel
- Supabase
- Anthropic Claude AI
- Tailwind CSS
- jsPDF

### License

[Your License Here]

---

## 21. Final Notes

### System Strengths
✅ Fast & efficient  
✅ AI-powered automation  
✅ Professional output  
✅ Scalable architecture  
✅ Cost-effective  
✅ User-friendly  

### Areas for Growth
🔄 Authentication system  
🔄 Multi-user support  
🔄 Advanced analytics  
🔄 Mobile optimization  
🔄 Email automation  
🔄 Payment integration  

### Success Metrics
- **95% time reduction** in quote generation
- **€0.04 cost** per quote
- **Unlimited scalability**
- **Professional quality** output

---

## Contact & Support

**Primary Developer:** Islam Mohamed  
**Project Started:** October 2025  
**Version:** 1.0.0  
**Last Updated:** August 23, 2026 (session 5)

---

**End of Handover Document**

---

*This document should be reviewed and updated regularly as the system evolves.*

