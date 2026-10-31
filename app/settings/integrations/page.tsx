// ============================================
// Settings › Organization › Partner integrations
// ============================================
// The partner platforms that send bookings in, with their API keys. Moved as
// it was from the old Settings "Partners" tab (/settings?tab=partners
// redirects here). Creating, pausing and rotating keys is admin-only; the
// panel says so to everyone else.
import { PartnerIntegrationsPanel } from '@/components/settings/PartnerIntegrationsPanel'

export default function PartnerIntegrationsPage() {
  return (
    <div className="m-4 md:m-6 max-w-5xl bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <PartnerIntegrationsPanel />
    </div>
  )
}
