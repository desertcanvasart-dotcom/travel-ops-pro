-- Customer-facing message templates
-- 16 templates covering the full client lifecycle: inquiry → booking → pre-trip → post-trip

-- ============================================
-- PRE-BOOKING (Lead Nurturing)
-- ============================================

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Welcome / Inquiry Response',
  'First response to a new client inquiry. Sets expectations and shows professionalism.',
  'customer',
  'email',
  'Thank you for your inquiry — {{TourName}}',
  'Dear {{GuestName}},

Thank you for reaching out to us about your upcoming trip to Egypt!

We have received your inquiry and are already working on a personalized itinerary for you. Here is what we have noted so far:

• Travel dates: {{TripDates}}
• Number of travelers: {{PaxCount}}
• Destinations: {{Cities}}

Our team will prepare a detailed quotation with day-by-day activities, accommodation options, and transparent pricing. You can expect to hear from us within 24 hours.

In the meantime, feel free to reply to this email with any additional preferences or questions.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Welcome / Inquiry Response (WhatsApp)',
  'WhatsApp version of the inquiry response.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 👋

Thank you for your interest in traveling to Egypt!

We''ve noted your request:
📅 {{TripDates}}
👥 {{PaxCount}} travelers
📍 {{Cities}}

We''re preparing a personalized itinerary for you and will share it within 24 hours.

Feel free to send any additional preferences!

