// ============================================================
// Tenancy
// ------------------------------------------------------------
// AllAttest is multi-tenant from the ground up. A tenant is
// a customer workspace (e.g., "Assure Agent, Inc."). Every
// operational record — connectors, controls, evidence, activity —
// carries a tenantId and is never visible across tenants.
//
// Frameworks and the connector/control catalogs are global
// product content; provisioning stamps per-tenant copies of the
// catalog so each tenant evolves independently.
// ============================================================

import { db } from "./store.js";

// ---- Platform catalogs (configured here, at the platform level) ----

// Every compliance type the platform supports. Tenants subscribe to a
// subset at onboarding; readiness is only ever computed for those.
export const FRAMEWORK_CATALOG = [
  { id: "SOC2", name: "SOC 2 Type II", color: "#157F5F" },
  { id: "GDPR", name: "GDPR", color: "#2C5AA0" },
  { id: "PCI", name: "PCI DSS", color: "#8A4FBF" },
  { id: "HIPAA", name: "HIPAA", color: "#A63D62" },
  { id: "ISO27001", name: "ISO 27001", color: "#4D7C0F" },
];

// System categories group interchangeable vendors: a tenant uses ADP
// *or* Gusto *or* Paychex for payroll, AWS and/or Azure and/or GCP for
// cloud. Controls point at a category; provisioning resolves the
// category to whichever systems the tenant actually selected.
export const SYSTEM_CATEGORIES = [
  { id: "cloud", name: "Cloud infrastructure" },
  { id: "code", name: "Code & CI" },
  { id: "identity", name: "Identity / SSO" },
  { id: "hr", name: "HR & payroll" },
  { id: "ticketing", name: "Ticketing" },
  { id: "logging", name: "Logging & monitoring" },
  { id: "alerts", name: "Alerts & comms" },
];

export const CONNECTOR_CATALOG = [
  { key: "aws", name: "AWS", category: "cloud", kind: "Cloud infra" },
  { key: "azure", name: "Microsoft Azure", category: "cloud", kind: "Cloud infra" },
  { key: "gcp", name: "Google Cloud", category: "cloud", kind: "Cloud infra" },
  { key: "github", name: "GitHub", category: "code", kind: "Code & CI" },
  { key: "okta", name: "Okta", category: "identity", kind: "Identity / SSO" },
  { key: "entra", name: "Microsoft Entra ID", category: "identity", kind: "Identity / SSO" },
  { key: "gworkspace", name: "Google Workspace", category: "identity", kind: "Identity / SSO" },
  { key: "jumpcloud", name: "JumpCloud", category: "identity", kind: "Identity / SSO" },
  { key: "gusto", name: "Gusto", category: "hr", kind: "HR & payroll" },
  { key: "adp", name: "ADP", category: "hr", kind: "HR & payroll" },
  { key: "paychex", name: "Paychex", category: "hr", kind: "HR & payroll" },
  { key: "jira", name: "Jira", category: "ticketing", kind: "Ticketing" },
  { key: "datadog", name: "Datadog", category: "logging", kind: "Logging" },
  { key: "slack", name: "Slack", category: "alerts", kind: "Alerts" },
];

// How often evidence for a control is re-checked. Cadence is a CONTROL
// property, not a tenant setting: the frameworks themselves set the bar
// (PCI Req 10 wants daily log review; access reviews are quarterly to
// semi-annual; registers are quarterly; training is annual). Checking
// more often than the strictest requirement just burdens vendor APIs.
export const CHECK_FREQUENCIES = {
  daily: { label: "Daily", ms: 24 * 60 * 60 * 1000 },
  weekly: { label: "Weekly", ms: 7 * 24 * 60 * 60 * 1000 },
  monthly: { label: "Monthly", ms: 30 * 24 * 60 * 60 * 1000 },
  quarterly: { label: "Quarterly", ms: 90 * 24 * 60 * 60 * 1000 },
};

