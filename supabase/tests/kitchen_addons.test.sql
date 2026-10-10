-- ============================================================================
-- SmartCanteen Stage 1: Kitchen Addons Test Suite
-- Run in Supabase SQL Editor to verify kitchen_addons.sql behaviour.
-- ============================================================================

do $$
declare
  v_new_item public.menu_items%rowtype;
  v_dup_error boolean := false;
  v_prep_error boolean := false;
  v_price_error boolean := false;
  v_order_result jsonb;
  v_edit_result jsonb;
  v_archived_item public.menu_items%rowtype;
begin
  raise notice 'Starting kitchen addons test suite...';

  -- 1. Test Valid Add Menu Item
  v_new_item := public.add_menu_item(
    p_name => 'Test Masala Chai ' || floor(random() * 1000)::text,
    p_category => 'Beverages',
    p_price => 25.00,
    p_prep_minutes => 5,
    p_daily_limit => 50,
    p_is_veg => true,
    p_description => 'Hot spiced tea with cardamom and ginger',
    p_counter => 'Counter 4 (Beverages)'
  );
  assert v_new_item.id is not null, 'Test 1 Failed: Item ID should be generated';
  assert v_new_item.stock = 50, 'Test 1 Failed: Initial stock should equal daily limit';
  assert v_new_item.badge = '⚡ 5 Mins', 'Test 1 Failed: Badge should be auto-generated for quick prep';
  assert 'Quick Prep' = any(v_new_item.tags), 'Test 1 Failed: Tags should include Quick Prep';
  raise notice 'Test 1 Passed: Valid dish added successfully (ID: %, Badge: %)', v_new_item.id, v_new_item.badge;

  -- 2. Test Duplicate Name Detection
  begin
    perform public.add_menu_item(
      p_name => v_new_item.name, -- same name
      p_category => 'Beverages',
      p_price => 30.00,
      p_prep_minutes => 6,
      p_daily_limit => 20
    );
  exception when others then
    v_dup_error := true;
    raise notice 'Test 2 Passed: Duplicate dish rejected with message "%"', sqlerrm;
  end;
  assert v_dup_error, 'Test 2 Failed: Duplicate dish was not rejected';

  -- 3. Test Prep Time > 30 Rejection
  begin
    perform public.add_menu_item(
      p_name => 'Slow Smoked Roast ' || floor(random() * 1000)::text,
      p_category => 'Bowls & Wok',
      p_price => 150.00,
      p_prep_minutes => 35, -- invalid > 30
      p_daily_limit => 20
    );
  exception when others then
    v_prep_error := true;
    raise notice 'Test 3 Passed: Prep time 35 rejected with message "%"', sqlerrm;
  end;
  assert v_prep_error, 'Test 3 Failed: Prep time > 30 was not rejected';

  -- 4. Test Price <= 0 Rejection
  begin
    perform public.add_menu_item(
      p_name => 'Free Water Bottle ' || floor(random() * 1000)::text,
      p_category => 'Beverages',
      p_price => 0.00, -- invalid price
      p_prep_minutes => 2,
      p_daily_limit => 50
    );
  exception when others then
    v_price_error := true;
    raise notice 'Test 4 Passed: Zero price rejected with message "%"', sqlerrm;
  end;
  assert v_price_error, 'Test 4 Failed: Price 0 was not rejected';

  -- 5. Test Archive and Order Prevention
  v_archived_item := public.archive_menu_item(v_new_item.id);
  assert not v_archived_item.is_active, 'Test 5 Failed: Item should be inactive after archive';

  -- Attempt to place order on archived item
  v_order_result := public.place_order(
    p_student_name => 'Tester',
    p_student_roll => 'TEST-001',
    p_items => jsonb_build_array(jsonb_build_object('id', v_new_item.id, 'quantity', 1)),
    p_pickup_time => now() + interval '15 minutes'
  );
  assert (v_order_result ->> 'ok')::boolean = false, 'Test 5 Failed: Order on archived item must fail';
  assert v_order_result ->> 'reason' = 'invalid_item', 'Test 5 Failed: Reason should be invalid_item';
  raise notice 'Test 5 Passed: Archived item rejected during order placement (%)', v_order_result ->> 'reason';

  -- 6. Test Unarchive Menu Item
  v_archived_item := public.unarchive_menu_item(v_new_item.id);
  assert v_archived_item.is_active, 'Test 6 Failed: Item should be active after unarchive';
  raise notice 'Test 6 Passed: Item successfully unarchived';

  -- 7. Test Edit Limit Below Current Stock (Stock Clamping)
  -- Initially stock = 50. Lower daily limit to 20.
  v_edit_result := public.update_menu_item(
    p_id => v_new_item.id,
    p_daily_limit => 20
  );
  assert (v_edit_result ->> 'ok')::boolean = true, 'Test 7 Failed: Edit menu item failed';
  assert (v_edit_result -> 'menu_item' ->> 'stock')::integer = 20, 'Test 7 Failed: Stock was not clamped to new daily limit';
  raise notice 'Test 7 Passed: Stock successfully clamped to new daily limit (New Stock: %)', v_edit_result -> 'menu_item' ->> 'stock';

  -- Cleanup test item
  delete from public.menu_items where id = v_new_item.id;

  raise notice 'ALL TESTS PASSED SUCCESSFULLY!';
end;
$$;
