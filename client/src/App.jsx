import React, { useState, useEffect, useRef, useCallback } from "react";
import { api, setTenant, setToken, hasToken } from "./api.js";

/* ------------------------------------------------------------
   AllAttest brand system
   Deep "audit navy" chrome — the color of the signed report —
   with a verified-teal primary for trust actions, violet for
   AI-agent surfaces, and amber/red reserved strictly for
   compliance states. Tenants carry their own accent color.
   ------------------------------------------------------------ */
const C = {
  ink: "#122032", inkSoft: "#48586B", paper: "#F3F5F6", panel: "#FFFFFF",
  line: "#DBE1E4",
  navy: "#0A2A43",       // brand chrome (header)
  navySoft: "#8FA3B5",   // muted text on navy
  primary: "#0E7C6B",    // verified teal — trust actions
  primaryBg: "#E4F2EE",
  agent: "#5B4FD9",      // AI surfaces only
  agentBg: "#ECEAFB",
  pass: "#1B7F4D", passBg: "#E4F2EA",
  warn: "#A96A12", warnBg: "#F8EEDB",
  fail: "#B3362B", failBg: "#F9E7E4",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  sans: "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif",
};

// A control may be fed by several systems (e.g. AWS + Azure for a
// two-cloud tenant). Older records carried a single `src`.
const srcsOf = (c) => c.srcs ?? (c.src ? [c.src] : []);

const TRIGGER_LABEL = { scheduled: "SCHEDULED", manual: "MANUAL", initial: "ON CONNECT" };

const STATUS = {
  passing: { l: "PASSING", fg: C.pass, bg: C.passBg },
  syncing: { l: "SYNCING", fg: C.agent, bg: C.agentBg },
  pending: { l: "PENDING", fg: C.warn, bg: C.warnBg },
  failing: { l: "FAILING", fg: C.fail, bg: C.failBg },
};

/* A render error anywhere below must never blank the whole app —
   show what went wrong and let the user navigate away instead. */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ background: C.panel, border: `1px solid ${C.fail}`, borderRadius: 8, padding: 20 }}>
        <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", color: C.fail }}>SOMETHING WENT WRONG ON THIS VIEW</div>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.inkSoft, marginTop: 8 }}>{String(this.state.error?.message ?? this.state.error)}</div>
        <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft, marginTop: 8 }}>
          Your session is intact — switch tabs or refresh to continue.
        </div>
      </div>
    );
  }
}

function Chip({ label, fg, bg }) {
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.04em", color: fg, background: bg, border: `1px solid ${fg}22`, padding: "2px 7px", borderRadius: 3, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Panel({ children, style }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, ...style }}>{children}</div>;
}

