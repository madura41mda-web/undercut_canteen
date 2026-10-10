# SmartCanteen — Backend Setup & Demo Script

## Prerequisites
- A Supabase project (free tier works)
- Node.js 18+ and npm
- The repo cloned locally

---

## Step 1 — Run SQL in Supabase

Open your project → **SQL Editor**. Paste and run the files **in this exact order**:

### 1a. Core schema
Paste the full contents of `supabase/migrations/20261010142130_canteen_core.sql` and click **Run**.

This creates all tables (`menu_items`, `orders`, `order_items`, `kitchen_settings`, `profiles`), all RPC functions, the `order_queue` view, RLS policies, grants, and the Realtime publication.

### 1b. Addon functions
Paste `supabase/smartcanteen_addons.sql` and click **Run**.

This adds the `initial_stock` column and the `restock_item` / `demo_reset` functions.

### 1c. Seed data
Paste `supabase/seed.sql` and click **Run**.

This inserts all 10 menu items and the default kitchen settings row.

### 1d. (Optional) Demo scenario
Paste `supabase/demo_scenario.sql` and click **Run**.

This pre-creates 4 orders with different priorities and advances 2 of them through the lifecycle so the kitchen queue is already populated on first load.

> **Note:** If you get a "relation already exists" or "already subscribed" error on the Realtime publication line in the core schema, that is safe to ignore — it means the table was already added.

---

## Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these in your Supabase dashboard → **Project Settings → API**.

> The anon key is safe to expose in the frontend. Never put the service-role key here.

---

## Step 3 — Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Demo Script (Hackathon Presentation)

### Scene 1 — Prioritization
1. Go to **Student Menu** tab. Place an order for "Crispy Masala Dosa" with a pickup 12 minutes away, selecting **CRITICAL** priority (use the priority field in CheckoutModal — currently hardcoded NORMAL, can be exposed).
2. Place a second order for "Paneer Tikka Roll" with a pickup 30 minutes away, NORMAL priority.
3. Switch to **Kitchen Command Center**. The Kanban shows both orders in "Upcoming / Queued".
4. Click the **Order Queue** view in Supabase → notice the CRITICAL order scores higher despite having a later absolute position.

### Scene 2 — Last-item race condition
1. Ensure `item-10` (Idli Vada Sambar Combo) has stock = 1 (run `update public.menu_items set stock = 1 where id = 'item-10';` or use Reset Demo).
2. In one browser tab, add item-10 to cart and proceed to checkout.
3. In a second browser tab (same window), do the same.
4. Submit both checkouts rapidly. **Exactly one succeeds**; the other sees "Sorry — Idli Vada Sambar Combo just sold out."

### Scene 3 — Unavailable item rejection with alternatives
1. In Supabase SQL Editor: `update public.menu_items set stock = 0 where id = 'item-7';`
2. Student adds "Hyderabadi Dum Veg Biryani" to cart (the Sold Out card is already greyed; to demo the server-side check, temporarily set `is_active = false` on item-7 and place an order via the RPC directly).
3. The checkout returns `ok: false, reason: sold_out` and the UI shows the red rejection banner with alternative "Bowls & Wok" items listed below it.

### Scene 4 — Kitchen capacity pushing pickup slot later
1. In Manager Dashboard, reduce **Max Kitchen Capacity** to 2.
2. Ensure 2 orders are in Preparing state (use the Demo Controller buttons on the Tracking tab).
3. Place a new order — observe that the pickup slot times are pushed forward (larger `minutes_from_now`) because all capacity waves are occupied.

### Scene 5 — Cancel during preparation
1. Place a fresh order (Tracking tab shows it as "Placed").
2. Use the Demo Controller to advance it to **Preparing**.
3. On the Tracking tab, scroll down to the **Cancel Order** button.
4. Confirm cancellation. The UI shows the red "ORDER CANCELLED" banner with the note "Cancelled during preparation — stock could not be restored."
5. Switch to Kitchen Command Center → the Cancelled Orders section at the bottom shows the order with "During prep (no restock)" label.
6. In Manager Dashboard → inventory table, confirm stock has NOT changed.

### Scene 6 — Reset for next demo
1. Press **Reset Demo** button (next to the Demo Controller in Tracking, or in the footer).
2. All orders are cleared, token sequence restarts at CN-0001, menu stock restores to seed values.

---

## Architecture Notes

| Layer | Technology |
|---|---|
| Database | Supabase Postgres with RLS |
| Real-time | Supabase Realtime (postgres_changes subscription) |
| Auth model | `demo_mode = true` → all writes open; set false for role-based auth |
| Frontend state | In-memory cache in `CanteenService` — synchronous reads, async writes |
| Slot calculation | Server-side `get_pickup_slots` RPC using real active order count |
| Stock safety | `FOR UPDATE` row locks in `place_order` prevent oversell |

## Files Created / Changed

### New files
| File | Purpose |
|---|---|
| `supabase/smartcanteen_addons.sql` | `initial_stock`, `restock_item`, `demo_reset` |
| `src/lib/supabaseClient.js` | Supabase singleton client |
| `.env.example` | Env var template |
| `docs/backend-analysis.md` | Codebase analysis |
| `docs/backend-setup.md` | This file |

### Modified files
| File | What changed |
|---|---|
| `supabase/seed.sql` | Added `initial_stock`, fixed conflict clause |
| `supabase/demo_scenario.sql` | Richer demo with 4 orders, lifecycle progression |
| `.gitignore` | Added `.env*` protection |
| `src/services/canteenState.js` | Full rewrite — Supabase-backed with Realtime |
| `src/App.jsx` | Async handlers, CanteenService.subscribe, loading state, cancel/reset props |
| `src/components/CheckoutModal.jsx` | Async submit, server errors, alternatives, slot-adjusted notice |
| `src/components/OrderTracking.jsx` | Forward-only advance, Cancel button, Cancelled state, Reset Demo |
| `src/components/KitchenCommandCenter.jsx` | Async status changes, Cancelled orders section |
| `src/components/ManagerDashboard.jsx` | Async save handlers with saving indicator |

## What was not verified (no live database)
- End-to-end Realtime subscription delivery (cannot test without a running Supabase project)
- The `demo_reset` function's `ALTER SEQUENCE` statement — Supabase may require superuser on some plans; if it fails, replace with `SELECT setval('public.order_token_seq', 1, false);`
- The `supabase_realtime` publication block in the migration — if your project already has other tables in the publication, the `DO $$ ... $$` guard prevents duplicate additions correctly, but always verify in the Replication settings tab
