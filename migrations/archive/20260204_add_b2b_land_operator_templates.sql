-- =====================================================
-- B2B LAND OPERATOR (DMC) MESSAGE TEMPLATES
-- =====================================================
-- Core email templates for land operators working with overseas agents
-- Categories: quotes, amendments, confirmations, payments, cancellations
-- =====================================================

-- First, deactivate any existing partner-related templates
UPDATE message_templates
SET is_active = false
WHERE category = 'partner' OR subcategory LIKE '%partner%';

-- =====================================================
-- 1. QUOTATION FLOW
-- =====================================================

-- 1.1 Quotation Acknowledgement (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Quotation Acknowledgement',
  'Confirm receipt of quote request and set expectations',
  'b2b',
  'quotes',
  'email',
  'RE: {{RequestSubject}} - Quote Request Received',
  'Dear {{AgentName}},

Thank you for your inquiry. We have received your request for the following:

REQUEST SUMMARY:
• Destinations: {{Destinations}}
• Travel Dates: {{TravelDates}}
• Number of Travelers: {{Pax}}
• Nationality: {{Nationality}}

We are currently working on your quotation and will revert within {{ResponseTime}}.

Should you have any immediate questions, please don''t hesitate to reach out.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{RequestSubject}}", "{{Destinations}}", "{{TravelDates}}", "{{Pax}}", "{{Nationality}}", "{{ResponseTime}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- 1.1 Quotation Acknowledgement (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Quotation Acknowledgement - WhatsApp',
  'Quick acknowledgement of quote request',
  'b2b',
  'quotes',
  'whatsapp',
  'Dear {{AgentName}},

Thank you for your inquiry.

*Request received:*
• {{Destinations}}
• {{TravelDates}}
• {{Pax}} pax ({{Nationality}})

We''ll send your quotation within {{ResponseTime}}.

{{SenderName}}',
  '["{{AgentName}}", "{{Destinations}}", "{{TravelDates}}", "{{Pax}}", "{{Nationality}}", "{{ResponseTime}}", "{{SenderName}}"]'::jsonb,
  true
);

-- 1.2 Initial Quotation Submission (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Initial Quotation',
  'Submit official land quote with full scope and terms',
  'b2b',
  'quotes',
  'email',
  'Quotation {{QuoteRef}} - {{TourName}} - {{TravelDates}}',
  'Dear {{AgentName}},

Please find below our quotation as requested:

═══════════════════════════════════════
QUOTATION REFERENCE: {{QuoteRef}}
VERSION: {{QuoteVersion}}
VALIDITY: {{ValidUntil}}
═══════════════════════════════════════

TRIP DETAILS:
• Tour: {{TourName}}
• Dates: {{TravelDates}} ({{Duration}})
• Travelers: {{Pax}} ({{Nationality}})
• Service Level: {{ServiceLevel}}

PRICING (Net rates in {{Currency}}):
{{PricingBreakdown}}

TOTAL: {{TotalPrice}} {{Currency}}

───────────────────────────────────────
WHAT''S INCLUDED:
{{Inclusions}}

WHAT''S NOT INCLUDED:
{{Exclusions}}

───────────────────────────────────────
ASSUMPTIONS & CONDITIONS:
{{Assumptions}}

PAYMENT TERMS:
{{PaymentTerms}}

CANCELLATION POLICY:
{{CancellationPolicy}}

───────────────────────────────────────

This quotation is valid until {{ValidUntil}}. Prices are subject to availability at time of booking.

Please let us know if you need any clarifications or adjustments.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{QuoteRef}}", "{{QuoteVersion}}", "{{ValidUntil}}", "{{TourName}}", "{{TravelDates}}", "{{Duration}}", "{{Pax}}", "{{Nationality}}", "{{ServiceLevel}}", "{{Currency}}", "{{PricingBreakdown}}", "{{TotalPrice}}", "{{Inclusions}}", "{{Exclusions}}", "{{Assumptions}}", "{{PaymentTerms}}", "{{CancellationPolicy}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- 1.3 Clarification / Missing Information Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Clarification Request',
  'Request missing information to provide accurate quote',
  'b2b',
  'quotes',
  'email',
  'RE: {{RequestSubject}} - Information Required',
  'Dear {{AgentName}},

Thank you for your inquiry. To provide an accurate quotation, we kindly request the following information:

MISSING DETAILS:
{{MissingInfo}}

CLARIFICATIONS NEEDED:
{{Clarifications}}

Once we receive this information, we will finalize your quotation within {{ResponseTime}}.

Thank you for your cooperation.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{AgentName}}", "{{RequestSubject}}", "{{MissingInfo}}", "{{Clarifications}}", "{{ResponseTime}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 1.3 Clarification Request (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Clarification Request - WhatsApp',
  'Quick clarification request via WhatsApp',
  'b2b',
  'quotes',
  'whatsapp',
  'Dear {{AgentName}},

To finalize your quote, we need:

{{MissingInfo}}

Please advise.

{{SenderName}}',
  '["{{AgentName}}", "{{MissingInfo}}", "{{SenderName}}"]'::jsonb,
  true
);

-- 1.4 Revised Quotation (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Revised Quotation',
  'Updated quotation after changes or amendments',
  'b2b',
  'quotes',
  'email',
  'REVISED: Quotation {{QuoteRef}} v{{QuoteVersion}} - {{TourName}}',
  'Dear {{AgentName}},

Please find below our revised quotation based on {{RevisionReason}}.

═══════════════════════════════════════
QUOTATION REFERENCE: {{QuoteRef}}
VERSION: {{QuoteVersion}} (Previous: v{{PreviousVersion}})
VALIDITY: {{ValidUntil}}
═══════════════════════════════════════

CHANGES FROM PREVIOUS VERSION:
{{ChangesSummary}}

───────────────────────────────────────

UPDATED TRIP DETAILS:
• Tour: {{TourName}}
• Dates: {{TravelDates}} ({{Duration}})
• Travelers: {{Pax}} ({{Nationality}})
• Service Level: {{ServiceLevel}}

REVISED PRICING ({{Currency}}):
{{PricingBreakdown}}

NEW TOTAL: {{TotalPrice}} {{Currency}}
(Previous: {{PreviousTotal}} {{Currency}})

───────────────────────────────────────
INCLUSIONS:
{{Inclusions}}

EXCLUSIONS:
{{Exclusions}}

───────────────────────────────────────

This quotation supersedes all previous versions. Valid until {{ValidUntil}}.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{QuoteRef}}", "{{QuoteVersion}}", "{{PreviousVersion}}", "{{ValidUntil}}", "{{RevisionReason}}", "{{ChangesSummary}}", "{{TourName}}", "{{TravelDates}}", "{{Duration}}", "{{Pax}}", "{{Nationality}}", "{{ServiceLevel}}", "{{Currency}}", "{{PricingBreakdown}}", "{{TotalPrice}}", "{{PreviousTotal}}", "{{Inclusions}}", "{{Exclusions}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- =====================================================
-- 2. AMENDMENTS & ADJUSTMENTS
-- =====================================================

-- 2.1 Amendment Cost Impact Notification (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Amendment Cost Impact',
  'Explain how a requested change affects pricing',
  'b2b',
  'amendments',
  'email',
  'Amendment Impact - Ref {{BookingRef}} - {{GuestName}}',
  'Dear {{AgentName}},

Regarding your requested amendment for booking {{BookingRef}}:

REQUESTED CHANGE:
{{AmendmentRequest}}

IMPACT ASSESSMENT:
───────────────────────────────────────
Original Cost: {{OriginalCost}} {{Currency}}
Amendment Cost: {{AmendmentCost}} {{Currency}}
───────────────────────────────────────
Difference: {{CostDifference}} {{Currency}}
───────────────────────────────────────

BREAKDOWN OF CHANGES:
{{CostBreakdown}}

REASON FOR ADJUSTMENT:
{{AdjustmentReason}}

Please confirm if you wish to proceed with this amendment. Upon your approval, we will update the booking accordingly.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{AmendmentRequest}}", "{{OriginalCost}}", "{{AmendmentCost}}", "{{CostDifference}}", "{{Currency}}", "{{CostBreakdown}}", "{{AdjustmentReason}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 2.1 Amendment Cost Impact (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Amendment Cost Impact - WhatsApp',
  'Quick amendment cost notification',
  'b2b',
  'amendments',
  'whatsapp',
  'Dear {{AgentName}},

*Amendment Impact - {{BookingRef}}*

Requested: {{AmendmentRequest}}

*Cost Change:*
Original: {{OriginalCost}} {{Currency}}
New: {{AmendmentCost}} {{Currency}}
*Difference: {{CostDifference}} {{Currency}}*

Please confirm to proceed.

{{SenderName}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{AmendmentRequest}}", "{{OriginalCost}}", "{{AmendmentCost}}", "{{CostDifference}}", "{{Currency}}", "{{SenderName}}"]'::jsonb,
  true
);

-- 2.2 Amendment Confirmation (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Amendment Confirmation',
  'Confirm amendment has been processed',
  'b2b',
  'amendments',
  'email',
  'CONFIRMED: Amendment - Ref {{BookingRef}}',
  'Dear {{AgentName}},

This confirms that the following amendment has been processed for booking {{BookingRef}}:

AMENDMENT DETAILS:
───────────────────────────────────────
Guest Name: {{GuestName}}
Amendment Date: {{AmendmentDate}}
───────────────────────────────────────

CHANGES APPLIED:
{{AmendmentDetails}}

UPDATED BOOKING SUMMARY:
{{UpdatedBookingSummary}}

REVISED COST: {{RevisedCost}} {{Currency}}

Please review and confirm this information is correct.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{AmendmentDate}}", "{{AmendmentDetails}}", "{{UpdatedBookingSummary}}", "{{RevisedCost}}", "{{Currency}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 2.3 Alternative Proposal (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Alternative Proposal',
  'Offer alternatives when original request not feasible',
  'b2b',
  'amendments',
  'email',
  'Alternative Options - {{RequestSubject}}',
  'Dear {{AgentName}},

Regarding your request for {{OriginalRequest}}:

SITUATION:
{{UnavailabilityReason}}

ALTERNATIVE OPTIONS:
───────────────────────────────────────

OPTION A: {{OptionAName}}
{{OptionADetails}}
Cost: {{OptionACost}} {{Currency}}

───────────────────────────────────────

OPTION B: {{OptionBName}}
{{OptionBDetails}}
Cost: {{OptionBCost}} {{Currency}}

───────────────────────────────────────

OUR RECOMMENDATION:
{{Recommendation}}

Please advise your preference, and we will proceed accordingly.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{AgentName}}", "{{RequestSubject}}", "{{OriginalRequest}}", "{{UnavailabilityReason}}", "{{OptionAName}}", "{{OptionADetails}}", "{{OptionACost}}", "{{OptionBName}}", "{{OptionBDetails}}", "{{OptionBCost}}", "{{Currency}}", "{{Recommendation}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- =====================================================
-- 3. BOOKING & OPERATIONS
-- =====================================================

-- 3.1 Provisional Booking Confirmation (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Provisional Booking Confirmation',
  'Confirm services are on hold with deadline',
  'b2b',
  'confirmations',
  'email',
  'PROVISIONAL: Booking {{BookingRef}} - {{GuestName}} - ON HOLD',
  'Dear {{AgentName}},

We are pleased to confirm that the following services are now ON HOLD:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
STATUS: PROVISIONAL
HOLD EXPIRES: {{HoldExpiry}}
═══════════════════════════════════════

GUEST DETAILS:
• Name: {{GuestName}}
• Nationality: {{Nationality}}
• Number of Travelers: {{Pax}}

SERVICES ON HOLD:
{{ServicesOnHold}}

DATES: {{TravelDates}}

───────────────────────────────────────
IMPORTANT:
• This booking will be released automatically after {{HoldExpiry}} if not confirmed
• To confirm, please send written confirmation and deposit payment
• Deposit Required: {{DepositAmount}} {{Currency}}
• Deposit Deadline: {{DepositDeadline}}
───────────────────────────────────────

Please confirm at your earliest convenience to secure these services.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{Nationality}}", "{{Pax}}", "{{ServicesOnHold}}", "{{TravelDates}}", "{{HoldExpiry}}", "{{DepositAmount}}", "{{DepositDeadline}}", "{{Currency}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- 3.2 Final Booking Confirmation (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Final Booking Confirmation',
  'Confirm all services are locked and confirmed',
  'b2b',
  'confirmations',
  'email',
  'CONFIRMED: Booking {{BookingRef}} - {{GuestName}} - {{TravelDates}}',
  'Dear {{AgentName}},

We are pleased to confirm that all services for the below booking are now CONFIRMED:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
STATUS: CONFIRMED
CONFIRMATION DATE: {{ConfirmationDate}}
═══════════════════════════════════════

GUEST DETAILS:
• Full Name: {{GuestName}}
• Nationality: {{Nationality}}
• Passport Number: {{PassportNumber}}
• Number of Travelers: {{Pax}}

TRAVEL DATES: {{TravelDates}}

───────────────────────────────────────
CONFIRMED SERVICES:
───────────────────────────────────────
{{ConfirmedServices}}

───────────────────────────────────────
ACCOMMODATION:
───────────────────────────────────────
{{AccommodationDetails}}

───────────────────────────────────────
FINANCIAL SUMMARY:
Total Cost: {{TotalCost}} {{Currency}}
Deposit Received: {{DepositReceived}} {{Currency}}
Balance Due: {{BalanceDue}} {{Currency}}
Balance Due Date: {{BalanceDueDate}}
───────────────────────────────────────

EMERGENCY CONTACT:
{{EmergencyContact}}

Vouchers will be issued upon receipt of final payment.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{Nationality}}", "{{PassportNumber}}", "{{Pax}}", "{{TravelDates}}", "{{ConfirmationDate}}", "{{ConfirmedServices}}", "{{AccommodationDetails}}", "{{TotalCost}}", "{{DepositReceived}}", "{{BalanceDue}}", "{{BalanceDueDate}}", "{{Currency}}", "{{EmergencyContact}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- 3.3 Service Summary / Ground Handling Confirmation (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Service Summary',
  'Clean overview of all confirmed services',
  'b2b',
  'confirmations',
  'email',
  'Service Summary - {{BookingRef}} - {{GuestName}}',
  'Dear {{AgentName}},

Please find below the complete service summary for your reference:

═══════════════════════════════════════
BOOKING: {{BookingRef}}
GUEST: {{GuestName}} ({{Pax}} pax)
DATES: {{TravelDates}}
═══════════════════════════════════════

DAY-BY-DAY SERVICES:
───────────────────────────────────────
{{DayByDayServices}}
───────────────────────────────────────

ACCOMMODATION SUMMARY:
{{AccommodationSummary}}

TRANSPORT SUMMARY:
{{TransportSummary}}

GUIDE SERVICES:
{{GuideServices}}

INCLUDED MEALS:
{{MealsSummary}}

───────────────────────────────────────
SUPPLIER CONTACTS (FOR EMERGENCIES):
{{SupplierContacts}}
───────────────────────────────────────

Please review and confirm all details are correct.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{Pax}}", "{{TravelDates}}", "{{DayByDayServices}}", "{{AccommodationSummary}}", "{{TransportSummary}}", "{{GuideServices}}", "{{MealsSummary}}", "{{SupplierContacts}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- =====================================================
-- 4. FINANCIAL COMMUNICATION
-- =====================================================

-- 4.1 Payment Request / Deposit Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Payment Request',
  'Request deposit or payment professionally',
  'b2b',
  'payments',
  'email',
  'Payment Request - Booking {{BookingRef}} - {{PaymentType}}',
  'Dear {{AgentName}},

Kindly arrange payment for the following booking:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
TRAVEL DATES: {{TravelDates}}
═══════════════════════════════════════

PAYMENT DETAILS:
───────────────────────────────────────
Payment Type: {{PaymentType}}
Amount Due: {{AmountDue}} {{Currency}}
Due Date: {{DueDate}}
───────────────────────────────────────

BANK DETAILS:
{{BankDetails}}

IMPORTANT:
• Please include booking reference {{BookingRef}} in the transfer description
• Services will be confirmed/vouchers issued upon receipt of payment
• Late payment may result in release of bookings

Please send payment confirmation once transferred.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{TravelDates}}", "{{PaymentType}}", "{{AmountDue}}", "{{DueDate}}", "{{Currency}}", "{{BankDetails}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 4.1 Payment Request (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Payment Request - WhatsApp',
  'Quick payment request',
  'b2b',
  'payments',
  'whatsapp',
  'Dear {{AgentName}},

*Payment Request*

Booking: {{BookingRef}}
Guest: {{GuestName}}
Amount: *{{AmountDue}} {{Currency}}*
Due: {{DueDate}}

Please arrange payment and send confirmation.

{{SenderName}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{AmountDue}}", "{{Currency}}", "{{DueDate}}", "{{SenderName}}"]'::jsonb,
  true
);

-- 4.2 Payment Received Confirmation (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Payment Received Confirmation',
  'Confirm receipt of payment',
  'b2b',
  'payments',
  'email',
  'Payment Received - Booking {{BookingRef}} - Thank You',
  'Dear {{AgentName}},

We confirm receipt of your payment:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
═══════════════════════════════════════

PAYMENT RECEIVED:
───────────────────────────────────────
Amount: {{AmountReceived}} {{Currency}}
Date Received: {{PaymentDate}}
Payment Method: {{PaymentMethod}}
Transaction Reference: {{TransactionRef}}
───────────────────────────────────────

ACCOUNT STATUS:
Total Cost: {{TotalCost}} {{Currency}}
Total Paid: {{TotalPaid}} {{Currency}}
Balance: {{Balance}} {{Currency}}

{{NextSteps}}

Thank you for your payment.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{AmountReceived}}", "{{PaymentDate}}", "{{PaymentMethod}}", "{{TransactionRef}}", "{{TotalCost}}", "{{TotalPaid}}", "{{Balance}}", "{{Currency}}", "{{NextSteps}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 4.3 Balance Reminder (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Balance Reminder',
  'Polite reminder for outstanding balance',
  'b2b',
  'payments',
  'email',
  'Reminder: Balance Due - Booking {{BookingRef}}',
  'Dear {{AgentName}},

This is a friendly reminder regarding the outstanding balance for the following booking:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
TRAVEL DATES: {{TravelDates}}
═══════════════════════════════════════

PAYMENT STATUS:
───────────────────────────────────────
Total Cost: {{TotalCost}} {{Currency}}
Amount Paid: {{AmountPaid}} {{Currency}}
Outstanding Balance: {{BalanceDue}} {{Currency}}
Original Due Date: {{OriginalDueDate}}
───────────────────────────────────────

Please arrange payment at your earliest convenience to avoid any impact on confirmed services.

If payment has already been made, kindly disregard this reminder and send us the transfer confirmation.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{TravelDates}}", "{{TotalCost}}", "{{AmountPaid}}", "{{BalanceDue}}", "{{OriginalDueDate}}", "{{Currency}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- =====================================================
-- 5. CANCELLATIONS, RISKS & PROTECTION
-- =====================================================

-- 5.1 Cancellation Acknowledgement (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Cancellation Acknowledgement',
  'Acknowledge receipt of cancellation request',
  'b2b',
  'cancellations',
  'email',
  'Cancellation Received - Booking {{BookingRef}}',
  'Dear {{AgentName}},

We acknowledge receipt of your cancellation request for the following booking:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
TRAVEL DATES: {{TravelDates}}
CANCELLATION RECEIVED: {{CancellationDate}}
═══════════════════════════════════════

We are currently processing your request and calculating any applicable charges based on our terms and conditions.

We will send you a detailed cancellation statement within {{ResponseTime}}.

If you have any questions, please don''t hesitate to contact us.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{TravelDates}}", "{{CancellationDate}}", "{{ResponseTime}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 5.2 Cancellation Charges Notification (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Cancellation Charges',
  'Clearly state cancellation penalties',
  'b2b',
  'cancellations',
  'email',
  'Cancellation Charges - Booking {{BookingRef}}',
  'Dear {{AgentName}},

Following your cancellation request for booking {{BookingRef}}, please find below the cancellation charges:

═══════════════════════════════════════
BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
ORIGINAL TRAVEL DATES: {{TravelDates}}
CANCELLATION DATE: {{CancellationDate}}
═══════════════════════════════════════

CANCELLATION BREAKDOWN:
───────────────────────────────────────
{{CancellationBreakdown}}
───────────────────────────────────────

SUMMARY:
Total Booking Value: {{TotalBookingValue}} {{Currency}}
Cancellation Charges: {{CancellationCharges}} {{Currency}}
Refund Due: {{RefundDue}} {{Currency}}

───────────────────────────────────────
POLICY REFERENCE:
{{PolicyReference}}
───────────────────────────────────────

{{RefundInstructions}}

Please confirm your acceptance of these charges.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{TravelDates}}", "{{CancellationDate}}", "{{CancellationBreakdown}}", "{{TotalBookingValue}}", "{{CancellationCharges}}", "{{RefundDue}}", "{{Currency}}", "{{PolicyReference}}", "{{RefundInstructions}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 5.3 Force Majeure / Operational Constraint Notice (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Force Majeure Notice',
  'Notify about operational constraints beyond control',
  'b2b',
  'cancellations',
  'email',
  'IMPORTANT: Operational Notice - {{AffectedArea}} - {{IssueType}}',
  'Dear {{AgentName}},

We wish to inform you of a situation that may affect bookings in {{AffectedArea}}:

═══════════════════════════════════════
NOTICE TYPE: {{IssueType}}
AFFECTED AREA: {{AffectedArea}}
EFFECTIVE: {{EffectiveDate}}
STATUS: {{CurrentStatus}}
═══════════════════════════════════════

SITUATION:
{{SituationDescription}}

IMPACT ON SERVICES:
{{ServiceImpact}}

───────────────────────────────────────
AFFECTED BOOKINGS:
{{AffectedBookings}}
───────────────────────────────────────

RECOMMENDED ACTIONS:
{{RecommendedActions}}

ALTERNATIVE OPTIONS:
{{AlternativeOptions}}

───────────────────────────────────────

We will continue to monitor the situation and provide updates as available.

For any urgent matters, please contact us directly.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{IssueType}}", "{{AffectedArea}}", "{{EffectiveDate}}", "{{CurrentStatus}}", "{{SituationDescription}}", "{{ServiceImpact}}", "{{AffectedBookings}}", "{{RecommendedActions}}", "{{AlternativeOptions}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- =====================================================
-- 6. RELATIONSHIP & PROFESSIONALISM
-- =====================================================

-- 6.1 Post-Operation Follow-Up (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Post-Operation Follow-Up',
  'Follow up after trip completion',
  'b2b',
  'relationship',
  'email',
  'Follow-Up: Booking {{BookingRef}} - {{GuestName}}',
  'Dear {{AgentName}},

We hope {{GuestName}}''s trip was enjoyable and met expectations.

TRIP SUMMARY:
• Booking Reference: {{BookingRef}}
• Travel Dates: {{TravelDates}}
• Services Provided: {{ServicesProvided}}

We would appreciate any feedback from your clients to help us maintain our service standards.

Should there be any outstanding matters or concerns, please don''t hesitate to let us know.

We look forward to our continued partnership.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{AgentName}}", "{{BookingRef}}", "{{GuestName}}", "{{TravelDates}}", "{{ServicesProvided}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- 6.2 Seasonal Rates / Product Update (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Product Update',
  'Share seasonal rates or product updates',
  'b2b',
  'relationship',
  'email',
  '{{UpdateType}} - {{Season}} {{Year}}',
  'Dear {{AgentName}},

We would like to share the following update:

═══════════════════════════════════════
{{UpdateType}}
EFFECTIVE: {{EffectivePeriod}}
═══════════════════════════════════════

{{UpdateDetails}}

KEY HIGHLIGHTS:
{{KeyHighlights}}

───────────────────────────────────────

For detailed information or specific quotes, please contact us.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{AgentName}}", "{{UpdateType}}", "{{Season}}", "{{Year}}", "{{EffectivePeriod}}", "{{UpdateDetails}}", "{{KeyHighlights}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- =====================================================
-- ADD B2B PLACEHOLDERS
-- =====================================================
INSERT INTO template_placeholders (placeholder, display_name, description, category, example_value)
VALUES
  ('{{AgentName}}', 'Agent Name', 'Name of the travel agent contact', 'b2b', 'John Smith'),
  ('{{QuoteRef}}', 'Quote Reference', 'Unique quotation reference number', 'b2b', 'QT-2026-0042'),
  ('{{QuoteVersion}}', 'Quote Version', 'Version number of the quote', 'b2b', '2'),
  ('{{PreviousVersion}}', 'Previous Version', 'Previous quote version number', 'b2b', '1'),
  ('{{ValidUntil}}', 'Valid Until', 'Quote validity expiry date', 'b2b', '15 March 2026'),
  ('{{ResponseTime}}', 'Response Time', 'Expected response timeframe', 'b2b', '24-48 hours'),
  ('{{TourName}}', 'Tour Name', 'Name of the tour package', 'b2b', 'Classic Egypt 8 Days'),
  ('{{TravelDates}}', 'Travel Dates', 'Travel date range', 'b2b', '10-17 March 2026'),
  ('{{Duration}}', 'Duration', 'Trip duration', 'b2b', '8 days / 7 nights'),
  ('{{Pax}}', 'Pax', 'Number of travelers', 'b2b', '4 adults, 2 children'),
  ('{{ServiceLevel}}', 'Service Level', 'Service tier/category', 'b2b', 'Deluxe'),
  ('{{PricingBreakdown}}', 'Pricing Breakdown', 'Detailed price breakdown', 'b2b', 'Accommodation: $1,200...'),
  ('{{TotalPrice}}', 'Total Price', 'Total quotation price', 'b2b', '3,500.00'),
  ('{{Inclusions}}', 'Inclusions', 'List of included services', 'b2b', '• Airport transfers...'),
  ('{{Exclusions}}', 'Exclusions', 'List of excluded items', 'b2b', '• International flights...'),
  ('{{Assumptions}}', 'Assumptions', 'Quote assumptions and conditions', 'b2b', '• Based on 4-star hotels...'),
  ('{{PaymentTerms}}', 'Payment Terms', 'Payment schedule and terms', 'b2b', '30% deposit, balance 30 days prior'),
  ('{{CancellationPolicy}}', 'Cancellation Policy', 'Cancellation terms', 'b2b', '30+ days: 10% penalty...'),
  ('{{RevisionReason}}', 'Revision Reason', 'Reason for quote revision', 'b2b', 'hotel category upgrade'),
  ('{{ChangesSummary}}', 'Changes Summary', 'Summary of changes made', 'b2b', '• Upgraded from 4* to 5* hotels'),
  ('{{PreviousTotal}}', 'Previous Total', 'Previous quote total', 'b2b', '3,200.00'),
  ('{{MissingInfo}}', 'Missing Info', 'List of missing information', 'b2b', '• Exact nationality...'),
  ('{{Clarifications}}', 'Clarifications', 'Questions needing clarification', 'b2b', '• Private or shared tours?'),
  ('{{HoldExpiry}}', 'Hold Expiry', 'Provisional hold expiry date/time', 'b2b', '5 March 2026, 18:00'),
  ('{{DepositAmount}}', 'Deposit Amount', 'Required deposit amount', 'b2b', '1,000.00'),
  ('{{DepositDeadline}}', 'Deposit Deadline', 'Deposit payment deadline', 'b2b', '3 March 2026'),
  ('{{ServicesOnHold}}', 'Services on Hold', 'List of services on provisional hold', 'b2b', '• Marriott Mena House...'),
  ('{{ConfirmedServices}}', 'Confirmed Services', 'List of confirmed services', 'b2b', 'Day 1: Airport transfer...'),
  ('{{AccommodationDetails}}', 'Accommodation Details', 'Detailed accommodation info', 'b2b', 'Night 1-2: Marriott...'),
  ('{{BalanceDue}}', 'Balance Due', 'Outstanding balance amount', 'b2b', '2,500.00'),
  ('{{BalanceDueDate}}', 'Balance Due Date', 'Balance payment due date', 'b2b', '1 March 2026'),
  ('{{EmergencyContact}}', 'Emergency Contact', 'Emergency contact details', 'b2b', '+20 123 456 7890 (24/7)'),
  ('{{DayByDayServices}}', 'Day-by-Day Services', 'Complete day-by-day breakdown', 'b2b', 'Day 1: Arrival...'),
  ('{{AccommodationSummary}}', 'Accommodation Summary', 'Summary of all accommodation', 'b2b', '2 nights Cairo, 3 nights cruise...'),
  ('{{TransportSummary}}', 'Transport Summary', 'Summary of transport services', 'b2b', 'Private A/C vehicle throughout'),
  ('{{GuideServices}}', 'Guide Services', 'Guide service details', 'b2b', 'English-speaking guide: Days 1-8'),
  ('{{MealsSummary}}', 'Meals Summary', 'Summary of included meals', 'b2b', '7 breakfasts, 4 lunches, 3 dinners'),
  ('{{SupplierContacts}}', 'Supplier Contacts', 'Emergency supplier contact list', 'b2b', 'Hotel: +20 xxx, Guide: +20 xxx'),
  ('{{PaymentType}}', 'Payment Type', 'Type of payment requested', 'b2b', 'Deposit'),
  ('{{AmountDue}}', 'Amount Due', 'Amount due for payment', 'b2b', '1,000.00'),
  ('{{DueDate}}', 'Due Date', 'Payment due date', 'b2b', '5 March 2026'),
  ('{{BankDetails}}', 'Bank Details', 'Bank account details for transfer', 'b2b', 'Bank: XYZ Bank...'),
  ('{{AmountReceived}}', 'Amount Received', 'Payment amount received', 'b2b', '1,000.00'),
  ('{{PaymentDate}}', 'Payment Date', 'Date payment was received', 'b2b', '3 March 2026'),
  ('{{PaymentMethod}}', 'Payment Method', 'Method of payment', 'b2b', 'Bank Transfer'),
  ('{{TransactionRef}}', 'Transaction Ref', 'Payment transaction reference', 'b2b', 'TRX-20260303-001'),
  ('{{TotalCost}}', 'Total Cost', 'Total booking cost', 'b2b', '3,500.00'),
  ('{{TotalPaid}}', 'Total Paid', 'Total amount paid to date', 'b2b', '1,000.00'),
  ('{{Balance}}', 'Balance', 'Remaining balance', 'b2b', '2,500.00'),
  ('{{NextSteps}}', 'Next Steps', 'Next steps after payment', 'b2b', 'Balance due by 1 March. Vouchers will be issued upon final payment.'),
  ('{{AmountPaid}}', 'Amount Paid', 'Total amount already paid', 'b2b', '1,000.00'),
  ('{{OriginalDueDate}}', 'Original Due Date', 'Original payment due date', 'b2b', '25 February 2026'),
  ('{{CancellationBreakdown}}', 'Cancellation Breakdown', 'Detailed cancellation charges', 'b2b', 'Hotel: $200, Cruise: $500...'),
  ('{{TotalBookingValue}}', 'Total Booking Value', 'Original total booking value', 'b2b', '3,500.00'),
  ('{{CancellationCharges}}', 'Cancellation Charges', 'Total cancellation charges', 'b2b', '700.00'),
  ('{{RefundDue}}', 'Refund Due', 'Amount to be refunded', 'b2b', '300.00'),
  ('{{PolicyReference}}', 'Policy Reference', 'Reference to applicable policy', 'b2b', 'As per our T&Cs section 5.2...'),
  ('{{RefundInstructions}}', 'Refund Instructions', 'Instructions for refund processing', 'b2b', 'Refund will be processed within 14 working days.'),
  ('{{IssueType}}', 'Issue Type', 'Type of operational issue', 'b2b', 'Force Majeure'),
  ('{{AffectedArea}}', 'Affected Area', 'Geographic area affected', 'b2b', 'South Sinai'),
  ('{{EffectiveDate}}', 'Effective Date', 'Date issue became effective', 'b2b', '1 March 2026'),
  ('{{CurrentStatus}}', 'Current Status', 'Current situation status', 'b2b', 'Under Review'),
  ('{{SituationDescription}}', 'Situation Description', 'Description of the situation', 'b2b', 'Due to weather conditions...'),
  ('{{ServiceImpact}}', 'Service Impact', 'Impact on services', 'b2b', 'Abu Simbel flights suspended'),
  ('{{AffectedBookings}}', 'Affected Bookings', 'List of affected bookings', 'b2b', 'BKG-001, BKG-002, BKG-003'),
  ('{{RecommendedActions}}', 'Recommended Actions', 'Suggested actions to take', 'b2b', 'Consider alternative dates...'),
  ('{{AlternativeOptions}}', 'Alternative Options', 'Available alternatives', 'b2b', 'Option A: Reschedule to...'),
  ('{{ServicesProvided}}', 'Services Provided', 'Summary of services delivered', 'b2b', 'Cairo tour, Nile cruise, Luxor tour'),
  ('{{UpdateType}}', 'Update Type', 'Type of update notification', 'b2b', 'New Season Rates'),
  ('{{Season}}', 'Season', 'Travel season', 'b2b', 'Winter'),
  ('{{Year}}', 'Year', 'Year', 'b2b', '2026'),
  ('{{EffectivePeriod}}', 'Effective Period', 'Period rates/update applies', 'b2b', 'November 2026 - March 2027'),
  ('{{UpdateDetails}}', 'Update Details', 'Details of the update', 'b2b', 'New contracted rates with hotels...'),
  ('{{KeyHighlights}}', 'Key Highlights', 'Key points to highlight', 'b2b', '• 15% reduction on 5* hotels...')
ON CONFLICT (placeholder) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  example_value = EXCLUDED.example_value;
