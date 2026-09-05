"use client";

import { useEffect, useState, useCallback } from "react";
import { RunwayChart } from "@/components/RunwayChart";
import { AgentLoopStrip } from "@/components/AgentLoopStrip";

type Snapshot = { date: string; projectedBalance: number; confidence: number };
type ActionRow = {
  id: string;
  type: string;
  amount: number;
  status: string;
  reason: string;
  approval: { id: string; decision: string } | null;
};
type AgentRun = {
  id: string;
  createdAt: string;
  shortfallDetected: boolean;
  snapshots: Snapshot[];
  actions: ActionRow[];
};
type Payable = {
  id: string;
  amount: number;
  status: string;
  dueDate: string;
  vendor: { name: string; criticality: string };
};
type AuditLogRow = { id: string; actorType: string; action: string; createdAt: string; payload: any };

export default function Dashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [merchantName, setMerchantName] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"dashboard" | "payables" | "approvals" | "audit" | "metrics">("dashboard");
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("runwayguard_token");
    if (saved) setToken(saved);
  }, []);

  const authedFetch = useCallback(
    (url: string, opts: RequestInit = {}) =>
      fetch(url, {
        ...opts,
        headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${token}` },
      }),
    [token]
  );

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      const [runRes, payRes, logRes, apprRes, metricsRes] = await Promise.all([
        authedFetch("/api/agent-run").then((r) => r.json()),
        authedFetch("/api/payables").then((r) => r.json()),
        authedFetch("/api/audit-log").then((r) => r.json()),
        authedFetch("/api/approvals").then((r) => r.json()),
        authedFetch("/api/metrics").then((r) => r.json()),
      ]);
      if (metricsRes.metrics) setMetrics(metricsRes.metrics);
      if (runRes.error) throw new Error(runRes.error);
      if (runRes.merchant) setMerchantName(runRes.merchant.name);
      if (runRes.runs) setRuns(runRes.runs);
      if (payRes.payables) setPayables(payRes.payables);
      if (logRes.logs) setLogs(logRes.logs);
      if (apprRes.approvals) setApprovals(apprRes.approvals);
    } catch (e: any) {
      if (e.message?.includes("token") || e.message?.includes("Authorization")) {
        setToken(null);
        sessionStorage.removeItem("runwayguard_token");
      }
      setError(e.message ?? "Could not load data.");
    }
  }, [token, authedFetch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const login = async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      sessionStorage.setItem("runwayguard_token", data.token);
      setToken(data.token);
      setMerchantName(data.merchantName);
    } catch (e: any) {
      setLoginError(e.message ?? "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("runwayguard_token");
    setToken(null);
  };

  const runAgent = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/agent-run", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadAll();
    } catch (e: any) {
      setError(e.message ?? "Agent run failed");
    } finally {
      setLoading(false);
    }
  };

  const decide = async (approvalId: string, decision: "approved" | "rejected") => {
    await authedFetch("/api/approvals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, decision }),
    });
    await loadAll();
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-sm p-6 rounded-lg border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="font-display text-xl font-bold mb-1">RunwayGuard</div>
          <div className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>Merchant sign-in</div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            className="w-full px-3 py-2 rounded-md text-sm mb-3 font-mono"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          {loginError && <div className="text-xs mb-3" style={{ color: "var(--accent-risk)" }}>{loginError}</div>}
          <button
            onClick={login}
            disabled={loggingIn}
            className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent-safe)", color: "#04140c" }}
          >
            {loggingIn ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    );
  }

  const latestRun = runs[0];
  const loopStage = !latestRun ? -1 : latestRun.actions.length > 0 ? 4 : latestRun.shortfallDetected ? 2 : 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div
        className="w-full px-4 py-2 text-center text-xs font-mono font-medium"
        style={{ background: "var(--accent-watch)", color: "#1a1200" }}
      >
        DEMO MODE — Simulated payment actions. No real money is moved.
      </div>
      <div className="flex flex-1 min-h-0">
      <aside className="w-56 shrink-0 border-r flex flex-col" style={{ borderColor: "var(--border)" }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="font-display text-lg font-bold tracking-tight">RunwayGuard</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{merchantName || "—"}</div>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 text-sm">
          {[
            ["dashboard", "Command Center"],
            ["payables", "Payables"],
            ["approvals", `Approvals${approvals.length ? ` (${approvals.length})` : ""}`],
            ["audit", "Audit Log"],
            ["metrics", "Metrics"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className="text-left px-3 py-2 rounded-md transition-colors"
              style={{
                background: tab === key ? "var(--surface-raised)" : "transparent",
                color: tab === key ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>MODE: MOCK</span>
          <button onClick={logout} className="text-[10px] font-mono underline" style={{ color: "var(--text-muted)" }}>Sign out</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-8 py-6 overflow-y-auto">
        {error && (
          <div className="mb-4 px-4 py-2 rounded-md text-sm" style={{ background: "rgba(229,72,77,0.1)", color: "var(--accent-risk)" }}>
            {error}
          </div>
        )}

        {tab === "dashboard" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold">Agent Command Center</h1>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                  14-day cash forecast, guardrail decisions, and autonomous protective actions.
                </p>
              </div>
              <button
                onClick={runAgent}
                disabled={loading}
                className="px-4 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ background: "var(--accent-safe)", color: "#04140c" }}
              >
                {loading ? "Running..." : "Run Agent Cycle"}
              </button>
            </div>

            <div className="p-4 rounded-lg border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <AgentLoopStrip activeIndex={loopStage} />
            </div>

            <div className="p-5 rounded-lg border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <h2 className="font-display text-sm font-semibold mb-4" style={{ color: "var(--text-muted)" }}>RUNWAY FORECAST</h2>
              <RunwayChart snapshots={latestRun?.snapshots ?? []} />
              {latestRun && (
                <div className="mt-3 text-sm font-mono">
                  Shortfall detected:{" "}
                  <span style={{ color: latestRun.shortfallDetected ? "var(--accent-risk)" : "var(--accent-safe)" }}>
                    {latestRun.shortfallDetected ? "YES" : "NO"}
                  </span>
                </div>
              )}
            </div>

            {latestRun && latestRun.actions.length > 0 && (
              <div className="p-5 rounded-lg border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <h2 className="font-display text-sm font-semibold mb-4" style={{ color: "var(--text-muted)" }}>AGENT ACTIONS — LATEST RUN</h2>
                <div className="flex flex-col gap-3">
                  {latestRun.actions.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-4 pb-3 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <div className="flex-1">
                        <div className="font-mono text-sm">₹{a.amount.toLocaleString("en-IN")} — {a.type.replace("_", " ")}</div>
                        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{a.reason}</div>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "payables" && (
          <div>
            <h1 className="font-display text-2xl font-bold mb-6">Payables</h1>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="pb-2 font-medium">Vendor</th>
                  <th className="pb-2 font-medium">Criticality</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Due</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {payables.map((p) => (
                  <tr key={p.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-sans">{p.vendor.name}</td>
                    <td className="py-2.5">{p.vendor.criticality}</td>
                    <td className="py-2.5">₹{p.amount.toLocaleString("en-IN")}</td>
                    <td className="py-2.5">{new Date(p.dueDate).toISOString().slice(0, 10)}</td>
                    <td className="py-2.5"><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {tab === "approvals" && (
          <div>
            <h1 className="font-display text-2xl font-bold mb-6">Approval Queue</h1>
            {approvals.length === 0 && <p style={{ color: "var(--text-muted)" }}>Nothing pending. Actions land here when they exceed policy limits.</p>}
            <div className="flex flex-col gap-4">
              {approvals.map((appr) => (
                <div key={appr.id} className="p-4 rounded-lg border flex items-start justify-between gap-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div>
                    <div className="font-mono text-sm">₹{appr.agentAction.amount.toLocaleString("en-IN")} — {appr.agentAction.type.replace("_", " ")}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{appr.agentAction.reason}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => decide(appr.id, "approved")} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--accent-safe)", color: "#04140c" }}>Approve</button>
                    <button onClick={() => decide(appr.id, "rejected")} className="px-3 py-1.5 rounded-md text-xs font-medium border" style={{ borderColor: "var(--accent-risk)", color: "var(--accent-risk)" }}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div>
            <h1 className="font-display text-2xl font-bold mb-6">Audit Log</h1>
            <div className="flex flex-col gap-2 font-mono text-xs">
              {logs.map((l) => (
                <div key={l.id} className="flex gap-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <span style={{ color: "var(--text-muted)" }}>{new Date(l.createdAt).toISOString().slice(0, 19).replace("T", " ")}</span>
                  <span style={{ color: "var(--accent-safe)" }}>[{l.actorType}]</span>
                  <span>{l.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "metrics" && (
          <div>
            <h1 className="font-display text-2xl font-bold mb-6">Metrics</h1>
            {!metrics && <p style={{ color: "var(--text-muted)" }}>No data yet.</p>}
            {metrics && (
              <div className="grid grid-cols-3 gap-4">
                <MetricCard label="Forecast runs" value={metrics.forecastRunsTotal} />
                <MetricCard label="Shortfalls detected" value={metrics.shortfallsDetected} />
                <MetricCard label="Actions proposed" value={metrics.actionsProposedTotal} />
                <MetricCard label="Auto-executed" value={metrics.actionsAutoExecuted} color="var(--accent-safe)" />
                <MetricCard label="Escalated" value={metrics.actionsEscalated} color="var(--accent-watch)" />
                <MetricCard label="Rejected" value={metrics.actionsRejected} color="var(--accent-risk)" />
                <MetricCard label="Executed after approval" value={metrics.actionsExecutedAfterApproval} />
                <MetricCard label="Avg forecast horizon" value={`${metrics.averageForecastHorizonDays}d`} />
                <MetricCard label="Webhook events processed" value={metrics.webhookEventsProcessed} />
                <MetricCard label="Runway preserved (est.)" value={`₹${metrics.runwayPreservedEstimate.toLocaleString("en-IN")}`} wide />
              </div>
            )}
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, wide }: { label: string; value: string | number; color?: string; wide?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border ${wide ? "col-span-3" : ""}`} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-mono text-2xl font-semibold" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    auto_executed: "var(--accent-safe)",
    executed: "var(--accent-safe)",
    pending: "var(--accent-watch)",
    pending_approval: "var(--accent-watch)",
    held: "var(--accent-watch)",
    rejected: "var(--accent-risk)",
    failed: "var(--accent-risk)",
  };
  return (
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-sm border" style={{ color: colorMap[status] ?? "var(--text-muted)", borderColor: colorMap[status] ?? "var(--border)" }}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}
