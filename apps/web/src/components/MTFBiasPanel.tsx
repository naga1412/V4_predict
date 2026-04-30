import { useState } from "react";
import { useAppStore } from "../store/appStore.js";

function confidenceColor(c: "High" | "Medium" | "Low") {
  return c === "High" ? "var(--bull)" : c === "Medium" ? "var(--warn)" : "var(--bear)";
}

export function MTFBiasPanel() {
  const bias = useAppStore((s) => s.mtfBias);
  const [open, setOpen] = useState(true);

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((o) => !o)}>
        <span>MTF Bias</span>
        {bias && (
          <span className={`badge ${
            bias.direction === "Bullish" ? "badge-bull" :
            bias.direction === "Bearish" ? "badge-bear" : "badge-dim"
          }`}>
            {bias.direction}
          </span>
        )}
      </div>
      <div className={`acc-body${open ? "" : " closed"}`} style={{ maxHeight: open ? 320 : 0 }}>
        {!bias ? (
          <div className="card-body" style={{ color: "var(--fg-dim)", fontSize: 12 }}>
            Waiting for analysis…
          </div>
        ) : (
          <div className="card-body">
            {/* Summary row */}
            <div className="grid-2" style={{ marginBottom: 10 }}>
              <div>
                <div className="kv-label">Phase</div>
                <div className="kv-value" style={{ fontSize: 12 }}>{bias.phase}</div>
              </div>
              <div>
                <div className="kv-label">Confidence</div>
                <div className="kv-value" style={{ fontSize: 12, color: confidenceColor(bias.confidence) }}>
                  {bias.confidence}
                </div>
              </div>
            </div>

            {/* Condition */}
            <div style={{ marginBottom: 8 }}>
              <div className="kv-label">Condition</div>
              <div style={{ fontSize: 11, color: "var(--fg)" }}>{bias.condition}</div>
            </div>

            {/* Bull % bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span className="kv-label">Bull Strength</span>
                <span style={{ fontSize: 10, fontWeight: 600,
                  color: bias.bullPct >= 60 ? "var(--bull)" : bias.bullPct <= 40 ? "var(--bear)" : "var(--fg-dim)" }}>
                  {bias.bullPct}%
                </span>
              </div>
              <div className="prog-bar">
                <div className="prog-fill" style={{
                  width: `${bias.bullPct}%`,
                  background: bias.bullPct >= 60 ? "var(--bull)" : bias.bullPct <= 40 ? "var(--bear)" : "var(--warn)",
                }} />
              </div>
            </div>

            {/* Per-TF breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {bias.tfs.map(({ tf, bias: b, score }) => (
                <div key={tf} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 28, fontSize: 10, color: "var(--fg-dim)", fontWeight: 600 }}>{tf}</span>
                  <div className="prog-bar" style={{ flex: 1 }}>
                    <div className="prog-fill" style={{
                      width: `${Math.abs(score) * 100}%`,
                      background: score > 0 ? "var(--bull)" : score < 0 ? "var(--bear)" : "var(--fg-dim)",
                    }} />
                  </div>
                  <span style={{
                    width: 48, fontSize: 10, textAlign: "right",
                    color: b === "Bullish" ? "var(--bull)" : b === "Bearish" ? "var(--bear)" : "var(--fg-dim)",
                    fontWeight: 600,
                  }}>
                    {b.slice(0, 4)}
                  </span>
                </div>
              ))}
            </div>

            {/* Alignment badge */}
            {bias.aligned && (
              <div style={{ marginTop: 8 }}>
                <span className="badge badge-bull" style={{ fontSize: 10 }}>✓ TF Aligned</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
