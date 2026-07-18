// ============================================================
// Integration Hub (tenant-scoped)
// ------------------------------------------------------------
// Adapter interface per external system:
//
//   { key, auth(): AuthSpec, sync(ctx): EvidenceItem[] }
//
// auth() declares how a real connection is established so the
// frontend can render the right connect flow; sync() pulls
// normalized evidence. The hub maps evidence to the tenant's
// controls (control.srcs includes adapter.key — a control may be
// fed by several systems, e.g. AWS + Azure for a two-cloud
// tenant); controls map many-to-many onto frameworks. Replace a
// mock sync() with real API calls to go live — nothing else
// changes.
// ============================================================

import { db } from "../store.js";
import { scoped, FRAMEWORK_CATALOG, CHECK_FREQUENCIES, controlFreq } from "../tenants.js";

const adapters = {
  aws: {
    key: "aws",
    auth: () => ({ type: "aws_iam_role", note: "Cross-account read-only role (SecurityAudit policy)" }),
    sync: () => [
      { type: "config", title: "S3 default encryption enabled (all buckets)", detail: "aws:s3 GetBucketEncryption — AES-256/KMS on 14/14 buckets" },
      { type: "config", title: "TLS 1.2+ enforced on load balancers", detail: "ELB security policy ELBSecurityPolicy-TLS13-1-2-2021-06" },
      { type: "config", title: "VPC segmentation: prod isolated from dev", detail: "No peering between vpc-prod and vpc-dev; SGs reviewed" },
    ],
  },
  azure: {
    key: "azure",
    auth: () => ({ type: "service_principal", note: "Entra app registration, Reader + Security Reader roles" }),
    sync: () => [
      { type: "config", title: "Storage accounts encrypted with CMK", detail: "Microsoft.Storage — SSE with customer-managed keys on 8/8 accounts" },
      { type: "config", title: "TLS 1.2 minimum on App Services", detail: "minTlsVersion=1.2 across all app services and front doors" },
      { type: "config", title: "Prod VNet isolated via NSGs", detail: "No inbound from dev VNet; NSG flow logs reviewed" },
    ],
  },
  gcp: {
    key: "gcp",
    auth: () => ({ type: "service_account", note: "Read-only viewer + Security Reviewer roles" }),
    sync: () => [
      { type: "log", title: "Data deletion jobs completed within SLA", detail: "Cloud Scheduler purge job: last 30 runs OK, max latency 3d" },
    ],
  },
  github: {
    key: "github",
    auth: () => ({ type: "oauth2", scopes: ["repo:read", "admin:repo_hook"] }),
    sync: () => [
      { type: "config", title: "Branch protection on main (all repos)", detail: "Require PR review + status checks: 6/6 repos" },
      { type: "report", title: "Dependabot alerts triaged", detail: "0 critical, 2 moderate open < 14 days" },
    ],
  },
  okta: {
    key: "okta",
    auth: () => ({ type: "api_key", note: "Read-only Okta API token" }),
    sync: () => [
      { type: "report", title: "MFA enrollment 100%", detail: "12/12 active users enrolled (Okta Verify/WebAuthn)" },
      { type: "config", title: "RBAC groups mapped to least privilege", detail: "4 groups; no user with standing admin" },
    ],
  },
  entra: {
    key: "entra",
    auth: () => ({ type: "service_principal", note: "Entra app registration, Directory.Read + Reports.Read" }),
    sync: () => [
      { type: "report", title: "MFA enrollment 100%", detail: "Conditional Access requires MFA; all active users registered" },
      { type: "config", title: "RBAC groups mapped to least privilege", detail: "Entra groups → app roles; PIM for standing-admin elimination" },
    ],
  },
  gworkspace: {
    key: "gworkspace",
    auth: () => ({ type: "oauth2", scopes: ["admin.directory.user.readonly", "admin.reports.audit.readonly"] }),
    sync: () => [
      { type: "report", title: "MFA enrollment 100%", detail: "2-Step Verification enforced org-wide; 0 exempt users" },
      { type: "config", title: "RBAC groups mapped to least privilege", detail: "Google Groups drive app access; no super-admin daily drivers" },
    ],
  },
  jumpcloud: {
    key: "jumpcloud",
    auth: () => ({ type: "api_key", note: "JumpCloud API key, read-only" }),
    sync: () => [
      { type: "report", title: "MFA enrollment 100%", detail: "JumpCloud Protect required for all user portals" },
      { type: "config", title: "RBAC groups mapped to least privilege", detail: "User groups → SSO app bindings reviewed; no standing admin" },
    ],
  },
  gusto: {
    key: "gusto",
    auth: () => ({ type: "oauth2", scopes: ["employees:read"] }),
    sync: () => [
      { type: "record", title: "Background checks on file for all hires", detail: "2/2 hires since Jan 2026" },
      { type: "record", title: "Security training completion", detail: "Annual training: 100% complete" },
      { type: "record", title: "Offboarding checklist executed same-day", detail: "Last offboarding: access revoked in 3h" },
    ],
  },
  adp: {
    key: "adp",
    auth: () => ({ type: "oauth2", scopes: ["workers:read"] }),
    sync: () => [
      { type: "record", title: "Background checks on file for all hires", detail: "ADP screening reports: all active workers cleared" },
      { type: "record", title: "Security training completion", detail: "ADP Learning: annual security course 100% complete" },
      { type: "record", title: "Offboarding checklist executed same-day", detail: "Termination workflow: access revocation task closed <8h" },
    ],
  },
  paychex: {
    key: "paychex",
    auth: () => ({ type: "api_key", note: "Paychex Flex API, read-only HR scope" }),
    sync: () => [
      { type: "record", title: "Background checks on file for all hires", detail: "Paychex onboarding packets complete for all active staff" },
      { type: "record", title: "Security training completion", detail: "LMS export: annual security training 100% complete" },
      { type: "record", title: "Offboarding checklist executed same-day", detail: "Last separation: systems access ended same business day" },
    ],
  },
  jira: {
    key: "jira",
    auth: () => ({ type: "oauth2", scopes: ["read:jira-work"] }),
    sync: () => [
      { type: "record", title: "Subprocessor register reviewed quarterly", detail: "COMP-14 closed 2026-06-30; next due 2026-09-30" },
    ],
  },
  datadog: {
    key: "datadog",
    auth: () => ({ type: "api_key", note: "API + App key, read scope" }),
    sync: () => [
      { type: "log", title: "Audit logs centralized, 365-day retention", detail: "All prod services shipping; retention policy verified" },
    ],
  },
  slack: {
    key: "slack",
    auth: () => ({ type: "oauth2", scopes: ["channels:read"] }),
    sync: () => [
      { type: "config", title: "#security-alerts wired to on-call", detail: "PagerDuty escalation attached; test alert acked in 4m" },
    ],
  },
};