// Controls reference a system CATEGORY, not a vendor. At provisioning,
// `srcs` is stamped with the tenant's selected systems in that category
// (so IN-01 maps to AWS+Azure for a two-cloud tenant, and to whichever
// payroll vendor — ADP, Gusto, or Paychex — the tenant runs). Each
// control carries its check frequency + the compliance rationale.
export const CONTROL_TEMPLATE = [
  { id: "AC-01", name: "MFA enforced for all users", fw: ["SOC2", "PCI", "HIPAA", "ISO27001"], category: "identity",
    freq: "daily", freqNote: "Identity is the highest-risk surface — MFA policy drift must surface within a day. One read-only report call daily." },
  { id: "AC-02", name: "Role-based least-privilege access", fw: ["SOC2", "GDPR", "PCI", "HIPAA", "ISO27001"], category: "identity",
    freq: "weekly", freqNote: "PCI v4 requires access reviews only every 6 months (Req 7.2.4); a weekly config check catches drift without hammering the IdP." },
  { id: "AC-03", name: "Same-day offboarding revocation", fw: ["SOC2", "ISO27001"], category: "hr",
    freq: "weekly", freqNote: "Offboarding events are sparse; weekly verification of the latest departures is ample between audits." },
  { id: "IN-01", name: "Encryption at rest (customer data)", fw: ["SOC2", "GDPR", "PCI", "HIPAA", "ISO27001"], category: "cloud",
    freq: "daily", freqNote: "A new unencrypted bucket should surface within a day — a single read-only config call, standard for continuous monitoring." },
  { id: "IN-02", name: "Encryption in transit (TLS 1.2+)", fw: ["SOC2", "PCI", "HIPAA", "ISO27001"], category: "cloud",
    freq: "daily", freqNote: "TLS policy drift check — one lightweight config read per day." },
  { id: "IN-03", name: "Production network segmentation", fw: ["PCI"], category: "cloud",
    freq: "weekly", freqNote: "PCI requires ruleset review every 6 months (Req 1.2.7); weekly drift checks are already conservative." },
  { id: "DV-01", name: "Branch protection & code review", fw: ["SOC2", "ISO27001"], category: "code",
    freq: "weekly", freqNote: "Branch protection rarely changes; weekly stays well within GitHub API rate limits." },
  { id: "DV-02", name: "Dependency vulnerability scanning", fw: ["SOC2", "PCI", "ISO27001"], category: "code",
    freq: "weekly", freqNote: "SOC 2 practice is weekly vulnerability review; PCI external scans are only quarterly (Req 11.3)." },
  { id: "LG-01", name: "Centralized audit logging", fw: ["SOC2", "PCI", "HIPAA", "ISO27001"], category: "logging",
    freq: "daily", freqNote: "PCI DSS Req 10.4.1 mandates DAILY log review — the strictest cadence in the register." },
  { id: "LG-02", name: "Security alerting & on-call", fw: ["SOC2", "ISO27001"], category: "alerts",
    freq: "weekly", freqNote: "Alert-routing config check weekly; pair with a monthly live test alert." },
  { id: "HR-01", name: "Background checks for new hires", fw: ["SOC2"], category: "hr",
    freq: "monthly", freqNote: "Hires are infrequent; a monthly completeness sweep catches anyone missed." },
  { id: "HR-02", name: "Security awareness training", fw: ["SOC2", "GDPR", "HIPAA", "ISO27001"], category: "hr",
    freq: "monthly", freqNote: "Training is an ANNUAL requirement; monthly checks exist only to catch unenrolled new hires." },
  { id: "PR-01", name: "DPA & subprocessor register", fw: ["GDPR"], category: "ticketing",
    freq: "quarterly", freqNote: "GDPR practice is a quarterly subprocessor review — checking more often adds nothing." },
  { id: "PR-02", name: "Data deletion within SLA", fw: ["GDPR", "HIPAA"], category: "cloud",
    freq: "weekly", freqNote: "Weekly review of purge-job logs verifies the SLA without polling daily." },
  { id: "PR-03", name: "BAA register for vendors handling PHI", fw: ["HIPAA"], category: "ticketing",
    freq: "quarterly", freqNote: "BAA registers change when vendors change — quarterly review matches HIPAA practice." },
];

// Effective check frequency for a control record (falls back to the
// template for records stamped before `freq` existed).
export function controlFreq(control) {
  return control.freq ?? CONTROL_TEMPLATE.find((t) => t.id === control.code)?.freq ?? "weekly";
}

