// ============================================================
// Agent orchestration (tenant-scoped)
// ------------------------------------------------------------
// Each agent = { id, name, desc, action, buildPrompt(tenant, state) }.
// The orchestrator snapshots the tenant's live state, builds the
// prompt, calls Claude, and logs the run to that tenant's
// activity feed. Set ANTHROPIC_API_KEY to enable live agents;
// without it, agents return a clear stub.
// ============================================================

import { db } from "../store.js";
import { controlStatus } from "../hub/index.js";
import { scoped, getTenant } from "../tenants.js";

const MODEL = "claude-sonnet-4-6";

export function stateContext(tenantId) {
  const connectors = scoped.connectors(tenantId);
  const controls = scoped.controls(tenantId);
  const evidence = scoped.evidence(tenantId);

  const ctrlLines = controls.map((c) => {
    const st = controlStatus(c, connectors, evidence);
    const ev = evidence.filter((e) => e.controlIds.includes(c.code)).length;
    const srcs = (c.srcs ?? (c.src ? [c.src] : [])).join("+") || "none";
    return `${c.code} | ${c.name} | frameworks: ${c.fw.join(",")} | sources: ${srcs} | status: ${st} | evidence items: ${ev} | owner: ${c.owner}`;
  });
  const connLines = connectors.map(
    (c) => `${c.name} (${c.kind}): ${c.connected ? "CONNECTED" : "not connected"}${c.lastSync ? `, last sync ${c.lastSync}` : ""}`
  );
  return `CONTROL REGISTER:\n${ctrlLines.join("\n")}\n\nINTEGRATIONS:\n${connLines.join("\n")}`;
}

