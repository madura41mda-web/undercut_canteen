# Stage 3 Investigation & Technical Design Notes
**Team:** UNDERCUT DEV  
**Problem Statement:** 76 — Smart Canteen Order & Pickup Management  
**Scope:** Stage 3 — Student USN Identity, Image Upload with Storage RLS, and Availability Controls Redesign

---

## 1. Student Identity Architecture & Hardcoded Data Analysis

### 1.1 Current State & Root Causes of Hardcoded Identity
- In `CheckoutModal.jsx`, student identity was initialized to hardcoded placeholders:
  - `const [studentName, setStudentName] = useState("Aarav Sharma");`
  - `const [studentRoll, setStudentRoll] = useState("CS24B012");`
  - Fallback string `"UG-2026"` was embedded in `canteenState.js` and `canteen_core.sql`.
- Students had no persistent identity between sessions; anyone could view all orders on the tracking screen regardless of who placed them.
- In `cancel_order`, there was no check verifying that the student attempting cancellation actually placed the order.

### 1.2 Stage 3 USN Specification & Design
- **USN Format:** `^1GA[0-9]{2}CS[0-9]{3}$` (Case-insensitive matching on server, normalized to uppercase).
  - Prefix: Fixed `"1GA"`
  - Admission Year: 2 digits (e.g. `24`)
  - Branch: Fixed `"CS"`
  - Roll Index: 3 digits (e.g. `012`)
  - Complete USN Example: `1GA24CS012`
- **UI Focus Auto-Advance:**
  - A segmented component with fixed labels for `"1GA"` and `"CS"`.
  - The 2-digit input auto-advances to the 3-digit input upon typing 2 digits.
  - Pressing Backspace on an empty 3-digit input focuses back to the 2-digit input.
  - Digits-only filtering prevents non-numeric input.
  - Optional Student Name field allows personalization while preserving anonymity if left blank.
- **Session & Storage Management:**
  - USN and optional name are stored in `sessionStorage` (`smartcanteen_student_usn`, `smartcanteen_student_name`).
  - Header displays current USN with a `"Change USN"` action button.
- **Server-Side Enforcement & Migration:**
  - In `supabase/stage3_addons.sql`, a database check constraint `orders_student_roll_format` is added:
    `check (student_roll ~ '^1GA[0-9]{2}CS[0-9]{3}$')`.
  - Existing demo orders (e.g. `CS24B012`, `UG-2026`, etc.) are migrated safely using a CTE with deterministic numbering (`1GA24CS001`, `1GA24CS002`, ...) before creating the constraint, preventing migration failures.
  - `place_order` validates `p_student_roll` against `^1GA[0-9]{2}CS[0-9]{3}$` on the server and rejects invalid inputs with `reason: 'invalid_usn'`.
  - `cancel_order` compares `p_student_usn` against `orders.student_roll`. If a student attempts to cancel an order belonging to another USN, it rejects with `reason: 'forbidden_usn_mismatch'`.
  - Student order tracking filters orders strictly by the active USN.

---

## 2. Dish Image Upload & Supabase Storage Analysis

### 2.1 Storage Policy vs. Custom Passcode Session Evaluation
- **The Challenge:**
  - Standard Supabase GoTrue Auth uses JWTs in the `Authorization: Bearer <jwt>` header, allowing RLS policies on `storage.objects` to evaluate `auth.uid()`.
  - SmartCanteen utilizes lightweight 6-digit role passcodes stored in `public.role_passcodes` and validates active tokens via `public.role_sessions`.
  - Browser HTTP requests through `@supabase/storage-js` connect using the Supabase `anon` API key without a GoTrue JWT. Therefore, Postgres RLS policies on `storage.objects` cannot natively inspect `public.role_sessions` from standard storage upload endpoints.
- **Options Analyzed:**
  1. *RPC Base64 Storage Upload (`upload_dish_image`):*
     - Sends base64 file payloads to a `SECURITY DEFINER` Postgres function that checks `verify_role_session()` and writes into `storage.objects`.
     - *Drawback:* Base64 payloads increase transmission size by ~33%, and PostgreSQL storage table internals vary depending on whether Supabase uses S3 or DB object storage.
  2. *Hybrid Storage Bucket Policy with Server-Guarded Dish Creation (Chosen & Documented):*
     - Create a public bucket `'dish-images'` with public read enabled so student browsers can load dish photos.
     - Allow `INSERT` on `'dish-images'` for authenticated and anon clients, constrained to 2 MB and image mime types (`image/jpeg`, `image/png`, `image/webp`).
     - Client UI (`AddDishModal`) enforces role permission (`can('dish:add')`), generates random UUID file names (`${crypto.randomUUID()}.${ext}`), and validates file size (&le; 2 MB) and type before upload.
     - The critical security gate: The resulting image URL can ONLY be committed to the menu by invoking `add_menu_item(..., p_session_token)`, which strictly checks the staff session token on the database server. Unauthorized callers cannot register dishes on the canteen menu.
- **Image Fallback:**
  - If a custom image fails to load (network drop, invalid external URL, or missing resource), `<img onError={...} />` automatically falls back to a curated default food placeholder SVG/asset.

---

## 3. Availability Controls Redesign (Deprecating "86")

### 3.1 Terminology & Usability Overhaul
- The commercial kitchen slang `"Mark 86"` is replaced with intuitive, student- and staff-friendly phrasing:
  - `"Mark 86"` &rarr; `"Mark sold out"`
  - Reverse &rarr; `"Back in stock"`
  - `"86'd Items"` &rarr; `"Manage stock"`
  - `"Sold out / 86"` header &rarr; `"Sold Out"`

### 3.2 Two Distinct Availability States
To reflect real campus canteen operations, dishes now support two independent operational states:
1. **Sold Out for Today (`stock = 0`):**
   - Represents physical depletion of ingredients or allocated daily quota.
   - Stock is set to 0.
   - Student terminal displays `"Sold out"`; Add to Cart is disabled.
   - Reversed via `"Back in stock"` (restores quota) or typed restock / exact quantity.
2. **Temporarily Unavailable (`is_available = false`):**
   - Represents a temporary operational pause (e.g., station backlog, waiting for next dosa batter batch, fryer heating up).
   - Existing stock count is strictly preserved!
   - Student terminal displays `"Unavailable right now"`; Add to Cart is disabled.
   - Reversed via `"Resume (Available)"` toggle.

### 3.3 Server-Side Enforcement
- `menu_items` table adds `is_available boolean not null default true`.
- In `place_order`:
  - If `is_active = false`: rejected with `reason: 'invalid_item'` (archived).
  - If `is_available = false`: rejected with `reason: 'temporarily_unavailable'`.
  - If `stock < quantity`: rejected with `reason: 'sold_out'`.
- `set_item_availability(p_id text, p_is_available boolean, p_session_token text)` RPC installed in `stage3_addons.sql` to manage paused states with kitchen/manager session verification.
