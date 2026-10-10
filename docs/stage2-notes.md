# Stage 2 Investigation & Technical Analysis
**Team:** UNDERCUT DEV  
**Problem Statement:** 76 — Smart Canteen Order & Pickup Management  
**Scope:** Stage 2 — Lifecycle Transitions, Passcode Authentication, Verification & Inventory Redesign

---

## 1. Investigation Findings

### 1.1 Why "Start Cooking" in Kitchen Did Nothing
**Root Causes:**
1. **Illegal Status Skip (`Placed` &rarr; `Preparing`):**
   - In `KitchenCommandCenter.jsx`, Column 1 (`queuedOrders`) displays both `Placed` and `Accepted` orders.
   - For newly placed orders (`status === "Placed"`), the button was hardcoded as:
     ```jsx
     <button onClick={() => handleStatusChange(order.id, "Preparing")}>
       <span>Start Cooking</span>
     </button>
     ```
   - In the database schema (`supabase/migrations/20261010142130_canteen_core.sql`), `update_order_status` enforces strict forward progression:
     ```sql
     if not ((v_order.status = 'Placed' and v_new_status = 'Accepted')
          or (v_order.status = 'Accepted' and v_new_status = 'Preparing')
          or (v_order.status = 'Preparing' and v_new_status = 'Ready')
          or (v_order.status = 'Ready' and v_new_status = 'Collected')) then
       return jsonb_build_object('ok', false, 'reason', 'illegal_transition', ...);
     end if;
     ```
   - The database rejected the transition from `Placed` directly to `Preparing` with `reason: 'illegal_transition'`.

2. **Error Swallowing in Frontend Callback:**
   - In `App.jsx`, `handleUpdateOrderStatus` logged `console.warn("[App] status update failed:", res)` without notifying the user or raising a toast.
   - As a result, the click appeared completely dead with zero UI feedback.

**The Fix:**
- Kitchen cards now dynamically render the next legal step for each order:
  - `Placed` &rarr; `"Accept Order"` (advances to `Accepted`)
  - `Accepted` &rarr; `"Start Cooking"` (advances to `Preparing`)
  - `Preparing` &rarr; `"Mark Ready"` (advances to `Ready`)
  - `Ready` &rarr; `"Confirm Handover"` (advances to `Collected`)
- Action buttons are disabled while saving, and server rejections/errors are surfaced in toast notifications.

---

### 1.2 Why Stock for Crispy Masala Dosa, Idli Vada, and Paneer Tikka Roll Read 0 After Demo Scenario
**Root Causes:**
1. **`item-10` (Idli Vada Sambar Combo):**
   - `supabase/demo_scenario.sql` explicitly overrides:
     ```sql
     update public.menu_items set stock = 1, initial_stock = 1, daily_limit = 2 where id = 'item-10';
     ```
   - Then Order 4 (`Sneha Patel`, lines 41–50) places an order for 1x `item-10`.
   - `place_order` decrements `stock` by 1: `1 - 1 = 0`. This was intentionally designed to trigger the `sold_out` rejection in subsequent Order 5 for the hackathon demo.

2. **`item-1` (Crispy Masala Dosa) & `item-2` (Paneer Tikka Roll):**
   - In `supabase/smartcanteen_addons.sql`:
     ```sql
     alter table public.menu_items
       add column if not exists initial_stock integer not null default 0 check (initial_stock >= 0);
     ```
   - When added with `DEFAULT 0` on an already-seeded table, existing items received `initial_stock = 0` unless explicitly updated.
   - When `demo_reset()` ran (`update public.menu_items set stock = initial_stock;`), it restored stock to `0` for any dish whose `initial_stock` was 0.
   - In addition, `demo_scenario.sql` placed Order 1 for `item-1` and Order 2 for `item-2`.

**The Fix in `supabase/stage2_addons.sql`:**
- An idempotent backfill ensures `initial_stock` matches `stock` or `daily_limit`:
  ```sql
  update public.menu_items
  set initial_stock = coalesce(nullif(stock, 0), daily_limit, 20)
  where initial_stock = 0;
  ```
- `demo_reset()` ensures stock is restored to proper non-zero limits.

---

## 2. Stage 2 Architecture Summary

1. **Order Lifecycle in Kitchen:**
   - Single-step transitions: Placed &rarr; Accepted &rarr; Preparing &rarr; Ready &rarr; Collected.
   - Action buttons reflect the current state.
2. **Student Tracking Security:**
   - Student view is strictly read-only for status progression (Hackathon Demo Controller removed).
   - Students retain Cancel Order capability (only while `Placed`, `Accepted`, or `Preparing`).
3. **Order Confirmation & Realtime Handshake:**
   - Post-checkout confirmation screen shows Token, Order ID, Estimated pickup time, Items, and QR code.
   - Students tap "Track my order" to view real-time countdown starting at "Order Placed".
4. **QR Code Verification:**
   - Uses `qrcode.react` with secure minimal payload: `SC:<orderId>:<token>`.
   - Kitchen Command Center includes a "Verify Pickup" input box that loads the order by token/ID and enables single-click "Confirm Handover".
5. **Kitchen Inventory Redesign (Manage Stock):**
   - Full inventory management interface with live search, category filter, and "Low stock first" sorting.
   - Visual progress bars for `stock / daily_limit`.
   - Granular restock: set exact quantity, add typed custom amount, or mark 86.
6. **Passcode Role Authentication:**
   - Student persona enters directly.
   - Kitchen and Manager personas require a 6-digit PIN.
   - Cryptographic hashing via `extensions.crypt()` with `extensions.gen_salt('bf')`.
   - 8-hour session token (only sha256 hash stored in `role_sessions`).
   - Rate limiting: 5 failed attempts locks the role for 5 minutes.
   - Kitchen and Manager RPCs validate session token unless `demo_mode` is enabled.
