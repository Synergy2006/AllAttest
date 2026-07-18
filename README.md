# AllAttest — multi-tenant, agent-run compliance automation

AllAttest is the product: a multi-tenant SaaS that automates SOC 2 / GDPR / PCI
compliance work with AI agents, an integration hub for mapping external systems to
controls, and an evidence-backed control register. Each customer (tenant) gets an
isolated workspace — Assure Agent, Inc. ships as the first seeded tenant, with
Synergy Technologies, LLC as a second, fresh workspace.

```
allattest/
├── server/                 Express API (Node 18+, ES modules, zero-dep JSON store)
│   └── src/
│       ├── index.js        API routes
│       ├── store.js        File-backed store (swap point for Postgres/Prisma)
│       ├── seed.js         Seeds two tenants with isolated workspaces
│       ├── tenants.js      Tenancy: catalog, provisioning, scoped reads
│       ├── hub/index.js    Integration Hub: adapter interface + mapping engine
│       └── agents/index.js Agent orchestration + Claude client + Copilot
└── client/                 React (Vite) frontend
    └── src/
        ├── App.jsx         Dashboard · AI Agents · Integration Hub · Controls
        └── api.js          API client
```

## Quick start

```bash
# 1. API (terminal 1)
cd server
npm install
npm run seed          # creates data/db.json
export ANTHROPIC_API_KEY=sk-ant-...   # optional; agents return stubs without it
npm run dev           # http://localhost:4000

# 2. Frontend (terminal 2)
cd client
npm install
npm run dev           # http://localhost:5173 (proxies /api to :4000)
```

## How the pieces fit

**Multi-tenancy.** Every operational record — connectors, controls, evidence,
activity — carries a `tenantId` and is never visible across tenants. Tenant
users are scoped to their workspace by their session; only operators may select
a workspace via the `X-Tenant-Id` header. Provisioning a workspace (Admin
Console, `POST /api/admin/tenants`) stamps a per-tenant copy of the control
template and connector catalog, so each tenant evolves independently — and can
mint the tenant's first login in the same call.

**Data model.** Compliance types (frameworks) are platform configuration —
SOC 2, GDPR, PCI DSS, HIPAA, ISO 27001 — and each tenant subscribes to a subset
at onboarding. Systems come in categories of interchangeable vendors (AWS /
Azure / Google Cloud for cloud; Gusto / ADP / Paychex for payroll; Okta /
Entra ID / Google Workspace / JumpCloud for identity; …). The
operator picks what each tenant actually uses, and provisioning stamps only the
relevant controls, resolving each control's sources to the tenant's own systems
— a two-cloud tenant's encryption control maps to AWS *and* Azure; an ADP shop's
HR controls map to ADP. Controls map many-to-many onto frameworks; readiness is
always computed from live control status, never stored. Control records are
unique per tenant (`id = tenantId:code`) while the display `code` (AC-01…)
stays familiar.

**Integration Hub** (`server/src/hub/index.js`). Every external system implements
one adapter interface:

```js
{ id, auth(): AuthSpec, sync(ctx): EvidenceItem[] }
```

`auth()` declares the connection method (OAuth2 scopes, API key, AWS role) so the
frontend can render the right connect flow. `sync()` pulls evidence and returns
normalized items; the hub maps them to controls and updates status. The 14 bundled
adapters (AWS, Azure, GCP, GitHub, Okta, Entra ID, Google Workspace, JumpCloud,
Gusto, ADP, Paychex, Jira, Datadog, Slack) are mocks that emit realistic
evidence — replace a mock's `sync()` with real API calls and nothing else in
the system changes.

**Agents** (`server/src/agents/index.js`). Five agents (Gap Analyzer, Evidence
Collector, Policy Drafter, Vendor Risk, Audit Prep) plus a Compliance Copilot chat.
The orchestrator snapshots live state → builds the agent prompt → calls Claude
(`claude-sonnet-4-6`) → logs the run to the activity feed. All agent output is
grounded in the actual control register, not generic advice.

**Control status.** `pending` (source not connected) → `syncing` (connected, no
evidence yet) → `passing` (evidence on file). Connecting a system triggers an
initial sync automatically.

## API surface

| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/login | Sign in (public); everything else needs `Authorization: Bearer <token>` |
| GET/POST | /api/auth/me · /api/auth/logout | Session introspection / sign out |
| GET | /api/tenants | Workspaces (operator: all; tenant user: own only) |
| GET | /api/frameworks · /api/agents · /api/tenant-colors | Global product content |
| GET | /api/controls · /api/connectors | Tenant read models (tenant from session; operators pass X-Tenant-Id) |
| GET | /api/hub/map | Full connector→control→framework graph |
| GET | /api/evidence?controlId=&connectorId= | Evidence items |
| GET | /api/activity · /api/agents | Activity feed, agent catalog |
| POST | /api/connectors/:id/connect · /disconnect · /sync | Connector lifecycle (connect requires credentials) |
| GET | /api/synclog · /api/admin/synclog | Sync transactions (tenant view / all tenants) |
| POST | /api/agents/:id/run | Run an agent against live state |
| POST | /api/copilot | Chat with the Compliance Copilot |
| GET | /api/admin/overview · /tenants · /users · /activity | Operator: platform stats, tenant register, users, cross-tenant feed |
| GET | /api/admin/catalog | Operator: onboarding catalog — all compliance types + systems by category |
| POST | /api/admin/tenants · /tenants/:id/suspend · /resume | Operator: onboard (frameworks + systems + optional first login), suspend, reactivate |
| POST/DELETE | /api/admin/users · /users/:id/reset-password · /users/:id | Operator: create logins, reset passwords, delete users |

**Auth.** Email + password logins with two roles. The **platform operator**
signs into the Admin Console: cross-tenant overview, tenant register with live
readiness metrics, provisioning, suspend/resume, and user management (create
logins, reset passwords — generated passwords are shown once, never stored).
**Tenant users** land directly in their own workspace and can never see another
tenant — the server scopes them by session, ignoring any X-Tenant-Id header.
Suspended tenants get `403` from every workspace route. Passwords are
scrypt-hashed; sessions are 24h bearer tokens persisted in the store.
`npm run seed` prints the demo logins (also listed on the login page).

## Path to production

1. **Storage** — swap `store.js` for Postgres (Prisma). All reads/writes go through
   that one module.
2. **Real connectors** — implement OAuth2 flows per vendor and replace mock `sync()`
   bodies. The `auth()` spec on each adapter already declares what's needed.
3. **Auth** — email/password sessions are in place and the tenant is already
   derived from the session. Next: SSO/OIDC (e.g., Clerk/Auth0), password
   policy, self-serve reset, session revocation.
4. **Scheduling** — connector syncs are scheduled in-process today with
   control-driven cadence: each control declares how often its evidence must
   be re-checked per the strictest framework requirement (daily for PCI log
   review → quarterly for registers), and each connector syncs at the
   strictest cadence among the controls it feeds. Every run is logged to the
   sync history. Production wants real cron / a job queue, plus weekly agent
   runs posting to Slack.
5. **Secrets** — vendor tokens belong in a secrets manager (never the JSON store);
   API keys server-side only, as already structured.
