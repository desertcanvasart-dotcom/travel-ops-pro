// Transport Voucher Template - Updated
// Shows: Company, Vehicle Type, Route, Price per service

import { format } from 'date-fns'

interface TransportService {
  date: string
  day_number: number
  service_name: string
  vehicle_type?: string
  pickup_location?: string
  dropoff_location?: string
  pickup_time?: string
  city?: string
  quantity: number
  rate_eur: number
  total_cost: number
  notes?: string
}

interface TransportVoucherData {
  voucher_number: string
  created_date: string
  status: string
  supplier: {
    name: string
    contact_name?: string
    contact_phone?: string
    contact_email?: string
    city?: string
  }
  client: {
    name: string
    pax: number
    adults: number
    children: number
  }
  services: TransportService[]
  totals: {
    total_services: number
    total_cost: number
  }
  notes?: string
}

export function generateTransportVoucherHTML(data: TransportVoucherData): string {
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'EEE, MMM d, yyyy')
    } catch {
      return dateStr
    }
  }

  const formatShortDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d')
    } catch {
      return dateStr
    }
  }

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return ''
    try {
      const [hours, minutes] = timeStr.split(':')
      const hour = parseInt(hours)
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const hour12 = hour % 12 || 12
      return `${hour12}:${minutes} ${ampm}`
    } catch {
      return timeStr
    }
  }

  // Group services by date
  const servicesByDate = data.services.reduce((acc, service) => {
    const date = service.date
    if (!acc[date]) acc[date] = []
    acc[date].push(service)
    return acc
  }, {} as Record<string, TransportService[]>)

  const servicesHTML = Object.entries(servicesByDate)
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([date, services]) => {
      const serviceRows = services.map(service => `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: 500; color: #111827;">${service.service_name}</div>
            ${service.vehicle_type ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">🚗 ${service.vehicle_type}</div>` : ''}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
            ${service.pickup_location && service.dropoff_location ? `
              <div style="font-size: 13px; color: #374151;">
                <span style="font-weight: 500;">${service.pickup_location}</span>
                <span style="color: #9ca3af; margin: 0 6px;">→</span>
                <span style="font-weight: 500;">${service.dropoff_location}</span>
              </div>
            ` : `<span style="color: #9ca3af;">—</span>`}
            ${service.pickup_time ? `
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                🕐 Pickup: ${formatTime(service.pickup_time)}
              </div>
            ` : ''}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #059669;">
            €${service.total_cost.toFixed(2)}
          </td>
        </tr>
      `).join('')

      return `
        <tr>
          <td colspan="3" style="padding: 10px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: 600; color: #374151; font-size: 13px;">
              📅 ${formatDate(date)}
              ${services[0]?.city ? `<span style="color: #6b7280; font-weight: 400; margin-left: 8px;">• ${services[0].city}</span>` : ''}
            </div>
          </td>
        </tr>
        ${serviceRows}
      `
    }).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transport Voucher - ${data.voucher_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 24px; }
    .voucher { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
    @media print {
      body { background: white; padding: 0; }
      .voucher { box-shadow: none; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="voucher">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color: white; padding: 24px 32px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 4px;">TRAVEL2EGYPT</h1>
          <p style="font-size: 14px; opacity: 0.9;">Transport Voucher</p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 18px; font-weight: 700; font-family: monospace;">${data.voucher_number}</div>
          <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">${formatDate(data.created_date)}</div>
          <div style="margin-top: 8px;">
            <span style="display: inline-block; padding: 4px 12px; background: rgba(255,255,255,0.2); border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
              ${data.status}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Transport Company & Client Info -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
      <!-- Transport Company -->
      <div>
        <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
          Transport Company
        </div>
        <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 4px;">
          ${data.supplier.name}
        </div>
        ${data.supplier.city ? `<div style="font-size: 13px; color: #6b7280;">📍 ${data.supplier.city}</div>` : ''}
        ${data.supplier.contact_name ? `<div style="font-size: 13px; color: #374151; margin-top: 8px;">👤 ${data.supplier.contact_name}</div>` : ''}
        ${data.supplier.contact_phone ? `<div style="font-size: 13px; color: #374151;">📞 ${data.supplier.contact_phone}</div>` : ''}
        ${data.supplier.contact_email ? `<div style="font-size: 13px; color: #374151;">✉️ ${data.supplier.contact_email}</div>` : ''}
      </div>

      <!-- Client Info -->
      <div>
        <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
          Guest Information
        </div>
        <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 4px;">
          ${data.client.name}
        </div>
        <div style="display: flex; gap: 16px; margin-top: 8px;">
          <div style="background: #f3f4f6; padding: 8px 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: #0d9488;">${data.client.pax}</div>
            <div style="font-size: 11px; color: #6b7280;">Total Pax</div>
          </div>
          <div style="background: #f3f4f6; padding: 8px 12px; border-radius: 8px;">
            <div style="font-size: 13px; color: #374151;">
              ${data.client.adults} Adult${data.client.adults !== 1 ? 's' : ''}
              ${data.client.children > 0 ? `, ${data.client.children} Child${data.client.children !== 1 ? 'ren' : ''}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Services Table -->
    <div style="padding: 24px 32px;">
      <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
        Transport Services
      </div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb;">Service</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb;">Route</th>
            <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${servicesHTML}
        </tbody>
        <tfoot>
          <tr style="background: #f0fdf4;">
            <td colspan="2" style="padding: 14px 16px; font-weight: 600; color: #374151;">
              Total (${data.totals.total_services} service${data.totals.total_services !== 1 ? 's' : ''})
            </td>
            <td style="padding: 14px 16px; text-align: right; font-weight: 700; font-size: 18px; color: #059669;">
              €${data.totals.total_cost.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    ${data.notes ? `
    <!-- Notes -->
    <div style="padding: 0 32px 24px;">
      <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px 16px;">
        <div style="font-size: 12px; font-weight: 600; color: #92400e; margin-bottom: 4px;">📝 Notes</div>
        <div style="font-size: 13px; color: #78350f;">${data.notes}</div>
      </div>
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 12px; color: #6b7280;">
          Generated by Autoura • Travel2Egypt Operations
        </div>
        <div style="font-size: 12px; color: #6b7280;">
          ${formatDate(new Date().toISOString())}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`
}

// Export function to transform API data to voucher format
export function prepareTransportVoucherData(
  document: any,
  supplier: any,
  client: any,
  services: any[]
): TransportVoucherData {
  return {
    voucher_number: document.document_number,
    created_date: document.created_at,
    status: document.status,
    supplier: {
      name: supplier?.name || document.supplier_name || 'Unknown',
      contact_name: supplier?.contact_name,
      contact_phone: supplier?.contact_phone,
      contact_email: supplier?.contact_email,
      city: supplier?.city
    },
    client: {
      name: client?.name || 'Guest',
      pax: (client?.adults || 1) + (client?.children || 0),
      adults: client?.adults || 1,
      children: client?.children || 0
    },
    services: services.map(s => ({
      date: s.date,
      day_number: s.day_number,
      service_name: s.service_name,
      vehicle_type: s.vehicle_type,
      pickup_location: s.pickup_location,
      dropoff_location: s.dropoff_location,
      pickup_time: s.pickup_time,
      city: s.city,
      quantity: s.quantity || 1,
      rate_eur: s.rate_eur || 0,
      total_cost: s.total_cost || 0,
      notes: s.notes
    })),
    totals: {
      total_services: services.length,
      total_cost: services.reduce((sum, s) => sum + (s.total_cost || 0), 0)
    },
    notes: document.notes
  }
}