# Stage 4 Architecture & Investigation Notes

## 1. Pay-at-Counter Approval Workflow

### Existing State
- In Stage 3, `CheckoutModal` supported three payment methods: `UPI`, `Campus RFID Card`, and `Counter Cash`.
- All orders placed via `place_order` RPC were assigned `status = 'Placed'` (or `'Accepted'` if `auto_accept = true`), immediately entering the active kitchen queue and workload gauge.
- Stock was deducted immediately on order placement.

### Stage 4 Architecture
1. **Status Separation**:
   - For `Counter Cash` (Pay at Counter), `place_order` assigns `status = 'pending_approval'`.
   - For `UPI` and `Campus RFID Card`, `place_order` assigns `status = 'Placed'` (or `'Accepted'` if `auto_accept`).
2. **Stock Reservation & Capacity Protection**:
   - Stock is deducted immediately upon creating `pending_approval` orders to guarantee food availability upon counter arrival.
   - `pending_approval` orders are strictly **excluded** from:
     - Kitchen capacity load calculations (`kitchen_capacity`).
     - Kitchen active cooking queues (`Upcoming / Queued`, `In Cooking`, `Ready for Pickup`).
     - Batch cooking grouping algorithm.
3. **Approval RPC (`approve_order`)**:
   - Validates manager/kitchen session according to `counter_approver` setting.
   - Transitions status `pending_approval` -> `Placed` (or `'Accepted'` if `auto_accept`).
   - Recalculates `promised_pickup_time` from approval moment using `get_pickup_slots` to guarantee accurate kitchen preparation schedules.
4. **Rejection RPC (`reject_order`)**:
   - Validates manager/kitchen session.
   - Transitions `pending_approval` -> `Cancelled`.
   - Restores reserved stock for all items in the order.
   - Records `cancel_reason` (e.g. "Rejected at counter: Insufficient cash").
5. **Auto-Expiry (`expire_pending_orders`)**:
   - Cancels orders lingering in `pending_approval` beyond `pending_expiry_minutes` (default: 10 minutes).
   - Automatically releases reserved stock back to `menu_items`.
   - Invoked on read hooks and query triggers.

---

## 2. Manager Dashboard Redesign

### Hierarchy
1. **Top — Approvals Inbox**:
   - Displays all `pending_approval` orders with Student USN, Name, Items breakdown, Total amount, and minutes elapsed since order placement.
   - Quick action buttons: **Approve** and **Reject** (with optional rejection reason prompt/modal).
   - Empty state when no orders are pending counter payment.
2. **Next — Today's Real Numbers**:
   - **Orders Today**: Real count of orders placed today (excluding cancelled).
   - **Revenue**: Real sum of revenue from valid orders placed today.
   - **Active Queue**: Real count of orders currently in kitchen queue (`Placed`, `Accepted`, `Preparing`, `Ready`).
   - **Average Actual Prep Time**: Computed dynamically from completed orders or active menu prep weights.
3. **Then — Kitchen Settings**:
   - Concurrent capacity slider and rush hour multiplier.
   - Counter payment settings (`pending_expiry_minutes`, `counter_approver`).
   - Plain-English helper descriptions.
4. **Bottom — Menu and Prices**:
   - Collapsed by default with clear toggle button.
   - Allows editing price, daily limit, prep time, and archiving/unarchiving.

### Items Removed
- **Hardcoded SLA Percentage (`94.2%`)**: Removed arbitrary static SLA metric.
- **Hardcoded Hourly Rush Volume Chart (`hourlyRushData`)**: Removed static mock bars (`9 AM: 12`, `11 AM: 28`, `1 PM: 65`, etc.).
- **Hardcoded active transaction labels**: Replaced with live reactive counts.

---

## 3. Dismissing Cancelled Orders from Student View

- **Requirement**: Cancelled, rejected, and expired orders stay visible in the student's live tracking tab strip until explicitly dismissed.
- **Tab ✕ Trigger**: The ✕ icon appears **only** on tabs of orders whose status is `Cancelled` (or `Rejected` / `Expired`). Active orders (`pending_approval`, `Placed`, `Accepted`, `Preparing`, `Ready`) must never display a ✕ icon on their switcher tab.
- **Client Storage**: Dismissed order IDs are stored in `localStorage` under `smartcanteen_dismissed_orders_${studentUSN}`, wrapped in `try / catch`.
- **View-Only Isolation**: Dismissing an order only hides it from the student's personal view; the order row in Supabase remains intact for kitchen audit and reporting.

---

## 4. `cancel_order` RPC Signature & Stock Restoration

- Signature: `public.cancel_order(p_order_id uuid, p_reason text, p_student_usn text, p_session_token text)`.
- Students pass `p_student_usn` with `p_session_token = null`. The RPC verifies `UPPER(orders.student_roll) = UPPER(p_student_usn)`.
- Stock restoration condition:
  ```sql
  v_restore_stock := v_order.status in ('pending_approval', 'Placed', 'Accepted');
  ```
  This ensures cancelling a `pending_approval` order immediately restores reserved stock.
