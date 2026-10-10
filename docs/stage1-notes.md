# Stage 1 Analysis & Implementation Notes
**Team:** UNDERCUT DEV  
**Problem Statement:** 76 — Smart Canteen Order & Pickup Management  
**Scope:** Stage 1 — Add Dish, Role Separation, and Realtime Infrastructure

---

## 1. Schema & Migration Analysis

### 1.1 `public.menu_items` Schema
Inspected from `supabase/migrations/20261010142130_canteen_core.sql` and `supabase/smartcanteen_addons.sql`:

| Column Name | PostgreSQL Type | Constraints / Defaults | Notes |
|---|---|---|---|
| `id` | `text` | `primary key` | Textual identifier format `item-1`, `item-2`, etc. |
| `name` | `text` | `not null` | Dish name |
| `category` | `text` | `not null` | Category classification |
| `price` | `numeric(10, 2)` | `not null check (price >= 0)` | Price in INR |
| `prep_time_minutes` | `integer` | `not null check (prep_time_minutes > 0)` | Preparation time in minutes |
| `calories` | `integer` | `null` | Approximate calorie count |
| `is_veg` | `boolean` | `not null default true` | Dietary flag |
| `rating` | `numeric(2, 1)` | `check (rating between 0 and 5)` | Customer rating |
| `review_count` | `integer` | `not null default 0 check (review_count >= 0)` | Review count |
| `description` | `text` | `null` | Dish summary |
| `image` | `text` | `null` | Image URL |
| `stock` | `integer` | `not null default 0 check (stock >= 0)` | Live available units |
| `daily_limit` | `integer` | `not null check (daily_limit >= 0)` | Daily quota limit |
| `tags` | `text[]` | `not null default '{}'` | Array of tag badges (e.g. `['Quick Prep']`) |
| `badge` | `text` | `null` | Visual pill text (e.g. `⚡ 8 Mins`) |
| `counter` | `text` | `not null` | Station assignment (e.g. `Counter 1 (Main Station)`) |
| `is_active` | `boolean` | `not null default true` | Soft-delete flag (archived dishes = false) |
| `initial_stock` | `integer` | `not null default 0 check (initial_stock >= 0)` | Added by `smartcanteen_addons.sql` for demo resets |

---

### 1.2 Existing RPCs & Validation Rules

1. **`public.place_order(p_student_name, p_student_roll, p_items, p_pickup_time, p_priority, p_instructions, p_payment_method)`**
   - Validates non-empty `p_items` array with positive quantities.
   - Validates priority in `('NORMAL', 'HIGH', 'CRITICAL')`.
   - Locks `kitchen_settings` row to verify `canteen_open`.
   - Acquires deterministic row locks on requested `menu_items` rows (`order by mi.id for update`).
   - Checks `is_active` (`invalid_item` error if false), `stock >= quantity` (`sold_out` error if insufficient), and daily quota vs today's consumption (`daily_limit` error).
   - Queries alternatives in the same category if requested items are unavailable.
   - Calls `get_pickup_slots()` to enforce kitchen capacity limits and clamps pickup time to earliest feasible slot.
   - Decrements `stock` atomically and inserts into `orders` and `order_items`.
   - **Conclusion on `is_active`**: `place_order` already actively rejects inactive items with `reason: 'invalid_item'`. Therefore, no replacement of `place_order` is needed.

2. **`public.update_order_status(p_order_id, p_new_status)`**
   - Validates caller via `is_staff()` (`is_demo_mode() = true` or `role in ('kitchen', 'manager')`).
   - Row-locks target order; permits only strict forward progression:
     `Placed` &rarr; `Accepted` &rarr; `Preparing` &rarr; `Ready` &rarr; `Collected`.
   - Records lifecycle timestamps (`accepted_at`, `preparing_at`, `ready_at`, `collected_at`) and zeros out `estimated_minutes_remaining` when complete.

3. **`public.cancel_order(p_order_id, p_reason)`**
   - Validates caller (`is_demo_mode()` or `is_staff()` or `user_id = auth.uid()`).
   - Allows cancellation only from `Placed`, `Accepted`, or `Preparing`.
   - If cancelled before preparation (`Placed` or `Accepted`), restores menu item stock.
   - If cancelled during `Preparing`, cancels the order without restoring stock (`cancelled_during_prep = true`).

4. **`public.restock_item(p_id, p_amount)`**
   - Validates `is_staff()` and `p_amount > 0`.
   - Increments item stock by `p_amount`.

5. **`public.update_menu_item(p_id, p_price, p_prep_time_minutes, p_stock, p_daily_limit, p_is_active, p_badge)`**
   - Validates `is_manager()`.
   - In original migration, it lacks boundaries on prep minutes (1–30), price (>0), daily limit (>=0), and does not clamp stock when daily limit is reduced.
   - **Action:** Replaced in `kitchen_addons.sql` to enforce validation rules and clamp stock &le; daily_limit.

6. **`public.update_kitchen_settings(...)`**
   - Validates `is_manager()`; updates singleton kitchen parameters (capacity, rush multiplier, batching threshold, weights).

7. **`public.demo_reset()`**
   - Validates `is_demo_mode()`; truncates `orders`, resets `order_token_seq` to 1, and restores `stock = initial_stock`.

8. **`public.get_pickup_slots(p_items, p_priority)`**
   - Validates canteen open, items active, computes active workload vs `max_kitchen_capacity`, and generates 3 pickup slot intervals.

---

### 1.3 Quick Prep Implementation
- Current code hardcodes prep time &le; 8 mins in `StudentHome.jsx`: `matchesFastPrep = fastPrepOnly ? item.prepTimeMinutes <= 8 : true`.
- In Stage 1:
  - Unified under `QUICK_PREP_MAX_MINUTES = 8` exported from `canteenState.js`.
  - Used consistently across `StudentHome`, Add Dish modal form validation, and database trigger/RPC logic.

---

### 1.4 Realtime Subscriptions
- Handled in `canteenState.js` via `supabase.channel("smartcanteen-realtime")`.
- Listens on table changes for `menu_items`, `orders`, `order_items`, and `kitchen_settings`.
- In `kitchen_addons.sql`, publication membership is verified and `replica identity full` is set on `menu_items` for reliable payload diffing.
- Reconnection state listener added to notify the UI when connection drops and recovers.

---

### 1.5 Tab Rendering & Role Separation Architecture
- Current `App.jsx` rendered all 4 tabs via `activeTab` state without access control.
- In Stage 1:
  - `src/lib/role.js` created as the single source of truth (`currentRole`, `setRole`, `can(action)`).
  - Role persisted in `sessionStorage` with hash routing (`#/student`, `#/kitchen`, `#/manager`).
  - Strict UI gating prevents unauthorised tab rendering or action controls.
