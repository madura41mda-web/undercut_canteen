/**
 * CanteenService — Supabase-backed implementation with WebSocket Resilience,
 * 5-Second Polling Fallback, Timezone Standardization & Friendly Error Mapping.
 * Team: UNDERCUT DEV | Problem Statement 76
 */

import { supabase } from "../lib/supabaseClient";
import { RoleService } from "../lib/role";

export const QUICK_PREP_MAX_MINUTES = 8;
export const USN_REGEX = /^1GA[0-9]{2}CS[0-9]{3}$/;
export const NAME_REGEX = /^[A-Za-z\s.'-]{2,50}$/;

const STUDENT_USN_KEY = "smartcanteen_student_usn";
const STUDENT_NAME_KEY = "smartcanteen_student_name";

export function getStoredStudentUSN() {
  return sessionStorage.getItem(STUDENT_USN_KEY) || "";
}

export function setStoredStudentUSN(usn) {
  if (usn) sessionStorage.setItem(STUDENT_USN_KEY, usn.toUpperCase().trim());
  else sessionStorage.removeItem(STUDENT_USN_KEY);
}

export function getStoredStudentName() {
  return sessionStorage.getItem(STUDENT_NAME_KEY) || "";
}

export function setStoredStudentName(name) {
  if (name) sessionStorage.setItem(STUDENT_NAME_KEY, name.trim());
  else sessionStorage.removeItem(STUDENT_NAME_KEY);
}

// ─────────────────────────────────────────────
// Friendly Error Mapping & Technical Logging
// ─────────────────────────────────────────────

export function sanitizeErrorMessage(err) {
  if (!err) return "Something went wrong, please try again.";
  const raw = typeof err === "string" ? err : err.message || JSON.stringify(err);
  console.error("[CanteenService Technical Error]:", err);

  if (raw.includes("v_settings") || raw.includes("timezone")) {
    return "Order system encountered a temporary glitch. Please try again.";
  }
  if (raw.includes("invalid_name") || raw.includes("Student name is required")) {
    return "Student name is required (2 to 50 characters; letters, spaces, dots, and hyphens only).";
  }
  if (raw.includes("invalid_usn") || raw.includes("orders_student_roll_format")) {
    return "Invalid college USN format. Please enter a valid USN (e.g. 1GA24CS012).";
  }
  if (raw.includes("canteen_closed")) {
    return "The canteen is currently closed. Please check back during operating hours.";
  }
  if (raw.includes("sold_out")) {
    return "One or more items in your cart just sold out. Please review your cart.";
  }
  if (raw.includes("temporarily_unavailable")) {
    return "One or more items in your cart are temporarily unavailable.";
  }
  if (raw.includes("capacity_full")) {
    return "The kitchen is currently at peak capacity. Please select an available future pickup slot.";
  }
  if (raw.includes("forbidden_role") || raw.includes("forbidden")) {
    return "Permission denied. Please verify your staff credentials.";
  }
  if (raw.includes("forbidden_usn_mismatch")) {
    return "Permission denied: Students can only cancel their own orders.";
  }
  if (raw.includes("illegal_transition")) {
    return "Order cannot transition to this state.";
  }
  if (raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("network")) {
    return "Connection issue. Reconnecting to canteen servers...";
  }
  return "Something went wrong, please try again.";
}

// ─────────────────────────────────────────────
// Cancelled Order Auto-Hide Helper (5-minute window)
// ─────────────────────────────────────────────

export function isCancelledAutoHidden(order) {
  if (!order || order.status !== "Cancelled") return false;
  if (!order.cancelledAt) return false;
  const cancelledTime = new Date(order.cancelledAt).getTime();
  if (isNaN(cancelledTime)) return false;
  return Date.now() - cancelledTime > 5 * 60 * 1000;
}

// ─────────────────────────────────────────────
// Row-to-camelCase adapters
// ─────────────────────────────────────────────

function adaptMenuItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    prepTimeMinutes: row.prep_time_minutes,
    calories: row.calories,
    isVeg: row.is_veg,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: row.review_count,
    description: row.description,
    image: row.image,
    stock: row.stock,
    dailyLimit: row.daily_limit,
    tags: row.tags ?? [],
    badge: row.badge,
    counter: row.counter,
    isActive: row.is_active,
    isAvailable: row.is_available ?? true,
  };
}