export function getAdapter(key) {
  return adapters[key] ?? null;
}

// What each auth type needs from the customer. The connect flow renders
// these fields; the connect route requires them. When adapters go live,
// oauth2 becomes a redirect flow — the field spec is the demo stand-in.
const AUTH_FIELDS = {
  oauth2: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client secret", secret: true },
  ],
  api_key: [
    { key: "apiKey", label: "API key", secret: true },
  ],
  aws_iam_role: [
    { key: "roleArn", label: "IAM role ARN" },
    { key: "externalId", label: "External ID", secret: true },
  ],
  service_principal: [
    { key: "tenantId", label: "Directory (tenant) ID" },
    { key: "clientId", label: "Application (client) ID" },
    { key: "clientSecret", label: "Client secret", secret: true },
  ],
  service_account: [
    { key: "serviceAccountKey", label: "Service account key (JSON)", secret: true },
  ],
};

// Where to get the credentials, per connector: exact click-path in the
// vendor's console plus a link to it. Rendered behind the ⓘ toggle on
// the connect form so non-experts can self-serve.
const CONNECT_HELP = {
  aws: {
    consoleUrl: "https://console.aws.amazon.com/iam/",
    steps: [
      "Sign in to the AWS Console and open IAM → Roles → Create role.",
      "Trusted entity type: AWS account → Another AWS account. Enter AllAttest's account ID (shown in your onboarding email).",
      "Check 'Require external ID' and enter a random value you generate — that value is the External ID field here.",
      "Attach the AWS-managed 'SecurityAudit' policy (read-only), name the role (e.g. allattest-audit) and create it.",
      "Open the new role and copy its ARN (arn:aws:iam::…:role/allattest-audit) — that's the IAM role ARN field.",
    ],
  },
  azure: {
    consoleUrl: "https://portal.azure.com",
    steps: [
      "Sign in to the Azure portal → Microsoft Entra ID → App registrations → New registration (name it e.g. allattest-reader).",
      "On the app's Overview page, copy 'Directory (tenant) ID' and 'Application (client) ID'.",
      "Go to Certificates & secrets → New client secret → copy the secret VALUE immediately (it's shown only once).",
      "In your Subscription → Access control (IAM) → Add role assignment, grant the app 'Reader' and 'Security Reader'.",
    ],
  },
  gcp: {
    consoleUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    steps: [
      "Open Google Cloud Console → IAM & Admin → Service Accounts → Create service account (e.g. allattest-reader).",
      "Grant it the 'Viewer' and 'Security Reviewer' roles on your project.",
      "Open the account → Keys → Add key → Create new key → JSON. A .json file downloads.",
      "Open that file in a text editor and paste its full contents into the Service account key field here.",
    ],
  },
  github: {
    consoleUrl: "https://github.com/settings/developers",
    steps: [
      "On GitHub, open Settings → Developer settings → OAuth Apps → New OAuth App (use your ORG's settings for org repos).",
      "Authorization callback URL: your AllAttest URL + /callback (shown in your onboarding email).",
      "After creating, copy the Client ID from the app page.",
      "Click 'Generate a new client secret' and copy it right away — GitHub shows it only once.",
    ],
  },
  okta: {
    consoleUrl: "https://login.okta.com",
    steps: [
      "Sign in to your Okta Admin console (your-domain-admin.okta.com).",
      "Go to Security → API → Tokens → Create token.",
      "Name it (e.g. allattest-readonly) and copy the token value when shown — it's shown only once.",
      "Tip: create the token from a read-only admin account so the integration can never change anything.",
    ],
  },
  entra: {
    consoleUrl: "https://entra.microsoft.com",
    steps: [
      "Open the Microsoft Entra admin center → Identity → Applications → App registrations → New registration.",
      "On Overview, copy 'Directory (tenant) ID' and 'Application (client) ID'.",
      "Certificates & secrets → New client secret → copy the secret VALUE immediately.",
      "API permissions → Add permission → Microsoft Graph → Application: Directory.Read.All and Reports.Read.All → 'Grant admin consent'.",
    ],
  },
  gworkspace: {
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "In Google Cloud Console, pick (or create) a project, then APIs & Services → Enable APIs → enable 'Admin SDK API'.",
      "APIs & Services → Credentials → Create credentials → OAuth client ID (type: Web application).",
      "Add your AllAttest URL + /callback as an authorized redirect URI.",
      "Copy the Client ID and Client secret. Sign-in must be done by a Workspace admin with Reports access.",
    ],
  },
  jumpcloud: {
    consoleUrl: "https://console.jumpcloud.com",
    steps: [
      "Sign in to the JumpCloud Admin Portal.",
      "Click your admin initials (top-right) → My API Key.",
      "Generate (or reveal) the key and copy it — regenerating invalidates the old key.",
    ],
  },
  gusto: {
    consoleUrl: "https://dev.gusto.com",
    steps: [
      "Go to the Gusto Developer Portal and sign in with your company's Gusto admin account.",
      "Create an application (name it e.g. allattest) with the employees:read scope.",
      "Copy the Client ID and Client secret from the application page.",
    ],
  },
  adp: {
    consoleUrl: "https://developers.adp.com",
    steps: [
      "Sign in to ADP Developer Resources (or ask your ADP account rep to enable API access).",
      "Create a project for AllAttest and request the Workers (read) API scope.",
      "Copy the Client ID and Client secret from the project's credentials page.",
    ],
  },
  paychex: {
    consoleUrl: "https://developer.paychex.com",
    steps: [
      "Sign in to the Paychex Developer Portal (your Paychex rep can enable Flex API access).",
      "Register an application with read-only HR scope.",
      "Copy the API key from the application's credentials page.",
    ],
  },
  jira: {
    consoleUrl: "https://developer.atlassian.com/console/myapps/",
    steps: [
      "Open the Atlassian Developer Console → Create → OAuth 2.0 integration.",
      "Add the 'read:jira-work' scope under Permissions → Jira API.",
      "Add your AllAttest URL + /callback under Authorization.",
      "Copy the Client ID and Secret from Settings.",
    ],
  },
  datadog: {
    consoleUrl: "https://app.datadoghq.com/organization-settings/api-keys",
    steps: [
      "In Datadog, open Organization Settings → API Keys → New Key (name it allattest).",
      "Copy the key value — this is the API key field here.",
      "Ensure your Datadog role allows logs_read_data for audit-log evidence.",
    ],
  },
  slack: {
    consoleUrl: "https://api.slack.com/apps",
    steps: [
      "Go to api.slack.com/apps → Create New App → From scratch, and pick your workspace.",
      "Under OAuth & Permissions → Scopes, add the 'channels:read' bot scope.",
      "Under Basic Information → App Credentials, copy the Client ID and Client Secret.",
    ],
  },
};

