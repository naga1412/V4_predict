import { useState } from "react";
import { useAppStore } from "../store/appStore.js";

function directionColor(d: "long" | "short" | "neutral") {
  return d === "long" ? "var(--bull)" : d === "short" ? "var(--bear)" : "var(--fg-dim)";
}

function vetoLabel(v: false | "full" | "softened") {
  if (v === "full")      return "VETOED";
  if (v === "softened")  return "SOFTENED";
  return null;
}

export function MetaBrainCard() {
  const mb   = useAppStore((s) => s.metaBrain);
  const [open, setOpen] = useState(true);

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((o) => !o)}>
        <span>Meta-Brain</span>
        {mb?.vetoed && (
          <span className={`badge ${mb.vetoed === "full" ? "badge-bear" : "badge-warn"}`} style={{ fontSize: 9 }}>
            {vetoLabel(mb.vetoed)}
          </span>
        )}
      </div>

      <div className={`acc-body${open ? "" : " closed"}`} style={{ maxHeight: open ? 260 : 0 }}>
        {!mb ? (
          <div className="card-body" style={{ color: "var(--fg-dim)", fontSize: 12 }}>
            Waiting for meta-brain decision…
          </div>
        ) : (
          <div className="card-body">
            {/* Direction + probability */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{
                fontSize: 20,
                fontWeight: 800,
                color: directionColor(mb.direction),
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                {mb.direction === "long" ? "▲ LONG" : mb.direction === "short" ? "▼ SHORT" : "— NEUTRAL"}
              </span>
              <span style={{
                fontSize: 22,
                fontWeight: 800,
                color: directionColor(mb.direction),
              }}>
                {(mb.probability * 100).toFixed(1)}%
              </span>
            </div>

            {/* Calibrated probability bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span className="kv-label">Calibrated P(win)</span>
                <span style={{ fontSize: 10, color: "var(--fg-dim)" }}>
                  [{(mb.intervalLo * 100).toFixed(1)}% – {(mb.intervalHi * 100).toFixed(1)}%]
                </span>
              </div>
              <div className="prog-bar">
                {/* conformal interval shading */}
                <div style={{
                  position: "relative",
                  height: "100%",
                  background: "transparent",
                }}>
                  <div style={{
                    position: "absolute",
                    left: `${mb.intervalLo * 100}%`,
                    width: `${(mb.intervalHi - mb.intervalLo) * 100}%`,
                    height: "100%",
                    background: "color-mix(in srgb, var(--accent) 20%, transparent)",
                    borderRadius: 2,
                  }} />
                  <div className="prog-fill" style={{
                    width: `${mb.probability * 100}%`,
                    background: directionColor(mb.direction),
                  }} />
                </div>
              </div>
            </div>

            {/* Champion / retrain row */}
            <div className="grid-2">
              <div>
                <div className="kv-label">Champion</div>
                <div style={{ fontSize: 11, color: "var(--fg)" }}>
                  {mb.champion ?? "—"}
                </div>
              </div>
              {mb.retrained && (
                <div>
                  <div className="kv-label">Last Retrain</div>
                  <div style={{ fontSize: 11, color: "var(--fg)" }}>
                    {new Date(mb.retrained).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>

            {/* Veto reason */}
            {mb.vetoReason && (
              <div style={{ marginTop: 8, padding: "5px 8px",
                background: "color-mix(in srgb, var(--bear) 10%, transparent)",
                borderRadius: 4, borderLeft: "2px solid var(--bear)",
              }}>
                <span style={{ fontSize: 10, color: "var(--fg-dim)" }}>{mb.vetoReason}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
