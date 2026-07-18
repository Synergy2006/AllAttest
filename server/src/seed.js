import { db } from "./store.js";
import { provisionTenant, FRAMEWORK_CATALOG } from "./tenants.js";
import { syncConnector } from "./hub/index.js";
import { createUser } from "./auth.js";

// The framework catalog is platform config (tenants.js); the store just
// carries a copy for reads.
db.replaceAll({ frameworks: FRAMEWORK_CATALOG, tenants: [], connectors: [], controls: [], evidence: [], activity: [], users: [], sessions: [], synclog: [] });

// Tenant 1: Assure Agent, Inc. — SOC2/GDPR/PCI shop on AWS+GCP with Gusto
const assure = provisionTenant({
  name: "Assure Agent, Inc.",
  color: "#0E7C6B",
  frameworks: ["SOC2", "GDPR", "PCI"],
  systems: ["aws", "gcp", "github", "okta", "gusto", "jira", "datadog", "slack"],
});

const sravanthiOwns = new Set(["AC-03", "LG-02", "HR-01", "HR-02", "PR-01"]);
for (const c of db.get("controls").filter((c) => c.tenantId === assure.id)) {
  db.update("controls", c.id, { owner: sravanthiOwns.has(c.code) ? "Sravanthi" : "Rajesh" });
}

for (const key of ["aws", "github", "okta", "slack"]) {
  const rec = db.get("connectors").find((c) => c.tenantId === assure.id && c.key === key);
  db.update("connectors", rec.id, { connected: true, credentials: { seeded: "demo connection" } });
  syncConnector(assure.id, key);
}

// Tenant 2: Synergy Technologies — SOC2/HIPAA shop on Azure+GCP with ADP;
// fresh workspace, nothing connected yet. Demonstrates vendor alternatives:
// same controls, different systems (ADP not Gusto, Azure not AWS).
const synergy = provisionTenant({
  name: "Synergy Technologies, LLC",
  color: "#B4690E",
  frameworks: ["SOC2", "HIPAA"],
  systems: ["azure", "gcp", "github", "entra", "adp", "jira", "datadog", "slack"],
});

// Logins: one platform operator, one login per tenant workspace.
const logins = [
  createUser({ email: "rajesh@allattest.com", name: "Rajesh (Operator)", password: "ops-demo-2026", role: "operator" }),
  createUser({ email: "sravanthi@assureagent.com", name: "Sravanthi", password: "assure-demo", role: "tenant", tenantId: assure.id }),
  createUser({ email: "raj@synergytechs.net", name: "Raj", password: "synergy-demo", role: "tenant", tenantId: synergy.id }),
];

console.log(
  `Seeded: ${db.get("tenants").length} tenants, ${db.get("controls").length} controls, ${db.get("connectors").length} connectors, ${db.get("evidence").length} evidence items, ${logins.length} logins.`
);
console.log("Demo logins:");
console.log("  operator          rajesh@allattest.com   / ops-demo-2026");
console.log("  Assure Agent      sravanthi@assureagent.com / assure-demo");
console.log("  Synergy Tech      raj@synergytechs.net      / synergy-demo");
