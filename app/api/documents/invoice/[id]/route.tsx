import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6B8E23',
    marginBottom: 5,
  },
  invoiceNumber: {
    fontSize: 10,
    color: '#666',
  },
  companyInfo: {
    textAlign: 'right',
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  companyDetails: {
    fontSize: 9,
    color: '#666',
    marginBottom: 2,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 1,
  },
  clientName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  clientDetails: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  table: {
    marginBottom: 30,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#333',
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
  },
  tableCell: {
    fontSize: 10,
  },
  totalSection: {
    alignItems: 'flex-end',
    marginBottom: 30,
  },
  totalBox: {
    width: 250,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginTop: 10,
    backgroundColor: '#F0F4E8',
    borderRadius: 5,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  grandTotalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B8E23',
  },
  statusBadge: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: '#D1FAE5',
    borderRadius: 5,
    marginBottom: 30,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#065F46',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 20,
    marginTop: 30,
  },
  footerTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 9,
    color: '#666',
    lineHeight: 1.5,
  },
  thankYou: {
    textAlign: 'center',
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  thankYouText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 9,
    color: '#666',
  },
})

const InvoicePDF = ({ payment }: { payment: any }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>INVOICE</Text>
          <Text style={styles.invoiceNumber}>
            Invoice #{payment.transaction_reference || payment.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        <View style={styles.companyInfo}>
          <Text style={styles.companyName}>Autoura</Text>
          <Text style={styles.companyDetails}>Travel2Egypt</Text>
          <Text style={styles.companyDetails}>Cairo, Egypt</Text>
          <Text style={styles.companyDetails}>info@travel2egypt.com</Text>
        </View>
      </View>

      {/* Bill To */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bill To</Text>
        <Text style={styles.clientName}>{payment.client_name}</Text>
        {payment.client_email && (
          <Text style={styles.clientDetails}>{payment.client_email}</Text>
        )}
      </View>

      {/* Invoice Details */}
      <View style={styles.detailsGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Invoice Date</Text>
          <Text style={styles.detailValue}>
            {new Date(payment.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Payment Date</Text>
          <Text style={styles.detailValue}>
            {payment.payment_date 
              ? new Date(payment.payment_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })
              : 'Pending'
            }
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Itinerary</Text>
          <Text style={styles.detailValue}>{payment.itinerary_code}</Text>
        </View>
      </View>

      {/* Line Items */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Description</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Type</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Method</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Amount</Text>
        </View>
        <View style={styles.tableRow}>
          <View style={{ flex: 3 }}>
            <Text style={styles.tableCell}>Payment for {payment.itinerary_code}</Text>
            {payment.notes && (
              <Text style={[styles.tableCell, { fontSize: 8, color: '#666', marginTop: 3 }]}>
                {payment.notes}
              </Text>
            )}
          </View>
          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', textTransform: 'capitalize' }]}>
            {payment.payment_type.replace('_', ' ')}
          </Text>
          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', textTransform: 'capitalize' }]}>
            {payment.payment_method.replace('_', ' ')}
          </Text>
          <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontWeight: 'bold' }]}>
            {payment.currency} {payment.amount.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text>Subtotal:</Text>
            <Text style={{ fontWeight: 'bold' }}>
              {payment.currency} {payment.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total:</Text>
            <Text style={styles.grandTotalAmount}>
              {payment.currency} {payment.amount.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Payment Status */}
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>
          Payment Status: {payment.payment_status.replace('_', ' ').toUpperCase()}
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Terms & Conditions</Text>
        <Text style={styles.footerText}>
          Payment is due within 30 days of invoice date. Late payments may incur additional fees.
          All services are subject to our standard terms and conditions.
        </Text>
      </View>

      {/* Thank You */}
      <View style={styles.thankYou}>
        <Text style={styles.thankYouText}>Thank you for your business!</Text>
        <Text style={styles.contactText}>
          For questions, contact us at info@travel2egypt.com
        </Text>
      </View>
    </Page>
  </Document>
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()

    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          itinerary_code,
          client_name,
          client_email
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) throw error

    const formattedPayment = {
      ...payment,
      itinerary_code: payment.itineraries?.itinerary_code,
      client_name: payment.itineraries?.client_name,
      client_email: payment.itineraries?.client_email,
    }

    const pdfBlob = await pdf(<InvoicePDF payment={formattedPayment} />).toBlob()

    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${formattedPayment.itinerary_code}-${formattedPayment.transaction_reference || params.id}.pdf"`
      }
    })
  } catch (error: any) {
    console.error('PDF Generation Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}