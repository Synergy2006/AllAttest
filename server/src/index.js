import express from "express";
import cors from "cors";
import { db } from "./store.js";
import { hubMap, runSync, controlStatus, controlSrcs, authFor, connectorCadence } from "./hub/index.js";
import { startScheduler } from "./scheduler.js";
import { AGENTS, runAgent, copilot } from "./agents/index.js";
import { listTenants, provisionTenant, getTenant, scoped, setTenantStatus, tenantStatus, setAutoSync, autoSyncEnabled, TENANT_COLORS, FRAMEWORK_CATALOG, SYSTEM_CATEGORIES, CONNECTOR_CATALOG, CONTROL_GUIDANCE, CHECK_FREQUENCIES, CONTROL_TEMPLATE, controlFreq } from "./tenants.js";
import { login, logout, getSession, listUsers, createUser, resetPassword, deleteUser } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json());

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ---- public ----
app.post("/api/auth/login", (req, res) => {
  try {
    const { token, user } = login(req.body.email, req.body.password);
    const tenant = user.tenantId ? getTenant(user.tenantId) : null;
    res.json({ token, user, tenant });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

// ---- authentication ----
// Everything below requires a session. The client sends
// Authorization: Bearer <token> on every request after login.
app.use("/api", (req, res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const sess = getSession(token);
  if (!sess) return res.status(401).json({ error: "Sign in required" });
  req.user = sess.user;
  req.token = token;
  next();
});

app.get("/api/auth/me", (req, res) => {
  const tenant = req.user.tenantId ? getTenant(req.user.tenantId) : null;
  res.json({ user: req.user, tenant });
});

app.post("/api/auth/logout", (req, res) => {
  logout(req.token);
  res.json({ ok: true });
});

// ---- global (authed, no tenant required) ----
// Tenant users only ever see their own tenant; operators see all.
app.get("/api/tenants", (req, res) => {
  const all = listTenants();
  res.json(req.user.role === "operator" ? all : all.filter((t) => t.id === req.user.tenantId));
});
app.get("/api/tenant-colors", (req, res) => res.json(TENANT_COLORS));

// Frameworks are platform config — always served from FRAMEWORK_CATALOG
// (code), never the db copy, so a stale db.json can't hide a compliance
// type a tenant subscribed to. A workspace only sees the tenant's types.
app.get("/api/frameworks", (req, res) => {
  const tid = req.user.role === "tenant" ? req.user.tenantId : req.headers["x-tenant-id"];
  const tenant = tid ? getTenant(tid) : null;
  res.json(tenant?.frameworks ? FRAMEWORK_CATALOG.filter((f) => tenant.frameworks.includes(f.id)) : FRAMEWORK_CATALOG);
});
app.get("/api/agents", (req, res) =>
  res.json(AGENTS.map(({ id, name, desc, action, details }) => ({ id, name, desc, action, details })))
);

// ---- Admin Console (platform operator) ----
// Operator-role sessions only. These routes MUST stay above the
// tenant-resolution middleware — they are cross-tenant.
app.use("/api/admin", (req, res, next) => {
  if (req.user.role !== "operator") {
    return res.status(403).json({ error: "Operator access required" });
  }
  next();
});

// Per-tenant operational metrics, computed live (never stored).
// Framework readiness only covers the tenant's subscribed compliance types.
function tenantMetrics(tenantId) {
  const tenant = getTenant(tenantId);
  const connectors = scoped.connectors(tenantId);
  const evidence = scoped.evidence(tenantId);
  const controls = scoped.controls(tenantId).map((c) => ({ ...c, status: controlStatus(c, connectors, evidence) }));
  const fwList = FRAMEWORK_CATALOG.filter((f) => !tenant?.frameworks || tenant.frameworks.includes(f.id));
  const frameworks = fwList.map((f) => {
    const rel = controls.filter((c) => c.fw.includes(f.id));
    const passing = rel.filter((c) => c.status === "passing").length;
    return { id: f.id, name: f.name, color: f.color, passing, total: rel.length, pct: rel.length ? Math.round((passing / rel.length) * 100) : 0 };
  });
  const lastActivity = scoped.activity(tenantId).at(-1)?.at ?? null;
  return {
    controlsPassing: controls.filter((c) => c.status === "passing").length,
    controlsTotal: controls.length,
    connectorsLive: connectors.filter((c) => c.connected).length,
    connectorsTotal: connectors.length,
    evidenceCount: evidence.length,
    agentRuns: scoped.activity(tenantId).length,
    lastActivity,
    frameworks,
  };
}

app.get("/api/admin/overview", (req, res) => {
  const tenants = listTenants();
  const metrics = tenants.map((t) => tenantMetrics(t.id));
  res.json({
    tenants: {
      total: tenants.length,
      active: tenants.filter((t) => t.status === "active").length,
      suspended: tenants.filter((t) => t.status === "suspended").length,
    },
    users: listUsers().length,
    controlsPassing: metrics.reduce((n, m) => n + m.controlsPassing, 0),
    controlsTotal: metrics.reduce((n, m) => n + m.controlsTotal, 0),
    connectorsLive: metrics.reduce((n, m) => n + m.connectorsLive, 0),
    connectorsTotal: metrics.reduce((n, m) => n + m.connectorsTotal, 0),
    evidenceCount: metrics.reduce((n, m) => n + m.evidenceCount, 0),
    agentRuns: metrics.reduce((n, m) => n + m.agentRuns, 0),
  });
});

app.get("/api/admin/tenants", (req, res) => {
  res.json(listTenants().map((t) => ({ ...t, metrics: tenantMetrics(t.id) })));
});

// Onboarding catalog: every compliance type and system the platform
// supports, grouped so the console can render pickers.
app.get("/api/admin/catalog", (req, res) => {
  res.json({
    frameworks: FRAMEWORK_CATALOG,
    categories: SYSTEM_CATEGORIES.map((cat) => ({
      ...cat,
      systems: CONNECTOR_CATALOG.filter((c) => c.category === cat.id).map(({ key, name }) => ({ key, name })),
    })),
  });
});

// Provision a workspace: pick compliance types + the systems the tenant
// actually uses; controls/integrations are stamped from those choices.
// Optionally creates the tenant's first login — the generated password
// is returned ONCE and never stored in plaintext.
app.post("/api/admin/tenants", wrap((req, res) => {
  const tenant = provisionTenant({
    name: req.body.name,
    color: req.body.color,
    frameworks: req.body.frameworks,
    systems: req.body.systems,
    syncInterval: req.body.syncInterval,
  });
  let loginInfo = null;
  if (req.body.adminEmail) {
    const { user, password } = createUser({
      email: req.body.adminEmail,
      name: req.body.adminName || tenant.name,
      role: "tenant",
      tenantId: tenant.id,
    });
    loginInfo = { email: user.email, password };
  }
  res.json({ tenant, login: loginInfo });
}));

// Turn scheduled syncing on/off for a tenant (off = manual "Sync now" only).
app.post("/api/admin/tenants/:id/autosync", wrap((req, res) => {
  res.json(setAutoSync(req.params.id, req.body.enabled));
}));

// Platform-wide sync transactions (newest first).
app.get("/api/admin/synclog", (req, res) => {
  const names = Object.fromEntries(listTenants().map((t) => [t.id, t.name]));
  res.json(db.get("synclog").slice(-100).reverse().map((s) => ({ ...s, tenantName: names[s.tenantId] ?? s.tenantId })));
});

app.post("/api/admin/tenants/:id/suspend", wrap((req, res) => {
  res.json(setTenantStatus(req.params.id, "suspended"));
}));

app.post("/api/admin/tenants/:id/resume", wrap((req, res) => {
  res.json(setTenantStatus(req.params.id, "active"));
}));

app.get("/api/admin/activity", (req, res) => {
  const names = Object.fromEntries(listTenants().map((t) => [t.id, t.name]));
  res.json(
    db.get("activity").slice(-30).reverse()
      .map((a) => ({ ...a, tenantName: names[a.tenantId] ?? a.tenantId }))
  );
});

// ---- Admin Console: user management ----
app.get("/api/admin/users", (req, res) => {
  const names = Object.fromEntries(listTenants().map((t) => [t.id, t.name]));
  res.json(listUsers().map((u) => ({ ...u, tenantName: u.tenantId ? names[u.tenantId] ?? u.tenantId : null })));
});

app.post("/api/admin/users", wrap((req, res) => {
  const { email, name, role, tenantId, password } = req.body;
  if (role === "tenant" && !getTenant(tenantId)) throw new Error(`Unknown tenant: ${tenantId}`);
  res.json(createUser({ email, name, role, tenantId, password }));
}));

app.post("/api/admin/users/:id/reset-password", wrap((req, res) => {
  res.json(resetPassword(req.params.id));
}));

app.delete("/api/admin/users/:id", wrap((req, res) => {
  deleteUser(req.params.id, req.user.id);
  res.json({ ok: true });
}));

// ---- tenant resolution ----
// Tenant users are locked to their own workspace — the session, not the
// header, decides. Operators may open any workspace via X-Tenant-Id.
app.use("/api", (req, res, next) => {
  let tenant = null;
  if (req.user.role === "tenant") {
    tenant = getTenant(req.user.tenantId);
    if (!tenant) return res.status(404).json({ error: "Your workspace no longer exists" });
  } else {
    const id = req.headers["x-tenant-id"];
    if (!id) return res.status(400).json({ error: "X-Tenant-Id header required" });
    tenant = getTenant(id);
    if (!tenant) return res.status(404).json({ error: `Unknown tenant: ${id}` });
  }
  if (tenantStatus(tenant) === "suspended") {
    return res.status(403).json({ error: "This workspace is suspended. Contact AllAttest support." });
  }
  req.tenant = tenant;
  next();
});

// ---- tenant-scoped read models ----
// Each control ships with its guidance: what it requires, what makes it
// pass, and remediation steps FILTERED to the tenant's own systems (an
// Azure/ADP tenant never sees Okta/Gusto steps).
app.get("/api/controls", (req, res) => {
  const tid = req.tenant.id;
  const connectors = scoped.connectors(tid);
  const evidence = scoped.evidence(tid);
  res.json(scoped.controls(tid).map((c) => {
    const g = CONTROL_GUIDANCE[c.code];
    const srcs = controlSrcs(c);
    const freq = controlFreq(c);
    return {
      ...c,
      status: controlStatus(c, connectors, evidence),
      freq,
      freqLabel: CHECK_FREQUENCIES[freq]?.label ?? freq,
      freqNote: CONTROL_TEMPLATE.find((t) => t.id === c.code)?.freqNote ?? null,
      guidance: g ? {
        requirement: g.requirement,
        passWhen: g.passWhen,
        steps: Object.fromEntries(Object.entries(g.steps ?? {}).filter(([k]) => srcs.includes(k))),
      } : null,
    };
  }));
});

// Credentials are stored on the connector row but NEVER returned to the
// client — only a credentialsOnFile flag. (Production: secrets manager.)
app.get("/api/connectors", (req, res) =>
  res.json(scoped.connectors(req.tenant.id).map(({ credentials, ...c }) => {
    const cadence = connectorCadence(req.tenant.id, c.key);
    return {
      ...c,
      auth: authFor(c.key),
      credentialsOnFile: !!credentials,
      // strictest cadence among the controls this connector feeds
      checkFreq: cadence.freq,
      checkLabel: CHECK_FREQUENCIES[cadence.freq]?.label ?? cadence.freq,
    };
  }))
);

app.get("/api/evidence", (req, res) => {
  const { controlId, connectorId } = req.query;
  res.json(
    scoped.evidence(req.tenant.id).filter(
      (e) =>
        (!controlId || e.controlIds.includes(controlId)) &&
        (!connectorId || e.connectorId === connectorId)
    )
  );
});

app.get("/api/hub/map", (req, res) => res.json(hubMap(req.tenant.id)));
app.get("/api/activity", (req, res) => res.json(scoped.activity(req.tenant.id).slice(-20).reverse()));

// This tenant's sync transactions (newest first).
app.get("/api/synclog", (req, res) =>
  res.json(db.get("synclog").filter((s) => s.tenantId === req.tenant.id).slice(-50).reverse())
);

// ---- connector lifecycle (by catalog key) ----
// Connecting requires the credentials the adapter's auth type declares
// (service principal, API key, OAuth client, …). They're validated for
// presence, stored server-side, and never echoed back.
app.post("/api/connectors/:key/connect", wrap((req, res) => {
  const tid = req.tenant.id;
  const rec = scoped.connectors(tid).find((c) => c.key === req.params.key);
  if (!rec) throw new Error("Unknown connector");
  const spec = authFor(req.params.key);
  const creds = req.body?.credentials ?? {};
  const missing = (spec?.fields ?? []).filter((f) => !String(creds[f.key] ?? "").trim());
  if (missing.length) throw new Error(`Missing credentials: ${missing.map((f) => f.label).join(", ")}`);
  db.update("connectors", rec.id, { connected: true, credentials: creds });
  const evidence = runSync(tid, req.params.key, "initial"); // initial sync on connect, logged
  const { credentials, ...connector } = db.find("connectors", rec.id);
  res.json({ connector: { ...connector, credentialsOnFile: true }, evidence });
}));

app.post("/api/connectors/:key/disconnect", wrap((req, res) => {
  const rec = scoped.connectors(req.tenant.id).find((c) => c.key === req.params.key);
  if (!rec) throw new Error("Unknown connector");
  const { credentials, ...connector } = db.update("connectors", rec.id, { connected: false, credentials: null });
  res.json({ connector: { ...connector, credentialsOnFile: false } });
}));

app.post("/api/connectors/:key/sync", wrap((req, res) => {
  res.json({ evidence: runSync(req.tenant.id, req.params.key, "manual") });
}));

// ---- agents ----
app.post("/api/agents/:id/run", wrap(async (req, res) => {
  res.json(await runAgent(req.tenant.id, req.params.id));
}));

app.post("/api/copilot", wrap(async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("messages[] required");
  res.json({ text: await copilot(req.tenant.id, messages) });
}));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AllAttest API on http://localhost:${PORT}`);
  startScheduler();
});
