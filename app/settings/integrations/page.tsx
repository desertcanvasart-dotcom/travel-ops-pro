import { redirect } from 'next/navigation'

// Consolidated into Settings → Partner Integrations. Kept as a redirect so any
// existing links / bookmarks to /settings/integrations still land in the right
// place. The UI itself now lives in components/settings/PartnerIntegrationsPanel.
export default function IntegrationsRedirect() {
  redirect('/settings?tab=partners')
}