// What each control actually requires, what makes it pass, and the exact
// steps to get there — PER VENDOR, so an Azure/ADP tenant sees Azure/ADP
// steps and never Okta/Gusto ones. Rendered in the Control Register's
// expanded row alongside the live status explanation.
export const CONTROL_GUIDANCE = {
  "AC-01": {
    requirement: "Every active user account must be required to complete multi-factor authentication at sign-in — no exceptions or opt-outs.",
    passWhen: "Your identity provider reports 100% of active users enrolled in MFA under an enforced policy.",
    steps: {
      okta: [
        "In Okta Admin: Security → Authenticators — enable Okta Verify and/or WebAuthn.",
        "Security → Authentication Policies — add a rule requiring 2 factors for ALL users on ALL apps (no exempt groups).",
        "Reports → MFA Usage shows who hasn't enrolled; they'll be prompted at next sign-in.",
      ],
      entra: [
        "Entra admin center: Protection → Conditional Access → New policy.",
        "Target All users + All cloud apps; under Grant, select 'Require multifactor authentication'; turn the policy On (not report-only).",
        "Identity → Monitoring → Authentication methods activity — chase any unregistered users.",
      ],
      gworkspace: [
        "Google Admin: Security → Authentication → 2-Step Verification.",
        "Set Enforcement to ON for every organizational unit (not just 'allow users to turn on').",
        "Reports → Security highlights accounts without 2SV; give them a short enrollment window.",
      ],
      jumpcloud: [
        "JumpCloud Admin: Security Settings → require MFA for the User Portal.",
        "Enable JumpCloud Protect (or TOTP) for all user groups.",
        "Watch the MFA column on the Users list until every active user shows enrolled.",
      ],
    },
  },
  "AC-02": {
    requirement: "Access is granted through role-based groups carrying the minimum permissions each job needs; nobody holds standing admin rights they don't use.",
    passWhen: "App access flows from role groups (not direct grants) and privileged-role membership is small and reviewed.",
    steps: {
      okta: [
        "Model job roles as Okta groups and assign apps to GROUPS, never directly to individuals.",
        "Directory → Groups → group rules to auto-assign people by department/title.",
        "Security → Administrators — cut the admin list to the minimum; use custom admin roles for narrow duties.",
      ],
      entra: [
        "Assign enterprise apps to role groups, not individuals (Enterprise applications → Users and groups).",
        "Use PIM (Identity Governance → Privileged Identity Management) so admin roles are ELIGIBLE, not permanently active.",
        "Set up quarterly Access Reviews on privileged roles and app assignments.",
      ],
      gworkspace: [
        "Grant app access through Google Groups mapped to roles; avoid per-user grants.",
        "Admin console → Account → Admin roles — replace Super Admin day-to-day use with limited pre-built roles.",
        "Review role membership quarterly; document the review.",
      ],
      jumpcloud: [
        "Bind SSO applications to user groups that mirror job roles.",
        "Keep JumpCloud administrator accounts separate from daily-driver accounts.",
        "Review group→app bindings and admin list quarterly.",
      ],
    },
  },
  "AC-03": {
    requirement: "When someone leaves, all their system access is revoked the same day their employment ends.",
    passWhen: "The most recent offboarding shows access revocation completed within 24 hours of termination.",
    steps: {
      gusto: [
        "Use Gusto's dismissal flow for every departure so termination date is recorded.",
        "Add a same-day 'revoke all access' item to the offboarding checklist (IdP suspend, laptop, tokens).",
        "If Gusto is linked to your identity provider, enable auto-deprovisioning on dismissal.",
      ],
      adp: [
        "Process terminations through ADP's termination workflow on the effective date.",
        "Attach a same-day access-revocation task (suspend SSO account, revoke tokens) to the workflow.",
        "Keep the completion timestamp — that's the evidence auditors want.",
      ],
      paychex: [
        "Record separations in Paychex Flex on the day they happen.",
        "Pair each separation with a same-day IT checklist: suspend identity account, collect devices, revoke keys.",
        "Log when revocation completed to show the <24h window.",
      ],
    },
  },
  "IN-01": {
    requirement: "All storage that can hold customer data — object storage, disks, databases — is encrypted at rest.",
    passWhen: "Provider configuration shows encryption enabled on 100% of storage resources.",
    steps: {
      aws: [
        "S3: enable default bucket encryption (SSE-S3 or SSE-KMS) on EVERY bucket; block new unencrypted buckets with an SCP.",
        "EBS: Account Settings → enable 'Always encrypt new EBS volumes' in every active region.",
        "RDS: verify storage encryption on all instances (existing unencrypted DBs need snapshot-copy-restore with encryption).",
      ],
      azure: [
        "Storage accounts: SSE is on by default — if policy requires customer-managed keys, configure CMK via Key Vault on each account.",
        "Disks: use Disk Encryption Sets so managed disks encrypt with your keys.",
        "Azure SQL: confirm Transparent Data Encryption (TDE) is ON for every database.",
      ],
      gcp: [
        "GCP encrypts at rest by default — the work is proving it and covering exceptions.",
        "Where policy requires customer-managed keys, configure CMEK on buckets, disks, and Cloud SQL.",
        "Use Asset Inventory to sweep for any resource with CMEK required but not set.",
      ],
    },
  },
  "IN-02": {
    requirement: "Every external endpoint serves traffic over TLS 1.2 or newer; plain HTTP is redirected or refused.",
    passWhen: "Load balancers / front doors enforce a TLS 1.2+ policy and HTTP→HTTPS redirect on all public listeners.",
    steps: {
      aws: [
        "ALB/NLB listeners: set security policy to ELBSecurityPolicy-TLS13-1-2-2021-06 (or newer).",
        "CloudFront: set minimum protocol version to TLSv1.2_2021 on every distribution.",
        "Add HTTP→HTTPS redirect rules on port-80 listeners.",
      ],
      azure: [
        "App Services: Configuration → set minimum TLS version to 1.2 and 'HTTPS Only' on every app.",
        "Front Door / Application Gateway: apply a TLS 1.2+ policy on all frontends.",
        "Scan public endpoints (SSL Labs or similar) to confirm no TLS 1.0/1.1 remains.",
      ],
      gcp: [
        "Create an SSL policy with profile MODERN or RESTRICTED (min TLS 1.2) and attach it to every HTTPS load balancer.",
        "Enable HTTP→HTTPS redirect on the load balancer frontends.",
        "Verify with a TLS scan that no legacy protocol negotiates.",
      ],
    },
  },
  "IN-03": {
    requirement: "Production networks are segmented from development/test — no flat network where a dev compromise reaches prod (PCI requirement).",
    passWhen: "Prod runs in its own network with no peering/routes to dev and least-privilege firewall rules between segments.",
    steps: {
      aws: [
        "Run prod in a dedicated VPC (ideally a dedicated account); remove any VPC peering between prod and dev.",
        "Security groups: allow only the specific ports/sources each tier needs; no 0.0.0.0/0 on internal tiers.",
        "Review VPC flow logs quarterly for unexpected cross-segment traffic.",
      ],
      azure: [
        "Keep prod in its own VNet (or subscription); remove VNet peering between prod and dev.",
        "Apply NSGs per subnet with least-privilege rules; deny by default between environments.",
        "Enable NSG flow logs and review them for cross-environment traffic.",
      ],
      gcp: [
        "Separate prod and dev into different VPC networks (or projects); avoid Shared VPC spanning both.",
        "Write firewall rules per service; no broad allow-all between networks.",
        "Review VPC flow logs for unexpected prod↔dev traffic.",
      ],
    },
  },
  "DV-01": {
    requirement: "No code reaches the default branch without a pull request that someone else reviewed and passing status checks.",
    passWhen: "Branch protection (or rulesets) on the default branch of every repo requires ≥1 review + status checks and blocks force pushes.",
    steps: {
      github: [
        "Org Settings → Repository → Rulesets: create a ruleset for the default branch of ALL repos.",
        "Require a pull request with ≥1 approving review, require status checks, block force pushes and deletions.",
        "Don't exempt admins — auditors check for bypass lists.",
      ],
    },
  },
  "DV-02": {
    requirement: "Dependencies are scanned for known vulnerabilities and critical findings are fixed within your SLA.",
    passWhen: "Dependabot (or equivalent) is on for every repo and no critical alert is open past SLA.",
    steps: {
      github: [
        "Org Settings → Code security → enable Dependabot alerts AND security updates for all repositories.",
        "Set an internal SLA (e.g. criticals in 7 days, highs in 30) and triage weekly.",
        "Keep zero criticals open past SLA — that's the number the evidence shows.",
      ],
    },
  },
  "LG-01": {
    requirement: "Audit logs from all production services are centralized, tamper-resistant, and retained ≥365 days.",
    passWhen: "Every prod service ships logs to the central platform and retention/archives are configured for a year.",
    steps: {
      datadog: [
        "Install the Datadog agent / log shippers on every production service — sweep for services not reporting.",
        "Configure log archives (e.g. to cloud storage) with ≥365-day retention.",
        "Restrict who can modify pipelines and archives, so logs are tamper-resistant.",
      ],
    },
  },
  "LG-02": {
    requirement: "Security alerts reach a human quickly — a monitored channel with an on-call escalation path.",
    passWhen: "Alerts route to a dedicated channel wired to on-call, and a test alert was acknowledged recently.",
    steps: {
      slack: [
        "Create #security-alerts and route your monitoring/SIEM alerts into it.",
        "Wire the channel to your on-call tool (PagerDuty/Opsgenie) so alerts page someone.",
        "Fire a test alert monthly and record the acknowledgement time.",
      ],
    },
  },
  "HR-01": {
    requirement: "Every new hire completes a background check before (or at) their start date.",
    passWhen: "HR records show a completed check on file for all hires in the audit period.",
    steps: {
      gusto: [
        "Enable a background-check partner (e.g. Checkr) inside Gusto's hiring flow.",
        "Make the check a required step before the start date in your onboarding checklist.",
        "Keep completion reports in the employee record.",
      ],
      adp: [
        "Turn on ADP's screening & selection service (or integrate your screening vendor).",
        "Gate onboarding completion on a cleared check.",
        "Retain the screening report in the worker's ADP record.",
      ],
      paychex: [
        "Use Paychex's screening partner integration for every offer.",
        "Require a cleared check before day one in the onboarding packet.",
        "Store the result with the employee's record.",
      ],
    },
  },
  "HR-02": {
    requirement: "Everyone completes security awareness training at hire and annually after that.",
    passWhen: "Training records show 100% completion for all active staff within the last 12 months.",
    steps: {
      gusto: [
        "Assign an annual security course (Gusto Learn or an external LMS) to every employee.",
        "Auto-enroll new hires during onboarding.",
        "Chase completion to 100% — the completion report is the evidence.",
      ],
      adp: [
        "Assign the security awareness course in ADP Learning to all workers, annually.",
        "Add it to the new-hire onboarding path.",
        "Export the completion report once everyone's done.",
      ],
      paychex: [
        "Use the Paychex learning management module to assign annual security training.",
        "Include it in new-hire onboarding.",
        "Track to 100% completion and keep the export.",
      ],
    },
  },
  "PR-01": {
    requirement: "You maintain a current register of subprocessors with signed DPAs, reviewed quarterly (GDPR).",
    passWhen: "The register exists, every subprocessor has a DPA on file, and the last review closed within 90 days.",
    steps: {
      jira: [
        "Create a living 'Subprocessor register' page/issue listing every vendor touching personal data + DPA status.",
        "Create a recurring quarterly Jira ticket to review it: additions, removals, DPA renewals.",
        "Close each review ticket with notes — the closed ticket is the evidence.",
      ],
    },
  },
  "PR-02": {
    requirement: "Personal data is deleted within your committed SLA when retention ends or a deletion request arrives.",
    passWhen: "Automated purge jobs run on schedule and completion logs show deletions within the SLA window.",
    steps: {
      aws: [
        "Set S3 lifecycle expiration rules and database TTLs to match your retention policy.",
        "Automate deletion-request handling (e.g. Step Functions/Lambda runbook) with logged completions.",
        "Alert if a purge job fails or exceeds the SLA.",
      ],
      azure: [
        "Configure Storage lifecycle management rules per your retention policy.",
        "Automate deletions with Automation runbooks/Functions; write completion logs.",
        "Alert on missed or failed purge runs.",
      ],
      gcp: [
        "Set bucket lifecycle rules and database TTLs to your retention policy.",
        "Run scheduled purge jobs (Cloud Scheduler + Functions) that log every completion.",
        "Alert if a run fails or breaches the SLA window.",
      ],
    },
  },
  "PR-03": {
    requirement: "Every vendor that touches PHI has a signed Business Associate Agreement on file (HIPAA).",
    passWhen: "The BAA register lists all PHI-touching vendors with signed agreements attached and a quarterly review.",
    steps: {
      jira: [
        "Create a 'BAA register' listing every vendor that stores, processes, or transmits PHI.",
        "Attach the signed BAA to each vendor's entry; open a ticket for any vendor missing one.",
        "Add a recurring quarterly review ticket; close it with notes each cycle.",
      ],
    },
  },
};