Best regards,
{{AgentName}} — {{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Quotation Email',
  'Send the prepared quotation/itinerary to the client with pricing details.',
  'customer',
  'email',
  'Your Personalized Itinerary — {{TourName}} | Ref: {{BookingRef}}',
  'Dear {{GuestName}},

Please find attached your personalized itinerary for {{TourName}}.

TRIP SUMMARY
• Dates: {{TripDates}} ({{Duration}} days)
• Travelers: {{PaxCount}}
• Service level: {{ServiceLevel}}
• Total price: {{Currency}} {{TotalPrice}}

The itinerary includes a day-by-day breakdown of activities, accommodation details, transportation arrangements, and all entrance fees.

WHAT IS INCLUDED
{{Inclusions}}

WHAT IS NOT INCLUDED
{{Exclusions}}

This quotation is valid for 7 days. To confirm your booking, a deposit of {{DepositAmount}} is required.

Please do not hesitate to ask if you would like any changes — we are happy to adjust the itinerary to match your preferences.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Follow-Up After Quote',
  'Gentle follow-up if the client has not responded to the quotation.',
  'customer',
  'email',
  'Following up on your Egypt trip — {{BookingRef}}',
  'Dear {{GuestName}},

I hope this email finds you well. I wanted to follow up on the itinerary we sent for {{TourName}}.

I understand planning a trip takes time, so please do not rush. I am writing to check if you have any questions, or if you would like us to adjust anything — whether it is the dates, accommodation level, activities, or budget.

We are happy to revise the itinerary at no extra cost until you are completely satisfied.

Looking forward to hearing from you.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Quote Expiry Reminder',
  'Remind the client that their quotation is about to expire.',
  'customer',
  'email',
  'Your quotation expires soon — {{BookingRef}}',
  'Dear {{GuestName}},

This is a friendly reminder that your quotation for {{TourName}} (Ref: {{BookingRef}}) will expire in 3 days.

QUICK RECAP
• Dates: {{TripDates}}
• Travelers: {{PaxCount}}
• Total: {{Currency}} {{TotalPrice}}

After expiry, pricing may change due to hotel availability and seasonal rate adjustments.

To secure your booking at the current price, a deposit of {{DepositAmount}} is all that is needed. We can arrange flexible payment terms for the balance.

If you need more time or have questions, simply reply to this email.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

-- ============================================
-- BOOKING CONFIRMED
-- ============================================

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Booking Confirmation',
  'Confirm the booking after deposit or full payment is received.',
  'customer',
  'email',
  'Booking Confirmed! {{TourName}} — Ref: {{BookingRef}}',
  'Dear {{GuestName}},

Great news — your trip to Egypt is now confirmed!

BOOKING DETAILS
• Reference: {{BookingRef}}
• Tour: {{TourName}}
• Dates: {{TripDates}} ({{Duration}} days)
• Travelers: {{PaxCount}}
• Service level: {{ServiceLevel}}

PAYMENT STATUS
• Total cost: {{Currency}} {{TotalPrice}}
• Deposit received: {{Currency}} {{DepositAmount}}
• Balance due: {{Currency}} {{BalanceDue}} (by {{BalanceDueDate}})

WHAT HAPPENS NEXT
1. We will confirm all suppliers (hotels, guides, transport) within 48 hours
2. You will receive a detailed travel pack 7 days before departure
3. Your guide''s contact details will be shared 3 days before arrival

If you have any special requests — dietary needs, mobility considerations, celebration arrangements — please let us know now so we can make the necessary preparations.

We are excited to host you in Egypt!

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Deposit Received',
  'Acknowledge receipt of deposit payment.',
  'customer',
  'email',
  'Deposit received — {{BookingRef}}',
  'Dear {{GuestName}},

Thank you! We have received your deposit of {{Currency}} {{DepositAmount}} for {{TourName}}.

PAYMENT SUMMARY
• Booking reference: {{BookingRef}}
• Deposit received: {{Currency}} {{DepositAmount}}
• Remaining balance: {{Currency}} {{BalanceDue}}
• Balance due by: {{BalanceDueDate}}

A receipt is attached for your records.

We are now confirming all arrangements with our suppliers. You will receive a full booking confirmation shortly.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Final Payment Reminder',
  'Remind the client that the balance payment is due.',
  'customer',
  'email',
  'Balance payment due — {{BookingRef}}',
  'Dear {{GuestName}},

This is a friendly reminder that the remaining balance for your upcoming trip is due by {{BalanceDueDate}}.

PAYMENT DETAILS
• Booking: {{BookingRef}} — {{TourName}}
• Travel dates: {{TripDates}}
• Balance due: {{Currency}} {{BalanceDue}}

{{PaymentInstructions}}

Once we receive your payment, we will send your complete travel documents including your detailed itinerary, hotel vouchers, and guide contact information.

If you have any questions about the payment, please do not hesitate to reach out.

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Full Payment Received',
  'Confirm that full payment has been received and the client is all set.',
  'customer',
  'email',
  'All set! Full payment received — {{BookingRef}}',
  'Dear {{GuestName}},

We have received your full payment for {{TourName}}. You are all set!

CONFIRMED BOOKING
• Reference: {{BookingRef}}
• Dates: {{TripDates}}
• Total paid: {{Currency}} {{TotalPrice}}

A receipt is attached for your records.

Your complete travel pack with the detailed itinerary, hotel vouchers, and emergency contacts will be sent to you 7 days before your departure.

We cannot wait to welcome you to Egypt!

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

-- ============================================
-- PRE-TRIP
-- ============================================

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Pre-Trip Information Pack',
  'Comprehensive pre-trip information sent 7 days before departure.',
  'customer',
  'email',
  'Your trip starts in 7 days! Everything you need — {{BookingRef}}',
  'Dear {{GuestName}},

Your trip to Egypt is just 7 days away! Here is everything you need to know:

ARRIVAL DETAILS
• Date: {{StartDate}}
• Airport: Cairo International Airport (CAI)
• Our representative will meet you at arrivals with a sign bearing your name

YOUR GUIDE
• Name: {{GuideName}}
• Phone: {{GuidePhone}}
• Languages: {{GuideLanguages}}

ESSENTIAL INFORMATION
• Weather: Expect temperatures of 25-35°C. Light layers and sun protection recommended
• Currency: Egyptian Pound (EGP). USD and EUR widely accepted at hotels. ATMs available everywhere
• Visa: Available on arrival for most nationalities (approx. USD 25)
• Dress code: Modest clothing recommended for temple and mosque visits (shoulders and knees covered)
• Tipping: A local custom. Your guide will advise on appropriate amounts

WHAT TO PACK
• Comfortable walking shoes
• Sun hat and sunglasses
• Sunscreen (SPF 50+)
• Light scarf for mosque visits
• Camera with extra memory cards
• Power adapter (Type C, two-pin European)

Your detailed day-by-day itinerary is attached.

EMERGENCY CONTACTS
• 24/7 operations: {{CompanyPhone}}
• Your guide: {{GuidePhone}}
• Local emergency: 122 (police), 123 (ambulance)

Have a wonderful journey!

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Travel Documents Sent',
  'Notify client that all travel documents (itinerary, vouchers, contacts) have been sent.',
  'customer',
  'email',
  'Your travel documents are ready — {{BookingRef}}',
  'Dear {{GuestName}},

Your complete travel documents are attached to this email:

ATTACHED DOCUMENTS
1. Detailed day-by-day itinerary
2. Hotel vouchers
3. Transport confirmations
4. Emergency contact card

Please review everything and let us know if you have any questions before your departure on {{StartDate}}.

We recommend saving a copy of these documents on your phone for easy access during your trip.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Guide Introduction',
  'Introduce the assigned guide to the client before the trip.',
  'customer',
  'email',
  'Meet your guide for {{TourName}}',
  'Dear {{GuestName}},

We are pleased to introduce {{GuideName}}, who will be your personal guide during your trip.

ABOUT YOUR GUIDE
• Name: {{GuideName}}
• Languages: {{GuideLanguages}}
• Phone: {{GuidePhone}}

{{GuideName}} is one of our most experienced guides and will be with you throughout your journey. Feel free to contact them directly if you need anything upon arrival.

Your guide will meet you at {{MeetingPoint}} on {{StartDate}}.

We hope you have an incredible experience!

Best regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

-- ============================================
-- POST-TRIP
-- ============================================

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Thank You / Review Request',
  'Post-trip thank you email with a request for feedback.',
  'customer',
  'email',
  'Thank you for traveling with us, {{GuestName}}!',
  'Dear {{GuestName}},

Welcome home! We hope you had an unforgettable experience in Egypt.

It was a pleasure organizing your {{TourName}} trip ({{TripDates}}). We would love to hear about your highlights and any feedback you might have.

YOUR FEEDBACK MATTERS
If you have a moment, we would greatly appreciate a review. Your feedback helps us improve and helps other travelers plan their trips:

{{ReviewLink}}

If you have any photos you would like to share, we would love to feature them (with your permission) on our channels.

Thank you for choosing {{CompanyName}}. We hope to see you again!

Warm regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Thank You (WhatsApp)',
  'WhatsApp version of post-trip thank you.',
  'customer',
  'whatsapp',
  NULL,
  'Hi {{GuestName}} 😊

Welcome home! We hope you had an amazing time in Egypt 🇪🇬

It was a real pleasure hosting you on your {{TourName}} trip. We''d love to hear how it went!

If you have a moment, a quick review would mean the world to us:
{{ReviewLink}}

Thank you for choosing {{CompanyName}} — we hope to see you again! 🙏

Best regards,
{{AgentName}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Referral Request',
  'Ask satisfied clients to refer friends and family.',
  'customer',
  'email',
  'Know someone planning a trip to Egypt?',
  'Dear {{GuestName}},

We hope the memories from your {{TourName}} trip are still fresh!

Many of our best clients come through personal recommendations. If you know anyone — friends, family, or colleagues — who is considering a trip to Egypt, we would be honored if you shared your experience with them.

They can reach us directly at {{CompanyPhone}} or {{CompanyEmail}}, and we will take the same care with their trip as we did with yours.

As a thank you for any referral, we will send you a special discount on your next trip with us.

Warm regards,
{{AgentName}}
{{CompanyName}}',
  true,
  true,
  NOW(),
  NOW()
);

-- ============================================
-- OPERATIONAL
-- ============================================

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Itinerary Change Notification',
  'Notify the client about a change to their itinerary.',
  'customer',
  'email',
  'Update to your itinerary — {{BookingRef}}',
  'Dear {{GuestName}},

We would like to inform you of a small adjustment to your itinerary for {{TourName}}.

CHANGE DETAILS
{{ChangeDescription}}

REASON
{{ChangeReason}}

This change does not affect the overall quality of your experience, and we believe you will enjoy the updated arrangement.

All other arrangements remain unchanged. Your updated itinerary is attached.

If you have any questions or concerns, please do not hesitate to reach out.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  true,
  NOW(),
  NOW()
);

INSERT INTO message_templates (id, name, description, category, channel, subject, body, is_system, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Weather / Safety Advisory',
  'Important travel advisory for upcoming trips.',
  'customer',
  'email',
  'Important information about your upcoming trip — {{BookingRef}}',
  'Dear {{GuestName}},

We are writing to share some important information regarding your upcoming trip on {{TripDates}}.

{{AdvisoryDetails}}

HOW THIS AFFECTS YOUR TRIP
{{TripImpact}}

WHAT WE ARE DOING
{{ActionsTaken}}

Your safety and comfort are our top priority. Please do not hesitate to contact us if you have any concerns.

Best regards,
{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}',
  true,
  true,
  NOW(),
  NOW()
);
