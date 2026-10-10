-- ============================================================================
-- SmartCanteen - Stage 5 Addons: Timezone, Mandatory Name, Cancelled Auto-Hide & Realtime Hardening
-- Team: UNDERCUT DEV | Problem Statement 76
-- Safe to re-run idempotently.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Schema Extensions: timezone on kitchen_settings & cancelled_at on orders
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  -- Add timezone to kitchen_settings if not present
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kitchen_settings' and column_name = 'timezone'
  ) then
    alter table public.kitchen_settings add column timezone text not null default 'Asia/Kolkata';
  end if;

  -- Add cancelled_at to orders if not present
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'cancelled_at'
  ) then
    alter table public.orders add column cancelled_at timestamptz;
  end if;
end $$;

-- Enable full replica identity for realtime diff accuracy
alter table public.orders replica identity full;
alter table public.menu_items replica identity full;
alter table public.kitchen_settings replica identity full;

-- Ensure all required tables are members of the supabase_realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
  ) then
    alter publication supabase_realtime add table public.menu_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_settings'
  ) then
    alter publication supabase_realtime add table public.kitchen_settings;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Backfill Legacy Cancelled Orders
-- ────────────────────────────────────────────────────────────────────────────

update public.orders
set cancelled_at = coalesce(placed_at, now())
where status = 'Cancelled' and cancelled_at is null;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Expiry Function: Sets cancelled_at on automated cancellation
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

    -- Update order to Cancelled with expired reason and timestamp
    update public.orders
    set status = 'Cancelled',
        cancelled_at = now(),
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
-- 4. Dynamic Timezone-Aware Pickup Slot Calculation
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.get_pickup_slots(
  p_items jsonb,
  p_priority text default 'NORMAL'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.kitchen_settings%rowtype;
  v_tz text := 'Asia/Kolkata';
  v_priority text := upper(coalesce(nullif(p_priority, ''), 'NORMAL'));
  v_requested_count integer;
  v_found_count integer;
  v_max_prep integer;
  v_active_load integer;
  v_queue_waves integer;
  v_priority_buffer numeric;
  v_now timestamptz := now();
  v_earliest timestamptz;
  v_first_slot timestamptz;
  v_slot timestamptz;
  v_day_end timestamptz;
  v_slots jsonb := '[]'::jsonb;
  v_index integer;
  v_tag text;
  v_efficiency text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'slots', '[]'::jsonb);
  end if;
  if v_priority not in ('NORMAL', 'HIGH', 'CRITICAL') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_priority', 'slots', '[]'::jsonb);
  end if;

  select * into v_settings from public.kitchen_settings limit 1;
  if not found or not v_settings.canteen_open then
    return jsonb_build_object('ok', false, 'reason', 'canteen_closed', 'slots', '[]'::jsonb);
  end if;

  if v_settings.timezone is not null and length(trim(v_settings.timezone)) > 0 then
    v_tz := trim(v_settings.timezone);
  end if;

  select count(*) into v_requested_count from jsonb_array_elements(p_items);
  select count(*), max(mi.prep_time_minutes)
    into v_found_count, v_max_prep
  from jsonb_array_elements(p_items) request
  join public.menu_items mi on mi.id = coalesce(request.value ->> 'id', request.value ->> 'menu_item_id')
  where mi.is_active;
  if v_found_count <> v_requested_count then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'slots', '[]'::jsonb);
  end if;

  select count(*) into v_active_load
  from public.orders
  where status in ('Placed', 'Accepted', 'Preparing');

  v_queue_waves := greatest(0, ceil((v_active_load + 1)::numeric / v_settings.max_kitchen_capacity)::integer - 1);
  v_priority_buffer := case when v_priority in ('HIGH', 'CRITICAL') then v_settings.rush_multiplier else 1 end;
  v_earliest := v_now
    + make_interval(mins => coalesce(v_max_prep, 0) + 2)
    + make_interval(secs => round(v_queue_waves * coalesce(v_max_prep, 0) * 60 * v_priority_buffer)::integer);
  v_first_slot := to_timestamp((ceil(extract(epoch from v_earliest) / 300) * 300)::double precision);
  v_day_end := ((date_trunc('day', v_now at time zone v_tz) + interval '1 day') at time zone v_tz) - interval '1 second';

  for v_index in 0..2 loop
    v_slot := v_first_slot + make_interval(mins => v_index * 10);
    exit when v_slot > v_day_end;
    v_tag := case v_index when 0 then '⚡ Earliest Feasible' when 1 then 'Standard Slot' else 'Flexible / Post-Lecture' end;
    v_efficiency := case v_index when 0 then 'Optimal' when 1 then 'Comfortable' else 'Zero Queue' end;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'id', 'slot-' || floor(extract(epoch from (v_slot - v_now)) / 60)::integer,
      'slot_at', v_slot,
      'time', to_char(v_slot at time zone v_tz, 'HH12:MI AM'),
      'minutes_from_now', greatest(0, ceil(extract(epoch from (v_slot - v_now)) / 60)::integer),
      'tag', v_tag,
      'recommended', v_index = 0,
      'efficiency', v_efficiency,
      'kitchen_workload_percent', least(95, round(((v_active_load + 1)::numeric / v_settings.max_kitchen_capacity) * 100)::integer + case when v_index = 0 then 10 else 0 end)
    ));
  end loop;

  if jsonb_array_length(v_slots) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'capacity_full', 'slots', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'slots', v_slots);
