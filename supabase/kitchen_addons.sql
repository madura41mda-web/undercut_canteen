-- ============================================================================
-- SmartCanteen Stage 1: Kitchen Addons & Role Enforcement
-- Team: UNDERCUT DEV | Problem Statement 76
--
-- ALLOWED-ROLE PERMISSION MATRIX:
-- ----------------------------------------------------------------------------
-- Action                     | Student | Kitchen Staff | Manager | Demo Mode
-- ---------------------------+---------+---------------+---------+-----------
-- Browse menu (active items) | Yes     | Yes           | Yes     | Yes
-- View archived dishes       | No      | Yes           | Yes     | Yes
-- Place order                | Yes     | No            | No      | Yes
-- View & track own order     | Yes     | Yes           | Yes     | Yes
-- Add dish (add_menu_item)   | No      | Yes           | Yes     | Yes
-- Restock / 86 item          | No      | Yes           | Yes     | Yes
-- Advance cooking status     | No      | Yes           | No      | Yes
-- Cancel order during prep   | No      | Yes           | No      | Yes
-- Cancel unstarted order     | Yes     | Yes           | Yes     | Yes
-- Edit price, prep, limits   | No      | No            | Yes     | Yes
-- Archive / unarchive dish   | No      | No            | Yes     | Yes
-- Update kitchen settings    | No      | No            | Yes     | Yes
-- Demo reset                 | No      | Yes           | Yes     | Yes
--
-- In demo_mode (kitchen_settings.demo_mode = true):
-- Client role enforcement operates at UI level for rapid hackathon testing.
-- When demo_mode = false:
-- Strict RLS and SECURITY DEFINER RPC role gates check public.profiles.role.
-- ============================================================================

-- Ensure unique sequence for text IDs formatted as 'item-XXX'
create sequence if not exists public.menu_item_id_seq start with 100;

-- Ensure initial_stock column is present (idempotent with smartcanteen_addons.sql)
alter table public.menu_items
  add column if not exists initial_stock integer not null default 0 check (initial_stock >= 0);

-- Set replica identity full so UPDATE payloads publish all column states
alter table public.menu_items replica identity full;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Helper: current_app_role()
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_demo_mode() then 'demo'
    else coalesce((select role from public.profiles where id = auth.uid()), 'student')
  end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC: add_menu_item(...)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.add_menu_item(
  p_name text,
  p_category text,
  p_price numeric,
  p_prep_minutes int,
  p_daily_limit int,
  p_is_veg boolean default true,
  p_description text default '',
  p_image text default null,
  p_counter text default null,
  p_calories int default null
)
returns public.menu_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed_name text;
  v_trimmed_cat text;
  v_new_id text;
  v_badge text;
  v_tags text[];
  v_counter text;
  v_item public.menu_items%rowtype;
begin
  -- Role check: kitchen or manager required outside demo mode
  if not public.is_staff() then
    raise exception 'forbidden: only kitchen or manager can add dishes';
  end if;

  v_trimmed_name := trim(coalesce(p_name, ''));
  v_trimmed_cat := trim(coalesce(p_category, ''));

  -- Validation 1: Dish name length (2 to 60 chars)
  if length(v_trimmed_name) < 2 or length(v_trimmed_name) > 60 then
    raise exception 'Dish name must be between 2 and 60 characters';
  end if;

  -- Validation 2: Category not empty
  if length(v_trimmed_cat) = 0 then
    raise exception 'Category cannot be empty';
  end if;

  -- Validation 3: Case-insensitive duplicate name among active dishes
  if exists (
    select 1 from public.menu_items
    where is_active and lower(name) = lower(v_trimmed_name)
  ) then
    raise exception 'A dish named "%" already exists', v_trimmed_name;
  end if;

  -- Validation 4: Price > 0 and <= 5000
  if p_price is null or p_price <= 0 or p_price > 5000 then
    raise exception 'Price must be greater than 0 and at most 5000';
  end if;

  -- Validation 5: Prep minutes 1 to 30
  if p_prep_minutes is null or p_prep_minutes < 1 or p_prep_minutes > 30 then
    raise exception 'Preparation time must be between 1 and 30 minutes';
  end if;

  -- Validation 6: Daily limit 0 to 500
  if p_daily_limit is null or p_daily_limit < 0 or p_daily_limit > 500 then
    raise exception 'Daily limit must be between 0 and 500';
  end if;

  -- Generate unique ID using sequence (starts at 100, above seed item-1..item-10)
  v_new_id := 'item-' || nextval('public.menu_item_id_seq'::regclass);
  v_counter := coalesce(nullif(trim(coalesce(p_counter, '')), ''), 'Counter 1 (Main Station)');

  -- Quick Prep derived purely from prep_minutes <= 8
  if p_prep_minutes <= 8 then
    v_badge := '⚡ ' || p_prep_minutes || ' Mins';
    v_tags := array['Quick Prep'];
  else
    v_badge := null;
    v_tags := array[]::text[];
  end if;

  insert into public.menu_items (
    id,
    name,
    category,
    price,
    prep_time_minutes,
    calories,
    is_veg,
    rating,
    review_count,
    description,
    image,
    stock,
    initial_stock,
    daily_limit,
    tags,
    badge,
    counter,
    is_active
  ) values (
    v_new_id,
    v_trimmed_name,
    v_trimmed_cat,
    round(p_price, 2),
    p_prep_minutes,
    p_calories,
    coalesce(p_is_veg, true),
    null,
    0,
    coalesce(nullif(trim(coalesce(p_description, '')), ''), ''),
    nullif(trim(coalesce(p_image, '')), ''),
    p_daily_limit,
    p_daily_limit,
    p_daily_limit,
    v_tags,
    v_badge,
    v_counter,
    true
  )
  returning * into v_item;

  return v_item;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RPC: archive_menu_item(p_id text) & unarchive_menu_item(p_id text)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.archive_menu_item(p_id text)
