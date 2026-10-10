-- ============================================================================
-- SmartCanteen - Stage 4 Addons: Pay-at-Counter Approval, Expiry & USN Cancel
-- Safe to re-run (idempotent).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Update Order Status Constraint & Kitchen Settings Columns
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  -- Allow 'pending_approval' in orders status
  alter table public.orders drop constraint if exists orders_status_check;
  alter table public.orders add constraint orders_status_check
    check (status in ('pending_approval', 'Placed', 'Accepted', 'Preparing', 'Ready', 'Collected', 'Cancelled'));

  -- Add pending_expiry_minutes and counter_approver to kitchen_settings if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kitchen_settings' and column_name = 'pending_expiry_minutes'
  ) then
    alter table public.kitchen_settings add column pending_expiry_minutes integer not null default 10;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kitchen_settings' and column_name = 'counter_approver'
  ) then
    alter table public.kitchen_settings add column counter_approver text not null default 'manager';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Function to auto-expire lingering pending orders and release stock
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.expire_pending_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.kitchen_settings%rowtype;
  v_expiry_mins integer := 10;
  v_expired_count integer := 0;
  v_rec record;
begin
  select * into v_settings from public.kitchen_settings limit 1;
  if found and v_settings.pending_expiry_minutes > 0 then
    v_expiry_mins := v_settings.pending_expiry_minutes;
  end if;

  for v_rec in
    select id from public.orders
    where status = 'pending_approval'
      and placed_at < (now() - (v_expiry_mins || ' minutes')::interval)
    for update
  loop
    -- Restore reserved stock for all items in the expired order
    update public.menu_items mi
    set stock = mi.stock + oi.quantity
    from public.order_items oi
    where oi.order_id = v_rec.id and mi.id = oi.menu_item_id;

    -- Update order to Cancelled with expired reason
    update public.orders
    set status = 'Cancelled',
        cancel_reason = 'Expired (counter payment not confirmed within ' || v_expiry_mins || ' minutes)',
        estimated_minutes_remaining = 0
    where id = v_rec.id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'expired_count', v_expired_count);
end;
$$;