// Full auth spec for a connector: adapter's declaration + the input
// fields its type requires + how to obtain them.
export function authFor(key) {
  const adapter = getAdapter(key);
  if (!adapter) return null;
  const spec = adapter.auth();
  return { ...spec, fields: AUTH_FIELDS[spec.type] ?? [], help: CONNECT_HELP[key] ?? null };
}

// A control may be fed by several systems (control.srcs). Older records
// carried a single `src`; both shapes are handled.
export function controlSrcs(control) {
  return control.srcs ?? (control.src ? [control.src] : []);
}

export function controlStatus(control, connectors, evidence) {
  const keys = controlSrcs(control);
  const conns = connectors.filter((c) => keys.includes(c.key));
  if (conns.length === 0 || !conns.some((c) => c.connected)) return "pending";
  const hasEvidence = evidence.some((e) => e.controlIds.includes(control.code));
  return hasEvidence ? "passing" : "syncing";
}

// Sync one connector for one tenant: run its adapter, map evidence to controls.
export function syncConnector(tenantId, key) {
  const adapter = getAdapter(key);
  const connector = scoped.connectors(tenantId).find((c) => c.key === key);
  if (!adapter || !connector) throw new Error(`Unknown connector: ${key}`);
  if (!connector.connected) throw new Error(`${connector.name} is not connected`);

  const controls = scoped.controls(tenantId).filter((c) => controlSrcs(c).includes(key));
  const items = adapter.sync({ connector, controls });
  const now = new Date().toISOString();

  const stored = items.map((item, i) => {
    // Real adapters tag control codes directly; mocks fall back to positional mapping.
    const controlIds = item.controlIds ?? (controls[i] ? [controls[i].code] : controls.map((c) => c.code));
    return db.insert("evidence", {
      id: `${tenantId}:${key}:${Date.now()}:${i}`,
      tenantId,
      connectorId: key,
      controlIds,
      collectedAt: now,
      ...item,
    });
  });

  db.update("connectors", connector.id, { lastSync: now });
  return stored;
}

