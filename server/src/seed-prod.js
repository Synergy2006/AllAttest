// Production seed: empty platform (schema only — all collections present,
// no tenants/demo data) plus a single root operator login.
// Root credentials come from ROOT_EMAIL / ROOT_PASSWORD env vars; if
// ROOT_PASSWORD is unset a password is generated and printed ONCE to the
// boot log (Azure: Log stream) — it is never stored in plaintext.
import { db } from "./store.js";
import { FRAMEWORK_CATALOG } from "./tenants.js";
import { createUser } from "./auth.js";

db.replaceAll({ frameworks: FRAMEWORK_CATALOG, tenants: [], connectors: [], controls: [], evidence: [], activity: [], users: [], sessions: [], synclog: [] });

const email = process.env.ROOT_EMAIL || "root@allattest.com";
const { password } = createUser({ email, name: "Root", password: process.env.ROOT_PASSWORD, role: "operator" });

console.log(`Production database initialized: 0 tenants, 1 root operator (${email}).`);
if (!process.env.ROOT_PASSWORD) {
  console.log(`Generated root password (shown once, not stored): ${password}`);
}
