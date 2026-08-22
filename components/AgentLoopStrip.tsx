"use client";

const STAGES = ["FORECAST", "PLAN", "GUARD", "ACT", "VERIFY"] as const;

export function AgentLoopStrip({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center gap-1">
          <span
            className="px-2.5 py-1 rounded-sm border transition-colors"
            style={{
              borderColor: i <= activeIndex ? "var(--accent-safe)" : "var(--border)",
              color: i <= activeIndex ? "var(--accent-safe)" : "var(--text-muted)",
              background: i <= activeIndex ? "rgba(47,217,138,0.08)" : "transparent",
            }}
          >
            {stage}
          </span>
          {i < STAGES.length - 1 && <span style={{ color: "var(--text-muted)" }}>→</span>}
        </div>
      ))}
    </div>
  );
}