function SectionTitle({ kicker, title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.inkSoft }}>{kicker}</div>
        <div style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: "-0.01em" }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ data, tenant, refresh }) {
  const { frameworks, controls, connectors, activity } = data;
  const stats = frameworks.map((f) => {
    const rel = controls.filter((c) => c.fw.includes(f.id));
    const passing = rel.filter((c) => c.status === "passing").length;
    return { ...f, total: rel.length, passing, pct: rel.length ? Math.round((passing / rel.length) * 100) : 0 };
  });
  const connected = connectors.filter((c) => c.connected).length;
  const passing = controls.filter((c) => c.status === "passing").length;

  return (
    <div>
      <SectionTitle kicker={tenant.name.toUpperCase()} title="Compliance Dashboard"
        right={<button onClick={refresh} style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, background: "transparent", border: `1px solid ${C.line}`, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>Refresh</button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {stats.map((s) => (
          <Panel key={s.id} style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontFamily: C.sans, fontWeight: 600, color: C.ink, fontSize: 15 }}>{s.name}</div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: s.color }}>{s.passing}/{s.total}</div>
            </div>
            <div style={{ marginTop: 12, height: 8, background: C.paper, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${s.pct}%`, height: "100%", background: s.color, transition: "width .5s ease" }} />
            </div>
            <div style={{ marginTop: 8, fontFamily: C.mono, fontSize: 24, color: C.ink }}>
              {s.pct}<span style={{ fontSize: 13, color: C.inkSoft }}>% ready</span>
            </div>
          </Panel>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 16 }}>
        <Panel style={{ padding: 18 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft }}>CONTROLS PASSING</div>
          <div style={{ fontFamily: C.mono, fontSize: 30, color: C.pass, marginTop: 6 }}>{passing}<span style={{ color: C.inkSoft, fontSize: 15 }}> / {controls.length}</span></div>
        </Panel>
        <Panel style={{ padding: 18 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft }}>INTEGRATIONS LIVE</div>
          <div style={{ fontFamily: C.mono, fontSize: 30, color: C.ink, marginTop: 6 }}>{connected}<span style={{ color: C.inkSoft, fontSize: 15 }}> / {connectors.length}</span></div>
        </Panel>
        <Panel style={{ padding: 18 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft }}>NEXT MILESTONE</div>
          <div style={{ fontFamily: C.sans, fontSize: 15, color: C.ink, marginTop: 8, fontWeight: 600 }}>SOC 2 Type I audit</div>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.warn, marginTop: 2 }}>target: Oct 2026</div>
        </Panel>
      </div>

      <Panel style={{ marginTop: 16, padding: 18 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft, marginBottom: 10 }}>AGENT ACTIVITY</div>
        {activity.length === 0 && (
          <div style={{ fontFamily: C.sans, fontSize: 13.5, color: C.inkSoft }}>No agent runs yet in this workspace. Open <b>AI Agents</b> and run one.</div>
        )}
        {activity.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
            <Chip label={a.agent.toUpperCase()} fg={C.agent} bg={C.agentBg} />
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft, flex: 1 }}>{a.summary}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>{new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/* ---------- Agents ---------- */
function Agents({ agents, tenant, refresh }) {
  const [outputs, setOutputs] = useState({});
  const [running, setRunning] = useState({});
  const [expanded, setExpanded] = useState({}); // which agents' detail sections are open
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, busy]);
  useEffect(() => { setOutputs({}); setChat([]); setExpanded({}); }, [tenant.id]);

  const DETAIL_ROWS = [
    ["purpose", "PURPOSE"],
    ["reads", "WHAT IT READS"],
    ["produces", "WHAT YOU GET"],
    ["howTo", "HOW TO RUN IT"],
    ["results", "WHERE RESULTS SHOW"],
    ["runWhen", "RUN IT WHEN"],
  ];

  const run = async (a) => {
    setRunning((r) => ({ ...r, [a.id]: true }));
    try {
      const { output } = await api.runAgent(a.id);
      setOutputs((o) => ({ ...o, [a.id]: output }));
      refresh();
    } catch (e) {
      setOutputs((o) => ({ ...o, [a.id]: `Run failed: ${e.message}` }));
    }
    setRunning((r) => ({ ...r, [a.id]: false }));
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    const next = [...chat, { role: "user", text: q }];
    setChat(next); setInput(""); setBusy(true);
    try {
      const { text } = await api.copilot(next);
      setChat((c) => [...c, { role: "agent", text }]);
    } catch (e) {
      setChat((c) => [...c, { role: "agent", text: `Couldn't reach the copilot: ${e.message}` }]);
    }
    setBusy(false);
  };

  return (
    <div>
      <SectionTitle kicker={tenant.name.toUpperCase()} title="AI Agents" right={<Chip label="POWERED BY CLAUDE" fg={C.agent} bg={C.agentBg} />} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {agents.map((a) => (
            <Panel key={a.id} style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 15, color: C.ink }}>{a.name}</div>
                  <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft, marginTop: 3, lineHeight: 1.45 }}>{a.desc}</div>
                  {a.details && (
                    <button onClick={() => setExpanded((x) => ({ ...x, [a.id]: !x[a.id] }))}
                      style={{ fontFamily: C.mono, fontSize: 10.5, color: C.agent, background: "transparent", border: "none", padding: 0, marginTop: 6, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
                      {expanded[a.id] ? "Hide details ▲" : "What does this agent do? ▼"}
                    </button>
                  )}
                </div>
                <button onClick={() => run(a)} disabled={running[a.id]}
                  style={{ fontFamily: C.mono, fontSize: 11.5, color: running[a.id] ? C.inkSoft : "#fff", background: running[a.id] ? C.paper : C.agent, border: `1px solid ${running[a.id] ? C.line : C.agent}`, padding: "7px 12px", borderRadius: 5, cursor: running[a.id] ? "default" : "pointer", whiteSpace: "nowrap" }}>
                  {running[a.id] ? "Running…" : a.action}
                </button>
              </div>

              {expanded[a.id] && a.details && (
                <div style={{ marginTop: 12, background: C.agentBg, border: `1px solid ${C.agent}22`, borderRadius: 6, padding: "4px 14px 10px" }}>
                  {DETAIL_ROWS.map(([k, label]) => a.details[k] && (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "128px 1fr", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.agent}18` }}>
                      <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.agent, paddingTop: 2 }}>{label}</div>
                      <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.ink, lineHeight: 1.55 }}>{a.details[k]}</div>
                    </div>
                  ))}
                  <div style={{ fontFamily: C.sans, fontSize: 11, color: C.inkSoft, paddingTop: 8 }}>
                    Agents advise — they read your workspace state and never change your systems. Output clears on refresh or tenant switch (by design); each run is kept in the activity feed.
                  </div>
                </div>
              )}
              {outputs[a.id] && (
                <div style={{ marginTop: 12, padding: 12, background: C.paper, borderRadius: 6, fontFamily: C.sans, fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.55, borderLeft: `3px solid ${C.agent}` }}>
                  {outputs[a.id]}
                </div>
              )}
            </Panel>
          ))}
        </div>

        <Panel style={{ display: "flex", flexDirection: "column", minHeight: 420, maxHeight: 640, position: "sticky", top: 16 }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 15, color: C.ink }}>Compliance Copilot</div>
            <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.inkSoft }}>Answers against {tenant.name}'s live control register and integrations.</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {chat.length === 0 && (
              <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft }}>
                Try: <i>"What's blocking SOC 2 right now?"</i>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} style={{ marginBottom: 10, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "85%", padding: "9px 12px", borderRadius: 8, background: m.role === "user" ? C.navy : C.agentBg, color: m.role === "user" ? "#fff" : C.ink, fontFamily: C.sans, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && <div style={{ fontFamily: C.mono, fontSize: 12, color: C.agent }}>thinking…</div>}
            <div ref={endRef} />
          </div>
          <div style={{ padding: 12, borderTop: `1px solid ${C.line}`, display: "flex", gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask the copilot…"
              style={{ flex: 1, fontFamily: C.sans, fontSize: 13.5, padding: "9px 12px", border: `1px solid ${C.line}`, borderRadius: 6, outline: "none", color: C.ink, background: C.paper }} />
            <button onClick={send} disabled={busy}
              style={{ fontFamily: C.mono, fontSize: 12, color: "#fff", background: busy ? C.inkSoft : C.primary, border: "none", padding: "9px 16px", borderRadius: 6, cursor: busy ? "default" : "pointer" }}>
              Send
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------- Integration Hub ---------- */
function Hub({ data, tenant, refresh }) {
  const { connectors, controls, frameworks } = data;
  const [selected, setSelected] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [credKey, setCredKey] = useState(null); // connector whose credential form is open
  const [creds, setCreds] = useState({});
  const [credErr, setCredErr] = useState(null);
  const [showHelp, setShowHelp] = useState(false); // ⓘ how-to-get-credentials guide
  const [syncLog, setSyncLog] = useState([]);

  const loadLog = useCallback(() => api.syncLog().then(setSyncLog).catch(() => {}), []);
  useEffect(() => { setSelected(null); setCredKey(null); setCreds({}); setCredErr(null); setShowHelp(false); loadLog(); }, [tenant.id, loadLog]);

  const act = async (fn, key) => {
    setBusyKey(key);
    try { await fn(key); await refresh(); await loadLog(); } catch (e) { alert(e.message); }
    setBusyKey(null);
  };

  const openConnect = (c) => { setCredKey(c.key); setCreds({}); setCredErr(null); setShowHelp(false); };

  const submitConnect = async (c) => {
    setBusyKey(c.key);
    try {
      await api.connect(c.key, creds);
      setCredKey(null); setCreds({}); setCredErr(null);
      await refresh();
      await loadLog();
    } catch (e) { setCredErr(e.message); }
    setBusyKey(null);
  };

  const rowC = 46, rowF = 120, topPad = 26;
  const H = Math.max(connectors.length * 62, controls.length * rowC) + topPad * 2;
  const colX = { conn: 16, ctrl: 356, fw: 720 };
  const colW = { conn: 208, ctrl: 300, fw: 190 };
  const connY = (i) => topPad + i * 62;
  const ctrlY = (i) => topPad + i * rowC;
  const fwY = (i) => topPad + 60 + i * rowF;

  const hiCtrl = selected ? new Set(controls.filter((c) => srcsOf(c).includes(selected)).map((c) => c.code)) : null;
  const hiFw = selected ? new Set(controls.filter((c) => srcsOf(c).includes(selected)).flatMap((c) => c.fw)) : null;
  const path = (x1, y1, x2, y2) => { const mx = (x1 + x2) / 2; return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`; };

  return (
    <div>
      <SectionTitle kicker={tenant.name.toUpperCase()} title="Integration Hub"
        right={
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.inkSoft }}>click a connector to trace its mapping</div>
            <div style={{ fontFamily: C.mono, fontSize: 10.5, color: tenant.autoSync === false ? C.warn : C.primary, marginTop: 3 }}>
              {tenant.autoSync === false
                ? "auto-sync is OFF for this workspace — run syncs manually with \"Sync now\""
                : "auto-checked per control's compliance cadence — see each connector card"}
            </div>
          </div>
        } />
      <Panel style={{ padding: 12, overflowX: "auto" }}>
        <svg viewBox={`0 0 940 ${H}`} width="100%" style={{ minWidth: 860, display: "block" }}>
          {[{ x: colX.conn, t: "CONNECTORS" }, { x: colX.ctrl, t: "CONTROLS" }, { x: colX.fw, t: "FRAMEWORKS" }].map((c) => (
            <text key={c.t} x={c.x} y={14} fontFamily={C.mono} fontSize="10" letterSpacing="2" fill={C.inkSoft}>{c.t}</text>
          ))}
          {controls.flatMap((ctl, ci) =>
            srcsOf(ctl).map((src) => {
              const conIdx = connectors.findIndex((c) => c.key === src);
              if (conIdx < 0) return null;
              const active = selected === src;
              const conn = connectors[conIdx];
              return (
                <path key={`p1-${ctl.code}-${src}`} d={path(colX.conn + colW.conn, connY(conIdx) + 22, colX.ctrl, ctrlY(ci) + 17)} fill="none"
                  stroke={active ? C.agent : conn.connected ? C.primary : C.line} strokeWidth={active ? 2.2 : 1.2}
                  opacity={selected && !active ? 0.18 : conn.connected || active ? 0.85 : 0.5}
                  strokeDasharray={conn.connected ? "none" : "4 4"} />
              );
            })
          )}
          {controls.map((ctl, ci) =>
            ctl.fw.map((f) => {
              const fi = frameworks.findIndex((x) => x.id === f);
              if (fi < 0) return null; // fw not in this workspace's list — skip the edge
              const active = hiCtrl && hiCtrl.has(ctl.code);
              return (
                <path key={`p2-${ctl.code}-${f}`} d={path(colX.ctrl + colW.ctrl, ctrlY(ci) + 17, colX.fw, fwY(fi) + 26)} fill="none"
                  stroke={active ? C.agent : C.line} strokeWidth={active ? 2 : 1} opacity={selected ? (active ? 0.9 : 0.12) : 0.55} />
              );
            })
          )}
          {connectors.map((c, i) => {
            const active = selected === c.key;
            return (
              <g key={c.key} onClick={() => setSelected(active ? null : c.key)} style={{ cursor: "pointer" }}>
                <rect x={colX.conn} y={connY(i)} width={colW.conn} height={44} rx={6}
                  fill={active ? C.agentBg : C.panel} stroke={active ? C.agent : c.connected ? C.primary : C.line} strokeWidth={active ? 1.8 : 1.2} />
                <text x={colX.conn + 12} y={connY(i) + 19} fontFamily={C.sans} fontSize="13" fontWeight="600" fill={C.ink}>{c.name}</text>
                <text x={colX.conn + 12} y={connY(i) + 34} fontFamily={C.mono} fontSize="9.5" fill={C.inkSoft}>{c.kind.toUpperCase()}</text>
                <circle cx={colX.conn + colW.conn - 16} cy={connY(i) + 22} r={4.5} fill={c.connected ? C.primary : C.line} />
              </g>
            );
          })}
          {controls.map((ctl, i) => {
            const active = hiCtrl && hiCtrl.has(ctl.code);
            const stCol = ctl.status === "passing" ? C.pass : ctl.status === "syncing" ? C.agent : C.warn;
            return (
              <g key={ctl.code} opacity={selected && !active ? 0.3 : 1}>
                <rect x={colX.ctrl} y={ctrlY(i)} width={colW.ctrl} height={34} rx={5}
                  fill={active ? C.agentBg : C.panel} stroke={active ? C.agent : stCol} strokeWidth={active ? 1.6 : 1} strokeOpacity={active ? 1 : 0.6} />
                <text x={colX.ctrl + 10} y={ctrlY(i) + 15} fontFamily={C.mono} fontSize="9.5" fill={stCol}>{ctl.code} · {ctl.status.toUpperCase()}</text>
                <text x={colX.ctrl + 10} y={ctrlY(i) + 28} fontFamily={C.sans} fontSize="11.5" fill={C.ink}>
                  {ctl.name.length > 40 ? ctl.name.slice(0, 39) + "…" : ctl.name}
                </text>
              </g>
            );
          })}
          {frameworks.map((f, i) => {
            const rel = controls.filter((c) => c.fw.includes(f.id));
            const passing = rel.filter((c) => c.status === "passing").length;
            const active = hiFw && hiFw.has(f.id);
            return (
              <g key={f.id} opacity={selected && !active ? 0.3 : 1}>
                <rect x={colX.fw} y={fwY(i)} width={colW.fw} height={56} rx={6} fill={C.panel} stroke={active ? C.agent : f.color} strokeWidth={active ? 1.8 : 1.4} />
                <text x={colX.fw + 12} y={fwY(i) + 22} fontFamily={C.sans} fontSize="13" fontWeight="600" fill={C.ink}>{f.name}</text>
                <text x={colX.fw + 12} y={fwY(i) + 40} fontFamily={C.mono} fontSize="10.5" fill={f.color}>{passing}/{rel.length} controls passing</text>
              </g>
            );
          })}
        </svg>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
        {connectors.map((c) => (
          <Panel key={c.key} style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 13.5, color: C.ink }}>{c.name}</div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft }}>{c.kind.toUpperCase()}</div>
                {c.auth && <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.primary, marginTop: 4 }}>auth: {c.auth.type}</div>}
                {c.checkLabel && (
                  <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.inkSoft, marginTop: 2 }}>
                    {tenant.autoSync === false ? "auto-check: off (manual)" : `auto-check: ${c.checkLabel.toLowerCase()}`}
                  </div>
                )}
                {c.connected && c.credentialsOnFile && <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.pass, marginTop: 2 }}>credentials on file</div>}
                {c.lastSync && <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.inkSoft, marginTop: 2 }}>synced {new Date(c.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={() => (c.connected ? act(api.disconnect, c.key) : credKey === c.key ? setCredKey(null) : openConnect(c))} disabled={busyKey === c.key}
                  style={{ fontFamily: C.mono, fontSize: 10.5, color: c.connected ? C.fail : credKey === c.key ? C.inkSoft : "#fff", background: c.connected || credKey === c.key ? "transparent" : C.primary, border: `1px solid ${c.connected ? C.fail : credKey === c.key ? C.line : C.primary}`, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>
                  {busyKey === c.key ? "…" : c.connected ? "Disconnect" : credKey === c.key ? "Cancel" : "Connect"}
                </button>
                {c.connected && (
                  <button onClick={() => act(api.sync, c.key)} disabled={busyKey === c.key}
                    style={{ fontFamily: C.mono, fontSize: 10.5, color: C.agent, background: "transparent", border: `1px solid ${C.agent}`, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>
                    Sync now
                  </button>
                )}
              </div>
            </div>

            {credKey === c.key && !c.connected && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.inkSoft }}>
                    CONNECTION DETAILS{c.auth?.note ? ` — ${c.auth.note.toUpperCase()}` : ""}
                  </div>
                  {c.auth?.help && (
                    <button onClick={() => setShowHelp((s) => !s)} title="Where do I find these?" aria-label="Where do I find these?"
                      style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 10, fontFamily: C.mono, fontSize: 11, fontStyle: "italic", color: showHelp ? "#fff" : C.primary, background: showHelp ? C.primary : "transparent", border: `1.5px solid ${C.primary}`, cursor: "pointer", lineHeight: 1, padding: 0 }}>
                      i
                    </button>
                  )}
                </div>
                {showHelp && c.auth?.help && (
                  <div style={{ background: C.primaryBg, border: `1px solid ${C.primary}33`, borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.primary, marginBottom: 6 }}>
                      HOW TO GET THESE FROM {c.name.toUpperCase()}
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 16 }}>
                      {c.auth.help.steps.map((s, i) => (
                        <li key={i} style={{ fontFamily: C.sans, fontSize: 11.5, color: C.ink, lineHeight: 1.5, marginBottom: 4 }}>{s}</li>
                      ))}
                    </ol>
                    <a href={c.auth.help.consoleUrl} target="_blank" rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 6, fontFamily: C.mono, fontSize: 10.5, color: C.primary, textDecoration: "none", borderBottom: `1px solid ${C.primary}55` }}>
                      Open {c.name} console ↗
                    </a>
                  </div>
                )}
                {(c.auth?.fields ?? []).map((f) => (
                  <input key={f.key} type={f.secret ? "password" : "text"} placeholder={f.label}
                    value={creds[f.key] ?? ""} onChange={(e) => setCreds((v) => ({ ...v, [f.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && submitConnect(c)}
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: C.mono, fontSize: 12, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", color: C.ink, marginBottom: 7 }} />
                ))}
                {c.auth?.scopes && (
                  <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.inkSoft, marginBottom: 7 }}>scopes: {c.auth.scopes.join(", ")}</div>
                )}
                {credErr && <div style={{ fontFamily: C.sans, fontSize: 12, color: C.fail, marginBottom: 7 }}>{credErr}</div>}
                <button onClick={() => submitConnect(c)} disabled={busyKey === c.key}
                  style={{ width: "100%", fontFamily: C.mono, fontSize: 11, color: "#fff", background: C.primary, border: "none", padding: "8px 0", borderRadius: 5, cursor: "pointer" }}>
                  {busyKey === c.key ? "Connecting…" : `Connect ${c.name}`}
                </button>
                <div style={{ fontFamily: C.sans, fontSize: 10.5, color: C.inkSoft, marginTop: 6, lineHeight: 1.4 }}>
                  Stored securely server-side, never shown again. Mock adapter: details are recorded but not yet verified against the live API.
                </div>
              </div>
            )}
          </Panel>
        ))}
      </div>

      {/* sync transactions: every run — on-connect, manual, scheduled */}
      <Panel style={{ marginTop: 16, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft }}>SYNC HISTORY ({syncLog.length})</div>
          <button onClick={loadLog} style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, background: "transparent", border: `1px solid ${C.line}`, padding: "4px 9px", borderRadius: 4, cursor: "pointer" }}>Refresh</button>
        </div>
        {syncLog.length === 0 && (
          <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft }}>No syncs yet — connect a system, or wait for the next scheduled run.</div>
        )}
        {syncLog.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, width: 150, flexShrink: 0 }}>
              {new Date(s.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.ink, width: 160, flexShrink: 0 }}>{s.connectorName}</div>
            <Chip label={TRIGGER_LABEL[s.trigger] ?? s.trigger?.toUpperCase()} fg={s.trigger === "scheduled" ? C.primary : C.inkSoft} bg={s.trigger === "scheduled" ? C.primaryBg : C.paper} />
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, flex: 1 }}>
              {s.ok ? `${s.items} evidence item${s.items === 1 ? "" : "s"} collected` : `failed: ${s.error}`}
              {typeof s.durationMs === "number" ? ` · ${s.durationMs}ms` : ""}
            </div>
            <Chip label={s.ok ? "OK" : "FAILED"} fg={s.ok ? C.pass : C.fail} bg={s.ok ? C.passBg : C.failBg} />
          </div>
        ))}
      </Panel>
    </div>
  );
}

