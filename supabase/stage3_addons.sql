-- ============================================================================
-- SmartCanteen Stage 3: Student USN Identity, Image Storage & Availability Controls
-- Team: UNDERCUT DEV | Problem Statement 76
-- Safe to re-run idempotently.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Student USN Format Validation & Existing Rows Migration
-- ────────────────────────────────────────────────────────────────────────────

-- Safely migrate any existing demo orders to valid USN format before constraint
with ranked as (
  select id, '1GA24CS' || lpad((row_number() over (order by placed_at, id))::text, 3, '0') as clean_usn
  from public.orders
  where student_roll !~ '^1GA[0-9]{2}CS[0-9]{3}$'
)
update public.orders o
set student_roll = ranked.clean_usn
from ranked
where o.id = ranked.id;

-- Add database check constraint enforcing USN format: ^1GA[0-9]{2}CS[0-9]{3}$
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_student_roll_format'
  ) then
    alter table public.orders
      add constraint orders_student_roll_format
      check (student_roll ~ '^1GA[0-9]{2}CS[0-9]{3}$');
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Availability Controls: is_available column & Toggle RPC
-- ────────────────────────────────────────────────────────────────────────────

-- Add column if not present (true by default)
alter table public.menu_items
  add column if not exists is_available boolean not null default true;

-- Update replica identity full
alter table public.menu_items replica identity full;

-- RPC to toggle dish availability (Staff only: Kitchen or Manager)
create or replace function public.set_item_availability(
  p_id text,
  p_is_available boolean,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.menu_items%rowtype;
begin
  if not public.verify_role_session(p_session_token, 'kitchen') then
    return jsonb_build_object(
      'ok', false,
      'reason', 'forbidden',
      'message', 'Staff session required to update item availability.'
    );
  end if;

  update public.menu_items
  set is_available = coalesce(p_is_available, true)
  where id = p_id
  returning * into v_item;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Menu item not found.');
  end if;

  return jsonb_build_object('ok', true, 'menu_item', to_jsonb(v_item));
end;
$$;

grant execute on function public.set_item_availability(text, boolean, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Update place_order with USN validation & Availability Check
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
begin
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
  ) normalized;

  select count(*) into v_found_count
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  join public.menu_items mi on mi.id = request.id;
  if v_found_count <> jsonb_array_length(v_requested) then
    return jsonb_build_object(
      'ok', false, 'reason', 'invalid_item',
      'unavailable', (
        select coalesce(jsonb_agg(jsonb_build_object('id', request.id, 'name', request.id, 'requested', request.quantity, 'available', 0)), '[]'::jsonb)
        from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
        where not exists (select 1 from public.menu_items mi where mi.id = request.id)
      ),
      'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb)
    );
  end if;

  v_day_start := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_day_end := v_day_start + interval '1 day';
  for v_line in
    select mi.*, request.quantity
    from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
    join public.menu_items mi on mi.id = request.id
    order by mi.id
    for update of mi
  loop
    select coalesce(sum(oi.quantity), 0) into v_consumed_today
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.menu_item_id = v_line.id
      and o.status <> 'Cancelled'
      and o.placed_at >= v_day_start and o.placed_at < v_day_end;

    if not v_line.is_active then
      v_failure_reason := coalesce(v_failure_reason, 'invalid_item');
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', 0, 'reason', 'archived'));
    elsif not coalesce(v_line.is_available, true) then
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

  update public.menu_items mi
  set stock = mi.stock - request.quantity
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  where mi.id = request.id;

  insert into public.orders (
    student_name, student_roll, user_id, status, priority, instructions, payment_method,
    total_amount, counter, promised_pickup_time, estimated_minutes_remaining, accepted_at
  ) values (
    coalesce(nullif(trim(p_student_name), ''), 'Student'),
    v_usn,
    auth.uid(),
    case when v_settings.auto_accept then 'Accepted' else 'Placed' end,
    v_priority, nullif(trim(p_instructions), ''), coalesce(nullif(trim(p_payment_method), ''), 'UPI'),
    v_total, v_counter, v_chosen_slot,
    greatest(0, ceil(extract(epoch from (v_chosen_slot - now())) / 60)::integer),
    case when v_settings.auto_accept then now() else null end
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
-- 4. USN-Guarded cancel_order (Students can only cancel their own orders)
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

  -- Check if caller is kitchen/manager staff via session token
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

  -- Transition check: can only cancel if Placed, Accepted, or Preparing
  if v_order.status not in ('Placed', 'Accepted', 'Preparing') then
    return jsonb_build_object(
      'ok', false,
      'reason', 'illegal_transition',
      'from', v_order.status,
      'to', 'Cancelled',
      'message', format('Cannot cancel order in status %s.', v_order.status)
    );
  end if;

  -- Restore stock only if cancelled before preparation started
  v_restore_stock := v_order.status in ('Placed', 'Accepted');
  if v_restore_stock then
    perform 1
    from public.menu_items mi join public.order_items oi on oi.menu_item_id = mi.id
    where oi.order_id = p_order_id
    order by mi.id
    for update of mi;

    update public.menu_items mi
    set stock = mi.stock + oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and mi.id = oi.menu_item_id;
  end if;

  update public.orders
  set status = 'Cancelled',
      cancelled_at = now(),
      cancel_reason = nullif(trim(p_reason), ''),
      cancelled_during_prep = not v_restore_stock
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'order', to_jsonb(v_order),
    'stock_restored', v_restore_stock
  );
end;
$$;

-- Overload for backwards compatibility
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.cancel_order(p_order_id, p_reason, null, null);
end;
$$;

grant execute on function public.cancel_order(uuid, text, text, text) to anon, authenticated;
grant execute on function public.cancel_order(uuid, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Supabase Storage: 'dish-images' Bucket & Security Policies
-- ────────────────────────────────────────────────────────────────────────────

-- Ensure public storage bucket exists with 2 MB limit & image mime types
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dish-images',
  'dish-images',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS policies
do $$
begin
  drop policy if exists "dish_images_public_read" on storage.objects;
  create policy "dish_images_public_read"
    on storage.objects for select
    using (bucket_id = 'dish-images');

  drop policy if exists "dish_images_insert" on storage.objects;
  create policy "dish_images_insert"
    on storage.objects for insert
    with check (
      bucket_id = 'dish-images'
    );
end $$;
