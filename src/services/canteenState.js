/**
 * CanteenService — Supabase-backed implementation.
 *
 * Design contract kept from the localStorage version:
 *  - Synchronous reads:  getMenu(), getOrders(), getSettings(), getActiveOrder()
 *  - Async writes:       createOrder(), updateOrderStatus(), cancelOrder(),
 *                        updateMenuItemStock(), updateMenuItem(), updateSettings(),
 *                        restockItem(), setItemStock(), demoReset(), addMenuItem(),
 *                        archiveMenuItem(), unarchiveMenuItem(), verifyPickup()
 *  - Slot generation:    calculateFeasibleSlots() — async, returns a Promise<Slot[]>
 *  - Batch detection:    detectBatches() — synchronous, derived from in-memory orders
 *
 * Row → camelCase adapter keeps all component field references intact.
 */

import { supabase } from "../lib/supabaseClient";
import { RoleService } from "../lib/role";

export const QUICK_PREP_MAX_MINUTES = 8;
export const USN_REGEX = /^1GA[0-9]{2}CS[0-9]{3}$/;

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

function adaptOrder(row) {
  if (!row) return null;
  const items = Array.isArray(row.items)
    ? row.items.map(adaptOrderItem)
    : [];

  // promisedPickupTime: display string (HH:MM AM/PM) from timestamptz
  let promisedPickupTimeDisplay = "";
  let promisedPickupTimeISO = row.promised_pickup_time;
  if (row.promised_pickup_time) {
    try {
      promisedPickupTimeDisplay = new Date(row.promised_pickup_time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
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
  };
}

// ─────────────────────────────────────────────
// In-memory cache (keeps synchronous reads alive)
// ─────────────────────────────────────────────

let _menu = [];
let _orders = [];
let _settings = {};
let _activeOrderId = null; // token-style id  e.g. "CN-0001"
let _changeListeners = [];
let _initialized = false;
let _initPromise = null;
let _realtimeStatus = "disconnected"; // "connected" | "reconnecting" | "disconnected"

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
// Initialisation & Realtime
// ─────────────────────────────────────────────

async function _loadAll() {
  const [menuRes, ordersRes, settingsRes, orderItemsRes] = await Promise.all([
    supabase.from("menu_items").select("*").order("id"),
    supabase
      .from("orders")
      .select("*")
      .order("placed_at", { ascending: false }),
    supabase.from("kitchen_settings").select("*").single(),
    supabase.from("order_items").select("*"),
  ]);

  if (menuRes.error) console.error("[CanteenService] menu load error:", menuRes.error);
  if (ordersRes.error) console.error("[CanteenService] orders load error:", ordersRes.error);
  if (settingsRes.error) console.error("[CanteenService] settings load error:", settingsRes.error);
  if (orderItemsRes.error) console.error("[CanteenService] order_items load error:", orderItemsRes.error);

  // Build order→items map
  const itemsByOrder = {};
  (orderItemsRes.data ?? []).forEach((oi) => {
    if (!itemsByOrder[oi.order_id]) itemsByOrder[oi.order_id] = [];
    itemsByOrder[oi.order_id].push(oi);
  });

  _menu = _dedupeMenu((menuRes.data ?? []).map(adaptMenuItem));
  _orders = (ordersRes.data ?? []).map((o) =>
    adaptOrder({ ...o, items: itemsByOrder[o.id] ?? [] })
  );
  _settings = adaptSettings(settingsRes.data);
}

function _setupRealtime() {
  supabase
    .channel("smartcanteen-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, async () => {
      const { data } = await supabase.from("menu_items").select("*").order("id");
      _menu = _dedupeMenu((data ?? []).map(adaptMenuItem));
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
      _orders = (ordersRes.data ?? []).map((o) =>
        adaptOrder({ ...o, items: itemsByOrder[o.id] ?? [] })
      );
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
      _orders = (ordersRes.data ?? []).map((o) =>
        adaptOrder({ ...o, items: itemsByOrder[o.id] ?? [] })
      );
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_settings" }, async () => {
      const { data } = await supabase.from("kitchen_settings").select("*").single();
      _settings = adaptSettings(data);
      notify();
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        const wasReconnecting = _realtimeStatus === "reconnecting";
        _realtimeStatus = "connected";
        if (wasReconnecting) {
          _loadAll().then(notify);
        }
        notify();
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        _realtimeStatus = "reconnecting";
        notify();
      }
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
    return _realtimeStatus;
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
    const name = (studentName || getStoredStudentName() || "").trim() || "Student";

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
      console.error("[CanteenService] place_order error:", error);
      return { ok: false, reason: "server_error", message: error.message };
    }

    const result = data;
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        unavailable: result.unavailable ?? [],
        alternatives: result.alternatives ?? { items: [], slots: [] },
        message: _reasonToMessage(result.reason, result.unavailable),
      };
    }

    const adaptedOrder = adaptOrder(result.order);
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
      console.error("[CanteenService] update_order_status error:", error);
      return { ok: false, reason: "server_error", message: error.message };
    }
    if (!data?.ok) {
      return {
        ok: false,
        reason: data?.reason || "error",
        message: data?.message || "Failed to update order status.",
      };
    }
    if (data.order) {
      const adapted = adaptOrder(data.order);
      _orders = _orders.map((o) => (o.id === adapted.id || o._uuid === adapted._uuid ? adapted : o));
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
      console.error("[CanteenService] verify_pickup error:", error);
      return { ok: false, reason: "server_error", message: error.message };
    }
    if (!data?.ok) {
      return { ok: false, reason: data?.reason, message: data?.message || "Order not found." };
    }
    return { ok: true, order: adaptOrder(data.order) };
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
      console.error("[CanteenService] cancel_order error:", error);
      return { ok: false, reason: "server_error", message: error.message };
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
      console.error("[CanteenService] approve_order error:", error);
      return { ok: false, reason: "server_error", message: error.message };
    }
    if (data?.ok && data.order) {
      const adapted = adaptOrder(data.order);
      _orders = _orders.map((o) => (o.id === adapted.id || o._uuid === adapted._uuid ? adapted : o));
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
      console.error("[CanteenService] reject_order error:", error);
      return { ok: false, reason: "server_error", message: error.message };
    }
    if (data?.ok && data.order) {
      const adapted = adaptOrder(data.order);
      _orders = _orders.map((o) => (o.id === adapted.id || o._uuid === adapted._uuid ? adapted : o));
      notify();
    }
    return data;
  },

  async expirePendingOrders() {
    const { data, error } = await supabase.rpc("expire_pending_orders");
    if (error) {
      console.error("[CanteenService] expire_pending_orders error:", error);
      return { ok: false, reason: "server_error", message: error.message };
    }
    return data;
  },

  async setItemAvailability(itemId, isAvailable) {
    const token = RoleService.getSessionToken();
    const { data, error } = await supabase.rpc("set_item_availability", {
      p_id: itemId,
      p_is_available: Boolean(isAvailable),
      p_session_token: token,
    });
    if (error) {
      console.error("[CanteenService] set_item_availability error:", error);
      return { ok: false, message: error.message };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
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
      console.error("[CanteenService] set_item_stock error:", error);
      return { ok: false, error: error.message };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
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
      console.error("[CanteenService] set_item_stock error:", error);
      return { ok: false, message: error.message };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
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
      console.error("[CanteenService] restockItem error:", error);
      return { ok: false, error: error.message };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
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
      console.error("[CanteenService] updateMenuItem error:", error);
      return { ok: false, error: error.message };
    }
    if (data?.ok && data.menu_item) {
      const adapted = adaptMenuItem(data.menu_item);
      _menu = _menu.map((m) => (m.id === updatedItem.id ? adapted : m));
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
      console.error("[CanteenService] add_menu_item error:", error);
      return { ok: false, error: error.message };
    }

    const adapted = adaptMenuItem(data);
    if (adapted) {
      _menu = _dedupeMenu([adapted, ..._menu]);
      notify();
    }
    return { ok: true, data: adapted };
  },

  async archiveMenuItem(itemId) {
    const { data, error } = await supabase.rpc("archive_menu_item", {
      p_id: itemId,
    });
    if (error) {
      console.error("[CanteenService] archive_menu_item error:", error);
      return { ok: false, error: error.message };
    }
    const adapted = adaptMenuItem(data);
    if (adapted) {
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
      notify();
    }
    return { ok: true, data: adapted };
  },

  async unarchiveMenuItem(itemId) {
    const { data, error } = await supabase.rpc("unarchive_menu_item", {
      p_id: itemId,
    });
    if (error) {
      console.error("[CanteenService] unarchive_menu_item error:", error);
      return { ok: false, error: error.message };
    }
    const adapted = adaptMenuItem(data);
    if (adapted) {
      _menu = _menu.map((m) => (m.id === itemId ? adapted : m));
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
      p_session_token: token,
    });
    if (error) {
      console.error("[CanteenService] updateSettings error:", error);
      return { ok: false, error: error.message };
    }
    if (data?.ok && data.settings) {
      _settings = adaptSettings(data.settings);
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
      console.error("[CanteenService] demo_reset error:", error);
      return { ok: false, reason: "server_error", message: error.message };
    }
    _activeOrderId = null;
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
