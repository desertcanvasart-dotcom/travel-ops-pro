-- =====================================================
-- SUPPLIER MESSAGE TEMPLATES
-- =====================================================
-- Run this migration to add supplier templates to message_templates table
-- =====================================================

-- Hotel Reservation Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Hotel Reservation Request',
  'Request a hotel reservation for guests',
  'supplier',
  'hotel_reservation',
  'email',
  'Reservation Request - {{GuestName}} - {{CheckInDate}} to {{CheckOutDate}}',
  'Dear {{HotelName}} Reservations Team,

We would like to request a reservation with the following details:

BOOKING DETAILS:
Guest Name: {{GuestName}}
Number of Guests: {{NumAdults}} Adults, {{NumChildren}} Children
Check-in: {{CheckInDate}}
Check-out: {{CheckOutDate}}
Number of Nights: {{NumNights}}
Room Type: {{RoomType}}

SPECIAL REQUESTS:
{{SpecialRequests}}

Please confirm availability and rate at your earliest convenience.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{HotelName}}", "{{GuestName}}", "{{NumAdults}}", "{{NumChildren}}", "{{CheckInDate}}", "{{CheckOutDate}}", "{{NumNights}}", "{{RoomType}}", "{{SpecialRequests}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- Hotel Reservation Request (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Hotel Reservation - WhatsApp',
  'Quick hotel reservation request via WhatsApp',
  'supplier',
  'hotel_reservation',
  'whatsapp',
  'Hello {{HotelName}},

New reservation request:

*Guest:* {{GuestName}}
*Dates:* {{CheckInDate}} - {{CheckOutDate}}
*Guests:* {{NumAdults}} adults, {{NumChildren}} children
*Room:* {{RoomType}}

Please confirm availability and rate.

Thank you,
{{SenderName}}',
  '["{{HotelName}}", "{{GuestName}}", "{{CheckInDate}}", "{{CheckOutDate}}", "{{NumAdults}}", "{{NumChildren}}", "{{RoomType}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Transport Booking Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Transport Booking Request',
  'Request transport service from supplier',
  'supplier',
  'transport_booking',
  'email',
  'Transport Request - {{ServiceDate}} - {{GuestName}}',
  'Dear {{SupplierName}},

We would like to book transport services as follows:

SERVICE DETAILS:
Date: {{ServiceDate}}
Guest Name: {{GuestName}}
Number of Passengers: {{NumPassengers}}
Pickup Location: {{PickupLocation}}
Pickup Time: {{PickupTime}}
Drop-off Location: {{DropoffLocation}}
Vehicle Type: {{VehicleType}}

ADDITIONAL NOTES:
{{AdditionalNotes}}

Please confirm availability and provide a quote.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{SupplierName}}", "{{ServiceDate}}", "{{GuestName}}", "{{NumPassengers}}", "{{PickupLocation}}", "{{PickupTime}}", "{{DropoffLocation}}", "{{VehicleType}}", "{{AdditionalNotes}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- Transport Booking (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Transport Booking - WhatsApp',
  'Quick transport booking via WhatsApp',
  'supplier',
  'transport_booking',
  'whatsapp',
  'Hello {{SupplierName}},

Transport booking request:

*Date:* {{ServiceDate}}
*Guest:* {{GuestName}}
*Passengers:* {{NumPassengers}}
*From:* {{PickupLocation}} at {{PickupTime}}
*To:* {{DropoffLocation}}
*Vehicle:* {{VehicleType}}

Please confirm.

{{SenderName}}',
  '["{{SupplierName}}", "{{ServiceDate}}", "{{GuestName}}", "{{NumPassengers}}", "{{PickupLocation}}", "{{PickupTime}}", "{{DropoffLocation}}", "{{VehicleType}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Guide Assignment Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Guide Assignment Request',
  'Request guide services for a tour',
  'supplier',
  'guide_assignment',
  'email',
  'Guide Assignment - {{TourName}} - {{ServiceDate}}',
  'Dear {{GuideName}},

We would like to assign you to the following tour:

TOUR DETAILS:
Tour Name: {{TourName}}
Date: {{ServiceDate}}
Duration: {{Duration}}
Meeting Point: {{MeetingPoint}}
Meeting Time: {{MeetingTime}}

GUEST INFORMATION:
Guest Name: {{GuestName}}
Number of Guests: {{NumGuests}}
Languages: {{Languages}}
Nationality: {{Nationality}}

ITINERARY:
{{Itinerary}}

SPECIAL NOTES:
{{SpecialNotes}}

Please confirm your availability.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{GuideName}}", "{{TourName}}", "{{ServiceDate}}", "{{Duration}}", "{{MeetingPoint}}", "{{MeetingTime}}", "{{GuestName}}", "{{NumGuests}}", "{{Languages}}", "{{Nationality}}", "{{Itinerary}}", "{{SpecialNotes}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- Guide Assignment (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Guide Assignment - WhatsApp',
  'Quick guide assignment via WhatsApp',
  'supplier',
  'guide_assignment',
  'whatsapp',
  'Hello {{GuideName}},

New assignment:

*Tour:* {{TourName}}
*Date:* {{ServiceDate}}
*Time:* {{MeetingTime}}
*Location:* {{MeetingPoint}}
*Guest:* {{GuestName}} ({{NumGuests}} pax)

Please confirm availability.

{{SenderName}}',
  '["{{GuideName}}", "{{TourName}}", "{{ServiceDate}}", "{{MeetingTime}}", "{{MeetingPoint}}", "{{GuestName}}", "{{NumGuests}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Cruise Booking Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Nile Cruise Booking Request',
  'Request a Nile cruise booking',
  'supplier',
  'cruise_booking',
  'email',
  'Cruise Booking Request - {{CruiseName}} - {{BoardingDate}}',
  'Dear {{CruiseName}} Reservations,

We would like to request a cabin reservation:

BOOKING DETAILS:
Guest Name: {{GuestName}}
Boarding Date: {{BoardingDate}}
Disembarkation Date: {{DisembarkationDate}}
Route: {{CruiseRoute}}
Cabin Type: {{CabinType}}
Number of Cabins: {{NumCabins}}
Guests: {{NumAdults}} Adults, {{NumChildren}} Children

SPECIAL REQUESTS:
- Dietary Requirements: {{DietaryRequirements}}
- Special Occasions: {{SpecialOccasions}}
- Other: {{OtherRequests}}

Please confirm availability and provide the net rate.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{CruiseName}}", "{{GuestName}}", "{{BoardingDate}}", "{{DisembarkationDate}}", "{{CruiseRoute}}", "{{CabinType}}", "{{NumCabins}}", "{{NumAdults}}", "{{NumChildren}}", "{{DietaryRequirements}}", "{{SpecialOccasions}}", "{{OtherRequests}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- Cruise Booking (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Nile Cruise Booking - WhatsApp',
  'Quick cruise booking via WhatsApp',
  'supplier',
  'cruise_booking',
  'whatsapp',
  'Hello {{CruiseName}},

Cruise booking request:

*Guest:* {{GuestName}}
*Dates:* {{BoardingDate}} - {{DisembarkationDate}}
*Route:* {{CruiseRoute}}
*Cabin:* {{CabinType}} x {{NumCabins}}
*Guests:* {{NumAdults}} adults, {{NumChildren}} children

Please confirm availability and rate.

{{SenderName}}',
  '["{{CruiseName}}", "{{GuestName}}", "{{BoardingDate}}", "{{DisembarkationDate}}", "{{CruiseRoute}}", "{{CabinType}}", "{{NumCabins}}", "{{NumAdults}}", "{{NumChildren}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Service Order (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'General Service Order',
  'General service order for any supplier',
  'supplier',
  'service_order',
  'email',
  'Service Order - {{ServiceType}} - {{ServiceDate}}',
  'Dear {{SupplierName}},

We would like to place the following service order:

ORDER DETAILS:
Reference: {{BookingRef}}
Service Type: {{ServiceType}}
Date: {{ServiceDate}}
Time: {{ServiceTime}}
Location: {{ServiceLocation}}

GUEST DETAILS:
Guest Name: {{GuestName}}
Number of Guests: {{NumGuests}}
Contact: {{GuestPhone}}

SERVICE DESCRIPTION:
{{ServiceDescription}}

SPECIAL REQUIREMENTS:
{{SpecialRequirements}}

Please confirm this order and provide the final cost.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{ServiceType}}", "{{ServiceDate}}", "{{ServiceTime}}", "{{ServiceLocation}}", "{{GuestName}}", "{{NumGuests}}", "{{GuestPhone}}", "{{ServiceDescription}}", "{{SpecialRequirements}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- Service Order (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Service Order - WhatsApp',
  'Quick service order via WhatsApp',
  'supplier',
  'service_order',
  'whatsapp',
  'Hello {{SupplierName}},

Service order:

*Ref:* {{BookingRef}}
*Service:* {{ServiceType}}
*Date:* {{ServiceDate}} at {{ServiceTime}}
*Location:* {{ServiceLocation}}
*Guest:* {{GuestName}} ({{NumGuests}} pax)

Please confirm.

{{SenderName}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{ServiceType}}", "{{ServiceDate}}", "{{ServiceTime}}", "{{ServiceLocation}}", "{{GuestName}}", "{{NumGuests}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Confirmation Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Confirmation Request',
  'Request confirmation of a pending booking',
  'supplier',
  'confirmation_request',
  'email',
  'URGENT: Confirmation Request - Ref {{BookingRef}}',
  'Dear {{SupplierName}},

We are following up on our booking request and kindly request your confirmation.

BOOKING REFERENCE: {{BookingRef}}
GUEST NAME: {{GuestName}}
SERVICE DATE: {{ServiceDate}}
SERVICE TYPE: {{ServiceType}}

We need confirmation by {{ConfirmationDeadline}} to finalize arrangements with our client.

Please reply with:
1. Confirmation status
2. Final pricing
3. Any special instructions

Thank you for your prompt attention.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{GuestName}}", "{{ServiceDate}}", "{{ServiceType}}", "{{ConfirmationDeadline}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- Confirmation Request (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Confirmation Request - WhatsApp',
  'Urgent confirmation request via WhatsApp',
  'supplier',
  'confirmation_request',
  'whatsapp',
  'Hello {{SupplierName}},

Kindly confirm our booking:

*Ref:* {{BookingRef}}
*Guest:* {{GuestName}}
*Date:* {{ServiceDate}}
*Service:* {{ServiceType}}

Need confirmation by {{ConfirmationDeadline}}.

Thank you,
{{SenderName}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{GuestName}}", "{{ServiceDate}}", "{{ServiceType}}", "{{ConfirmationDeadline}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Payment Notice (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Payment Notice to Supplier',
  'Notify supplier of upcoming or completed payment',
  'supplier',
  'payment_notice',
  'email',
  'Payment Notice - {{BookingRef}} - {{PaymentAmount}}',
  'Dear {{SupplierName}},

This is to inform you about a payment related to the following booking:

BOOKING DETAILS:
Reference: {{BookingRef}}
Guest Name: {{GuestName}}
Service Date: {{ServiceDate}}

PAYMENT INFORMATION:
Amount: {{PaymentAmount}} {{Currency}}
Payment Type: {{PaymentType}}
Payment Date: {{PaymentDate}}
Payment Method: {{PaymentMethod}}
Transaction Reference: {{TransactionRef}}

INVOICE/BOOKING DETAILS:
{{InvoiceDetails}}

Please confirm receipt of this payment notice.

Best regards,
{{SenderName}}
{{CompanyName}}
Accounts Department',
  '["{{SupplierName}}", "{{BookingRef}}", "{{GuestName}}", "{{ServiceDate}}", "{{PaymentAmount}}", "{{Currency}}", "{{PaymentType}}", "{{PaymentDate}}", "{{PaymentMethod}}", "{{TransactionRef}}", "{{InvoiceDetails}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- Payment Notice (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Payment Notice - WhatsApp',
  'Quick payment notification via WhatsApp',
  'supplier',
  'payment_notice',
  'whatsapp',
  'Hello {{SupplierName}},

Payment notification:

*Ref:* {{BookingRef}}
*Amount:* {{PaymentAmount}} {{Currency}}
*Date:* {{PaymentDate}}
*Type:* {{PaymentType}}

Please confirm receipt.

{{SenderName}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{PaymentAmount}}", "{{Currency}}", "{{PaymentDate}}", "{{PaymentType}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Amendment Request (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Booking Amendment Request',
  'Request changes to an existing booking',
  'supplier',
  'amendment',
  'email',
  'Amendment Request - Ref {{BookingRef}} - {{GuestName}}',
  'Dear {{SupplierName}},

We need to request an amendment to the following confirmed booking:

ORIGINAL BOOKING:
Reference: {{BookingRef}}
Guest Name: {{GuestName}}
Original Date: {{OriginalDate}}
Original Service: {{OriginalService}}

REQUESTED CHANGES:
{{AmendmentDetails}}

NEW DETAILS:
{{NewDetails}}

REASON FOR CHANGE:
{{AmendmentReason}}

Please confirm if these changes can be accommodated and advise of any rate adjustments or penalties.

We apologize for any inconvenience caused.

Best regards,
{{SenderName}}
{{CompanyName}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{GuestName}}", "{{OriginalDate}}", "{{OriginalService}}", "{{AmendmentDetails}}", "{{NewDetails}}", "{{AmendmentReason}}", "{{SenderName}}", "{{CompanyName}}"]'::jsonb,
  true
);

-- Amendment Request (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Amendment Request - WhatsApp',
  'Quick amendment request via WhatsApp',
  'supplier',
  'amendment',
  'whatsapp',
  'Hello {{SupplierName}},

Amendment request for:

*Ref:* {{BookingRef}}
*Guest:* {{GuestName}}

*Changes needed:*
{{AmendmentDetails}}

Please confirm if possible.

{{SenderName}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{GuestName}}", "{{AmendmentDetails}}", "{{SenderName}}"]'::jsonb,
  true
);

-- Cancellation Notice (Email)
INSERT INTO message_templates (name, description, category, subcategory, channel, subject, body, placeholders, is_active)
VALUES (
  'Booking Cancellation Notice',
  'Notify supplier of a booking cancellation',
  'supplier',
  'cancellation',
  'email',
  'CANCELLATION - Ref {{BookingRef}} - {{GuestName}}',
  'Dear {{SupplierName}},

We regret to inform you that we need to cancel the following booking:

BOOKING DETAILS:
Reference: {{BookingRef}}
Guest Name: {{GuestName}}
Service Date: {{ServiceDate}}
Service Type: {{ServiceType}}

REASON FOR CANCELLATION:
{{CancellationReason}}

CANCELLATION DATE: {{CancellationDate}}

Please confirm receipt of this cancellation and advise of any applicable cancellation charges per your terms and conditions.

We apologize for any inconvenience.

Best regards,
{{SenderName}}
{{CompanyName}}
{{SenderPhone}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{GuestName}}", "{{ServiceDate}}", "{{ServiceType}}", "{{CancellationReason}}", "{{CancellationDate}}", "{{SenderName}}", "{{CompanyName}}", "{{SenderPhone}}"]'::jsonb,
  true
);

-- Cancellation Notice (WhatsApp)
INSERT INTO message_templates (name, description, category, subcategory, channel, body, placeholders, is_active)
VALUES (
  'Cancellation Notice - WhatsApp',
  'Quick cancellation notice via WhatsApp',
  'supplier',
  'cancellation',
  'whatsapp',
  'Hello {{SupplierName}},

Unfortunately, we need to cancel:

*Ref:* {{BookingRef}}
*Guest:* {{GuestName}}
*Date:* {{ServiceDate}}

*Reason:* {{CancellationReason}}

Please confirm cancellation and any charges.

Apologies for the inconvenience.

{{SenderName}}',
  '["{{SupplierName}}", "{{BookingRef}}", "{{GuestName}}", "{{ServiceDate}}", "{{CancellationReason}}", "{{SenderName}}"]'::jsonb,
  true
);

-- =====================================================
-- Add supplier-specific placeholders to template_placeholders table (if it exists)
-- =====================================================
INSERT INTO template_placeholders (placeholder, display_name, description, category, example_value)
VALUES
  ('{{SupplierName}}', 'Supplier Name', 'Name of the supplier/vendor', 'supplier', 'Pyramids Transport Co.'),
  ('{{SupplierEmail}}', 'Supplier Email', 'Email address of the supplier', 'supplier', 'bookings@supplier.com'),
  ('{{SupplierPhone}}', 'Supplier Phone', 'Phone number of the supplier', 'supplier', '+20 123 456 7890'),
  ('{{SupplierWhatsApp}}', 'Supplier WhatsApp', 'WhatsApp number of the supplier', 'supplier', '+20 123 456 7890'),
  ('{{HotelName}}', 'Hotel Name', 'Name of the hotel', 'supplier', 'Marriott Mena House'),
  ('{{CruiseName}}', 'Cruise Name', 'Name of the Nile cruise', 'supplier', 'MS Oberoi Philae'),
  ('{{GuideName}}', 'Guide Name', 'Name of the tour guide', 'supplier', 'Ahmed Hassan'),
  ('{{BookingRef}}', 'Booking Reference', 'Internal booking reference number', 'booking', 'BKG-2026-0042'),
  ('{{ServiceDate}}', 'Service Date', 'Date of the service', 'booking', '15 March 2026'),
  ('{{ServiceTime}}', 'Service Time', 'Time of the service', 'booking', '09:00 AM'),
  ('{{ServiceType}}', 'Service Type', 'Type of service booked', 'booking', 'Airport Transfer'),
  ('{{ServiceLocation}}', 'Service Location', 'Location where service is provided', 'booking', 'Cairo International Airport'),
  ('{{ServiceDescription}}', 'Service Description', 'Detailed description of the service', 'booking', 'Private airport pickup with meet & greet'),
  ('{{PickupLocation}}', 'Pickup Location', 'Pickup address or location', 'transport', 'Four Seasons Hotel Cairo'),
  ('{{PickupTime}}', 'Pickup Time', 'Scheduled pickup time', 'transport', '08:00 AM'),
  ('{{DropoffLocation}}', 'Drop-off Location', 'Drop-off address or location', 'transport', 'Giza Pyramids'),
  ('{{VehicleType}}', 'Vehicle Type', 'Type of vehicle requested', 'transport', 'Mercedes Viano'),
  ('{{NumPassengers}}', 'Number of Passengers', 'Total number of passengers', 'transport', '4'),
  ('{{CheckInDate}}', 'Check-in Date', 'Hotel check-in date', 'hotel', '10 March 2026'),
  ('{{CheckOutDate}}', 'Check-out Date', 'Hotel check-out date', 'hotel', '12 March 2026'),
  ('{{NumNights}}', 'Number of Nights', 'Total number of nights', 'hotel', '2'),
  ('{{RoomType}}', 'Room Type', 'Type of room requested', 'hotel', 'Deluxe Pyramid View'),
  ('{{BoardingDate}}', 'Boarding Date', 'Cruise boarding date', 'cruise', '15 March 2026'),
  ('{{DisembarkationDate}}', 'Disembarkation Date', 'Cruise disembarkation date', 'cruise', '19 March 2026'),
  ('{{CruiseRoute}}', 'Cruise Route', 'Cruise itinerary route', 'cruise', 'Luxor to Aswan'),
  ('{{CabinType}}', 'Cabin Type', 'Type of cabin requested', 'cruise', 'Suite with Balcony'),
  ('{{NumCabins}}', 'Number of Cabins', 'Number of cabins requested', 'cruise', '1'),
  ('{{TourName}}', 'Tour Name', 'Name of the tour', 'tour', 'Full Day Pyramids & Sphinx'),
  ('{{Duration}}', 'Duration', 'Duration of the tour/service', 'tour', '8 hours'),
  ('{{MeetingPoint}}', 'Meeting Point', 'Where to meet the guide', 'tour', 'Hotel Lobby'),
  ('{{MeetingTime}}', 'Meeting Time', 'Time to meet', 'tour', '08:30 AM'),
  ('{{Itinerary}}', 'Itinerary', 'Detailed tour itinerary', 'tour', 'Pyramids - Sphinx - Lunch - Museum'),
  ('{{Languages}}', 'Languages', 'Language requirements', 'tour', 'English'),
  ('{{Nationality}}', 'Nationality', 'Guest nationality', 'guest', 'American'),
  ('{{NumGuests}}', 'Number of Guests', 'Total number of guests', 'guest', '4'),
  ('{{DietaryRequirements}}', 'Dietary Requirements', 'Special dietary needs', 'guest', 'Vegetarian'),
  ('{{SpecialOccasions}}', 'Special Occasions', 'Birthdays, anniversaries, etc.', 'guest', 'Honeymoon'),
  ('{{SpecialRequests}}', 'Special Requests', 'Any special requests', 'guest', 'Early check-in requested'),
  ('{{SpecialRequirements}}', 'Special Requirements', 'Special service requirements', 'guest', 'Wheelchair accessible'),
  ('{{SpecialNotes}}', 'Special Notes', 'Additional notes', 'general', 'VIP guests - extra attention'),
  ('{{OtherRequests}}', 'Other Requests', 'Other special requests', 'general', 'Flowers in room'),
  ('{{AdditionalNotes}}', 'Additional Notes', 'Additional notes for supplier', 'general', 'Please provide water bottles'),
  ('{{PaymentAmount}}', 'Payment Amount', 'Amount being paid', 'payment', '1,500.00'),
  ('{{Currency}}', 'Currency', 'Payment currency', 'payment', 'USD'),
  ('{{PaymentType}}', 'Payment Type', 'Type of payment (deposit, final, etc.)', 'payment', 'Final Payment'),
  ('{{PaymentDate}}', 'Payment Date', 'Date of payment', 'payment', '1 March 2026'),
  ('{{PaymentMethod}}', 'Payment Method', 'How payment was made', 'payment', 'Bank Transfer'),
  ('{{TransactionRef}}', 'Transaction Reference', 'Bank or payment transaction ID', 'payment', 'TRX-2026-03-001'),
  ('{{InvoiceDetails}}', 'Invoice Details', 'Invoice number and details', 'payment', 'INV-2026-0042'),
  ('{{ConfirmationDeadline}}', 'Confirmation Deadline', 'Date by which confirmation is needed', 'booking', '5 March 2026'),
  ('{{OriginalDate}}', 'Original Date', 'Original booking date before amendment', 'amendment', '10 March 2026'),
  ('{{OriginalService}}', 'Original Service', 'Original service before amendment', 'amendment', 'Standard Room'),
  ('{{AmendmentDetails}}', 'Amendment Details', 'Details of requested changes', 'amendment', 'Change room type from Standard to Deluxe'),
  ('{{NewDetails}}', 'New Details', 'New booking details after amendment', 'amendment', 'Deluxe Room with Nile View'),
  ('{{AmendmentReason}}', 'Amendment Reason', 'Reason for the change', 'amendment', 'Guest preference'),
  ('{{CancellationReason}}', 'Cancellation Reason', 'Reason for cancellation', 'cancellation', 'Change of travel plans'),
  ('{{CancellationDate}}', 'Cancellation Date', 'Date of cancellation request', 'cancellation', '1 March 2026')
ON CONFLICT (placeholder) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  example_value = EXCLUDED.example_value;
