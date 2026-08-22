"use client";

type Snapshot = { date: string; projectedBalance: number; confidence: number };

export function RunwayChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length === 0) {
    return <div className="text-sm" style={{ color: "var(--text-muted)" }}>No forecast data yet — run the agent cycle.</div>;
  }

  const width = 720;
  const height = 220;
  const padding = 32;

  const values = snapshots.map((s) => s.projectedBalance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xStep = (width - padding * 2) / (snapshots.length - 1 || 1);
  const yFor = (v: number) => height - padding - ((v - min) / range) * (height - padding * 2);
  const xFor = (i: number) => padding + i * xStep;

  const points = snapshots.map((s, i) => `${xFor(i)},${yFor(s.projectedBalance)}`).join(" ");
  const zeroY = yFor(0);

  const shortfallIndex = snapshots.findIndex((s) => s.projectedBalance < 0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* zero-line */}
      <line x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeDasharray="4 4" />
      <text x={padding} y={zeroY - 6} fontSize="10" fill="var(--text-muted)" className="font-mono">₹0</text>

      {/* shortfall zone highlight */}
      {shortfallIndex >= 0 && (
        <rect
          x={xFor(shortfallIndex) - xStep / 2}
          y={0}
          width={xStep * 2}
          height={height}
          fill="var(--accent-risk)"
          opacity={0.08}
        />
      )}

      {/* balance line */}
      <polyline points={points} fill="none" stroke="var(--accent-safe)" strokeWidth={2} />

      {/* points */}
      {snapshots.map((s, i) => (
        <circle
          key={i}
          cx={xFor(i)}
          cy={yFor(s.projectedBalance)}
          r={3}
          fill={s.projectedBalance < 0 ? "var(--accent-risk)" : "var(--accent-safe)"}
        />
      ))}

      {/* x-axis dates, sparse */}
      {snapshots.map((s, i) =>
        i % 3 === 0 ? (
          <text key={i} x={xFor(i)} y={height - 8} fontSize="9" fill="var(--text-muted)" textAnchor="middle" className="font-mono">
            {new Date(s.date).toISOString().slice(5, 10)}
          </text>
        ) : null
      )}
    </svg>
  );
}
