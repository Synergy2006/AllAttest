// Session token persists in localStorage so a refresh keeps you signed in.
const TOKEN_KEY = "ac_token";
let token = localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => {
  token = t || null;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};
export const hasToken = () => !!token;

// Operators browse any workspace; the server ignores this header for
// tenant users and scopes them to their own tenant from the session.
let tenantId = null;
export const setTenant = (id) => { tenantId = id; };

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(new Error(b.error || r.statusText)));
  return r.json();
};
const auth = () => (token ? { authorization: `Bearer ${token}` } : {});
const h = () => ({ ...auth(), "x-tenant-id": tenantId });
const hj = () => ({ ...h(), "content-type": "application/json" });
const ha = () => auth();
const haj = () => ({ ...ha(), "content-type": "application/json" });

export const api = {
  // auth
  login: (email, password) =>
    fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }).then(j),
  logout: () => fetch("/api/auth/logout", { method: "POST", headers: ha() }).then(j),
  me: () => fetch("/api/auth/me", { headers: ha() }).then(j),
  // global (authed)
  tenants: () => fetch("/api/tenants", { headers: ha() }).then(j),
  tenantColors: () => fetch("/api/tenant-colors", { headers: ha() }).then(j),
  frameworks: () => fetch("/api/frameworks", { headers: h() }).then(j), // tenant-scoped view of the platform catalog
  agents: () => fetch("/api/agents", { headers: ha() }).then(j),
  // tenant-scoped
  controls: () => fetch("/api/controls", { headers: h() }).then(j),
  connectors: () => fetch("/api/connectors", { headers: h() }).then(j),
  hubMap: () => fetch("/api/hub/map", { headers: h() }).then(j),
  activity: () => fetch("/api/activity", { headers: h() }).then(j),
  evidence: (params = {}) => fetch("/api/evidence?" + new URLSearchParams(params), { headers: h() }).then(j),
  syncLog: () => fetch("/api/synclog", { headers: h() }).then(j),
  connect: (key, credentials) =>
    fetch(`/api/connectors/${key}/connect`, { method: "POST", headers: hj(), body: JSON.stringify({ credentials }) }).then(j),
  disconnect: (key) => fetch(`/api/connectors/${key}/disconnect`, { method: "POST", headers: h() }).then(j),
  sync: (key) => fetch(`/api/connectors/${key}/sync`, { method: "POST", headers: h() }).then(j),
  runAgent: (id) => fetch(`/api/agents/${id}/run`, { method: "POST", headers: h() }).then(j),
  copilot: (messages) => fetch("/api/copilot", { method: "POST", headers: hj(), body: JSON.stringify({ messages }) }).then(j),
  // admin console (platform operator)
  adminOverview: () => fetch("/api/admin/overview", { headers: ha() }).then(j),
  adminTenants: () => fetch("/api/admin/tenants", { headers: ha() }).then(j),
  adminActivity: () => fetch("/api/admin/activity", { headers: ha() }).then(j),
  adminCatalog: () => fetch("/api/admin/catalog", { headers: ha() }).then(j),
  adminCreateTenant: (payload) =>
    fetch("/api/admin/tenants", { method: "POST", headers: haj(), body: JSON.stringify(payload) }).then(j),
  adminSyncLog: () => fetch("/api/admin/synclog", { headers: ha() }).then(j),
  adminSetAutoSync: (id, enabled) =>
    fetch(`/api/admin/tenants/${id}/autosync`, { method: "POST", headers: haj(), body: JSON.stringify({ enabled }) }).then(j),
  adminSuspend: (id) => fetch(`/api/admin/tenants/${id}/suspend`, { method: "POST", headers: ha() }).then(j),
  adminResume: (id) => fetch(`/api/admin/tenants/${id}/resume`, { method: "POST", headers: ha() }).then(j),
  // admin console: user management
  adminUsers: () => fetch("/api/admin/users", { headers: ha() }).then(j),
  adminCreateUser: (payload) =>
    fetch("/api/admin/users", { method: "POST", headers: haj(), body: JSON.stringify(payload) }).then(j),
  adminResetPassword: (id) => fetch(`/api/admin/users/${id}/reset-password`, { method: "POST", headers: ha() }).then(j),
  adminDeleteUser: (id) => fetch(`/api/admin/users/${id}`, { method: "DELETE", headers: ha() }).then(j),
};