/* ---------- Controls + evidence drawer ---------- */
function Controls({ data, tenant }) {
  const { controls, connectors, frameworks } = data;
  const [fwFilter, setFwFilter] = useState("ALL");
  const [open, setOpen] = useState(null);
  const [evidence, setEvidence] = useState([]);
  // column sort + Excel-style header filters (multi-select per column)
  const [sort, setSort] = useState({ key: "code", dir: 1 });
  const [q, setQ] = useState("");
  const [fFw, setFFw] = useState([]);
  const [fStatus, setFStatus] = useState([]);
  const [fSource, setFSource] = useState([]);
  const [fCheck, setFCheck] = useState([]);
  const [fOwner, setFOwner] = useState([]);
  const [openFilter, setOpenFilter] = useState(null); // which column's popover is open
  const popRef = useRef(null);

  const resetFilters = () => { setQ(""); setFFw([]); setFStatus([]); setFSource([]); setFCheck([]); setFOwner([]); setFwFilter("ALL"); };
  useEffect(() => { setOpen(null); resetFilters(); setSort({ key: "code", dir: 1 }); setOpenFilter(null); }, [tenant.id]);

  // close an open filter popover on outside click
  useEffect(() => {
    if (!openFilter) return;
    const close = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpenFilter(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openFilter]);

  const srcNamesOf = (c) => srcsOf(c).map((k) => connectors.find((x) => x.key === k)?.name ?? k);

  // dropdown options come from the data actually in this workspace
  const owners = [...new Set(controls.map((c) => c.owner))].sort();
  const sources = [...new Set(controls.flatMap((c) => srcNamesOf(c)))].sort();
  const checks = [...new Set(controls.map((c) => c.freqLabel).filter(Boolean))];
  const statuses = [...new Set(controls.map((c) => c.status))];

  const FREQ_ORDER = { daily: 0, weekly: 1, monthly: 2, quarterly: 3 };
  const STATUS_ORDER = { passing: 0, syncing: 1, pending: 2, failing: 3 };
  const sortVal = (c) => {
    switch (sort.key) {
      case "name": return c.name.toLowerCase();
      case "src": return (srcNamesOf(c)[0] ?? "").toLowerCase();
      case "freq": return FREQ_ORDER[c.freq] ?? 9;
      case "owner": return c.owner.toLowerCase();
      case "status": return STATUS_ORDER[c.status] ?? 9;
      default: return c.code;
    }
  };

  // per-column filter registry: values shown in the popover + selection state
  const FILTERS = {
    fw: { values: frameworks.map((f) => f.id), sel: fFw, set: setFFw },
    src: { values: sources, sel: fSource, set: setFSource },
    freq: { values: checks, sel: fCheck, set: setFCheck },
    owner: { values: owners, sel: fOwner, set: setFOwner },
    status: { values: statuses, sel: fStatus, set: setFStatus },
  };
  const toggleVal = (f, v) => f.set(f.sel.includes(v) ? f.sel.filter((x) => x !== v) : [...f.sel, v]);

  const filtersActive = q || fFw.length || fStatus.length || fSource.length || fCheck.length || fOwner.length || fwFilter !== "ALL";

  const list = controls
    .filter((c) => fwFilter === "ALL" || c.fw.includes(fwFilter))
    .filter((c) => !fFw.length || c.fw.some((f) => fFw.includes(f)))
    .filter((c) => !q || c.code.toLowerCase().includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => !fStatus.length || fStatus.includes(c.status))
    .filter((c) => !fSource.length || srcNamesOf(c).some((s) => fSource.includes(s)))
    .filter((c) => !fCheck.length || fCheck.includes(c.freqLabel))
    .filter((c) => !fOwner.length || fOwner.includes(c.owner))
    .sort((a, b) => {
      const va = sortVal(a), vb = sortVal(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));

  const openControl = async (c) => {
    if (open === c.code) { setOpen(null); return; }
    setOpen(c.code);
    setEvidence(await api.evidence({ controlId: c.code }));
  };


  return (
    <div>
      <SectionTitle kicker={tenant.name.toUpperCase()} title="Control Register"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            {["ALL", ...frameworks.map((f) => f.id)].map((f) => (
              <button key={f} onClick={() => setFwFilter(f)}
                style={{ fontFamily: C.mono, fontSize: 11, padding: "5px 10px", borderRadius: 4, cursor: "pointer", background: fwFilter === f ? C.navy : "transparent", color: fwFilter === f ? "#fff" : C.inkSoft, border: `1px solid ${fwFilter === f ? C.navy : C.line}` }}>
                {f}
              </button>
            ))}
          </div>
        } />
      <Panel>
        {/* slim search bar — value filters live on the column headers */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${C.line}`, background: "#FBFCFC" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or name…"
            style={{ fontFamily: C.sans, fontSize: 12.5, padding: "6px 10px", border: `1px solid ${C.line}`, borderRadius: 4, outline: "none", color: C.ink, width: 200 }} />
          <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.inkSoft }}>use the ⧩ on a column header to filter by value</div>
          {filtersActive && (
            <button onClick={resetFilters}
              style={{ fontFamily: C.mono, fontSize: 10.5, color: C.fail, background: "transparent", border: `1px solid ${C.fail}55`, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>
              Clear filters
            </button>
          )}
          <div style={{ marginLeft: "auto", fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft }}>
            {list.length} of {controls.length} controls
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "72px 1fr 140px 110px 92px 84px 100px", padding: "10px 16px", borderBottom: `1px solid ${C.line}`, overflow: "visible" }}>
          {[
            { key: "code", label: "ID" },
            { key: "name", label: "CONTROL" },
            { key: null, label: "FRAMEWORKS", fkey: "fw" },
            { key: "src", label: "SOURCE", fkey: "src" },
            { key: "freq", label: "CHECK", fkey: "freq" },
            { key: "owner", label: "OWNER", fkey: "owner" },
            { key: "status", label: "STATUS", fkey: "status" },
          ].map((h) => {
            const f = h.fkey ? FILTERS[h.fkey] : null;
            const active = f && f.sel.length > 0;
            return (
              <div key={h.label} style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, userSelect: "none" }}>
                <span
                  onClick={h.key ? () => toggleSort(h.key) : undefined}
                  title={h.key ? "Click to sort" : undefined}
                  style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: sort.key === h.key ? C.ink : C.inkSoft, cursor: h.key ? "pointer" : "default", fontWeight: sort.key === h.key ? 700 : 400 }}>
                  {h.label}{sort.key === h.key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
                </span>
                {f && (
                  <button onClick={() => setOpenFilter(openFilter === h.fkey ? null : h.fkey)}
                    title={`Filter ${h.label.toLowerCase()}`} aria-label={`Filter ${h.label.toLowerCase()}`}
                    style={{ fontFamily: C.mono, fontSize: 10, lineHeight: 1, color: active ? "#fff" : C.inkSoft, background: active ? C.primary : "transparent", border: `1px solid ${active ? C.primary : C.line}`, borderRadius: 3, padding: "2px 4px", cursor: "pointer" }}>
                    ⧩{active ? ` ${f.sel.length}` : ""}
                  </button>
                )}
                {f && openFilter === h.fkey && (
                  <div ref={popRef} style={{ position: "absolute", top: "calc(100% + 7px)", left: 0, zIndex: 60, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 7, boxShadow: "0 8px 24px rgba(10,42,67,0.18)", padding: "8px 0", minWidth: 170 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.inkSoft, padding: "2px 12px 7px", borderBottom: `1px solid ${C.line}` }}>
                      FILTER {h.label}
                    </div>
                    {f.values.map((v) => {
                      const on = f.sel.includes(v);
                      return (
                        <div key={v} onClick={() => toggleVal(f, v)}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, color: C.ink, background: on ? C.primaryBg : "transparent" }}>
                          <span style={{ fontFamily: C.mono, fontSize: 12, color: on ? C.primary : C.inkSoft }}>{on ? "☑" : "☐"}</span>
                          {v}
                        </div>
                      );
                    })}
                    <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4, padding: "7px 12px 2px", display: "flex", gap: 10 }}>
                      <button onClick={() => f.set([])}
                        style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                        Clear
                      </button>
                      <button onClick={() => setOpenFilter(null)}
                        style={{ fontFamily: C.mono, fontSize: 10, color: C.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {list.map((c, i) => {
          const srcNames = srcsOf(c).map((k) => connectors.find((x) => x.key === k)?.name ?? k);
          const st = STATUS[c.status] ?? STATUS.pending;
          return (
            <React.Fragment key={c.code}>
              <div onClick={() => openControl(c)}
                style={{ display: "grid", gridTemplateColumns: "72px 1fr 140px 110px 92px 84px 100px", padding: "11px 16px", borderBottom: `1px solid ${C.line}`, alignItems: "center", background: open === c.code ? C.primaryBg : i % 2 ? "#FBFCFC" : C.panel, cursor: "pointer" }}>
                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.inkSoft }}>{c.code}</div>
                <div style={{ fontFamily: C.sans, fontSize: 13, color: C.ink, paddingRight: 8 }}>{c.name}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {c.fw.map((f) => {
                    const col = frameworks.find((x) => x.id === f)?.color ?? C.inkSoft; // unknown fw id must never crash the page
                    return <Chip key={f} label={f} fg={col} bg={`${col}14`} />;
                  })}
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.inkSoft }}>{srcNames.length ? srcNames.join(", ") : "—"}</div>
                <div title={c.freqNote ?? ""} style={{ fontFamily: C.mono, fontSize: 11, color: C.primary }}>{(c.freqLabel ?? "—").toUpperCase()}</div>
                <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.inkSoft }}>{c.owner}</div>
                <div><Chip label={st.l} fg={st.fg} bg={st.bg} /></div>
              </div>
              {open === c.code && (() => {
                // Why is this control in its current state, in plain language?
                const srcConns = srcsOf(c).map((k) => connectors.find((x) => x.key === k)).filter(Boolean);
                const liveConns = srcConns.filter((x) => x.connected);
                const deadConns = srcConns.filter((x) => !x.connected);
                let whyTone, whyTitle, whyText;
                if (c.status === "passing") {
                  whyTone = { fg: C.pass, bg: C.passBg };
                  whyTitle = "WHY IT'S PASSING";
                  whyText = `Evidence collected from ${liveConns.map((x) => x.name).join(" and ")} (below) shows the requirement is met. It stays passing as long as syncs keep returning this evidence — if the configuration regresses in the source system, the next sync will surface it.`;
                } else if (c.status === "syncing") {
                  whyTone = { fg: C.warn, bg: C.warnBg };
                  whyTitle = "WHY IT'S NOT PASSING YET";
                  whyText = `${liveConns.map((x) => x.name).join(" and ")} is connected, but no evidence for this control has been collected yet. Run "Sync now" in the Integration Hub. If evidence still doesn't appear, the requirement isn't actually met in ${liveConns.map((x) => x.name).join("/") || "the source system"} yet — follow the steps below, then sync again.`;
                } else {
                  whyTone = { fg: C.warn, bg: C.warnBg };
                  whyTitle = "WHY IT'S PENDING";
                  whyText = srcConns.length === 0
                    ? "This workspace has no system configured in this control's category, so there is nothing to collect evidence from. Ask your AllAttest operator to add the system you use."
                    : `${deadConns.map((x) => x.name).join(" and ")} isn't connected, so no evidence can be collected — nothing is verified either way. Connect it in the Integration Hub, then work through the steps below in the vendor console.`;
                }
                const stepEntries = Object.entries(c.guidance?.steps ?? {});
                return (
                  <div style={{ padding: "14px 16px 18px 88px", borderBottom: `1px solid ${C.line}`, background: "#FBFCFC" }}>
                    {c.guidance && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.inkSoft }}>WHAT THIS CONTROL REQUIRES</div>
                          {c.freqLabel && <Chip label={`AUTO-CHECKED ${c.freqLabel.toUpperCase()}`} fg={C.primary} bg={C.primaryBg} />}
                        </div>
                        <div style={{ fontFamily: C.sans, fontSize: 13, color: C.ink, lineHeight: 1.55, maxWidth: 720 }}>{c.guidance.requirement}</div>
                        <div style={{ fontFamily: C.sans, fontSize: 12, color: C.inkSoft, marginTop: 4, maxWidth: 720 }}>
                          <b style={{ color: C.pass }}>Passes when:</b> {c.guidance.passWhen}
                        </div>
                        {c.freqNote && (
                          <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.inkSoft, marginTop: 4, maxWidth: 720 }}>
                            <b>Why this cadence:</b> {c.freqNote}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ background: whyTone.bg, border: `1px solid ${whyTone.fg}33`, borderRadius: 6, padding: "10px 13px", marginBottom: 12, maxWidth: 720 }}>
                      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: whyTone.fg, marginBottom: 4 }}>{whyTitle}</div>
                      <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.ink, lineHeight: 1.55 }}>{whyText}</div>
                    </div>

                    <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.inkSoft, marginBottom: 8 }}>EVIDENCE ({evidence.length})</div>
                    {evidence.length === 0 && (
                      <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.inkSoft, marginBottom: 10 }}>None on file yet.</div>
                    )}
                    {evidence.map((e) => (
                      <div key={e.id} style={{ padding: "7px 0", borderTop: `1px solid ${C.line}`, maxWidth: 720 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Chip label={e.type.toUpperCase()} fg={C.primary} bg={C.primaryBg} />
                          <span style={{ fontFamily: C.sans, fontSize: 13, color: C.ink, fontWeight: 500 }}>{e.title}</span>
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, marginTop: 3 }}>{e.detail} · {new Date(e.collectedAt).toLocaleString()}</div>
                      </div>
                    ))}

                    {stepEntries.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: c.status === "passing" ? C.inkSoft : C.primary, marginBottom: 8 }}>
                          {c.status === "passing" ? "HOW TO KEEP IT PASSING" : "HOW TO MAKE IT PASS"}
                        </div>
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                          {stepEntries.map(([key, steps]) => {
                            const vendor = connectors.find((x) => x.key === key)?.name ?? key;
                            return (
                              <div key={key} style={{ flex: "1 1 300px", maxWidth: 420, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 13px" }}>
                                <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.ink, fontWeight: 600, marginBottom: 6 }}>IN {vendor.toUpperCase()}</div>
                                <ol style={{ margin: 0, paddingLeft: 16 }}>
                                  {steps.map((s, i) => (
                                    <li key={i} style={{ fontFamily: C.sans, fontSize: 12, color: C.ink, lineHeight: 1.5, marginBottom: 5 }}>{s}</li>
                                  ))}
                                </ol>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </React.Fragment>
          );
        })}
      </Panel>
    </div>
  );
}

