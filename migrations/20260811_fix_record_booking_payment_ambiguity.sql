-- ============================================================================
-- Fix record_booking_payment(): "column reference deposit_paid is ambiguous"
-- ============================================================================
-- The function from 20260624 has NEVER been callable. Its RETURNS TABLE names
-- three outputs — payment_status, balance_due, deposit_paid — which PL/pgSQL
-- puts in scope as variables. Every bare reference to a bookings column of the
-- same name is therefore ambiguous, and the very first statement
--
--     select id, total_cost, deposit_amount, currency, deposit_paid, status
--       into v_booking from public.bookings ...
--
-- raises at runtime. Recording a booking payment has been failing since that
-- migration landed. (It was masked until 2026-08-11 by a second, unrelated
-- fault: bookings.deposit_paid_date did not exist either, so the function could
-- not have worked regardless. Adding the column revealed this one.)
--
-- `create or replace function` does not validate column references in a
-- plpgsql body, which is why the migration applied cleanly and the breakage
-- only ever appeared on a real call.
--
-- FIX: `#variable_conflict use_column`. At every ambiguous site in this body the
-- column is what is meant — the computed values are all read through v_-prefixed
-- variables, which never collide, including the closing RETURN QUERY. The body
-- below is otherwise character-for-character the 20260624 version.
--
-- The alternative (renaming the OUT columns) would change the RPC's result
-- shape, and app/api/bookings/[id]/payments/route.ts reads rpcResult.balance_due
-- / .payment_status / .deposit_paid by name. Keeping the contract is better than
-- renaming both sides for a scoping problem.
-- ============================================================================

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
#variable_conflict use_column
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

revoke all on function public.record_booking_payment(uuid, text, numeric, text, text, date, text, text) from public;
grant execute on function public.record_booking_payment(uuid, text, numeric, text, text, date, text, text) to service_role, authenticated;

-- ============================================================================
-- Verify after applying — this must return a row rather than raising:
--
--   -- against a throwaway booking whose currency is EUR:
--   select * from public.record_booking_payment(
--     '<booking-id>'::uuid, 'deposit', 300, 'EUR', 'bank_transfer',
--     current_date, 'VERIFY', 'verification'
--   );
--
-- Expect payment_status='deposit_received' for a 300 deposit on a 1000 booking
-- with deposit_amount=300, balance_due=700, deposit_paid=true, and
-- bookings.deposit_paid_date set to today.
-- ============================================================================
