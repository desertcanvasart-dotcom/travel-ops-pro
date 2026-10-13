// The copilot tone a draft is written in: the SIGNED-IN user's setting
// (copilot_settings, set on the Copilot Knowledge page), or 'professional'.
//
// The draft routes used to read the tone of whatever user_id the browser put
// in the request body, so a draft could be written in a colleague's tone (and
// read their setting). The caller now passes getCurrentUserId().
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopilotTone } from '@/types/copilot'

const TONES: CopilotTone[] = ['professional', 'friendly', 'formal']

export async function copilotToneFor(supabase: SupabaseClient, userId: string | null): Promise<CopilotTone> {
  if (!userId) return 'professional'
  const { data } = await supabase
    .from('copilot_settings')
    .select('tone')
    .eq('user_id', userId)
    .maybeSingle()
  const tone = data?.tone as CopilotTone | undefined
  return tone && TONES.includes(tone) ? tone : 'professional'
}
