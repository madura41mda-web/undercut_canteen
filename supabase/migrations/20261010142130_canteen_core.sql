-- SmartCanteen core schema. Frontend-to-database mapping:
-- menu prepTimeMinutes/isVeg/reviewCount/dailyLimit -> prep_time_minutes/is_veg/review_count/daily_limit
-- order studentName/studentRoll/totalAmount/placedAt/promisedPickupTime/estimatedMinutesRemaining/paymentMethod
-- -> student_name/student_roll/total_amount/placed_at/promised_pickup_time/estimated_minutes_remaining/payment_method.

create extension if not exists pgcrypto with schema extensions;

create sequence public.order_token_seq start with 1;

create table public.menu_items (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(10, 2) not null check (price >= 0),
  prep_time_minutes integer not null check (prep_time_minutes > 0),
  calories integer,
  is_veg boolean not null default true,
  rating numeric(2, 1) check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  description text,
  image text,
  stock integer not null default 0 check (stock >= 0),
  daily_limit integer not null check (daily_limit >= 0),
  tags text[] not null default '{}',
  badge text,
  counter text not null,
  is_active boolean not null default true
);

create table public.kitchen_settings (
  singleton boolean primary key default true check (singleton),
  max_kitchen_capacity integer not null default 12 check (max_kitchen_capacity > 0),
  rush_multiplier numeric(6, 2) not null default 1.25 check (rush_multiplier >= 1),
  batching_threshold integer not null default 2 check (batching_threshold > 0),
  auto_batching_enabled boolean not null default true,
  canteen_open boolean not null default true,
  w_pickup_urgency numeric(8, 2) not null default 1 check (w_pickup_urgency >= 0),
  w_prep_time numeric(8, 2) not null default 1 check (w_prep_time >= 0),
  w_priority numeric(8, 2) not null default 1 check (w_priority >= 0),
  auto_accept boolean not null default false,
  demo_mode boolean not null default true
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('student', 'kitchen', 'manager'))
);

create table public.orders (
  id uuid primary key default extensions.gen_random_uuid(),
  token text not null unique default ('CN-' || lpad(nextval('public.order_token_seq'::regclass)::text, 4, '0')),
  student_name text not null,
  student_roll text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'Placed' check (status in ('Placed', 'Accepted', 'Preparing', 'Ready', 'Collected', 'Cancelled')),
  priority text not null default 'NORMAL' check (priority in ('NORMAL', 'HIGH', 'CRITICAL')),
  instructions text,
  payment_method text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  counter text not null,
  placed_at timestamptz not null default now(),
  promised_pickup_time timestamptz not null,
  estimated_minutes_remaining integer not null check (estimated_minutes_remaining >= 0),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_during_prep boolean not null default false
);

create table public.order_items (
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id text not null references public.menu_items(id),
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  quantity integer not null check (quantity > 0),
  prep_time_minutes integer not null check (prep_time_minutes > 0),
  primary key (order_id, menu_item_id)
);

create index orders_status_promised_pickup_time_idx on public.orders (status, promised_pickup_time);
create index order_items_order_id_idx on public.order_items (order_id);

-- Guarantees the single settings row is read safely by policies and RPCs.
create function public.is_demo_mode()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select demo_mode from public.kitchen_settings where singleton), false);
$$;

-- Guarantees demo access while demo_mode is on; otherwise only kitchen/manager profiles pass.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_demo_mode()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('kitchen', 'manager')
    );
$$;

-- Guarantees manager-only access after demo_mode is disabled.
create function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_demo_mode()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'manager'
    );
$$;

-- Guarantees a stable numeric rank for the three accepted priority literals.
create function public.priority_rank(p_priority text)
returns integer
language sql
immutable
security definer
set search_path = public
as $$
  select case upper(coalesce(p_priority, 'NORMAL'))
    when 'CRITICAL' then 3
    when 'HIGH' then 2
    when 'NORMAL' then 1
    else 0
  end;
$$;

-- Guarantees a server-computed score where urgent pickup, shorter prep, and higher priority rank first.
create function public.queue_score(p_order public.orders)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.kitchen_settings%rowtype;
  v_max_prep integer;
  v_slack_minutes numeric;
begin
  select * into v_settings from public.kitchen_settings where singleton;
  if not found then
    return 0;
  end if;

  select coalesce(max(prep_time_minutes), 0) into v_max_prep
  from public.order_items where order_id = p_order.id;
  v_slack_minutes := greatest(0, extract(epoch from (p_order.promised_pickup_time - now())) / 60);

  return ((1440 - least(1440, v_slack_minutes)) * v_settings.w_pickup_urgency)
       + (greatest(0, 120 - v_max_prep) * v_settings.w_prep_time)
       + (public.priority_rank(p_order.priority) * v_settings.w_priority * 100);
end;
$$;

create view public.order_queue with (security_invoker = true) as
select
  o.*,
  public.queue_score(o) as queue_score,
  format(
    '%s, pickup in %s min',
    initcap(lower(o.priority)),
    greatest(0, ceil(extract(epoch from (o.promised_pickup_time - now())) / 60)::integer)
  ) as queue_reason