function adaptOrderItem(row) {
  return {
    id: row.menu_item_id,
    name: row.name,
    price: Number(row.price),
    quantity: row.quantity,
    prepTimeMinutes: row.prep_time_minutes,
  };
}

function adaptOrder(row, timezone = "Asia/Kolkata") {
  if (!row) return null;
  const items = Array.isArray(row.items)
    ? row.items.map(adaptOrderItem)
    : [];

  let promisedPickupTimeDisplay = "";
  let promisedPickupTimeISO = row.promised_pickup_time;
  if (row.promised_pickup_time) {
    try {
      promisedPickupTimeDisplay = new Date(row.promised_pickup_time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      });
    } catch {
      promisedPickupTimeDisplay = row.promised_pickup_time;
    }
  }

  return {
    id: row.token || row.id,        // UI always shows token as the order identifier
    _uuid: row.id,                  // internal UUID for RPC calls
    token: row.token
      ? row.token.replace("CN-", "").replace(/^0+/, "") || "0"
      : "",
    studentName: row.student_name,
    studentRoll: row.student_roll,
    items,
    totalAmount: Number(row.total_amount),
    status: row.status,
    priority: row.priority,
    instructions: row.instructions ?? "None",
    paymentMethod: row.payment_method,
    counter: row.counter,
    placedAt: row.placed_at,
    promisedPickupTime: promisedPickupTimeDisplay,
    promisedPickupTimeISO,
    estimatedMinutesRemaining: row.estimated_minutes_remaining,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    cancelledDuringPrep: row.cancelled_during_prep,
  };
}

function adaptSettings(row) {
  if (!row) return {};
  return {
    maxKitchenCapacity: row.max_kitchen_capacity,
    rushMultiplier: Number(row.rush_multiplier),
    batchingThreshold: row.batching_threshold,
    autoBatchingEnabled: row.auto_batching_enabled,
    canteenOpen: row.canteen_open,
    wPickupUrgency: Number(row.w_pickup_urgency),
    wPrepTime: Number(row.w_prep_time),
    wPriority: Number(row.w_priority),
    autoAccept: row.auto_accept,
    demoMode: row.demo_mode,
    pendingExpiryMinutes: row.pending_expiry_minutes ?? 10,
    counterApprover: row.counter_approver ?? "manager",
    timezone: row.timezone || "Asia/Kolkata",
  };
}

// ─────────────────────────────────────────────
// In-memory cache & Realtime / Polling State
// ─────────────────────────────────────────────

let _menu = [];
let _orders = [];
let _settings = { timezone: "Asia/Kolkata" };
let _activeOrderId = null;
let _changeListeners = [];
let _initialized = false;
let _initPromise = null;
let _realtimeStatus = "disconnected"; // "connected" | "reconnecting" | "disconnected"
let _lastUpdated = null;
let _realtimeChannel = null;
let _reconnectTimeout = null;
let _reconnectAttempts = 0;
let _fallbackPollInterval = null;

function notify() {
  _changeListeners.forEach((fn) => fn());
  window.dispatchEvent(new CustomEvent("canteen_state_change"));
}

