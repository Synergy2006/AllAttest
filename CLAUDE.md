# CLAUDE.md — AllAttest

## What this is
AllAttest is a multi-tenant B2B SaaS that automates compliance (SOC 2 / GDPR / PCI)
with AI agents. Built by Rajesh (founder, with co-founder Sravanthi). Assure Agent, Inc.
is the first tenant; Synergy Technologies, LLC is the second. The platform operator view
is the Admin Console; each customer gets an isolated tenant workspace.

## Run it (Windows / PowerShell)
```
# terminal 1
cd server
npm install          # first time only
npm run seed         # rebuilds data/db.json demo data (wipes runtime state)
npm run dev          # http://localhost:4000

# terminal 2
cd client
npm install          # first time only
npm run dev          # http://localhost:5173 (proxies /api -> :4000)
```
Optional env: `ANTHROPIC_API_KEY` enables live AI agents (stubs otherwise).
`npm run seed` prints the demo logins (1 platform operator + 1 per tenant);
the login page lists them too.

## Architecture
- `server/` Express API, ES modules, Node 18+.
  - `src/store.js` — file-backed JSON store (data/db.json). ALL persistence goes
    through this module; it is the designated swap point for Postgres/Prisma.
  - `src/tenants.js` — PLATFORM CATALOGS + tenancy. FRAMEWORK_CATALOG (all
    compliance types: SOC 2, GDPR, PCI, HIPAA, ISO 27001), SYSTEM_CATEGORIES,
    CONNECTOR_CATALOG (vendors grouped by category — cloud: AWS/Azure/GCP,
    hr: Gusto/ADP/Paychex, identity: Okta/Entra/Google Workspace/JumpCloud, …),
    CONTROL_TEMPLATE (controls point at a CATEGORY,
    not a vendor), CONTROL_GUIDANCE (per control: requirement, pass criteria,
    and PER-VENDOR remediation steps — served on /api/controls filtered to the
    tenant's own systems; rendered in the Control Register's expanded row with
    a live why-passing/why-not explanation). provisionTenant({frameworks,
    systems}) stamps only relevant controls and resolves each control's `srcs`
    to the tenant's own systems.
    Also suspend/resume and `scoped.*` reads. Every record carries `tenantId`.
  - `src/auth.js` — logins & sessions. Roles: `operator` (platform Admin Console,
    all tenants) and `tenant` (locked to one workspace). Passwords scrypt-hashed
    via node:crypto; sessions are bearer tokens in the JSON store (24h TTL).
    Generated passwords are returned once to the operator, never stored.
  - `src/scheduler.js` — sync scheduler. Cadence is a CONTROL property, not a
    tenant setting: each control carries `freq` (daily/weekly/monthly/quarterly)
    + `freqNote` justifying it against the strictest framework requirement
    (PCI Req 10.4.1 daily log review is the tightest; registers are quarterly).
    Each CONNECTOR syncs at the strictest cadence among the controls it feeds
    (hub `connectorCadence()`): Datadog/clouds/IdP daily, GitHub/HR weekly-ish,
    Jira quarterly. 60s tick, catches up on boot, per-connector
    `lastScheduledSyncAt`. Every sync — initial, manual, scheduled — is
    recorded in `synclog` (capped 1000): tenants /api/synclog, operators
    /api/admin/synclog. Don't sync more often than the requirement — it only
    burdens vendor APIs. Operators can set a tenant to manual-only
    (tenant.autoSync=false via /api/admin/tenants/:id/autosync — the AUTO-SYNC
    toggle in the console); the scheduler skips them and the tenant uses
    "Sync now". Missing autoSync field = ON.
  - `src/hub/index.js` — Integration Hub. Adapter interface per external system:
    `{ key, auth(), sync(ctx) -> EvidenceItem[] }`. Current 14 adapters (aws,
    azure, gcp, github, okta, entra, gworkspace, jumpcloud, gusto, adp,
    paychex, jira, datadog, slack) are mocks; to go live, replace a mock
    `sync()` with real API calls — nothing else changes.
  - `src/agents/index.js` — 5 agents + Compliance Copilot. Orchestrator: snapshot
    tenant state -> build prompt -> call Claude (model `claude-sonnet-4-6`) -> log
    to tenant activity feed.
  - `src/index.js` — routes. Order matters: public /api/auth/login, then the
    bearer-token auth middleware, then global authed routes, then /api/admin/*
    (operator role only), then tenant resolution, then tenant-scoped routes.
    Tenant users are scoped by their session — X-Tenant-Id is ignored for them;
    operators choose a workspace via X-Tenant-Id. Suspended tenants get 403
    from all workspace routes.
- `client/` Vite + React 18, single App.jsx, no CSS framework — inline styles with
  a palette constant `C` at the top.

## Domain model
connectors --(evidence)--> controls --(many-to-many)--> frameworks.
Compliance types (frameworks) are PLATFORM config; each tenant subscribes to a
subset at onboarding (`tenant.frameworks`) and only ever sees/reports those.
Systems come in categories of interchangeable vendors (cloud, hr, identity, …);
at onboarding the operator picks what the tenant actually uses, and each
control's `srcs` array is resolved from its category to those systems (a
two-cloud tenant's IN-01 maps to aws+azure; an ADP shop's HR-01 maps to adp).
`srcs` may be empty: control applies but tenant has no system in that category.
Framework readiness is always COMPUTED from control status, never stored.
Control status: pending (no source connected) -> syncing (connected, no evidence)
-> passing (evidence on file).
Control record ids are `tenantId:CODE` (unique); display `code` is AC-01, IN-02, etc.
Connectors are per-tenant rows keyed by catalog `key`; routes address them by key.

## Conventions
- Brand palette (client App.jsx `C`): audit navy chrome #0A2A43, verified teal
  #0E7C6B for trust actions, violet #5B4FD9 EXCLUSIVELY for AI-agent surfaces,
  amber/red reserved for compliance states. Tenants carry their own accent color.
- Fonts: IBM Plex Sans (UI), IBM Plex Mono (data/labels).
- API errors: `{ error: string }` with 4xx status via the `wrap()` helper.
- Keep evidence normalized: `{ type, title, detail, controlIds, collectedAt }`.
- Connector credentials: connect collects the fields the adapter's auth type
  declares (hub AUTH_FIELDS), stores them on the connector row, and the API
  NEVER returns them — clients only see `credentialsOnFile`. Disconnect wipes
  them. Production: move to a secrets manager; oauth2 becomes a redirect flow.

## Roadmap (in rough priority order)
1. Per-tenant roles (admin / auditor / viewer) — user model exists in
   server/src/auth.js; role enforcement slots into the tenant middleware.
   (Basic per-tenant logins + operator auth shipped 2026-07.)
2. Swap store.js for Postgres via Prisma (single-module change).
3. First real connector: GitHub OAuth (easiest; makes DV-01/DV-02 genuinely live).
4. Weekly agent runs posting to Slack. (Scheduled connector syncs shipped
   2026-07 — in-process scheduler; production wants real cron / a job queue.)
5. Evidence file uploads for controls with no connected source.
6. Upgrade Vite to latest major (clears 2 dev-server npm audit warnings; verify build).
7. Production auth hardening: SSO/OIDC, password policy + self-serve reset,
   session revocation UI (replaces the demo email/password logins).

## Gotchas
- `npm run seed` wipes all runtime state (connections made in the UI, evidence,
  activity, users, sessions). Only run it when you want a fresh demo database.
- RESTART the API after `npm run seed` — store.js caches db.json in memory, so
  a running server won't see the reseeded file and will overwrite it on its
  next write.
- Mock adapters map evidence to controls positionally; real adapters must tag
  `controlIds` explicitly on each evidence item.
- The client keeps chat/agent outputs in React state only — they clear on refresh
  and on tenant switch (intentional; per-tenant isolation in the UI too).