from public.orders o
where o.status in ('Placed', 'Accepted', 'Preparing')
order by public.queue_score(o) desc, o.promised_pickup_time asc, o.placed_at asc;

-- Guarantees slot calculations use the persisted kitchen capacity, active queue, Kolkata day boundary, and priority buffer.
-- The jsonb envelope is {ok, reason?, slots:[{id, slot_at, time, minutes_from_now, tag, recommended, efficiency, kitchen_workload_percent}]}.
create function public.get_pickup_slots(
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

  select * into v_settings from public.kitchen_settings where singleton;
  if not found or not v_settings.canteen_open then
    return jsonb_build_object('ok', false, 'reason', 'canteen_closed', 'slots', '[]'::jsonb);
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
  v_day_end := ((date_trunc('day', v_now at time zone 'Asia/Kolkata') + interval '1 day') at time zone 'Asia/Kolkata') - interval '1 second';

  for v_index in 0..2 loop
    v_slot := v_first_slot + make_interval(mins => v_index * 10);
    exit when v_slot > v_day_end;
    v_tag := case v_index when 0 then '⚡ Earliest Feasible' when 1 then 'Standard Slot' else 'Flexible / Post-Lecture' end;
    v_efficiency := case v_index when 0 then 'Optimal' when 1 then 'Comfortable' else 'Zero Queue' end;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'id', 'slot-' || floor(extract(epoch from (v_slot - v_now)) / 60)::integer,
      'slot_at', v_slot,
      'time', to_char(v_slot at time zone 'Asia/Kolkata', 'HH12:MI AM'),
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

-- Guarantees a whole-order, row-locked transaction: validation failures write nothing and successful orders never make stock negative.
create function public.place_order(
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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb));
  end if;
  if v_priority not in ('NORMAL', 'HIGH', 'CRITICAL') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_priority', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', '[]'::jsonb, 'slots', '[]'::jsonb));
  end if;

  -- This row lock serializes capacity decisions even when concurrent orders contain different menu items.
  select * into v_settings from public.kitchen_settings where singleton for update;
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

  -- Lock requested menu rows in a fixed id order to avoid deadlocks and last-item races.
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
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', 0));
    elsif v_line.stock < v_line.quantity then
      v_failure_reason := coalesce(v_failure_reason, 'sold_out');
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', v_line.stock));
    elsif v_consumed_today + v_line.quantity > v_line.daily_limit then
      v_failure_reason := coalesce(v_failure_reason, 'daily_limit');
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_line.id, 'name', v_line.name, 'requested', v_line.quantity, 'available', greatest(v_line.daily_limit - v_consumed_today, 0)));
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', candidate.id, 'name', candidate.name, 'category', candidate.category, 'price', candidate.price, 'stock', candidate.stock)), '[]'::jsonb)
    into v_alternative_items
  from (
    select mi.id, mi.name, mi.category, mi.price, mi.stock
    from public.menu_items mi
    where mi.is_active and mi.stock > 0
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
  if v_chosen_slot >= v_day_end then
    return jsonb_build_object('ok', false, 'reason', 'capacity_full', 'unavailable', '[]'::jsonb, 'alternatives', jsonb_build_object('items', v_alternative_items, 'slots', v_slots));
  end if;

  select sum(mi.price * request.quantity), string_agg(distinct mi.counter, ' & ' order by mi.counter)
    into v_total, v_counter
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  join public.menu_items mi on mi.id = request.id;

  update public.menu_items mi
  set stock = mi.stock - request.quantity
  from jsonb_to_recordset(v_requested) as request(id text, quantity integer)
  where mi.id = request.id;

  insert into public.orders (
    student_name, student_roll, user_id, status, priority, instructions, payment_method,
    total_amount, counter, promised_pickup_time, estimated_minutes_remaining, accepted_at
  ) values (
    coalesce(nullif(trim(p_student_name), ''), 'Student'),
    coalesce(nullif(trim(p_student_roll), ''), 'UG-2026'),
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

-- Guarantees only staff may make a legal forward transition and that the matching lifecycle timestamp is written.
create function public.update_order_status(p_order_id uuid, p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_new_status text := initcap(lower(trim(p_new_status)));
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not ((v_order.status = 'Placed' and v_new_status = 'Accepted')
       or (v_order.status = 'Accepted' and v_new_status = 'Preparing')
       or (v_order.status = 'Preparing' and v_new_status = 'Ready')
       or (v_order.status = 'Ready' and v_new_status = 'Collected')) then
    return jsonb_build_object('ok', false, 'reason', 'illegal_transition', 'from', v_order.status, 'to', p_new_status);
  end if;
  update public.orders
  set status = v_new_status,
      accepted_at = case when v_new_status = 'Accepted' then now() else accepted_at end,
      preparing_at = case when v_new_status = 'Preparing' then now() else preparing_at end,
      ready_at = case when v_new_status = 'Ready' then now() else ready_at end,
      collected_at = case when v_new_status = 'Collected' then now() else collected_at end,
      estimated_minutes_remaining = case when v_new_status in ('Ready', 'Collected') then 0 else estimated_minutes_remaining end
  where id = p_order_id
  returning * into v_order;
  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
end;
$$;

-- Guarantees cancellation restores stock only before preparation; Preparing cancellations remain cancelled without restoring food already made.
create function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_restore_stock boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (public.is_demo_mode() or public.is_staff() or v_order.user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if v_order.status not in ('Placed', 'Accepted', 'Preparing') then
    return jsonb_build_object('ok', false, 'reason', 'illegal_transition', 'from', v_order.status, 'to', 'Cancelled');
  end if;
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
  set status = 'Cancelled', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), ''), cancelled_during_prep = not v_restore_stock
  where id = p_order_id
  returning * into v_order;
  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order), 'stock_restored', v_restore_stock);