returns public.menu_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.menu_items%rowtype;
begin
  if not public.is_manager() then
    raise exception 'forbidden: only manager can archive dishes';
  end if;

  update public.menu_items
  set is_active = false
  where id = p_id
  returning * into v_item;

  if not found then
    raise exception 'Menu item % not found', p_id;
  end if;

  return v_item;
end;
$$;

create or replace function public.unarchive_menu_item(p_id text)
returns public.menu_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.menu_items%rowtype;
begin
  if not public.is_manager() then
    raise exception 'forbidden: only manager can unarchive dishes';
  end if;

  update public.menu_items
  set is_active = true
  where id = p_id
  returning * into v_item;

  if not found then
    raise exception 'Menu item % not found', p_id;
  end if;

  return v_item;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC: update_menu_item(...) with validation and stock bounds
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.update_menu_item(
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
declare
  v_item public.menu_items%rowtype;
  v_new_daily_limit integer;
  v_new_stock integer;
  v_new_prep integer;
  v_new_badge text;
  v_new_tags text[];
begin
  if not public.is_manager() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden', 'message', 'forbidden: manager role required');
  end if;

  select * into v_item from public.menu_items where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Menu item not found');
  end if;

  -- Validate price if passed
  if p_price is not null and (p_price <= 0 or p_price > 5000) then
    raise exception 'Price must be greater than 0 and at most 5000';
  end if;

  -- Validate prep time if passed
  if p_prep_time_minutes is not null and (p_prep_time_minutes < 1 or p_prep_time_minutes > 30) then
    raise exception 'Preparation time must be between 1 and 30 minutes';
  end if;

  -- Validate daily limit if passed
  if p_daily_limit is not null and (p_daily_limit < 0 or p_daily_limit > 500) then
    raise exception 'Daily limit must be between 0 and 500';
  end if;

  -- Validate stock if passed
  if p_stock is not null and p_stock < 0 then
    raise exception 'Stock count cannot be negative';
  end if;

  v_new_daily_limit := coalesce(p_daily_limit, v_item.daily_limit);
  -- Clamp stock so it never exceeds the new daily limit
  v_new_stock := least(coalesce(p_stock, v_item.stock), v_new_daily_limit);
  v_new_prep := coalesce(p_prep_time_minutes, v_item.prep_time_minutes);

  -- Adjust tags and badge if prep time is updated
  if p_prep_time_minutes is not null then
    if v_new_prep <= 8 then
      v_new_badge := coalesce(p_badge, '⚡ ' || v_new_prep || ' Mins');
      v_new_tags := array_append(array_remove(v_item.tags, 'Quick Prep'), 'Quick Prep');
    else
      v_new_badge := p_badge;
      v_new_tags := array_remove(v_item.tags, 'Quick Prep');
    end if;
  else
    v_new_badge := coalesce(p_badge, v_item.badge);
    v_new_tags := v_item.tags;
  end if;

  update public.menu_items
  set price = coalesce(p_price, price),
      prep_time_minutes = v_new_prep,
      stock = v_new_stock,
      daily_limit = v_new_daily_limit,
      is_active = coalesce(p_is_active, is_active),
      badge = v_new_badge,
      tags = v_new_tags
  where id = p_id
  returning * into v_item;

  return jsonb_build_object('ok', true, 'menu_item', to_jsonb(v_item));
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Permissions & Grants
-- ────────────────────────────────────────────────────────────────────────────
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.add_menu_item(text, text, numeric, int, int, boolean, text, text, text, int) to anon, authenticated;
grant execute on function public.archive_menu_item(text) to anon, authenticated;
grant execute on function public.unarchive_menu_item(text) to anon, authenticated;
grant execute on function public.update_menu_item(text, numeric, integer, integer, integer, boolean, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Realtime Publication Guard
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
  ) then
    alter publication supabase_realtime add table public.menu_items;
  end if;

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
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_settings'
  ) then
    alter publication supabase_realtime add table public.kitchen_settings;
  end if;
end;
$$;
