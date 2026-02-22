# Autoura - User Guide

Welcome to Autoura, your all-in-one travel operations platform. This guide walks you through every feature so you can manage clients, build itineraries, send invoices, and run your travel business from one place.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Dashboard](#dashboard)
- [Clients](#clients)
- [Itineraries (Quotes)](#itineraries-quotes)
- [Bookings](#bookings)
- [Invoices](#invoices)
- [Payments](#payments)
- [Expenses](#expenses)
- [Commissions](#commissions)
- [Tasks](#tasks)
- [WhatsApp Inbox](#whatsapp-inbox)
- [WhatsApp Parser (AI)](#whatsapp-parser-ai)
- [Email Inbox](#email-inbox)
- [Tour Templates](#tour-templates)
- [Rates Management](#rates-management)
- [Resources](#resources)
- [Documents](#documents)
- [Financial Reports](#financial-reports)
- [B2B Partners](#b2b-partners)
- [Content Library](#content-library)
- [Team Members](#team-members)
- [Settings](#settings)
- [Multilingual Support](#multilingual-support)
- [Common Workflows](#common-workflows)
- [Tips & Shortcuts](#tips--shortcuts)

---

## Getting Started

### Logging In

1. Go to your Autoura URL (e.g., `https://autoura.net`)
2. Enter your email and password
3. Click **Sign In**

You can also sign in with your Google account by clicking the Google button.

### First-Time Setup

If you received an invitation email from your team admin:

1. Click the invitation link in the email
2. Set your password
3. You will be taken to the dashboard

### Your Role

Your admin assigns you one of these roles. Each role determines what you can see and do:

| Role | What You Can Do |
|------|-----------------|
| **Admin** | Everything: settings, users, rates, finances, and all operations |
| **Manager** | Rates, team members, financial reports, clients, itineraries, invoices, tours |
| **Agent** | Clients, itineraries, invoices, payments, tasks, inbox, WhatsApp, tours |
| **Viewer** | View-only: dashboard, analytics, calendar, notifications |

---

## Dashboard

The dashboard is your home base. When you log in, you see:

### Quick Stats
Four cards at the top showing:
- **Total Clients** in the system
- **Pending Follow-ups** that need your attention
- **Client Quotes** you have created
- **Upcoming Trips** in the next 30 days

### Quick Actions
Four buttons for the most common tasks:
- **Parse WhatsApp** - Paste a WhatsApp conversation and let AI extract client details and trip requirements
- **New Quote** - Create a new itinerary/quote from scratch
- **Rates Hub** - View and update your pricing
- **B2B Packages** - Browse ready-made tour packages

### Recent Activity
A list of your latest itineraries and actions, so you can quickly pick up where you left off.

### System Status
Small indicators showing whether the AI Parser, B2B Packages, and Email Service are online and working.

---

## Clients

### Viewing Your Clients

Go to **Clients** in the sidebar.

You will see a list of all your clients with their name, email, phone, nationality, total bookings, and total revenue.

**To find a specific client:**
- Type in the **Search** bar (searches name, email, phone, or client code)
- Use the **Filters** to narrow by status, client type, lead source, or VIP status
- **Sort** by name, revenue, number of bookings, or date added

### Adding a New Client

1. Click the **Add New Client** button (top right)
2. Fill in the client details:
   - Name (required)
   - Email
   - Phone number
   - Nationality
   - Passport type (EU or Non-EU - this affects entrance fee pricing)
3. Click **Save**

### Viewing Client Details

Click on any client name to see their full profile. The client page has these tabs:

- **Overview** - All client information, VIP status, total bookings, revenue, tags
- **Communications** - Every email, WhatsApp message, phone call logged with this client
- **Bookings** - All itineraries and bookings linked to this client
- **Notes** - Internal notes visible only to your team (preferences, complaints, important info)
- **Follow-ups** - Tasks and reminders linked to this client

### Quick Actions on a Client

From the client detail page, you can:
- **Add Follow-up** - Create a reminder to call or email the client
- **Add Note** - Write an internal note
- **Log Communication** - Record a phone call, meeting, or other interaction

---

## Itineraries (Quotes)

Itineraries are the heart of Autoura. An itinerary is a day-by-day trip plan with pricing that you send to clients as a quote.

### Viewing Itineraries

Go to **Itineraries** in the sidebar.

At the top, you see status cards showing how many itineraries are in each stage:
- **Draft** - Still being prepared
- **Sent** - Sent to the client
- **Confirmed** - Client accepted
- **Completed** - Trip is over
- **Cancelled** - Client declined

Click any status card to filter the list. Use the search bar to find by client name, trip name, or itinerary code.

### Creating a New Itinerary

1. Click **New Itinerary**
2. Fill in:
   - **Client Name** (required)
   - **Client Email** and **Phone**
   - **Trip Name** (e.g., "6-Day Egypt Private Tour")
   - **Start Date** and **End Date** (total days calculated automatically)
   - **Number of Adults** (default: 2)
   - **Number of Children** ages 4-12 (they get a 50% discount)
   - **Number of Infants** ages 0-3 (free except for flights)
   - **Currency** (EUR by default)
   - **Notes** (optional)
3. Click **Create Itinerary**

You are taken to the itinerary detail page.

### Editing an Itinerary

From the itinerary detail page, click the **Edit** button (pencil icon).

On the edit page you can:

**Add Days:**
- Each day has a **city**, **title** (e.g., "Arrival in Cairo"), and **description**
- Set the **overnight city** (where the client sleeps)

**Add Services to Each Day:**
- Click **Add Service** under any day
- Choose the service type: Hotel, Guide, Transportation, Entrance Fee, Meal, Activity, Tips, Supplies, or other
- Enter the service name, quantity, and rates
- The system calculates costs automatically if you are in **Auto** cost mode

**Cost Modes:**
- **Auto** - The system looks up your rates database and calculates costs automatically
- **Manual** - You enter costs by hand for each service

**Inclusions & Exclusions:**
- Add items that are included in the trip (e.g., "All entrance fees", "Private air-conditioned vehicle")
- Add items that are NOT included (e.g., "International flights", "Travel insurance")

### Viewing an Itinerary

The itinerary detail page shows everything in a clean, organized layout:

- **Client Info** - Name, email, phone
- **Trip Summary** - Dates, total days, number of travelers, total cost
- **Assigned Resources** - Which guide and vehicle are assigned, pickup details
- **Day-by-Day Breakdown** - Click any day to expand and see all services and costs
- **Inclusions & Exclusions** - What is and isn't included
- **Expenses** - Any expenses logged against this itinerary
- **Profit & Loss** - Revenue vs. costs breakdown

### Itinerary Actions

From the detail page, you can:

| Action | What It Does |
|--------|-------------|
| **Download PDF** | Creates a professional PDF document you can share |
| **Send via WhatsApp** | Sends the itinerary to the client on WhatsApp |
| **Send Email** | Emails the itinerary to the client |
| **Generate Invoice** | Creates an invoice from this itinerary |
| **Create Booking** | Converts the confirmed itinerary into a booking |
| **Generate Commissions** | Calculates commissions for all services |
| **Generate Tasks** | Uses AI to create operational tasks from the itinerary |
| **Generate Documents** | Creates contracts and other documents |

### Assigning Resources

On the itinerary detail page, you can assign:
- A **Guide** from your guides database (with language spoken, daily rate)
- A **Vehicle** from your transportation database
- **Pickup location** and **pickup time**

The system checks for scheduling conflicts and warns you if a guide or vehicle is already booked on those dates.

---

## Bookings

When a client confirms an itinerary, you convert it into a booking. Bookings track the operational side: supplier confirmations, payments, and status.

### Viewing Bookings

Go to **Bookings** in the sidebar.

Status cards at the top show:
- **Pending** - Just created, waiting on suppliers
- **Supplier Confirmed** - All suppliers confirmed
- **Payment Received** - Client has paid
- **Ready** - Everything is set for the trip
- **In Progress** - Client is currently traveling
- **Completed** - Trip finished
- **Cancelled**

### Booking Detail Page

Click any booking to see:

**Suppliers Tab:**
Each service (hotel, guide, transport, etc.) has a confirmation status:
- **Pending** - Not yet contacted
- **Requested** - Confirmation requested
- **Confirmed** - Supplier confirmed with a confirmation number
- **Issues** - Problems that need attention
- **Rejected/Cancelled**

Click **Sync from Itinerary** to automatically pull in all services from the linked itinerary.

**Payments Tab:**
View all payments received for this booking and link to the invoice.

**Notes Tab:**
Add internal operational notes.

### Updating Supplier Status

1. Open the booking
2. Go to the **Suppliers** tab
3. Click on a supplier
4. Update the status (e.g., Pending to Confirmed)
5. Enter the **confirmation number** if applicable
6. Add any notes

---

## Invoices

### Viewing Invoices

Go to **Invoices** in the sidebar.

Filter by status: Draft, Sent, Viewed, Partial, Paid, Overdue, Cancelled.

Each invoice shows: invoice number, client name, type, issue date, due date, amount, amount paid, balance due, and status.

### Creating an Invoice

The easiest way to create an invoice is from an itinerary:
1. Open the itinerary
2. Click **Generate Invoice**
3. The invoice is created with all line items from the itinerary

You can also create invoices manually from the Invoices page.

### Invoice Types

- **Standard** - Full amount invoice
- **Deposit** - Partial payment (typically 30%)
- **Final** - Remaining balance after deposit

### Invoice Detail Page

Shows:
- Invoice number and status
- Client information
- Line items with quantities, prices, and totals
- Tax calculation (if applicable)
- Discount (if applicable)
- **Payment Progress Bar** showing how much has been paid
- Payment history with dates, amounts, and methods

### Invoice Actions

| Action | What It Does |
|--------|-------------|
| **Download PDF** | Creates a professional invoice PDF |
| **Send via WhatsApp** | Sends the invoice on WhatsApp |
| **Send Email** | Emails the invoice |
| **Add Payment** | Record a payment received |
| **Send Reminder** | Sends a payment reminder to the client |
| **Create Final Invoice** | If this is a deposit invoice, creates the final balance invoice |

### Recording a Payment

1. Open the invoice
2. Click **Add Payment**
3. Enter:
   - Amount
   - Payment date
   - Payment method (Bank Transfer, Credit Card, Cash, PayPal, Wise, Airwallex, Stripe)
   - Transaction reference (optional)
   - Notes (optional)
4. Click **Save**

The invoice status updates automatically based on payments received.

---

## Payments

Go to **Payments** in the sidebar to see all payments across all invoices in one place.

You can:
- Search by client name or invoice number
- Filter by payment method or date range
- Create a new standalone payment
- View payment details

---

## Expenses

Track every cost associated with running trips.

### Adding an Expense

1. Go to **Expenses** in the sidebar
2. Click **Add Expense**
3. Fill in:
   - **Category** - Guide, Driver, Hotel, Transportation, Entrance Fees, Meals, Airport Staff, Permits, Fuel, Office, Marketing, Software, etc.
   - **Description** of the expense
   - **Amount** and **currency**
   - **Expense date**
   - **Supplier name** (who you paid)
   - **Link to itinerary** (optional - this connects the expense to a specific trip for P&L)
   - **Receipt** (upload or paste URL)
   - **Status** - Pending, Approved, Paid, Rejected
   - **Payment method** - Cash, Bank Transfer, Credit Card, Wise, PayPal, Company Card
4. Click **Save**

### Why Link Expenses to Itineraries?

When you link an expense to an itinerary, it appears in that itinerary's **Profit & Loss** section. This lets you see the true profit for each trip by comparing revenue (what the client pays) to costs (what you pay suppliers).

---

## Commissions

Track money earned from partners and money owed to suppliers.

### Types
- **Receivable** - Commissions you earn FROM partners (e.g., a hotel pays you a commission for bookings)
- **Payable** - Commissions you owe TO suppliers or agents

### Adding a Commission

1. Go to **Commissions** in the sidebar
2. Click **Add Commission**
3. Choose **Receivable** or **Payable**
4. Select the **Category** (Hotel, Shopping, Restaurant, Transport, Cruise, Attraction, etc.)
5. Enter the **base amount** and **commission rate (%)**
6. The commission amount is calculated automatically
7. Link to a supplier or itinerary
8. Set the status (Pending, Invoiced, Received/Paid, Cancelled, Disputed)

The summary cards at the top show your total receivables, payables, and net commission position.

---

## Tasks

Manage your team's to-do list.

### Views

Switch between three views using the buttons at the top:
- **Kanban Board** - Drag tasks between columns (To Do, In Progress, Done)
- **Table View** - Spreadsheet-style list with sorting
- **List View** - Simple list with filters

### Creating a Task

1. Click **New Task**
2. Fill in:
   - **Title** (required)
   - **Description**
   - **Priority** - Low, Medium, High, or Urgent
   - **Due Date**
   - **Assigned To** - Pick a team member
   - **Department**
   - **Link to** - Optionally link to an itinerary, client, invoice, or expense
3. Click **Save**

### AI-Generated Tasks

When you open an itinerary and click **Generate Tasks**, the AI analyzes all the services and creates operational tasks automatically. For example:
- "Confirm hotel reservation at Four Seasons" (assigned to Operations)
- "Book airport transfer for Oct 5 arrival" (assigned to Transport)
- "Confirm guide availability for Day 1-6" (assigned to Guides)

### Filtering Tasks

Use the filters at the top to show:
- Tasks by **status** (To Do, In Progress, Done)
- Tasks by **priority** (Low, Medium, High, Urgent)
- Tasks assigned to a **specific person**
- Tasks **due today**, **overdue**, or **upcoming**
- Tasks by **department**

---

## WhatsApp Inbox

Manage all your WhatsApp business conversations in one place.

### How It Works

When a client sends a message to your business WhatsApp number, it appears in the WhatsApp Inbox automatically.

### Using the Inbox

1. Go to **WhatsApp Inbox** in the sidebar
2. The left panel shows all conversations with the latest message preview
3. Click a conversation to open the full chat on the right
4. Type your reply at the bottom and press **Send**

### Features

- **Assign to Agent** - Click the assign dropdown to route the conversation to a specific team member
- **Quick Replies** - Use pre-written responses for common questions
- **Language** - Select the reply language if the client speaks a different language
- **Link Client** - Connect the conversation to an existing client record
- **Create Client** - Create a new client directly from the conversation
- **Send Documents** - Send quotes, invoices, contracts, and receipts through WhatsApp

### Message Status Icons
- ✓ Message sent
- ✓✓ Message delivered
- ✓✓ (blue) Message read

---

## WhatsApp Parser (AI)

The AI parser reads a WhatsApp conversation and extracts all the trip details automatically.

### How to Use It

1. From the Dashboard, click **Parse WhatsApp** (or go to **WhatsApp Parser** in the sidebar)
2. Paste the WhatsApp conversation text
3. Click **Parse**
4. The AI extracts:
   - Client name, email, phone
   - Nationality and passport type
   - Desired travel dates
   - Number of travelers (adults, children, infants)
   - Destinations and interests
   - Budget range
   - Special requests
5. Review the extracted information
6. Click **Create Itinerary** to generate a complete itinerary with day-by-day details and pricing

This is the fastest way to turn a client inquiry into a professional quote.

---

## Email Inbox

Manage your business emails directly within Autoura.

### Connecting Gmail

1. Go to **Settings > Email**
2. Click **Connect Gmail**
3. Sign in with your Google account and grant access

### Using the Inbox

Go to **Inbox** in the sidebar to see your emails.

You can:
- Read and reply to emails with a rich text editor (formatting, links, images)
- Send new emails
- View email threads
- Use Gmail labels for organization
- Download attachments
- Link emails to client records

---

## Tour Templates

Pre-built tour packages that you can use as starting points for itineraries.

### Browsing Tours

1. Go to **Tours** in the sidebar
2. Browse available tour packages by destination, duration, or category
3. Click a tour to see the full details

### Tour Detail Page

Each tour shows:
- **Description** and key **highlights**
- **Day-by-day itinerary** with cities, activities, and meals
- **What's included** and **what's not included**
- **Pricing calculator** - enter the number of travelers and passport type to get an instant price

### Tour Tiers

Most tours come in multiple tiers:
- **Budget** - Basic accommodation and services
- **Standard** - Mid-range quality
- **Deluxe** - Premium options
- **Luxury** - Top-tier everything

### Managing Tour Templates

Go to **Tours > Manage** (admin/manager only) to:
- Create new tour templates
- Edit existing tours
- Add/modify variations and pricing
- Set up daily itinerary details
- Auto-price tours from your rates database

---

## Rates Management

Manage all your pricing in one place. Go to **Rates** in the sidebar.

### Rate Categories

| Category | What It Covers |
|----------|---------------|
| **Hotels** | Room rates by city, tier, and per person |
| **Transportation** | Vehicle rates by type (sedan, minivan, bus), service type (day tour, airport transfer, intercity), and group size |
| **Guides** | Daily and hourly rates, by language and specialty |
| **Entrance Fees** | Attraction tickets with separate prices for EU and non-EU passport holders |
| **Meals** | Lunch and dinner rates by quality tier |
| **Activities** | Optional activities and excursions |
| **Cruises** | Nile cruise rates by ship, cabin type |
| **Airport Services** | Meet & greet, VIP lounge, etc. |
| **Hotel Services** | Additional hotel services |
| **Sleeping Trains** | Overnight train rates by cabin type |
| **Trains** | Regular train fares |
| **Flights** | Domestic flight rates |
| **Tipping** | Recommended tipping rates by service type |

### Adding or Editing a Rate

1. Go to the relevant rate category
2. Click **Add New** or click an existing rate to edit
3. Fill in the details (prices, descriptions, supplier info)
4. Click **Save**

Rates are used by the auto-pricing engine when you build itineraries in **Auto** cost mode.

### EU vs Non-EU Pricing

Many rates (especially entrance fees and transportation) have different prices for European passport holders and non-European passport holders. Make sure to set both when adding rates.

---

## Resources

Manage your operational contacts: guides, vehicles, hotels, restaurants, attractions, and airport staff.

### Guides

Go to **Resources** (or **Rates > Guides**) to manage your guides:
- Name, phone, email
- Languages spoken
- Specialties (e.g., Egyptology, adventure tours)
- Certifications
- Daily and hourly rates
- Availability

### Transportation

Manage transport suppliers:
- Company name
- Vehicle types available
- Driver information
- Contact details

### Other Resources

- **Hotels** - Property contacts and details
- **Restaurants** - Restaurant information for meal bookings
- **Attractions** - Contact info for attractions and sites
- **Airport Staff** - Personnel for airport services

---

## Documents

Generate and manage professional documents.

### Document Types

| Document | Purpose |
|----------|---------|
| **Itinerary PDF** | Day-by-day trip plan to send to clients |
| **Invoice PDF** | Professional billing document |
| **Contract** | Booking agreement with terms and conditions |
| **Receipt** | Payment confirmation |
| **Supplier Documents** | Vouchers and confirmations for suppliers |

### Generating Documents

Most documents are generated from within other pages:
- **Itinerary PDF** - From the itinerary detail page, click **Download PDF**
- **Invoice PDF** - From the invoice page, click **Download PDF**
- **Contract** - From the itinerary, click **Generate Documents**

You can also go to **Documents** in the sidebar to see all generated documents in one place.

---

## Financial Reports

Go to **Financial Reports** (admin/manager only) to see:

- **Revenue** by month, quarter, and year
- **Expenses** broken down by category
- **Profit margins** over time
- **Accounts Receivable** - Money clients owe you
- **Accounts Payable** - Money you owe suppliers
- **Profit & Loss** - Overall and per-itinerary breakdowns

### Per-Itinerary P&L

From any itinerary, you can see its individual Profit & Loss:
- Total revenue (what the client pays)
- Total expenses (what you pay suppliers)
- Commissions earned
- Net profit and margin percentage

---

## B2B Partners

Manage business-to-business relationships with other travel companies.

### Partners

Go to **B2B > Partners** to:
- Add partner companies (travel agencies, tour operators, DMCs)
- Set partner-specific pricing rules and discount structures
- Track partner performance

### B2B Quotes

Go to **B2B > Quotes** to:
- Create quotes specifically for B2B partners (with net pricing)
- Apply partner-specific pricing rules
- Convert B2B quotes to itineraries
- Generate B2B-specific PDFs

### Pricing Rules

Go to **B2B > Pricing Rules** to set up:
- Partner-specific discounts
- Commission structures
- Markup rules
- Volume-based pricing

---

## Content Library

Store and reuse frequently used content.

### What You Can Store

- **Tour descriptions** - Reusable descriptions for popular destinations
- **Email templates** - Pre-written emails for common scenarios
- **Itinerary text blocks** - Standard day descriptions you use repeatedly
- **AI Prompts** - Custom prompts for generating content
- **Writing Rules** - Style guidelines so AI-generated content matches your brand voice

### Using the Content Library

1. Go to **Content Library** in the sidebar
2. Browse or search for content
3. Click to view/edit
4. Copy content into itineraries, emails, or other documents

---

## Team Members

### Managing Your Team

Go to **Team Members** (admin/manager only) to:

- View all team members with their roles and departments
- See who is active and who is deactivated

### Inviting a New Team Member

1. Click **Invite Member**
2. Enter their email address
3. Select their **role** (Admin, Manager, Agent, or Viewer)
4. Assign a **department** (optional)
5. Click **Send Invitation**

They receive an email with a link to set up their account.

### Changing Roles

Click on a team member and update their role. Role changes take effect immediately.

---

## Settings

Go to **Settings** in the sidebar to customize your account.

### Profile
- Update your name, phone, and avatar
- View your role

### Email
- Connect or disconnect your Gmail account
- Set up your email signature
- Configure auto-reply settings

### WhatsApp
- View WhatsApp connection status
- Configure message settings

### Preferences
- **Default Cost Mode** - Choose Auto (use rates database) or Manual (enter costs by hand)
- **Default Currency** - Set your preferred currency (EUR, USD, etc.)
- **Default Tier** - Set a default quality tier for new itineraries
- **Default Margin** - Set a default markup percentage
- **Language** - Choose between English and Japanese for the interface

---

## Multilingual Support

Autoura supports creating content in multiple languages (currently English and Japanese).

### Switching the Interface Language

1. Go to **Settings > Preferences**
2. Change **Language** to your preferred language
3. The entire interface (menus, buttons, labels) switches to that language

### Creating Translated Itineraries

1. Open an itinerary
2. You see language tabs at the top: **English** and **Japanese**
3. Click the **Japanese** tab
4. If no Japanese version exists, you see two options:
   - **Create from Scratch** - Start with a blank Japanese version
   - **Copy & Translate** - Automatically translate the English content to Japanese using AI
5. Click **Copy & Translate** and wait for the translation to complete
6. All day titles, descriptions, service names, inclusions, and exclusions are translated

### Re-translating

If the translation needs to be redone:
1. Switch to the Japanese tab
2. Click **Re-translate from English** (small blue link below the language tabs)
3. Confirm in the dialog
4. The system deletes the old translation and creates a fresh one

### Translated Rates

Attraction names and other rate information can also be translated. When editing rates while in Japanese mode, the translated names are saved separately - the English names are never overwritten.

---

## Common Workflows

### From WhatsApp Inquiry to Confirmed Booking

1. **Receive inquiry** - Client messages on WhatsApp. The message appears in your WhatsApp Inbox.
2. **Parse with AI** - Copy the conversation and use the WhatsApp Parser. AI extracts all trip details.
3. **Create itinerary** - Click "Create Itinerary" from the parser results. A complete day-by-day plan with pricing is generated.
4. **Review and edit** - Open the itinerary editor. Adjust days, services, hotels, and pricing as needed.
5. **Send to client** - Download as PDF and send via WhatsApp or email.
6. **Client confirms** - Update the itinerary status to "Confirmed."
7. **Generate invoice** - Click "Generate Invoice" to create the billing document.
8. **Send invoice** - Send via WhatsApp or email. Set up reminders for payment.
9. **Create booking** - The system automatically creates a booking when you confirm the itinerary.
10. **Confirm suppliers** - In the booking, track each supplier's confirmation status.
11. **Record payments** - As the client pays, record payments on the invoice.
12. **Generate tasks** - Use AI to create operational tasks for your team.
13. **Complete trip** - After the trip, mark the booking as completed and review the P&L.

### Quick Quote (Under 5 Minutes)

1. Dashboard > **New Quote**
2. Enter client name, dates, and number of travelers
3. Use **Auto** cost mode to let the system price everything
4. Add the days and services
5. Click **Download PDF**
6. Send to the client

### Recording an Expense Against a Trip

1. Open the itinerary
2. Click **Add Expense**
3. Enter the category, amount, and supplier
4. The expense automatically appears in the itinerary's P&L

### Sending a Payment Reminder

1. Go to **Invoices**
2. Find the overdue invoice
3. Click on it
4. Click **Send Reminder**
5. Choose WhatsApp or Email

---

## Tips & Shortcuts

- **Status cards are clickable** - On any list page, click the status cards at the top to quickly filter
- **Auto-pricing saves time** - Keep your rates database updated and use Auto cost mode for instant pricing
- **Link everything** - Link expenses to itineraries, tasks to clients, and commissions to services for a complete picture
- **Use AI for tasks** - After building an itinerary, click "Generate Tasks" to automatically create your to-do list
- **PDF downloads are instant** - PDFs are generated in your browser, no waiting for server processing
- **WhatsApp is two-way** - Clients can reply to your WhatsApp messages and those replies appear in your inbox
- **The search bar works everywhere** - Every list page has a search bar that searches across multiple fields
- **Expand days for details** - On itinerary pages, click a day to expand it and see all services
- **Check for conflicts** - When assigning guides or vehicles, the system warns you about scheduling conflicts

---

## Need Help?

If you run into any issues or have questions:
- Contact your system administrator
- Check this guide for step-by-step instructions
- The system shows helpful error messages when something goes wrong

---

*Autoura - Turning inquiries into unforgettable journeys.*