export const TENANT_COLORS = ["#0E7C6B", "#B4690E", "#5B4FD9", "#0B5FA5", "#A63D62", "#4D7C0F"];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// Tenants seeded before the status field existed are treated as active.
export function tenantStatus(tenant) {
  return tenant?.status ?? "active";
}

export function getTenant(id) {
  return db.find("tenants", id);
}

export function listTenants() {
  return db.get("tenants").map((t) => ({ ...t, status: tenantStatus(t) }));
}

// Operator action (Admin Console): turn scheduled evidence syncing on or
// off for a tenant. Off = the tenant runs syncs manually ("Sync now").
// Tenants created before this field exist default to ON.
export function setAutoSync(id, enabled) {
  const tenant = getTenant(id);
  if (!tenant) throw new Error(`Unknown tenant: ${id}`);
  return db.update("tenants", id, { autoSync: !!enabled });
}

export function autoSyncEnabled(tenant) {
  return tenant?.autoSync !== false;
}

// Operator action (Admin Console): suspend or reactivate a workspace.
export function setTenantStatus(id, status) {
  if (!["active", "suspended"].includes(status)) throw new Error(`Invalid status: ${status}`);
  const tenant = getTenant(id);
  if (!tenant) throw new Error(`Unknown tenant: ${id}`);
  return db.update("tenants", id, { status });
}

