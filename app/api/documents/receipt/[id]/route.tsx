import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 60,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    textAlign: 'center',
    marginBottom: 40,
    paddingBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#6B8E23',
    marginBottom: 10,
  },
  companyInfo: {
    fontSize: 10,
    color: '#666',
    marginTop: 5,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    flexWrap: 'wrap',
  },
  detailBox: {
    width: '48%',
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#111',
  },
  paymentBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 20,
    marginBottom: 30,
  },
  paymentTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  paymentLabel: {
    fontSize: 10,
    color: '#666',
  },
  paymentValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  amountBox: {
    backgroundColor: '#6B8E23',
    borderRadius: 8,
    padding: 30,
    textAlign: 'center',
    marginBottom: 30,
  },
  amountLabel: {
    fontSize: 11,
    color: '#E8F5E9',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  notesBox: {
    marginBottom: 30,
  },
  notesTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 9,
    color: '#666',
    lineHeight: 1.5,
  },
  footer: {
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
    paddingTop: 20,
    textAlign: 'center',
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 9,
    color: '#666',
    marginTop: 5,
  },
})

const ReceiptPDF = ({ payment }: { payment: any }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>PAYMENT RECEIPT</Text>
        <Text style={styles.companyInfo}>Travel2Egypt</Text>
        <Text style={styles.companyInfo}>Cairo, Egypt | info@travel2egypt.com</Text>
      </View>

      {/* Receipt Details */}
      <View style={styles.detailsGrid}>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Receipt Number</Text>
          <Text style={styles.detailValue}>
            {payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`}
          </Text>
        </View>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>
            {new Date(payment.payment_date || Date.now()).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Text>
        </View>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Client Name</Text>
          <Text style={styles.detailValue}>{payment.client_name}</Text>
        </View>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Itinerary Code</Text>
          <Text style={styles.detailValue}>{payment.itinerary_code}</Text>
        </View>
      </View>

      {/* Payment Details */}
      <View style={styles.paymentBox}>
        <Text style={styles.paymentTitle}>Payment Details</Text>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Payment Type:</Text>
          <Text style={styles.paymentValue}>
            {payment.payment_type.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Payment Method:</Text>
          <Text style={styles.paymentValue}>
            {payment.payment_method.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Status:</Text>
          <Text style={[styles.paymentValue, { color: '#059669' }]}>
            {payment.payment_status.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Amount */}
      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>Amount Paid</Text>
        <Text style={styles.amountValue}>
          {payment.currency} {payment.amount.toFixed(2)}
        </Text>
      </View>

      {/* Notes */}
      {payment.notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesTitle}>Notes</Text>
          <Text style={styles.notesText}>{payment.notes}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Thank you for your payment!</Text>
        <Text style={styles.footerText}>
          This receipt confirms your payment has been received and processed.
        </Text>
        <Text style={styles.footerText}>
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
          client_name
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) throw error

    const formattedPayment = {
      ...payment,
      itinerary_code: payment.itineraries?.itinerary_code,
      client_name: payment.itineraries?.client_name,
    }

    const pdfBlob = await pdf(<ReceiptPDF payment={formattedPayment} />).toBlob()

    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${formattedPayment.itinerary_code}-${formattedPayment.transaction_reference || params.id}.pdf"`
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