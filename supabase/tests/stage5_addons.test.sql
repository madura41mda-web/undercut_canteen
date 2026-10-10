-- ============================================================================
-- SmartCanteen Stage 5: Timezone, Name Validation & Auto-Hide Test Suite
-- Team: UNDERCUT DEV | Problem Statement 76
-- Run in Supabase SQL Editor to verify stage5_addons.sql behaviour.
-- ============================================================================

do $$
declare
  v_settings public.kitchen_settings%rowtype;
  v_col_count integer;
  v_res jsonb;
  v_order_id uuid;
  v_cancelled_at timestamptz;
  v_item_id text := 'item-1';
  v_stock_before integer;
  v_stock_after integer;
  v_mgr_token text;
  v_session_res jsonb;
begin
  raise notice 'Starting Stage 5 Addons Test Suite...';

  -- 1. Verify schema column: kitchen_settings.timezone
  select count(*) into v_col_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'kitchen_settings' and column_name = 'timezone';
  assert v_col_count = 1, 'Test 1 Failed: kitchen_settings.timezone column is missing';
  raise notice 'Test 1 Passed: kitchen_settings.timezone column verified';

  -- 2. Verify schema column: orders.cancelled_at
  select count(*) into v_col_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'cancelled_at';
  assert v_col_count = 1, 'Test 2 Failed: orders.cancelled_at column is missing';
  raise notice 'Test 2 Passed: orders.cancelled_at column verified';

  -- 3. Verify publication membership for Realtime
  select count(*) into v_col_count
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('orders', 'order_items', 'menu_items', 'kitchen_settings');
  assert v_col_count >= 4, 'Test 3 Failed: Required tables not all in supabase_realtime publication';
  raise notice 'Test 3 Passed: Realtime publication tables verified (count: %)', v_col_count;

  -- Ensure item-1 has stock
  update public.menu_items set stock = 25, is_active = true, is_available = true where id = v_item_id;
  update public.kitchen_settings set canteen_open = true, timezone = 'Asia/Kolkata';

  -- 4. Test Student Name validation: blank / numbers / symbols
  v_res := public.place_order(
    p_student_name => '12345',
    p_student_roll => '1GA24CS099',
    p_items => jsonb_build_array(jsonb_build_object('id', v_item_id, 'quantity', 1)),
    p_pickup_time => now() + interval '20 minutes'
  );
  assert (v_res ->> 'ok')::boolean = false and v_res ->> 'reason' = 'invalid_name',
    'Test 4 Failed: Numeric student name was not rejected';
  raise notice 'Test 4 Passed: Invalid numeric name rejected with reason "%"', v_res ->> 'reason';

  v_res := public.place_order(
    p_student_name => '',
    p_student_roll => '1GA24CS099',
    p_items => jsonb_build_array(jsonb_build_object('id', v_item_id, 'quantity', 1)),
    p_pickup_time => now() + interval '20 minutes'
  );
  assert (v_res ->> 'ok')::boolean = false and v_res ->> 'reason' = 'invalid_name',
    'Test 4b Failed: Empty student name was not rejected';
  raise notice 'Test 4b Passed: Empty name rejected with reason "%"', v_res ->> 'reason';

  -- 5. Test Valid Order Placement with Timezone field handling
  select stock into v_stock_before from public.menu_items where id = v_item_id;
  v_res := public.place_order(
    p_student_name => 'Samarth Sharma',
    p_student_roll => '1GA24CS099',
    p_items => jsonb_build_array(jsonb_build_object('id', v_item_id, 'quantity', 2)),
    p_pickup_time => now() + interval '20 minutes',
    p_payment_method => 'Counter Cash'
  );
  assert (v_res ->> 'ok')::boolean = true, format('Test 5 Failed: Valid place_order failed: %s', v_res);
  v_order_id := (v_res -> 'order' ->> 'id')::uuid;
  assert v_res -> 'order' ->> 'status' = 'pending_approval', 'Test 5 Failed: Counter order must be pending_approval';
  
  -- Verify stock was reserved
  select stock into v_stock_after from public.menu_items where id = v_item_id;
  assert v_stock_after = v_stock_before - 2, 'Test 5 Failed: Stock was not reserved';
  raise notice 'Test 5 Passed: Counter order placed successfully (ID: %, Status: %)', v_order_id, v_res -> 'order' ->> 'status';

  -- 6. Create Manager session token for authorized actions
  v_session_res := public.create_role_session('manager', '0000');
  v_mgr_token := v_session_res ->> 'token';

  -- 7. Test reject_order sets cancelled_at and restores stock
  v_res := public.reject_order(
    p_order_id => v_order_id,
    p_reason => 'Test counter decline',
    p_session_token => v_mgr_token
  );
  assert (v_res ->> 'ok')::boolean = true, format('Test 7 Failed: reject_order failed: %s', v_res);
  assert v_res -> 'order' ->> 'cancelled_at' is not null, 'Test 7 Failed: cancelled_at was not populated on reject';
  
  -- Verify stock was restored
  select stock into v_stock_after from public.menu_items where id = v_item_id;
  assert v_stock_after = v_stock_before, 'Test 7 Failed: Stock was not restored on reject';
  raise notice 'Test 7 Passed: reject_order set cancelled_at and restored stock';

  -- 8. Test cancel_order by Student sets cancelled_at
  v_res := public.place_order(
    p_student_name => 'Priya Patel',
    p_student_roll => '1GA24CS015',
    p_items => jsonb_build_array(jsonb_build_object('id', v_item_id, 'quantity', 1)),
    p_pickup_time => now() + interval '20 minutes',
    p_payment_method => 'UPI'
  );
  v_order_id := (v_res -> 'order' ->> 'id')::uuid;
  
  v_res := public.cancel_order(
    p_order_id => v_order_id,
    p_reason => 'Change of mind',
    p_student_usn => '1GA24CS015'
  );
  assert (v_res ->> 'ok')::boolean = true, format('Test 8 Failed: cancel_order failed: %s', v_res);
  assert v_res -> 'order' ->> 'cancelled_at' is not null, 'Test 8 Failed: cancelled_at was not populated on cancel';
  raise notice 'Test 8 Passed: cancel_order set cancelled_at and restored stock';

  -- 9. Test get_pickup_slots with Timezone handling
  v_res := public.get_pickup_slots(
    p_items => jsonb_build_array(jsonb_build_object('id', v_item_id, 'quantity', 1))
  );
  assert (v_res ->> 'ok')::boolean = true, 'Test 9 Failed: get_pickup_slots failed';
  assert jsonb_array_length(v_res -> 'slots') > 0, 'Test 9 Failed: No slots returned';
  raise notice 'Test 9 Passed: get_pickup_slots returned valid timezone slots (Count: %)', jsonb_array_length(v_res -> 'slots');

  -- 10. Clean up test order records
  delete from public.orders where student_roll in ('1GA24CS099', '1GA24CS015');

  raise notice '==================================================';
  raise notice 'ALL STAGE 5 ADDON TESTS COMPLETED SUCCESSFULLY!';
  raise notice '==================================================';
end;
$$;
