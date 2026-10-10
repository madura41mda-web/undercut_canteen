# Concurrent last-item test

This test needs two database sessions; pgTAP itself runs one transaction and cannot prove lock contention.

1. Apply the migration and seed to a disposable local database, then run:

   ```sql
   update public.menu_items set stock = 1, daily_limit = 10 where id = 'item-10';
   ```

2. Start the following statement in each of two `psql` sessions at the same time. Change the roll number in the second session.

   ```sql
   select public.place_order(
     'Concurrent Tester', 'CONCURRENT-1',
     '[{"id":"item-10","quantity":1}]'::jsonb,
     now() + interval '30 minutes', 'NORMAL', null, 'UPI'
   );
   ```

3. Assert exactly one response has `ok: true`, the other has `reason: "sold_out"`, and `menu_items.stock` for `item-10` is zero. The ordered `FOR UPDATE` menu lock in `place_order` is the behavior under test.