grant execute on function public.expire_pending_orders() to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Update place_order to set pending_approval for Counter payments
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.place_order(
  p_student_name text,
  p_student_roll text,
  p_items jsonb,
  p_pickup_time timestamptz,
  p_priority text default 'NORMAL',
  p_instructions text default null,
  p_payment_method text default 'UPI'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.kitchen_settings%rowtype;
  v_priority text := upper(coalesce(nullif(p_priority, ''), 'NORMAL'));
  v_usn text := upper(trim(coalesce(p_student_roll, '')));
  v_payment_method text := coalesce(nullif(trim(p_payment_method), ''), 'UPI');
  v_is_counter boolean := (v_payment_method ilike '%counter%' or v_payment_method ilike '%cash%');
  v_requested jsonb;
  v_input_count integer;
  v_valid_count integer;
  v_found_count integer;
  v_line record;
  v_order public.orders%rowtype;
  v_total numeric(10, 2);
  v_counter text;
  v_consumed_today integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_unavailable jsonb := '[]'::jsonb;
  v_alternative_items jsonb := '[]'::jsonb;
  v_slot_result jsonb;
  v_slots jsonb := '[]'::jsonb;
  v_earliest timestamptz;
  v_chosen_slot timestamptz;
  v_slot_adjusted boolean := false;
  v_failure_reason text := null;
  v_order_items jsonb;
  v_initial_status text;
begin
  -- Run expiry sweep before processing new order
  perform public.expire_pending_orders();

  -- Server-side USN validation
  if v_usn !~ '^1GA[0-9]{2}CS[0-9]{3}$' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_usn',
      'message', 'Invalid college USN. Must match format 1GAxxCSxxx (e.g. 1GA24CS012).'
    );
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb));
  end if;
  if v_priority not in ('NORMAL', 'HIGH', 'CRITICAL') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_priority', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb));
  end if;

  select * into v_settings from public.kitchen_settings limit 1;
  if not found or not v_settings.canteen_open then
    return jsonb_build_object('ok', false, 'reason', 'canteen_closed', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb));
  end if;

  select count(*), count(*) filter (
    where coalesce(value ->> 'id', value ->> 'menu_item_id') is not null
      and coalesce(value ->> 'quantity', '') ~ '^[1-9][0-9]*$'
  ) into v_input_count, v_valid_count
  from jsonb_array_elements(p_items);
  if v_input_count = 0 or v_input_count <> v_valid_count then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb));
  end if;

  select jsonb_agg(jsonb_build_object('id', id, 'quantity', quantity) order by id)
    into v_requested
  from (
    select coalesce(value ->> 'id', value ->> 'menu_item_id') as id,
           sum((value ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items)
    group by coalesce(value ->> 'id', value ->> 'menu_item_id')
  ) grouped;

  select count(*) into v_found_count
  from public.menu_items
  where id in (select id from jsonb_to_recordset(v_requested) as request(id text, quantity integer));

  if v_found_count <> jsonb_array_length(v_requested) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb));
  end if;

  v_day_start := date_trunc('day', timezone(coalesce(v_settings.timezone, 'Asia/Kolkata'), now()));
  v_day_end := v_day_start + interval '1 day';

  for v_line in
    select mi.id,
           mi.name,
           mi.stock,
           mi.daily_limit,
           mi.is_active,
           coalesce(mi.is_available, true) as is_available,
           request.quantity
    from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
    join public.menu_items mi on mi.id = request.id
    for update of mi
  loop
    select coalesce(sum(oi.quantity), 0)
      into v_consumed_today
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.menu_item_id = v_line.id
      and o.placed_at >= v_day_start
      and o.placed_at < v_day_end
      and o.status <> 'Cancelled';

    if not v_line.is_active then
      v_failure_reason := coalesce(v_failure_reason, 'archived_item');
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', 0, 'reason', 'archived_item'));
    elsif not v_line.is_available then
      v_failure_reason := coalesce(v_failure_reason, 'temporarily_unavailable');
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', 0, 'reason', 'temporarily_unavailable'));
    elsif v_line.stock < v_line.quantity then
      v_failure_reason := coalesce(v_failure_reason, 'sold_out');
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', v_line.stock, 'reason', 'sold_out'));
    elsif v_consumed_today + v_line.quantity > v_line.daily_limit then
      v_failure_reason := coalesce(v_failure_reason, 'daily_limit');
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', greatest(v_line.daily_limit - v_consumed_today, 0), 'reason', 'daily_limit'));
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', candidate.id, 'name', candidate.name, 'category', candidate.category, 'price', candidate.price, 'stock', candidate.stock)), '[]'::jsonb)
    into v_alternative_items
  from (
    select mi.id, mi.name, mi.category, mi.price, mi.stock
    from public.menu_items mi
    where mi.is_active and coalesce(mi.is_available, true) and mi.stock > 0
      and mi.id not in (select id from jsonb_to_recordset(v_requested) as request(id text, quantity integer))
      and mi.category in (
        select category from public.menu_items
        where id in (select id from jsonb_to_recordset(v_requested) as request(id text, quantity integer))
      )
    order by mi.stock desc, mi.name
    limit 5
  ) candidate;

  if jsonb_array_length(v_unavailable) > 0 then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_failure_reason, 'invalid_item'), 'unavailable', v_unavailable, 'alternatives', jsonb_build_object('items', v_alternative_items, 'slots', '[]'::jsonb));
  end if;

  v_slot_result := public.get_pickup_slots(p_items, v_priority);
  v_slots := coalesce(v_slot_result -> 'slots', '[]'::jsonb);
  if coalesce((v_slot_result ->> 'ok')::boolean, false) is not true or jsonb_array_length(v_slots) = 0 then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_slot_result ->> 'reason', 'capacity_full'), 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', v_alternative_items, 'slots', v_slots));
  end if;

  v_earliest := (v_slots -> 0 ->> 'slot_at')::timestamptz;
  v_chosen_slot := greatest(coalesce(p_pickup_time, v_earliest), v_earliest);
  v_slot_adjusted := p_pickup_time is null or p_pickup_time < v_earliest;

  select sum(mi.price * request.quantity)
    into v_total
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  join public.menu_items mi on mi.id = request.id;

  select mi.counter into v_counter
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  join public.menu_items mi on mi.id = request.id
  group by mi.counter
  order by sum(request.quantity) desc, mi.counter
  limit 1;

  -- Reserve stock immediately for both online and counter payment orders
  update public.menu_items mi
  set stock = mi.stock - request.quantity
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  where mi.id = request.id;

  -- Determine initial status: pending_approval for counter payment, else Placed/Accepted
  if v_is_counter then
    v_initial_status := 'pending_approval';
  elsif v_settings.auto_accept then
    v_initial_status := 'Accepted';
  else
    v_initial_status := 'Placed';
  end if;

  insert into public.orders (
    student_name, student_roll, user_id, status, priority, instructions, payment_method,
    payment_status, total_amount, counter, promised_pickup_time, estimated_minutes_remaining, accepted_at
  ) values (
    coalesce(nullif(trim(p_student_name), ''), 'Student'),
    v_usn,
    auth.uid(),
    v_initial_status,
    v_priority, nullif(trim(p_instructions), ''), v_payment_method,
    case when v_is_counter then 'pending' else 'paid' end,
    v_total, v_counter, v_chosen_slot,
    greatest(0, ceil(extract(epoch from (v_chosen_slot - now())) / 60)::integer),
    case when v_initial_status = 'Accepted' then now() else null end
  ) returning * into v_order;

  insert into public.order_items (order_id, menu_item_id, name, price, quantity, prep_time_minutes)
  select v_order.id, mi.id, mi.name, mi.price, request.quantity, mi.prep_time_minutes
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  join public.menu_items mi on mi.id = request.id;

  select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', menu_item_id, 'name', name, 'price', price, 'quantity', quantity, 'prep_time_minutes', prep_time_minutes) order by menu_item_id), '[]'::jsonb)
    into v_order_items
  from public.order_items where order_id = v_order.id;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order) || jsonb_build_object('items', v_order_items), 'slot_adjusted', v_slot_adjusted);
