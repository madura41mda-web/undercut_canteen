# SmartCanteen — Backend Analysis

## CanteenService public API (pre-Supabase)

| Method | Signature | Return | Called by |
|---|---|---|---|
| `getMenu()` | `()` | `MenuItem[]` | App (state init), StudentHome, KitchenCommandCenter, ManagerDashboard |
| `updateMenuItemStock(itemId, newStock)` | `(string, number)` | `MenuItem[]` | App → KitchenCommandCenter stock drawer |
| `updateMenuItem(item)` | `(MenuItem)` | `MenuItem[]` | App → ManagerDashboard edit modal |
| `resetMenu()` | `()` | `MenuItem[]` | App footer "Reset Demo Data" button |
| `getOrders()` | `()` | `Order[]` | App (state init), all views |
| `getActiveOrder()` | `()` | `Order or null` | App (state init), Navbar badge, StudentHome banner |
| `setActiveOrderId(orderId)` | `(string)` | `void` | App → OrderTracking onSelectOrder |
| `createOrder(data)` | `({items, studentName, studentRoll, pickupSlot, instructions, paymentMethod})` | `Order` | App → CheckoutModal |
| `updateOrderStatus(orderId, nextStatus)` | `(string, string)` | `Order[]` | App → OrderTracking, KitchenCommandCenter |
| `getSettings()` | `()` | `Settings` | App (state init), ManagerDashboard |
| `updateSettings(partial)` | `(Partial<Settings>)` | `Settings` | App → ManagerDashboard |
| `calculateFeasibleSlots(cartItems)` | `(CartItem[])` | `Slot[]` | App (useMemo) → CartDrawer + CheckoutModal |
| `detectBatches()` | `()` | `Batch[]` | App (useMemo) → KitchenCommandCenter |

## camelCase field names used in UI

MenuItem: id, name, category, price, prepTimeMinutes, calories, isVeg, rating, reviewCount, description, image, stock, dailyLimit, tags, badge, counter

Order: id, token, studentName, studentRoll, items[], totalAmount, status, priority, instructions, paymentMethod, counter, placedAt, promisedPickupTime, estimatedMinutesRemaining, cancelledDuringPrep, cancelReason

OrderItem (nested): id (=menu_item_id), name, price, quantity, prepTimeMinutes

Settings: maxKitchenCapacity, rushMultiplier, batchingThreshold, autoBatchingEnabled, canteenOpen

Slot: id, time, minutesFromNow, tag, recommended, efficiency, kitchenWorkloadPercent

## Key observations and corrections

1. createOrder is synchronous today — throws on stock failure; CheckoutModal catches inside setTimeout(600ms).
2. feasibleSlots is a useMemo in App.jsx depending on [cart, orders]; pre-computed, not called at submit time.
3. calculateFeasibleSlots uses hardcoded capacity 12, does not read from settings.
4. order.id IS the display ID (CN-8412); token is the numeric part (8412) for the pickup token box.
5. The migration file already exists at supabase/migrations/20261010142130_canteen_core.sql and is complete.
6. seed.sql and demo_scenario.sql already exist.
7. advanceNextStatus in OrderTracking uses modulo cycling which allows Collected→Placed — must be fixed.
8. No Cancel button exists anywhere in current UI.
9. No restock_item or demo_reset functions exist in the migration.
10. initial_stock column does not exist on menu_items — needed for demo_reset.

## Migration bugs

1. Missing restock_item RPC — kitchen stock drawer needs it.
2. Missing demo_reset function.
3. Missing initial_stock column on menu_items.
4. seed.sql conflict clause does not update demo_mode.

## Files to create/modify

- supabase/smartcanteen_addons.sql (NEW): initial_stock column, restock_item, demo_reset functions, grants.
- supabase/seed.sql (UPDATE): add initial_stock, fix conflict update.
- supabase/demo_scenario.sql (UPDATE): richer demo orders.
- src/lib/supabaseClient.js (NEW)
- .env.example (NEW)
- .gitignore (UPDATE): add .env pattern
- src/services/canteenState.js (FULL REWRITE)
- src/App.jsx (UPDATE): async handlers, Realtime, cancel, demo reset
- src/components/CheckoutModal.jsx (UPDATE): async, server errors/alternatives
- src/components/OrderTracking.jsx (UPDATE): no backwards cycling, Cancel button, Cancelled state, Reset Demo
- src/components/KitchenCommandCenter.jsx (UPDATE): async, show Cancelled
- src/components/ManagerDashboard.jsx (UPDATE): async saves
- docs/backend-setup.md (NEW)