export const AGENTS = [
  {
    id: "gap",
    name: "Gap Analyzer",
    desc: "Reads the live control register and integration state, then reports the highest-risk gaps blocking the next audit milestone.",
    action: "Run gap analysis",
    details: {
      purpose: "Tells you what to fix FIRST. Turns 14+ control statuses into a ranked to-do list instead of a wall of red chips.",
      reads: "Your live control register (every control's status, evidence count, owner, sources) and which integrations are connected. Nothing outside this workspace.",
      produces: "A numbered list of the 3 highest-risk gaps blocking your next audit — why each matters and the fastest remediation for each. Under 250 words.",
      howTo: "Just click \"Run gap analysis\" — no input needed. It snapshots your workspace at that moment and takes a few seconds.",
      results: "The analysis appears right below this card. The run is also logged to your Dashboard's Agent Activity feed (and the operator's platform activity).",
      runWhen: "Right after onboarding, after connecting or disconnecting a system, and before any audit-planning meeting.",
    },
    buildPrompt: (tenant, state) =>
      `You are the Gap Analyzer agent inside AllAttest, a compliance automation platform. The customer is ${tenant.name}, pursuing: ${tenant.frameworks?.join(", ") || "SOC 2"}. Analyze the state below. Identify the 3 highest-risk gaps blocking their next audit, why each matters, and the fastest remediation. Under 250 words, numbered list.\n\n${state}`,
  },
  {
    id: "evidence",
    name: "Evidence Collector",
    desc: "Pulls proof from connected systems and files it against mapped controls; reports what still needs a source.",
    action: "Suggest evidence plan",
    details: {
      purpose: "Plans your evidence coverage so nothing is missing when the auditor asks. Separates \"automated and handled\" from \"needs a human\".",
      reads: "Which integrations are connected vs not, the control-to-source mapping, and what evidence is already on file.",
      produces: "Grouped by integration: what evidence should be auto-collected this week from each CONNECTED system, plus the list of controls with NO connected source (manual upload or a new connector needed).",
      howTo: "Click \"Suggest evidence plan\". No input needed — it works from the current connection state.",
      results: "Output appears below this card; the run is logged to the Dashboard's Agent Activity feed.",
      runWhen: "Weekly during audit prep, and any time you connect or disconnect an integration.",
    },
    buildPrompt: (tenant, state) =>
      `You are the Evidence Collector agent in AllAttest. Customer: ${tenant.name}. Given the state below, list which evidence should be auto-collected from each CONNECTED integration this week, and which controls have no connected evidence source (manual upload needed). Under 220 words, grouped by integration.\n\n${state}`,
  },
  {
    id: "policy",
    name: "Policy Drafter",
    desc: "Drafts and maintains required policies tuned to the customer's actual stack.",
    action: "Propose policy queue",
    details: {
      purpose: "Gets the written-policy side of compliance moving — auditors ask for policies (access control, incident response, …) as much as technical evidence.",
      reads: "Your subscribed compliance types (SOC 2, HIPAA, …) and your actual stack from the control register, so recommendations fit YOUR tools.",
      produces: "The 5 policies to draft first, with one line each on what must be company-specific rather than copied boilerplate.",
      howTo: "Click \"Propose policy queue\". No input needed.",
      results: "Output appears below this card; the run is logged to the Dashboard's Agent Activity feed.",
      runWhen: "Early in your compliance program, and again whenever you add a new compliance type.",
    },
    buildPrompt: (tenant, state) =>
      `You are the Policy Drafter agent in AllAttest. Customer: ${tenant.name}, pursuing ${tenant.frameworks?.join(", ") || "SOC 2"}. Based on the state below, list the 5 policies to draft first, one line each on what must be company-specific (not boilerplate). Under 200 words.\n\n${state}`,
  },
  {
    id: "vendor",
    name: "Vendor Risk Agent",
    desc: "Screens subprocessors, tracks their certifications, flags expiring attestations.",
    action: "Screen vendor stack",
    details: {
      purpose: "Covers third-party risk: every connected system is a vendor in YOUR supply chain, and auditors ask what you've verified about each.",
      reads: "Your connected integrations — each one treated as a vendor to screen.",
      produces: "One line per vendor: which attestation to request from them (SOC 2 report, DPA, ISO cert) and the typical risk flag to watch.",
      howTo: "Click \"Screen vendor stack\". No input needed.",
      results: "Output appears below this card; the run is logged to the Dashboard's Agent Activity feed. Pairs with the DPA/subprocessor (PR-01) and BAA (PR-03) register controls.",
      runWhen: "Quarterly, alongside your subprocessor/BAA register review, and when adding a new vendor.",
    },
    buildPrompt: (tenant, state) =>
      `You are the Vendor Risk agent in AllAttest. Customer: ${tenant.name}. For each CONNECTED integration below, state what attestation to request (e.g., SOC 2 report, DPA) and any typical risk flag. Under 200 words, one line per vendor.\n\n${state}`,
  },
  {
    id: "audit",
    name: "Audit Prep Agent",
    desc: "Simulates auditor requests against current evidence and produces a readiness scorecard.",
    action: "Run mock audit",
    details: {
      purpose: "Your dress rehearsal. Finds out what an auditor would flag BEFORE the real audit does.",
      reads: "The full control register with current evidence, filtered to the compliance types this workspace is pursuing.",
      produces: "5 simulated auditor requests, each graded PASS / AT RISK / FAIL with a one-line reason — a readiness scorecard.",
      howTo: "Click \"Run mock audit\". No input needed.",
      results: "Scorecard appears below this card; the run is logged to the Dashboard's Agent Activity feed.",
      runWhen: "4–6 weeks before your audit window, then after each round of remediation to watch grades improve.",
    },
    buildPrompt: (tenant, state) =>
      `You are the Audit Prep agent in AllAttest. Customer: ${tenant.name}, pursuing ${tenant.frameworks?.join(", ") || "SOC 2"}. Simulate 5 likely auditor requests for their next audit given the state below; for each say PASS / AT RISK / FAIL with a one-line reason. Under 220 words.\n\n${state}`,
  },
];

async function callClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return "[Stub response — set ANTHROPIC_API_KEY to enable live agents]\n\nThe orchestration path works end-to-end: tenant state snapshot built, prompt assembled, run logged. Add your API key and this agent will produce a real analysis of the state above.";
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

export async function runAgent(tenantId, id) {
  const agent = AGENTS.find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  const tenant = getTenant(tenantId);
  const output = await callClaude(agent.buildPrompt(tenant, stateContext(tenantId)));
  db.insert("activity", {
    id: `run:${tenantId}:${Date.now()}`,
    tenantId,
    agent: agent.name,
    summary: `${agent.action} completed`,
    at: new Date().toISOString(),
  });
  return { agent: agent.id, output };
}

export async function copilot(tenantId, messages) {
  const tenant = getTenant(tenantId);
  const history = messages.map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.text}`).join("\n");
  const prompt = `You are the Compliance Copilot inside AllAttest. The customer is ${tenant.name}. Answer using their live state below. Brief, specific, practical (under 180 words). No preamble.\n\n${stateContext(tenantId)}\n\nConversation:\n${history}\n\nRespond to the last customer message.`;
  return callClaude(prompt);
}