/* ---------- Login ---------- */
function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true); setErr(null);
    try {
      const { token, user, tenant } = await api.login(email.trim(), password);
      setToken(token);
      onSignedIn({ user, tenant });
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const input = { width: "100%", boxSizing: "border-box", fontFamily: C.sans, fontSize: 14, padding: "11px 13px", border: `1px solid ${C.line}`, borderRadius: 7, outline: "none", color: C.ink, background: "#fff" };

  return (
    <div style={{ minHeight: "100vh", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.sans, padding: 20 }}>
      <div style={{ width: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, justifyContent: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono, fontSize: 17, color: "#fff" }}>✓</div>
          <div>
            <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 19, color: "#fff" }}>AllAttest</div>
            <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.navySoft, letterSpacing: "0.12em" }}>COMPLIANCE, RUN BY AGENTS</div>
          </div>
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 26 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.14em", color: C.inkSoft }}>SIGN IN</div>
          <div style={{ fontFamily: C.sans, fontSize: 17, fontWeight: 600, color: C.ink, marginTop: 3, marginBottom: 16 }}>Welcome back</div>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Email" style={input} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Password" style={{ ...input, marginTop: 10 }} />
          {err && <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.fail, marginTop: 10 }}>{err}</div>}
          <button onClick={submit} disabled={busy}
            style={{ width: "100%", marginTop: 14, fontFamily: C.mono, fontSize: 12.5, letterSpacing: "0.04em", color: "#fff", background: busy ? C.inkSoft : C.primary, border: "none", padding: "12px 0", borderRadius: 7, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
        <div style={{ marginTop: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.12em", color: C.navySoft, marginBottom: 7 }}>DEMO LOGINS (npm run seed)</div>
          {[
            ["Platform operator", "rajesh@allattest.com", "ops-demo-2026"],
            ["Assure Agent, Inc.", "sravanthi@assureagent.com", "assure-demo"],
            ["Synergy Technologies", "raj@synergytechs.net", "synergy-demo"],
          ].map(([who, em, pw]) => (
            <div key={em} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: C.mono, fontSize: 10.5, color: "#C8D5DF", padding: "2.5px 0" }}>
              <span style={{ color: C.navySoft }}>{who}</span>
              <span>{em} / {pw}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin Console (platform operator) ----------
   Cross-tenant operator view: platform overview, tenant register with
   live metrics, provisioning (optionally with the tenant's first login),
   user management, suspend/resume, and a cross-tenant activity feed.
   Reachable only by operator-role sessions — the server enforces it. */
function AdminConsole({ onOpenWorkspace, onTenantsChanged }) {
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [colors, setColors] = useState([]);
  const [color, setColor] = useState(null);
  const [catalog, setCatalog] = useState(null); // platform compliance types + systems
  const [selFw, setSelFw] = useState([]);
  const [selSys, setSelSys] = useState([]);
  const [synclog, setSynclog] = useState([]);
  const [issued, setIssued] = useState(null); // one-time credentials to hand off

  const load = useCallback(async () => {
    try {
      const [ov, ts, us, act, sl] = await Promise.all([api.adminOverview(), api.adminTenants(), api.adminUsers(), api.adminActivity(), api.adminSyncLog()]);
      setOverview(ov); setRows(ts); setUsers(us); setActivity(act); setSynclog(sl); setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!creating) return;
    if (colors.length === 0) api.tenantColors().then((cs) => { setColors(cs); setColor(cs[0]); }).catch(() => {});
    if (!catalog) api.adminCatalog().then((cat) => {
      setCatalog(cat);
      setSelFw(cat.frameworks.map((f) => f.id)); // default: everything on; operator trims
      setSelSys(cat.categories.flatMap((c) => c.systems.map((s) => s.key)));
    }).catch((e) => setErr(e.message));
  }, [creating, colors.length, catalog]);

  const act = async (fn, id) => {
    setBusy(id);
    try { await fn(id); await load(); onTenantsChanged?.(); } catch (e) { setErr(e.message); }
    setBusy(null);
  };

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const provision = async () => {
    if (!selFw.length) { setErr("Pick at least one compliance type"); return; }
    try {
      const { tenant, login } = await api.adminCreateTenant({
        name, color, adminEmail: adminEmail.trim() || undefined,
        frameworks: selFw, systems: selSys,
      });
      if (login) setIssued({ context: `First login for ${tenant.name}`, ...login });
      setName(""); setAdminEmail(""); setCreating(false); setErr(null);
      await load(); onTenantsChanged?.();
    } catch (e) { setErr(e.message); }
  };

  const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div>
      <SectionTitle kicker="PLATFORM OPERATOR" title="Admin Console"
        right={<button onClick={load} style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, background: "transparent", border: `1px solid ${C.line}`, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>Refresh</button>} />

      {err && (
        <Panel style={{ padding: 12, borderColor: C.fail, marginBottom: 14 }}>
          <div style={{ fontFamily: C.sans, fontSize: 13, color: C.fail }}>{err}</div>
        </Panel>
      )}

      {issued && (
        <Panel style={{ padding: 16, borderColor: C.primary, marginBottom: 14, background: C.primaryBg }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", color: C.primary }}>CREDENTIALS ISSUED — SHOWN ONCE</div>
              <div style={{ fontFamily: C.sans, fontSize: 13, color: C.ink, marginTop: 5 }}>{issued.context}</div>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: C.ink, marginTop: 6 }}>
                {issued.email} &nbsp;/&nbsp; <b>{issued.password}</b>
              </div>
              <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.inkSoft, marginTop: 5 }}>
                Copy this password now — it isn't stored and can only be reset, not recovered.
              </div>
            </div>
            <button onClick={() => setIssued(null)}
              style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, background: "transparent", border: `1px solid ${C.line}`, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>
              Dismiss
            </button>
          </div>
        </Panel>
      )}

      {overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          {[
            { k: "TENANTS", v: overview.tenants.total, sub: `${overview.tenants.active} active · ${overview.tenants.suspended} suspended`, col: C.ink },
            { k: "USERS", v: overview.users, sub: "operator + tenant logins", col: C.ink },
            { k: "CONTROLS PASSING", v: `${overview.controlsPassing}`, sub: `of ${overview.controlsTotal} platform-wide`, col: C.pass },
            { k: "INTEGRATIONS LIVE", v: `${overview.connectorsLive}`, sub: `of ${overview.connectorsTotal} configured`, col: C.ink },
            { k: "EVIDENCE ITEMS", v: overview.evidenceCount, sub: "collected across tenants", col: C.primary },
            { k: "AGENT RUNS", v: overview.agentRuns, sub: "logged to activity", col: C.ink },
          ].map((s) => (
            <Panel key={s.k} style={{ padding: 16 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", color: C.inkSoft }}>{s.k}</div>
              <div style={{ fontFamily: C.mono, fontSize: 27, color: s.col, marginTop: 5 }}>{s.v}</div>
              <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.inkSoft, marginTop: 2 }}>{s.sub}</div>
            </Panel>
          ))}
        </div>
      )}

      {/* tenant register */}
      <Panel style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft }}>TENANTS ({rows.length})</div>
          <button onClick={() => setCreating((c) => !c)}
            style={{ fontFamily: C.mono, fontSize: 11, color: creating ? C.inkSoft : C.primary, background: "transparent", border: `1px dashed ${creating ? C.line : C.primary}`, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}>
            {creating ? "Cancel onboarding" : "+ Onboard tenant"}
          </button>
        </div>

        {creating && (
          <div style={{ padding: "16px", borderBottom: `1px solid ${C.line}`, background: "#FBFCFC" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name"
                style={{ fontFamily: C.sans, fontSize: 13, padding: "8px 11px", border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", color: C.ink, width: 210 }} />
              <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="First login email (optional)"
                style={{ fontFamily: C.sans, fontSize: 13, padding: "8px 11px", border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", color: C.ink, width: 210 }} />
              <div style={{ display: "flex", gap: 5 }}>
                {colors.map((col) => (
                  <button key={col} onClick={() => setColor(col)} aria-label={`accent ${col}`}
                    style={{ width: 19, height: 19, borderRadius: 4, background: col, border: color === col ? `2px solid ${C.ink}` : "2px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
            </div>

            {catalog && (
              <>
                <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.inkSoft, margin: "14px 0 7px" }}>
                  COMPLIANCE TYPES — what is this tenant pursuing?
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {catalog.frameworks.map((f) => {
                    const on = selFw.includes(f.id);
                    return (
                      <button key={f.id} onClick={() => toggle(selFw, setSelFw, f.id)}
                        style={{ fontFamily: C.mono, fontSize: 11, padding: "6px 12px", borderRadius: 5, cursor: "pointer", background: on ? `${f.color}18` : "transparent", color: on ? f.color : C.inkSoft, border: `1.5px solid ${on ? f.color : C.line}` }}>
                        {on ? "✓ " : ""}{f.name}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.inkSoft, margin: "14px 0 7px" }}>
                  SYSTEMS — what does this tenant actually use? Controls & integrations are stamped from these.
                  Evidence check cadence is set per control by its framework requirements (daily → quarterly), not per tenant.
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {catalog.categories.map((cat) => (
                    <div key={cat.id}>
                      <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.inkSoft, marginBottom: 5 }}>{cat.name.toUpperCase()}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {cat.systems.map((s) => {
                          const on = selSys.includes(s.key);
                          return (
                            <button key={s.key} onClick={() => toggle(selSys, setSelSys, s.key)}
                              style={{ fontFamily: C.sans, fontSize: 12, padding: "6px 11px", borderRadius: 5, cursor: "pointer", background: on ? C.primaryBg : "transparent", color: on ? C.primary : C.inkSoft, border: `1.5px solid ${on ? C.primary : C.line}` }}>
                              {on ? "✓ " : ""}{s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={provision}
                style={{ fontFamily: C.mono, fontSize: 11.5, color: "#fff", background: C.primary, border: "none", padding: "9px 18px", borderRadius: 5, cursor: "pointer" }}>
                Provision tenant
              </button>
              <div style={{ fontFamily: C.sans, fontSize: 12, color: C.inkSoft, alignSelf: "center" }}>
                {selFw.length} compliance type{selFw.length === 1 ? "" : "s"} · {selSys.length} system{selSys.length === 1 ? "" : "s"} selected
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 95px 1.3fr 85px 100px 100px 90px 165px", padding: "9px 16px", borderBottom: `1px solid ${C.line}` }}>
          {["TENANT", "CREATED", "READINESS", "CONTROLS", "INTEGRATIONS", "AUTO-SYNC", "STATUS", "ACTIONS"].map((h) => (
            <div key={h} style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.inkSoft }}>{h}</div>
          ))}
        </div>
        {rows.map((t, i) => {
          const suspended = t.status === "suspended";
          const autoOn = t.autoSync !== false;
          const m = t.metrics;
          return (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 95px 1.3fr 85px 100px 100px 90px 165px", padding: "12px 16px", borderBottom: `1px solid ${C.line}`, alignItems: "center", background: i % 2 ? "#FBFCFC" : C.panel, opacity: suspended ? 0.75 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, paddingRight: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: C.sans, fontSize: 13.5, fontWeight: 600, color: C.ink }}>{t.name}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft }}>{t.id}</div>
                </div>
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>{fmtDate(t.createdAt)}</div>
              <div style={{ display: "flex", gap: 10, paddingRight: 10 }}>
                {m.frameworks.map((f) => (
                  <div key={f.id} style={{ flex: 1, minWidth: 54 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 9.5, color: C.inkSoft }}>
                      <span>{f.id}</span><span style={{ color: f.color }}>{f.pct}%</span>
                    </div>
                    <div style={{ marginTop: 3, height: 5, background: C.paper, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${f.pct}%`, height: "100%", background: f.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.pass }}>{m.controlsPassing}<span style={{ color: C.inkSoft }}> / {m.controlsTotal}</span></div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.ink }}>{m.connectorsLive}<span style={{ color: C.inkSoft }}> / {m.connectorsTotal}</span></div>
              <div style={{ paddingRight: 8 }}>
                <button disabled={suspended || busy === `as:${t.id}`} title={autoOn ? "Scheduled syncs on — click for manual-only" : "Manual-only — tenant runs Sync now themselves; click to re-enable"}
                  onClick={() => act(() => api.adminSetAutoSync(t.id, !autoOn), `as:${t.id}`)}
                  style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.04em", color: autoOn ? C.primary : C.warn, background: autoOn ? C.primaryBg : C.warnBg, border: `1px solid ${autoOn ? C.primary : C.warn}44`, padding: "5px 9px", borderRadius: 4, cursor: suspended ? "default" : "pointer", whiteSpace: "nowrap" }}>
                  {busy === `as:${t.id}` ? "…" : autoOn ? "● ON" : "○ MANUAL"}
                </button>
              </div>
              <div><Chip label={suspended ? "SUSPENDED" : "ACTIVE"} fg={suspended ? C.fail : C.pass} bg={suspended ? C.failBg : C.passBg} /></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onOpenWorkspace(t)} disabled={suspended}
                  style={{ fontFamily: C.mono, fontSize: 10.5, color: suspended ? C.inkSoft : C.primary, background: "transparent", border: `1px solid ${suspended ? C.line : C.primary}`, padding: "5px 10px", borderRadius: 4, cursor: suspended ? "default" : "pointer" }}>
                  Open
                </button>
                <button onClick={() => act(suspended ? api.adminResume : api.adminSuspend, t.id)} disabled={busy === t.id}
                  style={{ fontFamily: C.mono, fontSize: 10.5, color: suspended ? "#fff" : C.fail, background: suspended ? C.primary : "transparent", border: `1px solid ${suspended ? C.primary : C.fail}`, padding: "5px 10px", borderRadius: 4, cursor: "pointer" }}>
                  {busy === t.id ? "…" : suspended ? "Resume" : "Suspend"}
                </button>
              </div>
            </div>
          );
        })}
      </Panel>

      {/* user management */}
      <UsersPanel users={users} tenants={rows} onChanged={load} onIssued={setIssued} onError={setErr} />

      {/* cross-tenant sync transactions */}
      <Panel style={{ marginTop: 16, padding: 18 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft, marginBottom: 10 }}>SYNC ACTIVITY — ALL TENANTS ({synclog.length})</div>
        {synclog.length === 0 && (
          <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft }}>No sync transactions yet.</div>
        )}
        {synclog.slice(0, 15).map((s) => {
          const t = rows.find((r) => r.id === s.tenantId);
          return (
            <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "7px 0", borderTop: `1px solid ${C.line}` }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t?.color ?? C.line, flexShrink: 0 }} />
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, width: 170, flexShrink: 0 }}>{s.tenantName}</span>
              <span style={{ fontFamily: C.sans, fontSize: 12.5, color: C.ink, width: 140, flexShrink: 0 }}>{s.connectorName}</span>
              <Chip label={TRIGGER_LABEL[s.trigger] ?? s.trigger?.toUpperCase()} fg={s.trigger === "scheduled" ? C.primary : C.inkSoft} bg={s.trigger === "scheduled" ? C.primaryBg : C.paper} />
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, flex: 1 }}>{s.ok ? `${s.items} items` : `failed: ${s.error}`}</span>
              <Chip label={s.ok ? "OK" : "FAILED"} fg={s.ok ? C.pass : C.fail} bg={s.ok ? C.passBg : C.failBg} />
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft }}>{new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          );
        })}
      </Panel>

      {/* cross-tenant activity */}
      <Panel style={{ marginTop: 16, padding: 18 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft, marginBottom: 10 }}>PLATFORM ACTIVITY</div>
        {activity.length === 0 && (
          <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft }}>No agent activity across the platform yet.</div>
        )}
        {activity.map((a) => {
          const t = rows.find((r) => r.id === a.tenantId);
          return (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t?.color ?? C.line, flexShrink: 0 }} />
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, width: 180, flexShrink: 0 }}>{a.tenantName}</span>
              <Chip label={a.agent.toUpperCase()} fg={C.agent} bg={C.agentBg} />
              <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft, flex: 1 }}>{a.summary}</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>{fmtWhen(a.at)}</div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

/* ---------- Admin Console: user management panel ---------- */
function UsersPanel({ users, tenants, onChanged, onIssued, onError }) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("tenant");
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(null);

  const reset = () => { setAdding(false); setEmail(""); setName(""); setRole("tenant"); setTenantId(""); };

  const create = async () => {
    try {
      const { user, password } = await api.adminCreateUser({
        email: email.trim(), name: name.trim() || undefined, role,
        tenantId: role === "tenant" ? (tenantId || tenants[0]?.id) : undefined,
      });
      onIssued({ context: `New ${user.role === "operator" ? "operator" : "tenant"} login${user.tenantId ? ` for ${tenants.find((t) => t.id === user.tenantId)?.name ?? user.tenantId}` : ""}`, email: user.email, password });
      reset(); onError(null); await onChanged();
    } catch (e) { onError(e.message); }
  };

  const doReset = async (u) => {
    setBusy(u.id);
    try {
      const { password } = await api.adminResetPassword(u.id);
      onIssued({ context: `Password reset for ${u.email}`, email: u.email, password });
      onError(null);
    } catch (e) { onError(e.message); }
    setBusy(null);
  };

  const remove = async (u) => {
    setBusy(u.id);
    try { await api.adminDeleteUser(u.id); onError(null); await onChanged(); } catch (e) { onError(e.message); }
    setBusy(null);
  };

  const sel = { fontFamily: C.sans, fontSize: 12.5, padding: "7px 8px", border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", color: C.ink, background: "#fff" };

  return (
    <Panel style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.12em", color: C.inkSoft }}>USERS ({users.length})</div>
        {!adding ? (
          <button onClick={() => setAdding(true)}
            style={{ fontFamily: C.mono, fontSize: 11, color: C.primary, background: "transparent", border: `1px dashed ${C.primary}`, padding: "6px 12px", borderRadius: 5, cursor: "pointer" }}>
            + Add login
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com"
              style={{ fontFamily: C.sans, fontSize: 12.5, padding: "7px 10px", border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", color: C.ink, width: 180 }} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)"
              style={{ fontFamily: C.sans, fontSize: 12.5, padding: "7px 10px", border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", color: C.ink, width: 130 }} />
            <select value={role} onChange={(e) => setRole(e.target.value)} style={sel}>
              <option value="tenant">Tenant user</option>
              <option value="operator">Platform operator</option>
            </select>
            {role === "tenant" && (
              <select value={tenantId || tenants[0]?.id || ""} onChange={(e) => setTenantId(e.target.value)} style={sel}>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button onClick={create}
              style={{ fontFamily: C.mono, fontSize: 11, color: "#fff", background: C.primary, border: "none", padding: "7px 12px", borderRadius: 5, cursor: "pointer" }}>
              Create login
            </button>
            <button onClick={reset}
              style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, background: "transparent", border: `1px solid ${C.line}`, padding: "7px 10px", borderRadius: 5, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr 110px 150px", padding: "9px 16px", borderBottom: `1px solid ${C.line}` }}>
        {["EMAIL", "NAME", "WORKSPACE", "ROLE", "ACTIONS"].map((h) => (
          <div key={h} style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.inkSoft }}>{h}</div>
        ))}
      </div>
      {users.map((u, i) => {
        const op = u.role === "operator";
        return (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr 110px 150px", padding: "10px 16px", borderBottom: `1px solid ${C.line}`, alignItems: "center", background: i % 2 ? "#FBFCFC" : C.panel }}>
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.ink, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft }}>{u.name}</div>
            <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.inkSoft }}>{op ? "—" : u.tenantName}</div>
            <div><Chip label={op ? "OPERATOR" : "TENANT"} fg={op ? C.navy : C.primary} bg={op ? "#E3EAF0" : C.primaryBg} /></div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => doReset(u)} disabled={busy === u.id}
                style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, background: "transparent", border: `1px solid ${C.line}`, padding: "5px 9px", borderRadius: 4, cursor: "pointer" }}>
                {busy === u.id ? "…" : "Reset pw"}
              </button>
              <button onClick={() => remove(u)} disabled={busy === u.id}
                style={{ fontFamily: C.mono, fontSize: 10.5, color: C.fail, background: "transparent", border: `1px solid ${C.fail}`, padding: "5px 9px", borderRadius: 4, cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

/* ---------- Tenant switcher (operator only; onboarding lives in the console) ---------- */
function TenantSwitcher({ tenants, current, onSwitch }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.sans, fontSize: 13, color: "#fff", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", padding: "7px 12px", borderRadius: 6, cursor: "pointer" }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: current?.color ?? "#fff" }} />
        {current ? current.name : "Select workspace"}
        <span style={{ fontFamily: C.mono, fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 280, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(10,42,67,0.18)", zIndex: 50, overflow: "hidden" }}>
          <div style={{ padding: "9px 12px", fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>WORKSPACES</div>
          {tenants.map((t) => (
            <button key={t.id} onClick={() => { onSwitch(t); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "10px 12px", background: current?.id === t.id ? C.primaryBg : "transparent", border: "none", cursor: "pointer", fontFamily: C.sans, fontSize: 13.5, color: C.ink }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: t.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{t.name}</span>
              {t.status === "suspended" && <Chip label="SUSPENDED" fg={C.fail} bg={C.failBg} />}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "9px 12px", fontFamily: C.sans, fontSize: 11.5, color: C.inkSoft }}>
            Onboard new tenants from the Admin Console.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Shell ---------- */
const NAV = [
  { id: "dash", label: "Dashboard" },
  { id: "agents", label: "AI Agents" },
  { id: "hub", label: "Integration Hub" },
  { id: "controls", label: "Controls" },
];

export default function App() {
  // session: undefined = restoring from stored token, null = signed out
  const [session, setSession] = useState(undefined);
  const [view, setView] = useState("dash");
  const [adminMode, setAdminMode] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [tenant, setTenantState] = useState(null);
  const [data, setData] = useState(null);
  const [agents, setAgents] = useState([]);
  const [err, setErr] = useState(null);

  const isOperator = session?.user?.role === "operator";

  const signOut = useCallback(() => {
    api.logout().catch(() => {});
    setToken(null);
    setSession(null);
    setAdminMode(false); setView("dash");
    setTenants([]); setTenantState(null); setData(null); setErr(null);
  }, []);

  const reloadTenants = useCallback(() => api.tenants().then(setTenants).catch(() => {}), []);

  const refresh = useCallback(async () => {
    try {
      const [frameworks, controls, connectors, activity] = await Promise.all([
        api.frameworks(), api.controls(), api.connectors(), api.activity(),
      ]);
      setData({ frameworks, controls, connectors, activity });
      setErr(null);
    } catch (e) {
      if (/sign in required/i.test(e.message)) return signOut(); // session expired
      setErr(e.message);
    }
  }, [signOut]);

  const switchTenant = useCallback((t) => {
    setTenant(t.id);
    setTenantState(t);
    setData(null);
    setView("dash");
    refresh();
  }, [refresh]);

  // Boot: restore the session from a stored token, if any.
  useEffect(() => {
    if (!hasToken()) { setSession(null); return; }
    api.me().then(setSession).catch(() => { setToken(null); setSession(null); });
  }, []);

  // After sign-in, route by role: operators land in the Admin Console,
  // tenant users go straight into their own workspace.
  useEffect(() => {
    if (!session?.user) return;
    api.agents().then(setAgents).catch(() => {});
    if (session.user.role === "operator") {
      setAdminMode(true);
      reloadTenants();
    } else {
      setTenants(session.tenant ? [session.tenant] : []);
      if (session.tenant) switchTenant(session.tenant);
    }
  }, [session, reloadTenants, switchTenant]);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", background: C.navy }} />;
  }
  if (!session) {
    return <Login onSignedIn={setSession} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paper, fontFamily: C.sans }}>
      <div style={{ background: C.navy, padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1180, margin: "0 auto", height: 58, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono, fontSize: 13, color: "#fff" }}>✓</div>
            <div>
              <span style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 15, color: "#fff" }}>AllAttest</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.navySoft, marginLeft: 10, letterSpacing: "0.1em" }}>COMPLIANCE, RUN BY AGENTS</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isOperator && !adminMode && (
              <button onClick={() => setAdminMode(true)}
                style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.08em", color: "#fff", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.35)", padding: "7px 12px", borderRadius: 6, cursor: "pointer" }}>
                <span style={{ fontSize: 12 }}>←</span> ADMIN CONSOLE
              </button>
            )}
            {isOperator && !adminMode && <TenantSwitcher tenants={tenants} current={tenant} onSwitch={switchTenant} />}
            {!isOperator && tenant && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: C.sans, fontSize: 13, color: "#fff", padding: "7px 12px", borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)" }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: tenant.color }} />
                {tenant.name}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.18)" }}>
              <span style={{ fontFamily: C.sans, fontSize: 12.5, color: C.navySoft }}>{session.user.name}</span>
              <button onClick={signOut}
                style={{ fontFamily: C.mono, fontSize: 10.5, color: C.navySoft, background: "transparent", border: "1px solid rgba(255,255,255,0.22)", padding: "6px 10px", borderRadius: 5, cursor: "pointer" }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
      {adminMode ? (
        <div style={{ background: "#0F3A5C", padding: "0 20px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "9px 0", fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", color: "#BFD2E0" }}>
            ADMIN CONSOLE — PLATFORM OPERATOR VIEW · TENANT WORKSPACES ARE ISOLATED
          </div>
        </div>
      ) : (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.line}`, padding: "0 20px" }}>
          <div style={{ display: "flex", gap: 4, maxWidth: 1180, margin: "0 auto" }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setView(n.id)}
                style={{ fontFamily: C.sans, fontSize: 13.5, fontWeight: view === n.id ? 600 : 400, color: view === n.id ? C.ink : C.inkSoft, background: "transparent", border: "none", cursor: "pointer", padding: "13px 14px", borderBottom: `2px solid ${view === n.id ? C.primary : "transparent"}` }}>
                {n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 60px" }}>
        <ErrorBoundary resetKey={`${adminMode}:${tenant?.id}:${view}`}>
        {adminMode ? (
          <AdminConsole
            onOpenWorkspace={(t) => { setAdminMode(false); switchTenant(t); }}
            onTenantsChanged={reloadTenants}
          />
        ) : (
          <>
            {err && /suspended/i.test(err) && (
              <Panel style={{ padding: 24, borderColor: C.fail, marginBottom: 16 }}>
                <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", color: C.fail }}>WORKSPACE SUSPENDED</div>
                <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 6 }}>
                  {tenant ? tenant.name : "This workspace"} has been suspended by the platform operator.
                </div>
                <div style={{ fontFamily: C.sans, fontSize: 13, color: C.inkSoft, marginTop: 4 }}>
                  All workspace access is blocked while suspended. {isOperator ? "Reactivate it from the Admin Console." : "Contact AllAttest support."}
                </div>
              </Panel>
            )}
            {err && !/suspended/i.test(err) && (
              <Panel style={{ padding: 16, borderColor: C.fail, marginBottom: 16 }}>
                <div style={{ fontFamily: C.sans, fontSize: 13.5, color: C.fail }}>
                  Can't reach the API ({err}). Start it with <code style={{ fontFamily: C.mono }}>cd server && npm run dev</code>, then refresh.
                </div>
              </Panel>
            )}
            {!data && !err && <div style={{ fontFamily: C.mono, fontSize: 12, color: C.inkSoft }}>loading…</div>}
            {data && tenant && view === "dash" && <Dashboard data={data} tenant={tenant} refresh={refresh} />}
            {data && tenant && view === "agents" && <Agents agents={agents} tenant={tenant} refresh={refresh} />}
            {data && tenant && view === "hub" && <Hub data={data} tenant={tenant} refresh={refresh} />}
            {data && tenant && view === "controls" && <Controls data={data} tenant={tenant} />}
          </>
        )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