// A connector is synced at the STRICTEST cadence among the controls it
// feeds — cadence is a control property (set by framework requirements),
// and this is how it rolls up to the vendor API that actually gets hit.
// E.g. Datadog syncs daily (LG-01: PCI daily log review) while Jira only
// syncs quarterly (registers). Returns { freq, ms }.
export function connectorCadence(tenantId, key) {
  const feeds = scoped.controls(tenantId).filter((c) => controlSrcs(c).includes(key));
  let best = null;
  for (const c of feeds) {
    const f = controlFreq(c);
    const ms = CHECK_FREQUENCIES[f]?.ms;
    if (ms && (!best || ms < best.ms)) best = { freq: f, ms };
  }
  return best ?? { freq: "quarterly", ms: CHECK_FREQUENCIES.quarterly.ms };
}

// Run one sync and record it as a transaction in the sync log — every
// run, whether initial (on connect), manual (Sync now), or scheduled,
// leaves an auditable trail: when, what triggered it, what it returned.
export function runSync(tenantId, key, trigger) {
  const connector = scoped.connectors(tenantId).find((c) => c.key === key);
  const started = Date.now();
  const entry = {
    id: `sync:${tenantId}:${key}:${started}`,
    tenantId,
    connectorKey: key,
    connectorName: connector?.name ?? key,
    trigger, // "initial" | "manual" | "scheduled"
    at: new Date(started).toISOString(),
  };
  try {
    const items = syncConnector(tenantId, key);
    db.insert("synclog", { ...entry, ok: true, items: items.length, durationMs: Date.now() - started });
    pruneSyncLog();
    return items;
  } catch (e) {
    db.insert("synclog", { ...entry, ok: false, items: 0, error: e.message, durationMs: Date.now() - started });
    pruneSyncLog();
    throw e;
  }
}

// Keep the log bounded (newest 1000 platform-wide).
function pruneSyncLog() {
  const log = db.get("synclog");
  const MAX = 1000;
  for (const e of log.slice(0, Math.max(0, log.length - MAX))) db.remove("synclog", e.id);
}

// Full graph for the hub mapping view (one tenant).
export function hubMap(tenantId) {
  const connectors = scoped.connectors(tenantId);
  const controls = scoped.controls(tenantId);
  const evidence = scoped.evidence(tenantId);
  const frameworks = FRAMEWORK_CATALOG; // platform config, not the db copy
  return {
    // credentials never leave the server — only a "on file" flag does
    connectors: connectors.map(({ credentials, ...c }) => ({ ...c, auth: authFor(c.key), credentialsOnFile: !!credentials })),
    controls: controls.map((c) => ({ ...c, status: controlStatus(c, connectors, evidence) })),
    frameworks,
    edges: {
      connectorToControl: controls.flatMap((c) => controlSrcs(c).map((s) => ({ from: s, to: c.code }))),
      controlToFramework: controls.flatMap((c) => c.fw.map((f) => ({ from: c.code, to: f }))),
    },
  };
}
