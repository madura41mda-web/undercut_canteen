-- Optional demo data. Run only after smartcanteen_addons.sql and seed.sql.
-- Creates orders with varied priorities, pickup times, and statuses to demonstrate
-- the queue scoring, prioritization, last-item race, and cancellation scenarios.

-- Item-10 (Idli Vada Sambar Combo) already has stock=2 from seed. Set to 1 for last-item demo.
update public.menu_items set stock = 1, initial_stock = 1, daily_limit = 2 where id = 'item-10';

-- Order 1: CRITICAL priority, short pickup window — highest score in queue.
select public.place_order(
  'Aarav Sharma',    -- student_name
  'CS24B012',        -- student_roll
  '[{"id":"item-1","quantity":1},{"id":"item-4","quantity":1}]'::jsonb,  -- items
  now() + interval '12 minutes',  -- pickup_time (urgent)
  'CRITICAL',        -- priority
  'Extra coconut chutney please',
  'UPI'
);

-- Order 2: HIGH priority, medium pickup window.
select public.place_order(
  'Priya Nair',
  'EC23B045',
  '[{"id":"item-2","quantity":1},{"id":"item-8","quantity":1}]'::jsonb,
  now() + interval '20 minutes',
  'HIGH',
  'Make sandwich crisp',
  'Campus RFID Card'
);

-- Order 3: NORMAL priority, long pickup window — lowest score.
select public.place_order(
  'Rohan Verma',
  'ME25B089',
  '[{"id":"item-6","quantity":2}]'::jsonb,
  now() + interval '35 minutes',
  'NORMAL',
  'Medium spicy',
  'UPI'
);

-- Order 4: HIGH priority with the last Idli Vada (stock=1). First call wins.
select public.place_order(
  'Sneha Patel',
  'BT24B022',
  '[{"id":"item-10","quantity":1}]'::jsonb,
  now() + interval '15 minutes',
  'HIGH',
  null,
  'Counter Cash'
);

-- Order 5: Attempt to get the last Idli Vada (stock now 0). Should return ok:false, sold_out.
-- Run this separately in the demo to show the rejection in real time:
-- select public.place_order('Arjun Das','EE25B033','[{"id":"item-10","quantity":1}]'::jsonb, now() + interval '15 minutes','NORMAL',null,'UPI');

-- Advance Order 1 through lifecycle to show prioritization in kitchen.
update public.orders
set status = 'Accepted', accepted_at = now()
where token = 'CN-0001';

update public.orders
set status = 'Preparing', preparing_at = now()
where token = 'CN-0001';

-- Order 2 accepted only — demonstrates queue ordering between accepted orders.
update public.orders
set status = 'Accepted', accepted_at = now()
where token = 'CN-0002';
