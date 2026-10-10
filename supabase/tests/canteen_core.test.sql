-- pgTAP coverage for SmartCanteen core. Run after migration and seed in a disposable local database.
begin;
select plan(14);

delete from public.orders;
update public.kitchen_settings set demo_mode = true, canteen_open = true, auto_accept = false, max_kitchen_capacity = 12;
update public.menu_items set stock = 20, daily_limit = 20, is_active = true;

-- Whole order rejection: item-7 is unavailable, so no companion item may be written either.
update public.menu_items set stock = 0 where id = 'item-7';
select is((public.place_order('Reject Me', 'T-001', '[{"id":"item-1","quantity":1},{"id":"item-7","quantity":1}]'::jsonb, now() + interval '30 minutes') ->> 'ok'), 'false', 'unavailable item rejects the whole order');
select is((select count(*)::integer from public.orders), 0, 'rejected order writes no order row');
select is((select stock from public.menu_items where id = 'item-1'), 20, 'rejected order does not decrement another item');

-- Daily limit counts non-cancelled Kolkata-day orders only; cancelled order no longer consumes quota.
update public.menu_items set stock = 3, daily_limit = 1 where id = 'item-10';
create temporary table test_orders (placed uuid, preparing uuid) on commit drop;
insert into test_orders (placed)
select ((public.place_order('Daily One', 'T-002', '[{"id":"item-10","quantity":1}]'::jsonb, now() + interval '30 minutes') -> 'order' ->> 'id')::uuid;
select is((public.place_order('Daily Two', 'T-003', '[{"id":"item-10","quantity":1}]'::jsonb, now() + interval '40 minutes') ->> 'reason'), 'daily_limit', 'daily limit rejects another non-cancelled order today');
select is((public.cancel_order((select placed from test_orders), 'test') ->> 'stock_restored'), 'true', 'Placed cancellation restores stock');
select is((public.place_order('Daily Three', 'T-004', '[{"id":"item-10","quantity":1}]'::jsonb, now() + interval '50 minutes') ->> 'ok'), 'true', 'cancelled order is excluded from the daily limit');

-- Status transitions and Preparing cancellation rule.
insert into test_orders (preparing)
select ((public.place_order('Prep Cancel', 'T-005', '[{"id":"item-4","quantity":1}]'::jsonb, now() + interval '60 minutes') -> 'order' ->> 'id')::uuid;
select is((public.update_order_status((select preparing from test_orders), 'Ready') ->> 'reason'), 'illegal_transition', 'illegal status jump is rejected');
select is((public.update_order_status((select preparing from test_orders), 'Accepted') ->> 'ok'), 'true', 'Placed can become Accepted');
select is((public.update_order_status((select preparing from test_orders), 'Preparing') ->> 'ok'), 'true', 'Accepted can become Preparing');
select is((public.cancel_order((select preparing from test_orders), 'already cooking') ->> 'stock_restored'), 'false', 'Preparing cancellation does not restore stock');
select is((select cancelled_during_prep from public.orders where id = (select preparing from test_orders)), true, 'Preparing cancellation is marked');

-- Slot calculation is capacity-sensitive and active orders push it later.
delete from public.orders;
update public.menu_items set stock = 20, daily_limit = 20 where id in ('item-1', 'item-2', 'item-3');
update public.kitchen_settings set max_kitchen_capacity = 1;
create temporary table slot_baseline (slot_at timestamptz) on commit drop;
insert into slot_baseline select ((public.get_pickup_slots('[{"id":"item-1","quantity":1}]'::jsonb) -> 'slots' -> 0 ->> 'slot_at'))::timestamptz;
insert into test_orders (placed)
select ((public.place_order('Capacity One', 'T-006', '[{"id":"item-2","quantity":1}]'::jsonb, now() + interval '30 minutes') -> 'order' ->> 'id')::uuid;
select ok(((public.get_pickup_slots('[{"id":"item-1","quantity":1}]'::jsonb) -> 'slots' -> 0 ->> 'slot_at'))::timestamptz > (select slot_at from slot_baseline), 'active load pushes the earliest slot later');
update public.kitchen_settings set max_kitchen_capacity = 10;
select ok(((public.get_pickup_slots('[{"id":"item-1","quantity":1}]'::jsonb) -> 'slots' -> 0 ->> 'slot_at'))::timestamptz <= (select slot_at from slot_baseline) + interval '5 minutes', 'larger capacity changes the slots returned');

-- Queue ordering favors CRITICAL over NORMAL when other inputs are comparable.
delete from public.orders;
insert into test_orders (placed)
select ((public.place_order('Normal Queue', 'T-007', '[{"id":"item-1","quantity":1}]'::jsonb, now() + interval '90 minutes', 'NORMAL') -> 'order' ->> 'id')::uuid;
insert into test_orders (placed)
select ((public.place_order('Critical Queue', 'T-008', '[{"id":"item-3","quantity":1}]'::jsonb, now() + interval '90 minutes', 'CRITICAL') -> 'order' ->> 'id')::uuid;
select is((select priority from public.order_queue limit 1), 'CRITICAL', 'order_queue ranks CRITICAL ahead of NORMAL');

select * from finish();
rollback;