end;
$$;

-- Guarantees manager-authorized inventory edits retain database invariants and return the changed row.
create function public.update_menu_item(
  p_id text,
  p_price numeric default null,
  p_prep_time_minutes integer default null,
  p_stock integer default null,
  p_daily_limit integer default null,
  p_is_active boolean default null,
  p_badge text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_item public.menu_items%rowtype;
begin
  if not public.is_manager() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  update public.menu_items
  set price = coalesce(p_price, price), prep_time_minutes = coalesce(p_prep_time_minutes, prep_time_minutes),
      stock = coalesce(p_stock, stock), daily_limit = coalesce(p_daily_limit, daily_limit),
      is_active = coalesce(p_is_active, is_active), badge = coalesce(p_badge, badge)
  where id = p_id returning * into v_item;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'menu_item', to_jsonb(v_item));
end;
$$;

-- Guarantees manager-authorized changes to the singleton scheduling configuration.
create function public.update_kitchen_settings(
  p_max_kitchen_capacity integer default null,
  p_rush_multiplier numeric default null,
  p_batching_threshold integer default null,
  p_auto_batching_enabled boolean default null,
  p_canteen_open boolean default null,
  p_w_pickup_urgency numeric default null,
  p_w_prep_time numeric default null,
  p_w_priority numeric default null,
  p_auto_accept boolean default null,
  p_demo_mode boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_settings public.kitchen_settings%rowtype;
begin
  if not public.is_manager() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  update public.kitchen_settings
  set max_kitchen_capacity = coalesce(p_max_kitchen_capacity, max_kitchen_capacity),
      rush_multiplier = coalesce(p_rush_multiplier, rush_multiplier), batching_threshold = coalesce(p_batching_threshold, batching_threshold),
      auto_batching_enabled = coalesce(p_auto_batching_enabled, auto_batching_enabled), canteen_open = coalesce(p_canteen_open, canteen_open),
      w_pickup_urgency = coalesce(p_w_pickup_urgency, w_pickup_urgency), w_prep_time = coalesce(p_w_prep_time, w_prep_time),
      w_priority = coalesce(p_w_priority, w_priority), auto_accept = coalesce(p_auto_accept, auto_accept), demo_mode = coalesce(p_demo_mode, demo_mode)
  where singleton returning * into v_settings;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'settings', to_jsonb(v_settings));
end;
$$;

alter table public.menu_items enable row level security;
alter table public.kitchen_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Replace the demo predicate below with ownership/staff-only predicates when demo_mode is retired.
create policy "menu is publicly readable" on public.menu_items for select to anon, authenticated using (true);
create policy "settings are publicly readable" on public.kitchen_settings for select to anon, authenticated using (true);
create policy "users read their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "demo or authorized users read orders" on public.orders for select to anon, authenticated
  using ((select public.is_demo_mode()) or (select public.is_staff()) or ((select auth.uid()) = user_id));
create policy "demo or authorized users read order items" on public.order_items for select to anon, authenticated
  using ((select public.is_demo_mode()) or (select public.is_staff()) or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

revoke all on public.menu_items, public.kitchen_settings, public.profiles, public.orders, public.order_items from anon, authenticated;
grant select on public.menu_items, public.kitchen_settings, public.orders, public.order_items to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.order_queue to anon, authenticated;

revoke all on function public.is_demo_mode(), public.is_staff(), public.is_manager(), public.priority_rank(text), public.queue_score(public.orders), public.get_pickup_slots(jsonb, text), public.place_order(text, text, jsonb, timestamptz, text, text, text), public.update_order_status(uuid, text), public.cancel_order(uuid, text), public.update_menu_item(text, numeric, integer, integer, integer, boolean, text), public.update_kitchen_settings(integer, numeric, integer, boolean, boolean, numeric, numeric, numeric, boolean, boolean) from public;
grant execute on function public.is_demo_mode(), public.is_staff(), public.is_manager(), public.priority_rank(text), public.queue_score(public.orders), public.get_pickup_slots(jsonb, text), public.place_order(text, text, jsonb, timestamptz, text, text, text), public.update_order_status(uuid, text), public.cancel_order(uuid, text), public.update_menu_item(text, numeric, integer, integer, integer, boolean, text), public.update_kitchen_settings(integer, numeric, integer, boolean, boolean, numeric, numeric, numeric, boolean, boolean) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders, public.order_items, public.menu_items, public.kitchen_settings;
  end if;
end;
$$;