function _dedupeMenu(items) {
  const map = new Map();
  items.forEach((item) => {
    if (item && item.id) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

// ─────────────────────────────────────────────
// Initialisation, Realtime & Fallback Polling
// ─────────────────────────────────────────────

async function _loadAll() {
  try {
    const [menuRes, ordersRes, settingsRes, orderItemsRes] = await Promise.all([
      supabase.from("menu_items").select("*").order("id"),
      supabase.from("orders").select("*").order("placed_at", { ascending: false }),
      supabase.from("kitchen_settings").select("*").single(),
      supabase.from("order_items").select("*"),
    ]);

    if (menuRes.error) console.error("[CanteenService] menu load error:", menuRes.error);
    if (ordersRes.error) console.error("[CanteenService] orders load error:", ordersRes.error);
    if (settingsRes.error) console.error("[CanteenService] settings load error:", settingsRes.error);
    if (orderItemsRes.error) console.error("[CanteenService] order_items load error:", orderItemsRes.error);

    _settings = adaptSettings(settingsRes.data);
    const tz = _settings.timezone || "Asia/Kolkata";

    // Build order→items map
    const itemsByOrder = {};
    (orderItemsRes.data ?? []).forEach((oi) => {
      if (!itemsByOrder[oi.order_id]) itemsByOrder[oi.order_id] = [];
      itemsByOrder[oi.order_id].push(oi);
    });

    _menu = _dedupeMenu((menuRes.data ?? []).map(adaptMenuItem));
    _orders = (ordersRes.data ?? []).map((o) =>
      adaptOrder({ ...o, items: itemsByOrder[o.id] ?? [] }, tz)
    );
    _lastUpdated = new Date();
  } catch (err) {
    console.error("[CanteenService] _loadAll error:", err);
  }
}

function _setupRealtime() {
  if (_realtimeChannel) {
    try {
      supabase.removeChannel(_realtimeChannel);
    } catch {
      // ignore teardown error
    }
    _realtimeChannel = null;
  }

  _realtimeChannel = supabase
    .channel("smartcanteen-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, async () => {
      const { data } = await supabase.from("menu_items").select("*").order("id");
      _menu = _dedupeMenu((data ?? []).map(adaptMenuItem));
      _lastUpdated = new Date();
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, async () => {
      const [ordersRes, itemsRes] = await Promise.all([
        supabase.from("orders").select("*").order("placed_at", { ascending: false }),
        supabase.from("order_items").select("*"),
      ]);
      const itemsByOrder = {};
      (itemsRes.data ?? []).forEach((oi) => {
        if (!itemsByOrder[oi.order_id]) itemsByOrder[oi.order_id] = [];
        itemsByOrder[oi.order_id].push(oi);
      });
      const tz = _settings.timezone || "Asia/Kolkata";
      _orders = (ordersRes.data ?? []).map((o) =>
        adaptOrder({ ...o, items: itemsByOrder[o.id] ?? [] }, tz)
      );
      _lastUpdated = new Date();
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, async () => {
      const [ordersRes, itemsRes] = await Promise.all([
        supabase.from("orders").select("*").order("placed_at", { ascending: false }),
        supabase.from("order_items").select("*"),
      ]);
      const itemsByOrder = {};
      (itemsRes.data ?? []).forEach((oi) => {
        if (!itemsByOrder[oi.order_id]) itemsByOrder[oi.order_id] = [];
        itemsByOrder[oi.order_id].push(oi);
      });
      const tz = _settings.timezone || "Asia/Kolkata";
      _orders = (ordersRes.data ?? []).map((o) =>
        adaptOrder({ ...o, items: itemsByOrder[o.id] ?? [] }, tz)
      );
      _lastUpdated = new Date();
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_settings" }, async () => {
      const { data } = await supabase.from("kitchen_settings").select("*").single();
      _settings = adaptSettings(data);
      _lastUpdated = new Date();
      notify();
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        _realtimeStatus = "connected";
        _reconnectAttempts = 0;
        _loadAll().then(notify);
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        _realtimeStatus = navigator.onLine ? "reconnecting" : "disconnected";
        notify();
        _scheduleResubscribe();
      }
    });
}

function _scheduleResubscribe() {
  if (_reconnectTimeout) clearTimeout(_reconnectTimeout);
  _reconnectAttempts += 1;
  const delay = Math.min(30000, Math.pow(1.5, _reconnectAttempts) * 2000);
  _reconnectTimeout = setTimeout(() => {
    if (navigator.onLine) {
      _setupRealtime();
    }
  }, delay);
}

// Setup background fallback polling (every 5 seconds when realtime is not connected)
// and window focus / visibility change listeners
function _setupResilienceListeners() {
  if (typeof window === "undefined") return;

  // 5-second polling fallback
  if (!_fallbackPollInterval) {
    _fallbackPollInterval = setInterval(() => {
      // Poll every 5s if not in connected state or to keep student/manager views guaranteed fresh
      if (_realtimeStatus !== "connected" || document.visibilityState === "visible") {
        _loadAll().then(notify);
      }
    }, 5000);
  }

  // Refetch on window focus
  window.addEventListener("focus", () => {
    _loadAll().then(notify);
  });

  // Refetch on tab visibility change
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      _loadAll().then(notify);
    }
  });

  // Network online/offline
  window.addEventListener("online", () => {
    _realtimeStatus = "reconnecting";
    _setupRealtime();
    _loadAll().then(notify);
  });

  window.addEventListener("offline", () => {
    _realtimeStatus = "disconnected";
    notify();
  });
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export const CanteenService = {
  // ── Lifecycle ──────────────────────────────────────────────────────

  async init() {
    if (_initialized) return;
    if (_initPromise) return _initPromise;
    _initPromise = _loadAll().then(() => {
      _initialized = true;
      _setupRealtime();
      _setupResilienceListeners();
      notify();
    });
    return _initPromise;
  },

  subscribe(fn) {
    _changeListeners.push(fn);
    return () => {
      _changeListeners = _changeListeners.filter((f) => f !== fn);
    };
  },

  isReady() {
    return _initialized;
  },

  getRealtimeStatus() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return "disconnected";
    }
    return _realtimeStatus;
  },

  getLastUpdated() {
    return _lastUpdated;
  },

  getLastUpdatedFormatted() {
    if (!_lastUpdated) return "Syncing…";
    try {
      const tz = _settings.timezone || "Asia/Kolkata";
      return _lastUpdated.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: tz,
      });
    } catch {
      return _lastUpdated.toLocaleTimeString();
    }
  },

  async refresh() {
    await _loadAll();
    notify();
  },

  // ── Synchronous reads (in-memory cache) ────────────────────────────

  getMenu() {
    return _menu;
  },

  getOrders() {
    return _orders;
  },

  getSettings() {
    return _settings;
  },

  getActiveOrder() {
    if (_activeOrderId) {
      const found = _orders.find((o) => o.id === _activeOrderId);
      if (found) return found;
    }
    return (
      _orders.find(
        (o) => o.status !== "Collected" && o.status !== "Cancelled"
      ) || _orders[0] || null
    );
  },

  setActiveOrderId(orderId) {
    _activeOrderId = orderId;
    notify();
  },

  // ── Order placement (async) ─────────────────────────────────────────

  async createOrder({ items, studentName, studentRoll, pickupSlot, instructions, paymentMethod, priority }) {
    const usn = (studentRoll || getStoredStudentUSN() || "").toUpperCase().trim();
    const name = (studentName || getStoredStudentName() || "").trim();

    // Client-side mandatory validation before calling RPC
    if (!name || !NAME_REGEX.test(name)) {
      return {
        ok: false,
        reason: "invalid_name",
        message: "Student name is required (2 to 50 characters; letters, spaces, dots, and hyphens only).",
      };
    }

    if (!USN_REGEX.test(usn)) {
      return {
        ok: false,
        reason: "invalid_usn",
        message: "A valid college USN is required (e.g. 1GA24CS012).",
      };
    }

    const itemsPayload = items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
    }));

    let pickupTime = null;
    if (pickupSlot?.slot_at) {
      pickupTime = pickupSlot.slot_at;
    } else if (pickupSlot?.minutesFromNow != null) {
      pickupTime = new Date(Date.now() + pickupSlot.minutesFromNow * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase.rpc("place_order", {
      p_student_name: name,
      p_student_roll: usn,
      p_items: itemsPayload,
      p_pickup_time: pickupTime,
      p_priority: priority || "NORMAL",
      p_instructions: instructions || null,
      p_payment_method: paymentMethod || "UPI",
    });

    if (error) {
      const friendlyMsg = sanitizeErrorMessage(error);
      return { ok: false, reason: "server_error", message: friendlyMsg };
    }

    const result = data;
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        unavailable: result.unavailable ?? [],
        alternatives: result.alternatives ?? { items: [], slots: [] },
        message: result.message || _reasonToMessage(result.reason, result.unavailable),
      };
    }

    const tz = _settings.timezone || "Asia/Kolkata";
    const adaptedOrder = adaptOrder(result.order, tz);
    _activeOrderId = adaptedOrder.id;
    return {
      ok: true,
      order: adaptedOrder,
      slotAdjusted: result.slot_adjusted,
    };
  },

  // ── Status updates (async) ──────────────────────────────────────────

  async updateOrderStatus(orderId, nextStatus) {
    const uuid = _resolveUUID(orderId);
    if (!uuid) {
      console.error("[CanteenService] updateOrderStatus: order not found", orderId);
      return { ok: false, reason: "not_found", message: "Order not found." };
    }
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("update_order_status", {
      p_order_id: uuid,
      p_new_status: nextStatus,
      p_session_token: token,
    });
    if (error) {
      return { ok: false, reason: "server_error", message: sanitizeErrorMessage(error) };
    }
    if (!data?.ok) {
      return {
        ok: false,
        reason: data?.reason || "error",
        message: data?.message || "Failed to update order status.",
      };
    }
    if (data.order) {
      const tz = _settings.timezone || "Asia/Kolkata";
      const adapted = adaptOrder(data.order, tz);
      _orders = _orders.map((o) => (o.id === adapted.id || o._uuid === adapted._uuid ? adapted : o));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async verifyPickup(query) {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("verify_pickup", {
      p_query: String(query).trim(),
      p_session_token: token,
    });
    if (error) {
      return { ok: false, reason: "server_error", message: sanitizeErrorMessage(error) };
    }
    if (!data?.ok) {
      return { ok: false, reason: data?.reason, message: data?.message || "Order not found." };
    }
    const tz = _settings.timezone || "Asia/Kolkata";
    return { ok: true, order: adaptOrder(data.order, tz) };
  },

  async cancelOrder(orderId, reason, studentUSN) {
    const uuid = _resolveUUID(orderId);
    if (!uuid) return { ok: false, reason: "not_found", message: "Order not found." };
    const usn = (studentUSN || getStoredStudentUSN() || "").toUpperCase().trim();
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("cancel_order", {
      p_order_id: uuid,
      p_reason: reason || null,
      p_student_usn: usn || null,
      p_session_token: token || null,
    });
    if (error) {
      return { ok: false, reason: "server_error", message: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.order) {
      const tz = _settings.timezone || "Asia/Kolkata";
      const adapted = adaptOrder(data.order, tz);
      _orders = _orders.map((o) => (o.id === adapted.id || o._uuid === adapted._uuid ? adapted : o));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async approveOrder(orderId) {
    const uuid = _resolveUUID(orderId);
    if (!uuid) return { ok: false, reason: "not_found", message: "Order not found." };
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("approve_order", {
      p_order_id: uuid,
      p_session_token: token,
    });
    if (error) {
      return { ok: false, reason: "server_error", message: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.order) {
      const tz = _settings.timezone || "Asia/Kolkata";
      const adapted = adaptOrder(data.order, tz);
      _orders = _orders.map((o) => (o.id === adapted.id || o._uuid === adapted._uuid ? adapted : o));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async rejectOrder(orderId, reason) {
    const uuid = _resolveUUID(orderId);
    if (!uuid) return { ok: false, reason: "not_found", message: "Order not found." };
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("reject_order", {
      p_order_id: uuid,
      p_reason: reason || null,
      p_session_token: token,
    });
    if (error) {
      return { ok: false, reason: "server_error", message: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.order) {
      const tz = _settings.timezone || "Asia/Kolkata";
      const adapted = adaptOrder(data.order, tz);
      _orders = _orders.map((o) => (o.id === adapted.id || o._uuid === adapted._uuid ? adapted : o));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async expirePendingOrders() {
    try {
      const { data, error } = await supabase.rpc("expire_pending_orders");
      if (error) {
        console.error("[CanteenService] expire_pending_orders error:", error);
        return { ok: false, reason: "server_error", message: sanitizeErrorMessage(error) };
      }
      return data;
    } catch (err) {
      console.error("[CanteenService] expirePendingOrders sweep exception:", err);
      return { ok: false };
    }
  },

  async setItemAvailability(itemId, isAvailable) {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("set_item_availability", {
      p_id: itemId,
      p_is_available: Boolean(isAvailable),
      p_session_token: token,
    });
    if (error) {
      return { ok: false, message: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  // ── Menu / stock updates (async) ────────────────────────────────────

  async updateMenuItemStock(itemId, newStock) {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("set_item_stock", {
      p_id: itemId,
      p_exact_stock: Math.max(0, Number(newStock)),
      p_session_token: token,
    });
    if (error) {
      return { ok: false, error: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async setItemStock(itemId, exactStock) {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("set_item_stock", {
      p_id: itemId,
      p_exact_stock: Math.max(0, Number(exactStock)),
      p_session_token: token,
    });
    if (error) {
      return { ok: false, message: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async restockItem(itemId, amount) {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("restock_item", {
      p_id: itemId,
      p_amount: Number(amount),
      p_session_token: token,
    });
    if (error) {
      return { ok: false, error: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async updateMenuItem(updatedItem) {
    const { data, error } = await supabase.rpc("update_menu_item", {
      p_id: updatedItem.id,
      p_price: updatedItem.price != null ? Number(updatedItem.price) : null,
      p_prep_time_minutes: updatedItem.prepTimeMinutes != null ? updatedItem.prepTimeMinutes : null,
      p_stock: updatedItem.stock != null ? Math.max(0, updatedItem.stock) : null,
      p_daily_limit: updatedItem.dailyLimit != null ? updatedItem.dailyLimit : null,
      p_is_active: updatedItem.isActive != null ? updatedItem.isActive : null,
      p_badge: updatedItem.badge != null ? updatedItem.badge : null,
    });
    if (error) {
      return { ok: false, error: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === updatedItem.id ? adapted : m));
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  async addMenuItem(item) {
    const { data, error } = await supabase.rpc("add_menu_item", {
      p_name: item.name,
      p_category: item.category,
      p_price: Number(item.price),
      p_prep_minutes: Number(item.prepTimeMinutes),
      p_daily_limit: Number(item.dailyLimit),
      p_is_veg: item.isVeg ?? true,
      p_description: item.description || "",
      p_image: item.image || null,
      p_counter: item.counter || null,
      p_calories: item.calories != null && item.calories !== "" ? Number(item.calories) : null,
    });

    if (error) {
      return { ok: false, error: sanitizeErrorMessage(error) };
    }

    const adapted = adaptMenuItem(data);
    if (adapted) {
      _menu = _dedupeMenu([adapted, ..._menu]);
      _lastUpdated = new Date();
      notify();
    }
    return { ok: true, data: adapted };
  },

  async archiveMenuItem(itemId) {
    const { data, error } = await supabase.rpc("archive_menu_item", {
      p_id: itemId,
    });
    if (error) {
      return { ok: false, error: sanitizeErrorMessage(error) };
    }
    const adapted = adaptMenuItem(data);
    if (adapted) {
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
      _lastUpdated = new Date();
      notify();
    }
    return { ok: true, data: adapted };
  },

  async unarchiveMenuItem(itemId) {
    const { data, error } = await supabase.rpc("unarchive_menu_item", {
      p_id: itemId,
    });
    if (error) {
      return { ok: false, error: sanitizeErrorMessage(error) };
    }
    const adapted = adaptMenuItem(data);
    if (adapted) {
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
      _lastUpdated = new Date();
      notify();
    }
    return { ok: true, data: adapted };
  },

  // ── Settings (async) ────────────────────────────────────────────────

  async updateSettings(newSettings) {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("update_kitchen_settings", {
      p_max_kitchen_capacity: newSettings.maxKitchenCapacity ?? null,
      p_rush_multiplier: newSettings.rushMultiplier ?? null,
      p_canteen_open: newSettings.canteenOpen ?? null,
      p_auto_accept: newSettings.autoAccept ?? null,
      p_pending_expiry_minutes: newSettings.pendingExpiryMinutes ?? null,
      p_counter_approver: newSettings.counterApprover ?? null,
      p_timezone: newSettings.timezone ?? null,
      p_session_token: token,
    });
    if (error) {
      return { ok: false, error: sanitizeErrorMessage(error) };
    }
    if (data?.ok && data.settings) {
      _settings = adaptSettings(data.settings);
      _lastUpdated = new Date();
      notify();
    }
    return data;
  },

  // ── Demo reset (async) ──────────────────────────────────────────────

  async demoReset() {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("demo_reset", {
      p_session_token: token,
    });
    if (error) {
      return { ok: false, reason: "server_error", message: sanitizeErrorMessage(error) };
    }
    _activeOrderId = null;
    _lastUpdated = new Date();
    return data;
  },

  async resetMenu() {
    return this.demoReset();
  },

  // ── Pickup slot calculation (async) ─────────────────────────────────

  async calculateFeasibleSlots(cartItems = [], priority = "NORMAL") {
    if (!cartItems.length) return [];
    const itemsPayload = cartItems.map((i) => ({ id: i.id, quantity: i.quantity }));
    const { data, error } = await supabase.rpc("get_pickup_slots", {
      p_items: itemsPayload,
      p_priority: priority,
    });
    if (error) {
      console.error("[CanteenService] get_pickup_slots error:", error);
      return [];
    }
    if (!data?.ok || !Array.isArray(data.slots)) return [];
    return data.slots.map((s) => ({
      id: s.id,
      slot_at: s.slot_at,
      time: s.time,
      minutesFromNow: s.minutes_from_now,
      tag: s.tag,
      recommended: s.recommended,
      efficiency: s.efficiency,
      kitchenWorkloadPercent: s.kitchen_workload_percent,
    }));
  },

  // ── Batch detection (synchronous, derived from in-memory orders) ────

  detectBatches() {
    const pendingOrders = _orders.filter(
      (o) => o.status === "Placed" || o.status === "Accepted" || o.status === "Preparing"
    );
    const itemMap = {};
    pendingOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (!itemMap[item.id]) {
          itemMap[item.id] = {
            id: item.id,
            name: item.name,
            totalQuantity: 0,
            orderIds: [],
            prepTime: item.prepTimeMinutes,
            counter: order.counter,
          };
        }
        itemMap[item.id].totalQuantity += item.quantity;
        if (!itemMap[item.id].orderIds.includes(order.id)) {
          itemMap[item.id].orderIds.push(order.id);
        }
      });
    });
    return Object.values(itemMap)
      .filter((b) => b.orderIds.length >= 2 || b.totalQuantity >= 3)
      .map((b) => ({
        ...b,
        timeSavedMinutes: Math.max(3, Math.round(b.prepTime * (b.orderIds.length - 1) * 0.45)),
        efficiencyScore: "+35% Kitchen Speed",
      }));
  },
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function _resolveUUID(orderId) {
  if (!orderId) return null;
  if (/^[0-9a-f-]{36}$/.test(orderId)) return orderId;
  const order = _orders.find((o) => o.id === orderId || o.token === orderId);
  return order?._uuid ?? null;
}

function _reasonToMessage(reason, unavailable = []) {
  const names = unavailable.map((u) => u.name).join(", ");
  switch (reason) {
    case "sold_out":
      return `Sorry — ${names || "one or more items"} just sold out. Please remove it from your cart and try again.`;
    case "temporarily_unavailable":
      return `Notice — ${names || "one or more items"} are temporarily paused by the kitchen right now.`;
    case "invalid_name":
      return "Student name is required (2 to 50 characters; letters, spaces, dots, and hyphens only).";
    case "invalid_usn":
      return "Please enter a valid college USN (Format: 1GAxxCSxxx).";
    case "daily_limit":
      return `Daily quota reached for: ${names}. Please choose a different item.`;
    case "canteen_closed":
      return "The canteen is currently closed. Please try again later.";
    case "capacity_full":
      return "Kitchen is at full capacity right now. Try a later pickup slot.";
    case "invalid_item":
      return `These items are no longer available: ${names || "unknown"}. Please refresh the menu.`;
    default:
      return "Order could not be placed. Please try again.";
  }
}