end;
$$;

grant execute on function public.get_pickup_slots(jsonb, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Updated place_order: Mandatory Name Validation + Safe Timezone Calculation
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
  v_tz text := 'Asia/Kolkata';
  v_clean_name text := trim(coalesce(p_student_name, ''));
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

  -- Mandatory Name validation (2 to 50 characters; letters, spaces, dots, hyphens, apostrophes)
  if length(v_clean_name) < 2 or length(v_clean_name) > 50 or v_clean_name !~ '^[A-Za-z\s.''-]+$' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_name',
      'message', 'Student name is required (2 to 50 characters; letters, spaces, dots, hyphens, and apostrophes only).'
    );
  end if;

  -- Mandatory College USN format validation
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

  if v_settings.timezone is not null and length(trim(v_settings.timezone)) > 0 then
    v_tz := trim(v_settings.timezone);
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

  v_day_start := date_trunc('day', timezone(v_tz, now()));
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

  -- Reserve stock immediately
  update public.menu_items mi
  set stock = mi.stock - request.quantity
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  where mi.id = request.id;

  -- Initial status assignment
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
    v_clean_name,
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
-- 6. Updated reject_order: Explicitly records cancelled_at
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
      cancelled_at = now(),
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
-- 7. Updated cancel_order: Explicitly records cancelled_at
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

  -- Staff session verification
  if p_session_token is not null and length(p_session_token) > 0 then
    v_is_staff := public.verify_role_session(p_session_token, 'kitchen');
  end if;

  -- Student USN match verification
  if not v_is_staff then
    if length(v_caller_usn) = 0 or upper(trim(v_order.student_roll)) <> v_caller_usn then
      return jsonb_build_object(
        'ok', false,
        'reason', 'forbidden_usn_mismatch',
        'message', 'Permission denied: Students can only cancel their own orders.'
      );
    end if;
  end if;

  -- Transition eligibility
  if v_order.status not in ('pending_approval', 'Placed', 'Accepted', 'Preparing') then
    return jsonb_build_object(
      'ok', false,
      'reason', 'illegal_transition',
      'from', v_order.status,
      'to', 'Cancelled',
      'message', format('Cannot cancel order in status %s.', v_order.status)
    );
  end if;

  -- Restore stock if cancelled before cooking starts
  v_restore_stock := v_order.status in ('pending_approval', 'Placed', 'Accepted');
  if v_restore_stock then
    update public.menu_items mi
    set stock = mi.stock + oi.quantity
    from public.order_items oi
    where oi.order_id = v_order.id and mi.id = oi.menu_item_id;
  end if;

  update public.orders
  set status = 'Cancelled',
      cancelled_at = now(),
      cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelled by user'),
      estimated_minutes_remaining = 0
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order), 'stock_restored', v_restore_stock);
end;
$$;

grant execute on function public.cancel_order(uuid, text, text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Updated update_kitchen_settings: Supports timezone configuration
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.update_kitchen_settings(
  p_max_kitchen_capacity integer default null,
  p_rush_multiplier numeric default null,
  p_canteen_open boolean default null,
  p_auto_accept boolean default null,
  p_pending_expiry_minutes integer default null,
  p_counter_approver text default null,
  p_timezone text default null,
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
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      updated_at = now()
  returning * into v_settings;

  return jsonb_build_object('ok', true, 'settings', to_jsonb(v_settings));
end;
$$;

grant execute on function public.update_kitchen_settings(integer, numeric, boolean, boolean, integer, text, text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. PostgREST Schema Cache Reload Notification
-- ────────────────────────────────────────────────────────────────────────────

notify pgrst, 'reload schema';