end;
$$;

grant execute on function public.place_order(text, text, jsonb, timestamptz, text, text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. approve_order RPC: Approve pending counter order -> Placed / Accepted
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.approve_order(
  p_order_id uuid,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.kitchen_settings%rowtype;
  v_order public.orders%rowtype;
  v_is_authorized boolean := false;
  v_order_items_json jsonb;
  v_slot_result jsonb;
  v_slots jsonb;
  v_chosen_slot timestamptz;
  v_next_status text;
  v_order_items jsonb;
begin
  select * into v_settings from public.kitchen_settings limit 1;

  -- Authorization check (Manager, or Kitchen if counter_approver = 'kitchen_or_manager')
  if p_session_token is not null and length(p_session_token) > 0 then
    if v_settings.counter_approver = 'kitchen_or_manager' then
      v_is_authorized := public.verify_role_session(p_session_token, 'kitchen');
    else
      v_is_authorized := public.verify_role_session(p_session_token, 'manager');
    end if;
  end if;

  if not v_is_authorized then
    return jsonb_build_object(
      'ok', false,
      'reason', 'forbidden_role',
      'message', 'Permission denied. Only authorized staff can approve counter orders.'
    );
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Order not found.');
  end if;

  if v_order.status <> 'pending_approval' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'illegal_transition',
      'from', v_order.status,
      'to', 'Placed',
      'message', format('Order is not in pending_approval status (current status: %s).', v_order.status)
    );
  end if;

  -- Recalculate feasible pickup slot from approval time
  select coalesce(jsonb_agg(jsonb_build_object('id', menu_item_id, 'quantity', quantity)), '[]'::jsonb)
    into v_order_items_json
  from public.order_items
  where order_id = v_order.id;

  v_slot_result := public.get_pickup_slots(v_order_items_json, v_order.priority);
  v_slots := coalesce(v_slot_result -> 'slots', '[]'::jsonb);

  if jsonb_array_length(v_slots) > 0 then
    v_chosen_slot := (v_slots -> 0 ->> 'slot_at')::timestamptz;
  else
    v_chosen_slot := now() + interval '15 minutes';
  end if;

  v_next_status := case when v_settings.auto_accept then 'Accepted' else 'Placed' end;

  update public.orders
  set status = v_next_status,
      payment_status = 'paid',
      placed_at = now(),
      promised_pickup_time = v_chosen_slot,
      estimated_minutes_remaining = greatest(0, ceil(extract(epoch from (v_chosen_slot - now())) / 60)::integer),
      accepted_at = case when v_next_status = 'Accepted' then now() else null end
  where id = v_order.id
  returning * into v_order;

  select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', menu_item_id, 'name', name, 'price', price, 'quantity', quantity, 'prep_time_minutes', prep_time_minutes) order by menu_item_id), '[]'::jsonb)
    into v_order_items
  from public.order_items where order_id = v_order.id;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order) || jsonb_build_object('items', v_order_items));
end;
$$;

