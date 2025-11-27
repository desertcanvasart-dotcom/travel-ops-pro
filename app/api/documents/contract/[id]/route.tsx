import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#333',
  },
  contractInfo: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 10,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  subsectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 10,
  },
  text: {
    fontSize: 9,
    lineHeight: 1.5,
    marginBottom: 5,
  },
  boldText: {
    fontWeight: 'bold',
  },
  listItem: {
    fontSize: 9,
    marginLeft: 15,
    marginBottom: 4,
    lineHeight: 1.5,
  },
  highlight: {
    backgroundColor: '#F0F4E8',
    padding: 15,
    borderRadius: 5,
    marginBottom: 15,
  },
  highlightText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  box: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 5,
    marginBottom: 10,
  },
  signatureSection: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#333',
  },
  signatureLine: {
    borderBottomWidth: 2,
    borderBottomColor: '#666',
    width: 300,
    marginTop: 30,
    marginBottom: 5,
  },
  footer: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    fontSize: 8,
    fontStyle: 'italic',
    color: '#666',
  },
})

const ContractPDF = ({ data }: { data: any }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Title */}
      <View style={styles.title}>
        <Text>TRAVEL CONTRACT</Text>
        <Text style={styles.contractInfo}>Contract Number: {data.contractNumber}</Text>
        <Text style={styles.contractInfo}>
          Date: {new Date(data.contractDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
      </View>

      {/* Parties */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PARTIES</Text>
        
        <Text style={[styles.text, styles.boldText]}>Service Provider:</Text>
        <Text style={styles.text}>{data.serviceProvider}</Text>
        <Text style={styles.text}>Website: {data.providerWebsite}</Text>
        <Text style={styles.text}>{data.providerLocation}</Text>

        <Text style={[styles.text, styles.boldText, { marginTop: 10 }]}>Client(s):</Text>
        <Text style={styles.text}>Primary Traveler: {data.clientName}</Text>
        {data.clientEmail && <Text style={styles.text}>{data.clientEmail}</Text>}
        <Text style={styles.text}>Number of Travelers: {data.numTravelers} {data.numTravelers === 1 ? 'person' : 'persons'}</Text>
      </View>

      {/* Tour Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TOUR DETAILS</Text>
        <Text style={styles.text}>Tour Package: {data.tourPackage}</Text>
        <Text style={styles.text}>
          Tour Start Date: {new Date(data.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
        <Text style={styles.text}>
          Tour End Date: {new Date(data.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
        <Text style={styles.text}>Total Duration: {data.duration}</Text>
        <Text style={styles.text}>Destinations: {data.destinations}</Text>
      </View>

      {/* Financial Terms */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>FINANCIAL TERMS</Text>
        
        <View style={styles.highlight}>
          <Text style={styles.highlightText}>
            Total Package Price: USD ${data.totalCost.toLocaleString()}
          </Text>
          <Text style={[styles.text, { marginTop: 5 }]}>
            (USD ${(data.totalCost / data.numTravelers).toFixed(2)} per person × {data.numTravelers} {data.numTravelers === 1 ? 'traveler' : 'travelers'})
          </Text>
        </View>

        <Text style={styles.subsectionTitle}>PAYMENT SCHEDULE</Text>
        <View style={styles.box}>
          <Text style={styles.text}>{data.paymentTerms}</Text>
        </View>
      </View>
    </Page>

    {/* Page 2 - Inclusions & Cancellation */}
    <Page size="A4" style={styles.page}>
      {/* Inclusions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>INCLUSIONS</Text>
        
        <Text style={styles.subsectionTitle}>What's Included</Text>
        {data.inclusions.map((item: string, index: number) => (
          <Text key={index} style={styles.listItem}>• {item}</Text>
        ))}

        <Text style={styles.subsectionTitle}>What's Not Included</Text>
        {data.exclusions.map((item: string, index: number) => (
          <Text key={index} style={styles.listItem}>• {item}</Text>
        ))}
      </View>

      {/* Cancellation Policy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CANCELLATION POLICY</Text>
        
        <Text style={styles.subsectionTitle}>Standard Cancellation Policy</Text>
        <View style={styles.box}>
          <Text style={styles.text}>The following cancellation charges apply from the date written notice is received:</Text>
          <Text style={styles.text}>• Domestic tickets are the only non-refundable part of the trip from day 1.</Text>
          <Text style={styles.text}>• {data.cancellation45Days}</Text>
          <Text style={styles.text}>• {data.cancellation44to30Days}</Text>
          <Text style={styles.text}>• {data.cancellation29to15Days}</Text>
          <Text style={styles.text}>• {data.cancellation14to0Days}</Text>
          <Text style={styles.text}>• Cancellation fees will be applied on accommodation portions only.</Text>
        </View>

        <Text style={styles.subsectionTitle}>Flight Cancellation Policy</Text>
        <View style={styles.box}>
          <Text style={styles.text}>{data.flightCancellation}</Text>
        </View>

        <Text style={styles.subsectionTitle}>No-Show Policy</Text>
        <View style={styles.box}>
          <Text style={styles.text}>{data.noShowPolicy}</Text>
        </View>

        <Text style={styles.subsectionTitle}>Force Majeure</Text>
        <View style={styles.box}>
          <Text style={styles.text}>{data.forceMajeure}</Text>
        </View>
      </View>
    </Page>

    {/* Page 3 - Terms & Signatures */}
    <Page size="A4" style={styles.page}>
      {/* Terms & Conditions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TERMS AND CONDITIONS</Text>
        
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.text, styles.boldText]}>1. BOOKING CONFIRMATION</Text>
          <Text style={styles.text}>
            This contract becomes binding upon receipt of the required deposit and signed contract by {data.serviceProvider}.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.text, styles.boldText]}>2. TRAVEL DOCUMENTS</Text>
          <Text style={styles.text}>
            Clients are responsible for ensuring they have valid passports, visas, and any required health documentation for travel to Egypt.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.text, styles.boldText]}>3. HEALTH AND SAFETY</Text>
          <Text style={styles.text}>• Clients must disclose any medical conditions that may affect their ability to participate in tour activities</Text>
          <Text style={styles.text}>• Travel insurance is strongly recommended and may be required</Text>
          <Text style={styles.text}>• Clients participate in all activities at their own risk</Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.text, styles.boldText]}>4. CHANGES TO ITINERARY</Text>
          <Text style={styles.text}>
            {data.serviceProvider} reserves the right to modify the itinerary due to circumstances beyond our control. Every effort will be made to provide suitable alternatives of equal value.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.text, styles.boldText]}>5. LIABILITY LIMITATIONS</Text>
          <Text style={styles.text}>
            {data.serviceProvider}'s liability is limited to the cost of the tour package. We are not responsible for delays, cancellations, or changes made by third-party suppliers.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.text, styles.boldText]}>6. DISPUTE RESOLUTION</Text>
          <Text style={styles.text}>
            Any disputes arising from this contract shall be resolved through arbitration under Egyptian law.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.text, styles.boldText]}>7. DATA PROTECTION</Text>
          <Text style={styles.text}>
            Client information will be used solely for the purpose of providing travel services and will be handled in accordance with applicable privacy laws.
          </Text>
        </View>
      </View>

      {/* Special Notes */}
      {data.specialNotes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SPECIAL NOTES</Text>
          <View style={styles.box}>
            <Text style={styles.text}>{data.specialNotes}</Text>
          </View>
        </View>
      )}

      {/* Signatures */}
      <View style={styles.signatureSection}>
        <Text style={styles.sectionTitle}>SIGNATURES</Text>
        <Text style={styles.text}>
          By signing below, both parties acknowledge they have read, understood, and agree to be bound by the terms and conditions of this contract.
        </Text>

        <View style={{ marginTop: 30 }}>
          <Text style={[styles.text, styles.boldText]}>{data.serviceProvider}</Text>
          <View style={styles.signatureLine}></View>
          <Text style={[styles.text, { fontSize: 8 }]}>Date: _______________</Text>
        </View>

        <View style={{ marginTop: 30 }}>
          <Text style={[styles.text, styles.boldText]}>Client Acceptance:</Text>
          <Text style={[styles.text, { marginTop: 10 }]}>{data.clientName}</Text>
          <View style={styles.signatureLine}></View>
          <Text style={[styles.text, { fontSize: 8 }]}>Date: _______________</Text>
        </View>

        <View style={styles.footer}>
          <Text>Contract Effective Date: Upon receipt of signed contract and deposit payment</Text>
          <Text>
            Contract Expiration: {new Date(data.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} (completion of tour services)
          </Text>
          <Text style={{ marginTop: 10 }}>
            This contract is governed by Egyptian law and any disputes will be subject to the jurisdiction of Egyptian courts.
          </Text>
        </View>
      </View>
    </Page>
  </Document>
)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contractData = await request.json()

    const pdfBlob = await pdf(<ContractPDF data={contractData} />).toBlob()

    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="contract-${contractData.contractNumber}.pdf"`
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