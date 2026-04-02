-- Customer WhatsApp variants + Internal team templates

-- ============================================
-- CUSTOMER WHATSAPP VARIANTS
-- ============================================

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Quotation (WhatsApp)',
  'Send quotation summary via WhatsApp with key details.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Your personalized itinerary for {{TourName}} is ready!

📋 *Trip Summary*
📅 {{TripDates}} ({{Duration}} days)
👥 {{PaxCount}} travelers
⭐ {{ServiceLevel}}
💰 {{Currency}} {{TotalPrice}}

I''ve sent the full day-by-day itinerary to your email with all the details.

This quote is valid for 7 days. To confirm, a deposit of {{DepositAmount}} is needed.

Let me know if you''d like any changes — happy to adjust! 😊

{{AgentName}} — {{CompanyName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Follow-Up After Quote (WhatsApp)',
  'Gentle WhatsApp follow-up after sending a quotation.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 😊

Just checking in about your {{TourName}} itinerary. Did you have a chance to review it?

Happy to answer any questions or make changes — no pressure at all!

{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Booking Confirmation (WhatsApp)',
  'Confirm booking via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 🎉

Great news — your trip is *confirmed*!

✅ *{{TourName}}*
📅 {{TripDates}}
👥 {{PaxCount}} travelers
🔖 Ref: {{BookingRef}}

*What happens next:*
1️⃣ We confirm all suppliers within 48 hours
2️⃣ Travel pack sent 7 days before departure
3️⃣ Guide contact shared 3 days before arrival

If you have any special requests, let me know now! 🙏

{{AgentName}} — {{CompanyName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Payment Reminder (WhatsApp)',
  'Remind client about upcoming balance payment via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Friendly reminder that your balance for {{TourName}} is due by {{BalanceDueDate}}.

💰 Balance: {{Currency}} {{BalanceDue}}
📅 Due by: {{BalanceDueDate}}

Once received, we''ll send your complete travel documents with itinerary, vouchers, and guide details.

Let me know if you need anything! 😊

{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Pre-Trip Info (WhatsApp)',
  'Pre-trip essentials sent via WhatsApp 7 days before departure.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} ✈️

Your trip starts in 7 days! Here are the essentials:

🧑‍✈️ *Your Guide*
{{GuideName}} — {{GuidePhone}}

📍 *Arrival*
{{StartDate}} at Cairo Airport (CAI)
Our rep will meet you at arrivals with your name sign

🌡️ *Weather:* 25-35°C — pack light layers + sunscreen
💵 *Currency:* Egyptian Pound. USD/EUR accepted at hotels
🛂 *Visa:* On arrival ~$25

📋 Full travel pack sent to your email!

See you soon! 🇪🇬

{{AgentName}} — {{CompanyName}}
📞 {{CompanyPhone}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Guide Introduction (WhatsApp)',
  'Introduce the guide to the client via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Meet your guide for {{TourName}}!

🧑‍🏫 *{{GuideName}}*
📱 {{GuidePhone}}
🗣️ {{GuideLanguages}}

{{GuideName}} will meet you at {{MeetingPoint}} on {{StartDate}}.

Feel free to contact them directly if you need anything upon arrival.

Have an amazing trip! 🎉

{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Itinerary Change (WhatsApp)',
  'Notify client of an itinerary change via WhatsApp.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Quick update on your {{TourName}} trip:

📝 *Change:* {{ChangeDescription}}
📌 *Reason:* {{ChangeReason}}

Everything else stays the same. Updated itinerary sent to your email.

Let me know if you have any questions! 🙏

{{AgentName}}',
  true, NOW(), NOW()
);

-- ============================================
-- INTERNAL TEMPLATES
-- ============================================

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Trip Handover Note',
  'Internal handover when reassigning a booking to another team member.',
  'internal',
  'email',
  'Handover: {{BookingRef}} — {{GuestName}} ({{TripDates}})',
  'Hi Team,

I am handing over the following booking:

BOOKING DETAILS
• Reference: {{BookingRef}}
• Client: {{GuestName}}
• Dates: {{TripDates}}
• Travelers: {{PaxCount}}
• Tour: {{TourName}}

STATUS
• Payment: {{PaymentStatus}}
• Supplier confirmations: {{ConfirmationStatus}}

IMPORTANT NOTES
{{HandoverNotes}}

PENDING ACTIONS
{{PendingActions}}

Please review the itinerary and reach out to the client to introduce yourself.

Thanks,
{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Daily Operations Brief',
  'Morning brief summarizing active trips, arrivals, and departures for the day.',
  'internal',
  'email',
  'Daily Ops Brief — {{Date}}',
  'Good morning team,

Here is today''s operations summary:

ARRIVALS TODAY
{{ArrivalsToday}}

DEPARTURES TODAY
{{DeparturesToday}}

ACTIVE TRIPS
{{ActiveTrips}}

PENDING CONFIRMATIONS
{{PendingConfirmations}}

PAYMENTS DUE
{{PaymentsDue}}

NOTES / ALERTS
{{DailyNotes}}

Have a great day!
{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Supplier Issue Alert',
  'Internal alert when a supplier issue requires immediate attention.',
  'internal',
  'email',
  'ALERT: Supplier Issue — {{BookingRef}}',
  'URGENT — Supplier Issue

BOOKING: {{BookingRef}} — {{GuestName}} ({{TripDates}})

ISSUE
• Supplier: {{SupplierName}}
• Service: {{ServiceType}}
• Date: {{ServiceDate}}
• Problem: {{IssueDescription}}

IMPACT ON CLIENT
{{ClientImpact}}

RECOMMENDED ACTION
{{RecommendedAction}}

ALTERNATIVES AVAILABLE
{{Alternatives}}

Please respond ASAP.

{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Supplier Issue Alert (WhatsApp)',
  'Urgent WhatsApp alert for supplier issues requiring immediate attention.',
  'internal',
  'whatsapp',
  NULL,
  '🚨 *SUPPLIER ISSUE*

Booking: {{BookingRef}} — {{GuestName}}
📅 {{TripDates}}

⚠️ *Problem:*
{{SupplierName}} — {{IssueDescription}}

🎯 *Action needed:*
{{RecommendedAction}}

Please respond ASAP!

{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'New Booking Notification',
  'Notify the team when a new booking is confirmed.',
  'internal',
  'email',
  'New Booking Confirmed — {{BookingRef}}',
  'Team,

A new booking has been confirmed:

• Reference: {{BookingRef}}
• Client: {{GuestName}} ({{Nationality}})
• Tour: {{TourName}}
• Dates: {{TripDates}} ({{Duration}} days)
• Travelers: {{PaxCount}}
• Service level: {{ServiceLevel}}
• Value: {{Currency}} {{TotalPrice}}

NEXT STEPS
1. Confirm hotels and transport
2. Assign guide
3. Send booking confirmation to client

Assigned to: {{AgentName}}

Let''s make this a great trip!',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'New Booking (WhatsApp)',
  'Quick WhatsApp notification for new booking.',
  'internal',
  'whatsapp',
  NULL,
  '✅ *New Booking Confirmed*

🔖 {{BookingRef}}
👤 {{GuestName}} ({{Nationality}})
📅 {{TripDates}}
👥 {{PaxCount}} pax
⭐ {{ServiceLevel}}
💰 {{Currency}} {{TotalPrice}}

Next: Confirm suppliers + assign guide

{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Weekly Performance Summary',
  'Internal weekly summary of bookings, revenue, and key metrics.',
  'internal',
  'email',
  'Weekly Summary — Week of {{WeekStartDate}}',
  'Hi Team,

Here is this week''s performance summary:

BOOKINGS
• New inquiries: {{NewInquiries}}
• Quotes sent: {{QuotesSent}}
• Bookings confirmed: {{BookingsConfirmed}}
• Conversion rate: {{ConversionRate}}

REVENUE
• Total booked: {{Currency}} {{TotalBooked}}
• Payments received: {{Currency}} {{PaymentsReceived}}
• Outstanding: {{Currency}} {{Outstanding}}

OPERATIONS
• Trips completed: {{TripsCompleted}}
• Active trips: {{ActiveTrips}}
• Upcoming (next 7 days): {{UpcomingTrips}}

HIGHLIGHTS
{{WeeklyHighlights}}

AREAS TO WATCH
{{AreasToWatch}}

Great work, team!
{{AgentName}}',
  true, NOW(), NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Client Complaint Escalation',
  'Internal escalation when a client complaint needs management attention.',
  'internal',
  'email',
  'ESCALATION: Client Complaint — {{BookingRef}}',
  'ESCALATION — Client Complaint

BOOKING: {{BookingRef}}
CLIENT: {{GuestName}} ({{GuestEmail}}, {{GuestPhone}})
TOUR: {{TourName}} ({{TripDates}})

COMPLAINT DETAILS
{{ComplaintDescription}}

SERVICES AFFECTED
{{AffectedServices}}

ACTIONS TAKEN SO FAR
{{ActionsTaken}}

RECOMMENDED RESOLUTION
{{RecommendedResolution}}

FINANCIAL IMPACT
{{FinancialImpact}}

This requires management review. Please advise on next steps.

{{AgentName}}',
  true, NOW(), NOW()
);
