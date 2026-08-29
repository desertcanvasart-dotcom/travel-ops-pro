-- ============================================
-- G2.1 Phase 1: guide fields on suppliers (merge guides → suppliers)
-- ============================================
-- The `guides` table is being retired in favor of suppliers(type='guide') as
-- the single source of truth (operator decision 2026-06-27: the 23 canonical
-- guide-suppliers are correct; the rest of the guides table is discarded).
--
-- The pricing pipeline reads guide-specific fields off `guides` (it picks a
-- guide by tier + language and uses that guide's per-day rate). To retire the
-- table, those fields must live on suppliers. This adds them. languages is
-- already on suppliers (text[]) and is reused for the AI's language filter.
--
-- These columns are guide-specific but live on the shared suppliers table
-- (same pattern as the existing hotel/cruise-specific columns star_rating,
-- ship_name, cabin_count, etc.). They stay NULL for non-guide suppliers.
--
-- Phase 2 backfills them for the 13 id-matched guides; Phase 3 repoints the
-- ~12 code read-sites; Phase 4 retires the guides table.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).
-- Date: 2026-06-27
-- ============================================

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tier TEXT;                       -- 'standard' | 'premium' | ...
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS daily_rate NUMERIC;              -- per-guide day rate (AI pricing)
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS max_group_size INTEGER;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS specialties TEXT[];
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS certification_number TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Helps the AI guide selection (filter by type+tier, language is a GIN/array op).
CREATE INDEX IF NOT EXISTS idx_suppliers_guide_lookup
  ON public.suppliers(type, tier) WHERE type = 'guide';

-- ============================================
-- MIGRATION COMPLETE — schema only. Phase 2 (data backfill) runs next.
-- ============================================
