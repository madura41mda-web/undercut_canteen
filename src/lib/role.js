/**
 * Role-Based Access Control (RBAC) & Passcode Authentication
 * Single Source of Truth for Role Permissions & Session Management
 */

import { supabase } from "./supabaseClient";

export const ROLES = {
  STUDENT: "student",
  KITCHEN: "kitchen",
  MANAGER: "manager",
};

export const ROLE_DETAILS = {
  [ROLES.STUDENT]: {
    id: ROLES.STUDENT,
    label: "Student",
    title: "Student Preorder",
    desc: "Browse live menu, order food with guaranteed pickup times, and track orders in real time.",
    hash: "#/student",
    defaultTab: "student",
    requiresPin: false,
  },
  [ROLES.KITCHEN]: {
    id: ROLES.KITCHEN,
    label: "Kitchen Staff",
    title: "Kitchen Command Center",
    desc: "Kitchen display unit (KDU), item-level batch cooking, live stock & availability controls, and status progression.",
    hash: "#/kitchen",
    defaultTab: "kitchen",
    requiresPin: true,
  },
  [ROLES.MANAGER]: {
    id: ROLES.MANAGER,
    label: "Manager",
    title: "Operations & Manager Dashboard",
    desc: "Executive capacity thresholds, rush multipliers, inventory quota controls, and menu archiving.",
    hash: "#/manager",
    defaultTab: "manager",
    requiresPin: true,
  },
};

const PERMISSIONS = {
  // Navigation tabs
  "tab:student": [ROLES.STUDENT],
  "tab:tracking": [ROLES.STUDENT],
  "tab:kitchen": [ROLES.KITCHEN],
  "tab:manager": [ROLES.MANAGER],

  // Student capabilities
  "cart:access": [ROLES.STUDENT],
  "order:place": [ROLES.STUDENT],

  // Kitchen capabilities (Strictly advance orders; manager CANNOT advance)
  "order:advance_status": [ROLES.KITCHEN],
  "order:cancel": [ROLES.KITCHEN, ROLES.STUDENT],
  "dish:add": [ROLES.KITCHEN, ROLES.MANAGER],
  "dish:restock": [ROLES.KITCHEN, ROLES.MANAGER],
  "dish:86": [ROLES.KITCHEN, ROLES.MANAGER],
  "dish:set_stock": [ROLES.KITCHEN, ROLES.MANAGER],
  "pickup:verify": [ROLES.KITCHEN, ROLES.MANAGER],

  // Manager capabilities
  "dish:archive": [ROLES.MANAGER],
  "dish:unarchive": [ROLES.MANAGER],
  "dish:edit_details": [ROLES.MANAGER],
  "settings:edit": [ROLES.MANAGER],
  "analytics:view": [ROLES.MANAGER],
  "order:read_only_overview": [ROLES.MANAGER],

  // Shared administrative actions
  "demo:reset": [ROLES.KITCHEN, ROLES.MANAGER],
};

const STORAGE_KEY = "smartcanteen_role";
const SESSION_TOKEN_KEY = "smartcanteen_session_token";

let _currentRole = null;
const _roleListeners = new Set();

/** Parse role from URL hash or sessionStorage */
function getInitialRole() {
  const hash = window.location.hash.toLowerCase();
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);

  if (hash.includes("student")) return ROLES.STUDENT;
  if (hash.includes("kitchen")) {
    return token ? ROLES.KITCHEN : null;
  }
  if (hash.includes("manager")) {
    return token ? ROLES.MANAGER : null;
  }

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored && Object.values(ROLES).includes(stored)) {
    if (stored === ROLES.STUDENT) return stored;
    return token ? stored : null;
  }
  return null;
}

_currentRole = getInitialRole();

export const RoleService = {
  getRole() {
    return _currentRole;
  },

  getSessionToken() {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || null;
  },

  setSessionToken(token) {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  },

  setRole(newRole, sessionToken = null) {
    if (!newRole) {
      _currentRole = null;
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      window.location.hash = "";
    } else if (Object.values(ROLES).includes(newRole)) {
      _currentRole = newRole;
      sessionStorage.setItem(STORAGE_KEY, newRole);
      if (sessionToken) {
        sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
      }
      window.location.hash = `#/${newRole}`;
    }
    _roleListeners.forEach((fn) => fn(_currentRole));
  },

  logout() {
    this.setRole(null);
  },

  async verifyPasscode(role, pin) {
    try {
      const { data, error } = await supabase.rpc("verify_passcode", {
        p_role: role,
        p_code: String(pin).trim(),
      });

      if (error) {
        console.error("[RoleService] verify_passcode error:", error);
        return { ok: false, message: error.message };
      }

      if (data?.ok && data.session_token) {
        this.setRole(role, data.session_token);
        return { ok: true, session_token: data.session_token };
      }

      return {
        ok: false,
        reason: data?.reason || "invalid_pin",
        message: data?.message || "Invalid 6-digit PIN code.",
      };
    } catch (err) {
      console.error("[RoleService] verifyPasscode exception:", err);
      return { ok: false, message: "Could not connect to authentication service." };
    }
  },

  can(action, roleOverride = null) {
    const role = roleOverride || _currentRole;
    if (!role) return false;
    const allowed = PERMISSIONS[action];
    if (!allowed) return false;
    return allowed.includes(role);
  },

  subscribe(fn) {
    _roleListeners.add(fn);
    return () => _roleListeners.delete(fn);
  },

  getRoleDetails(role = _currentRole) {
    return role ? ROLE_DETAILS[role] : null;
  },
};

/** Standalone convenience helper */
export function can(action) {
  return RoleService.can(action);
}