// Create a tenant and stamp its workspace from the platform catalogs.
// `frameworks`: which compliance types the tenant is pursuing.
// `systems`: which vendors the tenant actually uses (connector keys).
// Only controls relevant to the chosen frameworks are stamped, and each
// control's `srcs` resolves its category to the tenant's own systems.
export function provisionTenant({ name, color, frameworks, systems }) {
  if (!name || !name.trim()) throw new Error("Tenant name is required");

  const fwIds = FRAMEWORK_CATALOG.map((f) => f.id);
  const fws = frameworks?.length ? frameworks : fwIds;
  const badFw = fws.filter((f) => !fwIds.includes(f));
  if (badFw.length) throw new Error(`Unknown compliance type: ${badFw.join(", ")}`);

  const sysKeys = CONNECTOR_CATALOG.map((c) => c.key);
  const sys = systems?.length ? systems : sysKeys;
  const badSys = sys.filter((s) => !sysKeys.includes(s));
  if (badSys.length) throw new Error(`Unknown system: ${badSys.join(", ")}`);

  const base = slugify(name.trim());
  let id = base;
  let n = 2;
  while (db.find("tenants", id)) id = `${base}-${n++}`;

  const tenant = db.insert("tenants", {
    id,
    name: name.trim(),
    color: color || TENANT_COLORS[db.get("tenants").length % TENANT_COLORS.length],
    status: "active",
    frameworks: fws,
    createdAt: new Date().toISOString(),
  });

  for (const c of CONNECTOR_CATALOG.filter((c) => sys.includes(c.key))) {
    db.insert("connectors", {
      id: `${id}:${c.key}`,
      tenantId: id,
      key: c.key,
      name: c.name,
      kind: c.kind,
      category: c.category,
      connected: false,
      lastSync: null,
    });
  }

  for (const c of CONTROL_TEMPLATE) {
    if (!c.fw.some((f) => fws.includes(f))) continue; // not relevant to chosen frameworks
    const srcs = CONNECTOR_CATALOG
      .filter((cc) => cc.category === c.category && sys.includes(cc.key))
      .map((cc) => cc.key);
    db.insert("controls", {
      id: `${id}:${c.id}`,
      code: c.id,
      tenantId: id,
      name: c.name,
      fw: c.fw.filter((f) => fws.includes(f)),
      category: c.category,
      srcs, // may be empty: control applies but tenant has no system for it yet
      freq: c.freq, // check cadence set by the strictest framework requirement
      owner: "Admin",
    });
  }
  return tenant;
}

// Scoped reads used by routes, hub, and agents.
export const scoped = {
  connectors: (tenantId) => db.get("connectors").filter((c) => c.tenantId === tenantId),
  controls: (tenantId) => db.get("controls").filter((c) => c.tenantId === tenantId),
  evidence: (tenantId) => db.get("evidence").filter((e) => e.tenantId === tenantId),
  activity: (tenantId) => db.get("activity").filter((a) => a.tenantId === tenantId),
};
