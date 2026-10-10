/**
 * Role-Based Access Control (RBAC) - Single Source of Truth
 *
 * Exposes currentRole ('student' | 'kitchen' | 'manager'), setRole, and can(action).
 * In Stage 2, this will seamlessly connect to Supabase Auth (auth.uid() -> profiles.role)
 * without requiring rewrites in UI components.
 */

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
  },
  [ROLES.KITCHEN]: {
    id: ROLES.KITCHEN,
    label: "Kitchen Staff",
    title: "Kitchen Command Center",
    desc: "Kitchen display unit (KDU), item-level batch cooking, live 86 stock toggles, and status progression.",
    hash: "#/kitchen",
    defaultTab: "kitchen",
  },
  [ROLES.MANAGER]: {
    id: ROLES.MANAGER,
    label: "Manager",
    title: "Operations & Manager Dashboard",
    desc: "Executive capacity thresholds, rush multipliers, inventory quota controls, and menu archiving.",
    hash: "#/manager",
    defaultTab: "manager",
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

let _currentRole = null;
const _roleListeners = new Set();

/** Parse role from URL hash or sessionStorage */
function getInitialRole() {
  const hash = window.location.hash.toLowerCase();
  if (hash.includes("student")) return ROLES.STUDENT;
  if (hash.includes("kitchen")) return ROLES.KITCHEN;
  if (hash.includes("manager")) return ROLES.MANAGER;

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored && Object.values(ROLES).includes(stored)) {
    return stored;
  }
  return null;
}

_currentRole = getInitialRole();

export const RoleService = {
  getRole() {
    return _currentRole;
  },

  setRole(newRole) {
    if (!newRole) {
      _currentRole = null;
      sessionStorage.removeItem(STORAGE_KEY);
      window.location.hash = "";
    } else if (Object.values(ROLES).includes(newRole)) {
      _currentRole = newRole;
      sessionStorage.setItem(STORAGE_KEY, newRole);
      window.location.hash = `#/${newRole}`;
    }
    _roleListeners.forEach((fn) => fn(_currentRole));
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

/** Standalone convenience function */
export function can(action) {
  return RoleService.can(action);
}
