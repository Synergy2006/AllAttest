// ============================================================
// Sync scheduler — control-driven cadence
// ------------------------------------------------------------
// Audits happen quarterly or semi-annually; evidence collection
// doesn't need to hammer vendor APIs. Cadence is a property of
// each CONTROL (set by the strictest framework requirement — see
// CONTROL_TEMPLATE freq/freqNote), and each CONNECTOR syncs at
// the strictest cadence among the controls it feeds:
//   Datadog daily (PCI Req 10.4.1 daily log review),
//   GitHub weekly, HR systems monthly-ish, Jira quarterly.
//
// Runs in-process on a 60s tick and catches up on boot. Failures
// are recorded in the sync log, never thrown. Production: real
// cron / a job queue (roadmap).
// ============================================================

import { db } from "./store.js";
import { scoped, tenantStatus, autoSyncEnabled } from "./tenants.js";
import { runSync, connectorCadence } from "./hub/index.js";

const TICK_MS = 60 * 1000;

function tick() {
  for (const tenant of db.get("tenants")) {
    if (tenantStatus(tenant) === "suspended") continue; // suspended tenants don't sync
    if (!autoSyncEnabled(tenant)) continue; // operator set this tenant to manual-only

    for (const c of scoped.connectors(tenant.id).filter((c) => c.connected)) {
      const { ms } = connectorCadence(tenant.id, c.key);
      const last = c.lastScheduledSyncAt ? new Date(c.lastScheduledSyncAt).getTime() : 0;
      if (Date.now() - last < ms) continue;

      try {
        runSync(tenant.id, c.key, "scheduled");
      } catch {
        // failure is already recorded in the sync log; keep going
      }
      db.update("connectors", c.id, { lastScheduledSyncAt: new Date().toISOString() });
    }
  }
}

export function startScheduler() {
  tick(); // catch up on boot
  const timer = setInterval(tick, TICK_MS);
  timer.unref?.(); // don't hold the process open on shutdown
  console.log("Sync scheduler running (60s tick, control-driven per-connector cadence)");
}
