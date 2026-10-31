'use client'

// ============================================
// Settings › Organization › Company
// ============================================
// The company's identity, its commercial terms and the install's licence.
// Moved as it was from the old Settings "Organization" tab
// (/settings?tab=organization redirects here). Commercial terms live with
// the org, not with a user: how much money is asked for and when is not a
// per-agent preference. Each card gates its own writes by role.

import { Building2 } from 'lucide-react'
import PaymentTermsCard from '@/app/components/PaymentTermsCard'
import CompanyProfileCard from '@/app/components/CompanyProfileCard'
import LicenceCard from '@/app/components/LicenceCard'

export default function CompanySettingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-[#647C47]/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6 text-[#647C47]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Organization</h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage your organization name, members, roles, and pending invitations.
            </p>
            <a
              href="/settings/organization"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
            >
              <Building2 className="w-4 h-4" />
              Open organization settings
            </a>
          </div>
        </div>
      </div>
      <CompanyProfileCard />
      <PaymentTermsCard />
      {/* What this install is licensed as — read-only, from LICENSE_KEY. */}
      <LicenceCard />
    </div>
  )
}
