-- ============================================
-- Atomic booking-payment recording (M20)
-- ============================================
-- The route's POST /api/bookings/:id/payments handler used to (1) INSERT a
-- booking_payments row, then (2) call a helper that SELECT'd all payments,
-- summed them, and UPDATE'd the parent booking's payment_status,
-- balance_due, deposit_paid(_date), and sometimes status. Steps 1 and 2 ran
-- as separate, non-transactional PostgREST round-trips with no row lock,
-- so two concurrent payments on the same booking (e.g. a double-clicked
-- "Record payment" button or a deposit + balance recorded simultaneously)
-- could:
--   - both read a stale payment set,
--   - both compute a stale totalPaid,
--   - both UPDATE the booking, last write wins.
-- Symptoms: balance_due stays high after a "paid" booking, payment_status
-- stuck on "partial" when fully paid, deposit_paid_date set on the wrong
-- payment, or both transitions miss entirely. Both ledger rows survive, so
-- the booking's denormalized totals silently disagree with the ledger.
--
-- This function moves the whole sequence inside a single PL/pgSQL
-- transaction with SELECT ... FOR UPDATE on the booking row, so concurrent
-- callers serialize on this booking_id. The currency filter from M21 is
-- carried through so legacy mixed-currency rows can't poison the sum.
--
-- The route calls this RPC instead of doing the INSERT+UPDATE itself.
-- Behavior is otherwise identical: same payment_status values, same status
-- promotion (supplier_confirmed → payment_received), same deposit_paid_date
-- captured only on the first transition to paid/partial/deposit_received.
--
-- Date: 2026-06-24
-- ============================================

create or replace function public.record_booking_payment(
  p_booking_id uuid,
  p_payment_type text,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_payment_date date,
  p_transaction_reference text,
  p_notes text
) returns table (
  payment_id uuid,
  payment_status text,
  balance_due numeric,
  deposit_paid boolean
)
language plpgsql
as $$
declare
  v_booking record;
  v_payment_id uuid;
  v_total_paid numeric;
  v_balance_due numeric;
  v_payment_status text := 'pending';
  v_deposit_paid boolean := false;
  v_new_status text;
begin
  -- Lock the booking row for the rest of the transaction. Concurrent
  -- record_booking_payment calls on the same booking_id now serialize here.
  select id, total_cost, deposit_amount, currency, deposit_paid, status
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

  if not found then
    raise exception 'Booking % not found', p_booking_id;
  end if;

  -- Currency must match the booking's own currency (M21). The application
  -- layer already validates this; the RPC repeats it so the rule is enforced
  -- at the data layer too.
  if p_currency is null or p_currency <> coalesce(v_booking.currency, 'EUR') then
    raise exception 'Payment currency (%) must match booking currency (%)',
      p_currency, coalesce(v_booking.currency, 'EUR');
  end if;

  -- Insert the payment.
  insert into public.booking_payments (
    booking_id, payment_type, amount, currency, payment_method,
    payment_date, transaction_reference, notes
  ) values (
    p_booking_id, p_payment_type, p_amount, p_currency, p_payment_method,
    p_payment_date, p_transaction_reference, p_notes
  )
  returning id into v_payment_id;

  -- Recompute total_paid in the booking's currency. Refunds subtract;
  -- legacy rows with a different currency are excluded (matches M21's
  -- application-layer behavior).
  select coalesce(sum(
    case when payment_type = 'refund' then -amount else amount end
  ), 0)
    into v_total_paid
    from public.booking_payments
    where booking_id = p_booking_id
      and coalesce(currency, 'EUR') = coalesce(v_booking.currency, 'EUR');

  v_balance_due := greatest(0, coalesce(v_booking.total_cost, 0) - v_total_paid);

  -- Determine the new payment_status. Matches the JS helper's logic
  -- exactly so the route's observable behavior is unchanged.
  if v_total_paid >= coalesce(v_booking.total_cost, 0) then
    v_payment_status := 'paid';
    v_deposit_paid := true;
  elsif v_total_paid >= coalesce(v_booking.deposit_amount, 0) then
    if v_total_paid > coalesce(v_booking.deposit_amount, 0) then
      v_payment_status := 'partial';
    else
      v_payment_status := 'deposit_received';
    end if;
    v_deposit_paid := true;
  end if;

  -- Promote bookings.status from supplier_confirmed → payment_received
  -- when this payment moves it past 'pending'. Mirrors the JS behavior.
  v_new_status := v_booking.status;
  if v_payment_status <> 'pending' and v_booking.status = 'supplier_confirmed' then
    v_new_status := 'payment_received';
  end if;

  -- Write the booking back. deposit_paid_date is set ONLY on the first
  -- transition (when deposit_paid was previously false), so re-runs and
  -- subsequent payments don't keep updating it.
  update public.bookings
    set payment_status = v_payment_status,
        deposit_paid = v_deposit_paid,
        balance_due = v_balance_due,
        deposit_paid_date = case
          when v_deposit_paid and not coalesce(v_booking.deposit_paid, false)
            then current_date
          else deposit_paid_date
        end,
        status = v_new_status,
        updated_at = now()
    where id = p_booking_id;

  -- Return the new payment id + the computed status so the route can
  -- echo them back without a second SELECT round-trip.
  return query select v_payment_id, v_payment_status, v_balance_due, v_deposit_paid;
end$$;

-- Allow the service role to call this RPC. PostgREST routes already require
-- an authenticated session (or the service-role key); this just makes the
-- function callable via supabase.rpc().
revoke all on function public.record_booking_payment(uuid, text, numeric, text, text, date, text, text) from public;
grant execute on function public.record_booking_payment(uuid, text, numeric, text, text, date, text, text) to service_role, authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- After this lands, app/api/bookings/[id]/payments/route.ts POST should
-- call this RPC instead of inserting and recomputing in two separate steps.
-- ============================================
