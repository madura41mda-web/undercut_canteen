-- SmartCanteen addon functions.
-- Run AFTER supabase/migrations/20261010142130_canteen_core.sql and supabase/seed.sql.
-- Adds: initial_stock column, restock_item RPC, demo_reset RPC.

-- Add initial_stock column so demo_reset can restore original quantities.
alter table public.menu_items
  add column if not exists initial_stock integer not null default 0 check (initial_stock >= 0);

-- Guarantees staff-level quick restock of a single menu item without full manager edit.
create or replace function public.restock_item(p_id text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.menu_items%rowtype;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;
  update public.menu_items
  set stock = stock + p_amount
  where id = p_id
  returning * into v_item;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'menu_item', to_jsonb(v_item));
end;
$$;

-- Guarantees a clean demo slate: only runs when demo_mode is true, clears all orders,
-- restarts the token sequence, and restores menu stock to initial_stock values.
create or replace function public.demo_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleared integer;
begin
  if not public.is_demo_mode() then
    return jsonb_build_object('ok', false, 'reason', 'not_in_demo_mode');
  end if;

  -- Delete all orders (cascades to order_items).
  delete from public.orders;
  get diagnostics v_cleared = ROW_COUNT;

  -- Restart the token sequence.
  alter sequence public.order_token_seq restart with 1;

  -- Restore stock to initial_stock values.
  update public.menu_items set stock = initial_stock;

  return jsonb_build_object('ok', true, 'orders_cleared', v_cleared);
end;
$$;

-- Grant execute permissions to anon and authenticated.
grant execute on function public.restock_item(text, integer) to anon, authenticated;
grant execute on function public.demo_reset() to anon, authenticated;
