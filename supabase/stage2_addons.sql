-- ============================================================================
-- SmartCanteen Stage 2 Addons: Passcode Auth, Verification & Inventory Controls
-- Team: UNDERCUT DEV | Problem Statement 76
--
-- GROUND RULES:
-- - Idempotent and safe to re-run.
-- - NO passcodes, keys, or secrets seeded or committed.
-- - Tables have RLS enabled with NO grants to anon or authenticated.
-- - When kitchen_settings.demo_mode is true, permits rapid testing before PINs are set.
-- - When demo_mode is false, all staff RPCs strictly require a valid session token.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Authentication Tables
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.role_passcodes (
  role text primary key check (role in ('kitchen', 'manager')),
  passcode_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

alter table public.role_passcodes enable row level security;
revoke all on public.role_passcodes from anon, authenticated, public;

create table if not exists public.role_sessions (
  token_hash text primary key,
  role text not null check (role in ('kitchen', 'manager')),
  expires_at timestamptz not null
);

alter table public.role_sessions enable row level security;
revoke all on public.role_sessions from anon, authenticated, public;

-- Index for session expiry pruning
create index if not exists role_sessions_expires_at_idx on public.role_sessions (expires_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Passcode Setup & Verification Functions
-- ────────────────────────────────────────────────────────────────────────────

-- Callable ONLY from Supabase SQL Editor. Never granted to anon or authenticated.
create or replace function public.set_role_passcode(p_role text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_role not in ('kitchen', 'manager') then
    return jsonb_build_object('ok', false, 'message', 'Invalid role. Must be kitchen or manager.');
  end if;

  if length(coalesce(trim(p_code), '')) <> 6 or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'message', 'Passcode must be exactly 6 numeric digits.');
  end if;

  insert into public.role_passcodes (role, passcode_hash, failed_attempts, locked_until)
  values (
    p_role,
    extensions.crypt(p_code, extensions.gen_salt('bf', 10)),
    0,
    null
  )
  on conflict (role) do update set
    passcode_hash = excluded.passcode_hash,
    failed_attempts = 0,
    locked_until = null;

  return jsonb_build_object('ok', true, 'message', format('Passcode set successfully for %s', p_role));
end;
$$;

revoke all on function public.set_role_passcode(text, text) from public, anon, authenticated;

-- Verifies passcode and returns an 8-hour bearer session token (storing only sha256 hash).
create or replace function public.verify_passcode(p_role text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_record public.role_passcodes%rowtype;
  v_raw_token text;
  v_token_hash text;
  v_expires timestamptz;
begin
  if p_role not in ('kitchen', 'manager') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role', 'message', 'Invalid role specified.');
  end if;

  select * into v_record from public.role_passcodes where role = p_role for update;

  -- If no passcode has been set in database yet
  if not found then
    if public.is_demo_mode() then
      -- Allow testing in demo mode before manual SQL passcode creation
      v_raw_token := 'demo-' || extensions.gen_random_uuid()::text;
      v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
      v_expires := now() + interval '8 hours';
      insert into public.role_sessions (token_hash, role, expires_at)
      values (v_token_hash, p_role, v_expires);
      return jsonb_build_object(
        'ok', true,
        'session_token', v_raw_token,
        'role', p_role,
        'expires_at', v_expires,
        'demo_warning', 'No passcode configured in database; session generated under demo mode.'
      );
    else
      return jsonb_build_object('ok', false, 'reason', 'not_configured', 'message', 'No passcode configured for this role. Set via SQL Editor.');
    end if;
  end if;

  -- Check lockout
  if v_record.locked_until is not null and v_record.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'message', 'Too many failed attempts. Role temporarily locked. Please try again in a few minutes.'
    );
  end if;

  -- Validate passcode hash
  if v_record.passcode_hash = extensions.crypt(coalesce(p_code, ''), v_record.passcode_hash) then
    -- Reset failure counters
    update public.role_passcodes
    set failed_attempts = 0, locked_until = null
    where role = p_role;

    -- Generate random session token
    v_raw_token := extensions.gen_random_uuid()::text || '-' || extensions.gen_random_uuid()::text;
    v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
    v_expires := now() + interval '8 hours';

    -- Prune expired sessions
    delete from public.role_sessions where expires_at < now();

    insert into public.role_sessions (token_hash, role, expires_at)
    values (v_token_hash, p_role, v_expires);

    return jsonb_build_object(
      'ok', true,
      'session_token', v_raw_token,
      'role', p_role,
      'expires_at', v_expires
    );
  else
    -- Failed attempt tracking
    v_record.failed_attempts := v_record.failed_attempts + 1;
    if v_record.failed_attempts >= 5 then
      update public.role_passcodes
      set failed_attempts = v_record.failed_attempts,
          locked_until = now() + interval '5 minutes'
      where role = p_role;
      return jsonb_build_object(
        'ok', false,
        'reason', 'locked',
        'message', 'Too many failed attempts. Role locked for 5 minutes.'
      );
    else
      update public.role_passcodes
      set failed_attempts = v_record.failed_attempts
      where role = p_role;
      return jsonb_build_object(
        'ok', false,
        'reason', 'invalid_credentials',
        'message', 'Invalid PIN code. Please try again.'
      );
    end if;
  end if;
end;
$$;

grant execute on function public.verify_passcode(text, text) to anon, authenticated;

-- Helper to validate role session server-side
create or replace function public.verify_role_session(
  p_session_token text,
  p_required_role text -- 'kitchen', 'manager', 'kitchen_advance', 'staff'
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_session_role text;
begin
  -- In demo_mode, preserve backwards compatibility for manual UI testing
  if public.is_demo_mode() then
    return true;
  end if;

  if p_session_token is null or length(p_session_token) < 10 then
    return false;
  end if;

  v_hash := encode(extensions.digest(p_session_token, 'sha256'), 'hex');

  select role into v_session_role
  from public.role_sessions
  where token_hash = v_hash and expires_at > now();

  if not found then
    return false;
  end if;

  if p_required_role = 'kitchen_advance' then
    -- Strictly Kitchen Staff only (Manager cannot advance order cooking status)
    return v_session_role = 'kitchen';
  elsif p_required_role = 'kitchen' then
    -- Kitchen actions (add dish, 86, restock, pickup verify)
    return v_session_role in ('kitchen', 'manager');
  elsif p_required_role = 'manager' then
    -- Manager only (pricing, quotas, capacity, archive)
    return v_session_role = 'manager';
  elsif p_required_role = 'staff' then
    return v_session_role in ('kitchen', 'manager');
  end if;

  return false;
end;
$$;

grant execute on function public.verify_role_session(text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Session-Guarded Status Progression (Replaces previous RPC)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_new_status text := initcap(lower(trim(p_new_status)));
begin
  -- Server-side check: Must possess an active Kitchen Staff session
  if not public.verify_role_session(p_session_token, 'kitchen_advance') then
    return jsonb_build_object(
      'ok', false,
      'reason', 'forbidden',
      'message', 'Permission denied. Only Kitchen Staff can advance order status.'
    );
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Order not found.');
  end if;

  -- Legal forward transition validation
  if not ((v_order.status = 'Placed' and v_new_status = 'Accepted')
       or (v_order.status = 'Accepted' and v_new_status = 'Preparing')
       or (v_order.status = 'Preparing' and v_new_status = 'Ready')
       or (v_order.status = 'Ready' and v_new_status = 'Collected')) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'illegal_transition',
      'from', v_order.status,
      'to', p_new_status,
      'message', format('Cannot transition order from %s to %s.', v_order.status, p_new_status)
    );
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

grant execute on function public.update_order_status(uuid, text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. QR Pickup Verification RPC
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.verify_pickup(
  p_query text,
  p_session_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clean text;
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  if not public.verify_role_session(p_session_token, 'kitchen') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden', 'message', 'Staff session required.');
  end if;

  v_clean := trim(coalesce(p_query, ''));
  if length(v_clean) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_query', 'message', 'Please enter a token or order ID.');
  end if;

  -- Strip QR prefix format if scanned: SC:<orderId>:<token>
  if v_clean ilike 'sc:%' then
    v_clean := split_part(v_clean, ':', 3);
  end if;

  -- Strip token prefix CN- if present
  if v_clean ~* '^cn-[0-9]+$' then
    select * into v_order from public.orders where token ilike v_clean limit 1;
  elsif v_clean ~ '^[0-9]+$' then
    -- Match numeric token suffix (e.g. "1" or "0001")
    select * into v_order from public.orders
    where token ilike ('CN-' || lpad(v_clean, 4, '0')) or token ilike ('CN-' || v_clean)
    limit 1;
  elsif v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_order from public.orders where id = v_clean::uuid limit 1;
  else
    select * into v_order from public.orders where token ilike v_clean or id::text ilike (v_clean || '%') limit 1;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'No matching order found for this token.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'menu_item_id', oi.menu_item_id,
    'name', oi.name,
    'price', oi.price,
    'quantity', oi.quantity,
    'prep_time_minutes', oi.prep_time_minutes
  )), '[]'::jsonb) into v_items
  from public.order_items oi
  where oi.order_id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'order', to_jsonb(v_order) || jsonb_build_object('items', v_items)
  );
end;
$$;

grant execute on function public.verify_pickup(text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Exact Stock Setting RPC (For Inventory Redesign)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.set_item_stock(
  p_id text,
  p_exact_stock integer,
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
    return jsonb_build_object('ok', false, 'reason', 'forbidden', 'message', 'Staff session required.');
  end if;

  if p_exact_stock is null or p_exact_stock < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_stock', 'message', 'Stock cannot be negative.');
  end if;

  select * into v_item from public.menu_items where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Item not found.');
  end if;

  update public.menu_items
  set stock = least(p_exact_stock, daily_limit)
  where id = p_id
  returning * into v_item;

  return jsonb_build_object('ok', true, 'menu_item', to_jsonb(v_item));
end;
$$;

grant execute on function public.set_item_stock(text, integer, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Backfill initial_stock & Improved Demo Reset
-- ────────────────────────────────────────────────────────────────────────────

-- Idempotently populate initial_stock for all items where it was defaulted to 0
update public.menu_items
set initial_stock = case
  when stock > 0 then stock
  when daily_limit > 0 then daily_limit
  else 20
end
where initial_stock = 0;

-- Demo reset with optional session check
create or replace function public.demo_reset(p_session_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleared integer;
begin
  if not public.is_demo_mode() and not public.verify_role_session(p_session_token, 'staff') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden', 'message', 'Staff session required to reset demo data.');
  end if;

  delete from public.orders;
  get diagnostics v_cleared = ROW_COUNT;

  alter sequence public.order_token_seq restart with 1;

  -- Restore stock to initial_stock values
  update public.menu_items set stock = initial_stock;

  return jsonb_build_object('ok', true, 'orders_cleared', v_cleared);
end;
$$;

grant execute on function public.demo_reset(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Additional Session-Guarded Operations
-- ────────────────────────────────────────────────────────────────────────────

-- Restock item with session checking (Kitchen or Manager)
create or replace function public.restock_item(
  p_id text,
  p_amount integer,
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
    return jsonb_build_object('ok', false, 'reason', 'forbidden', 'message', 'Staff session required to restock items.');
  end if;

  if coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount', 'message', 'Restock amount must be greater than zero.');
  end if;

  update public.menu_items
  set stock = least(stock + p_amount, daily_limit)
  where id = p_id
  returning * into v_item;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Item not found.');
  end if;

  return jsonb_build_object('ok', true, 'menu_item', to_jsonb(v_item));
end;
$$;

grant execute on function public.restock_item(text, integer, text) to anon, authenticated;

-- Manager-only capacity adjustment
create or replace function public.update_kitchen_capacity(
  p_capacity integer,
  p_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.kitchen_settings%rowtype;
begin
  if not public.verify_role_session(p_session_token, 'manager') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden', 'message', 'Manager session required to change kitchen capacity.');
  end if;

  if p_capacity is null or p_capacity < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_capacity', 'message', 'Capacity must be at least 1.');
  end if;

  update public.kitchen_settings
  set max_concurrent_orders = p_capacity,
      updated_at = now()
  returning * into v_settings;

  return jsonb_build_object('ok', true, 'kitchen_settings', to_jsonb(v_settings));
end;
$$;

grant execute on function public.update_kitchen_capacity(integer, text) to anon, authenticated;

