-- ============================================
-- Who SOLD a service, as distinct from who provides it
-- ============================================
-- A guide sells an optional tour on the road. The tour is supplied by a third
-- party (supplier_id); the guide is paid a share of OUR PROFIT on it — that is
-- the "we pay" commission direction (operator, 2026-08-22). Until now the
-- generator could only credit the SERVICE's supplier, so a guide was paid only
-- on services the guide personally supplied. This column names the seller.
--
-- ON DELETE SET NULL: deleting the seller detaches the credit, same as the
-- provider link. The supplier delete guard (lib/suppliers/delete-guard.ts)
-- refuses to delete a supplier still named as seller, so this only fires for
-- rows that slip past it.
--
-- NOTE FOR POSTGREST: this is the SECOND foreign key from itinerary_services
-- to suppliers. Every embed of suppliers from itinerary_services must now name
-- its FK column (suppliers!supplier_id / suppliers!sold_by_supplier_id) or
-- PostgREST answers PGRST201 (ambiguous). The app's embeds were updated in the
-- same change; apply this migration BEFORE deploying it.

ALTER TABLE public.itinerary_services
  ADD COLUMN IF NOT EXISTS sold_by_supplier_id UUID NULL
    REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_services_sold_by
  ON public.itinerary_services (sold_by_supplier_id)
  WHERE sold_by_supplier_id IS NOT NULL;

COMMENT ON COLUMN public.itinerary_services.sold_by_supplier_id IS
  'The supplier (usually a guide) who SOLD this service to the client, paid a "we pay" commission on our profit from it. Distinct from supplier_id, who PROVIDES it.';