grant execute on function public.approve_order(uuid, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. reject_order RPC: Reject pending counter order -> Cancelled & restore stock
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.reject_order(
  p_order_id uuid,
  p_reason text default null,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.kitchen_settings%rowtype;
  v_order public.orders%rowtype;
  v_is_authorized boolean := false;
  v_order_items jsonb;
begin
  select * into v_settings from public.kitchen_settings limit 1;

  -- Authorization check
  if p_session_token is not null and length(p_session_token) > 0 then
    if v_settings.counter_approver = 'kitchen_or_manager' then
      v_is_authorized := public.verify_role_session(p_session_token, 'kitchen');
    else
      v_is_authorized := public.verify_role_session(p_session_token, 'manager');
    end if;
  end if;

  if not v_is_authorized then
    return jsonb_build_object(
      'ok', false,
      'reason', 'forbidden_role',
      'message', 'Permission denied. Only authorized staff can reject counter orders.'
    );
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Order not found.');
  end if;

  if v_order.status <> 'pending_approval' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'illegal_transition',
      'from', v_order.status,
      'to', 'Cancelled',
      'message', format('Order is not in pending_approval status (current status: %s).', v_order.status)
    );
  end if;

  -- Restore reserved stock back to menu_items
  update public.menu_items mi
  set stock = mi.stock + oi.quantity
  from public.order_items oi
  where oi.order_id = v_order.id and mi.id = oi.menu_item_id;

  update public.orders
  set status = 'Cancelled',
      payment_status = 'failed',
      cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Rejected by manager at counter'),
      estimated_minutes_remaining = 0
  where id = v_order.id
  returning * into v_order;

  select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', menu_item_id, 'name', name, 'price', price, 'quantity', quantity, 'prep_time_minutes', prep_time_minutes) order by menu_item_id), '[]'::jsonb)
    into v_order_items
  from public.order_items where order_id = v_order.id;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order) || jsonb_build_object('items', v_order_items));
end;
$$;

grant execute on function public.reject_order(uuid, text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Updated cancel_order: Support cancelling pending_approval + USN check
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default null,
  p_student_usn text default null,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_restore_stock boolean;
  v_caller_usn text := upper(trim(coalesce(p_student_usn, '')));
  v_is_staff boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Order not found.');
  end if;

  -- Check if caller is staff via session token
  if p_session_token is not null and length(p_session_token) > 0 then
    v_is_staff := public.verify_role_session(p_session_token, 'kitchen');
  end if;

  -- If not staff, enforce that the student USN matches the order's student_roll
  if not v_is_staff then
    if length(v_caller_usn) = 0 or upper(trim(v_order.student_roll)) <> v_caller_usn then
      return jsonb_build_object(
        'ok', false,
        'reason', 'forbidden_usn_mismatch',
        'message', 'Permission denied: Students can only cancel their own orders.'
      );
    end if;
  end if;

  -- Transition check: can only cancel if pending_approval, Placed, Accepted, or Preparing
  if v_order.status not in ('pending_approval', 'Placed', 'Accepted', 'Preparing') then
    return jsonb_build_object(
      'ok', false,
      'reason', 'illegal_transition',
      'from', v_order.status,
      'to', 'Cancelled',
      'message', format('Cannot cancel order in status %s.', v_order.status)
    );
  end if;

  -- Restore stock if cancelled before cooking starts (pending_approval, Placed, or Accepted)
  v_restore_stock := v_order.status in ('pending_approval', 'Placed', 'Accepted');
  if v_restore_stock then
    update public.menu_items mi
    set stock = mi.stock + oi.quantity
    from public.order_items oi
    where oi.order_id = v_order.id and mi.id = oi.menu_item_id;
  end if;

  update public.orders
  set status = 'Cancelled',
      cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelled by user'),
      estimated_minutes_remaining = 0
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order), 'stock_restored', v_restore_stock);
end;
$$;

grant execute on function public.cancel_order(uuid, text, text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Update update_kitchen_settings to accept new fields
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.update_kitchen_settings(
  p_max_kitchen_capacity integer default null,
  p_rush_multiplier numeric default null,
  p_canteen_open boolean default null,
  p_auto_accept boolean default null,
  p_pending_expiry_minutes integer default null,
  p_counter_approver text default null,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_manager boolean := false;
  v_settings public.kitchen_settings%rowtype;
begin
  if p_session_token is not null and length(p_session_token) > 0 then
    v_is_manager := public.verify_role_session(p_session_token, 'manager');
  end if;

  if not v_is_manager then
    return jsonb_build_object(
      'ok', false,
      'reason', 'forbidden_role',
      'message', 'Permission denied. Only managers can modify kitchen settings.'
    );
  end if;

  update public.kitchen_settings
  set max_kitchen_capacity = coalesce(p_max_kitchen_capacity, max_kitchen_capacity),
      rush_multiplier = coalesce(p_rush_multiplier, rush_multiplier),
      canteen_open = coalesce(p_canteen_open, canteen_open),
      auto_accept = coalesce(p_auto_accept, auto_accept),
      pending_expiry_minutes = coalesce(p_pending_expiry_minutes, pending_expiry_minutes),
      counter_approver = coalesce(nullif(trim(p_counter_approver), ''), counter_approver),
      updated_at = now()
  returning * into v_settings;

  return jsonb_build_object('ok', true, 'settings', to_jsonb(v_settings));
end;
$$;

grant execute on function public.update_kitchen_settings(integer, numeric, boolean, boolean, integer, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
