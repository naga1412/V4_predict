import { useState } from "react";
import { useAppStore } from "../store/appStore.js";

function SignalBadge({ signal }: { signal: "LONG" | "SHORT" | "NEUTRAL" }) {
  const cls =
    signal === "LONG"  ? "badge badge-bull"
    : signal === "SHORT" ? "badge badge-bear"
    : "badge badge-dim";
  return <span className={cls}>{signal}</span>;
}

export function TradeSetupPanel() {
  const setup = useAppStore((s) => s.tradeSetup);
  const [open, setOpen] = useState(true);

  const accent = setup?.signal === "LONG" ? "var(--bull)"
    : setup?.signal === "SHORT" ? "var(--bear)" : "var(--fg-dim)";

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((o) => !o)}>
        <span>Trade Setup</span>
        {setup && <SignalBadge signal={setup.signal} />}
      </div>
      <div className={`acc-body${open ? "" : " closed"}`} style={{ maxHeight: open ? 360 : 0 }}>
        {!setup ? (
          <div className="card-body" style={{ color: "var(--fg-dim)", fontSize: 12 }}>
            Waiting for signal…
          </div>
        ) : (
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Entry zone — left-border accent matches signal direction */}
            <div style={{
              padding: "5px 10px",
              background: "var(--bg)",
              borderRadius: 4,
              borderLeft: `3px solid ${accent}`,
            }}>
              <div className="kv-label" style={{ marginBottom: 2 }}>Entry Zone</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "var(--fg)" }}>
                {setup.entryMin.toFixed(2)} – {setup.entryMax.toFixed(2)}
              </div>
            </div>

            {/* TP1 / TP2 side-by-side, each colored */}
            <div className="grid-2">
              <div style={{
                background: "var(--bg)", borderRadius: 4,
                padding: "5px 8px",
                border: "1px solid color-mix(in srgb, var(--bull) 35%, transparent)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--bull)" }}>TP 1</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--fg)", marginTop: 1 }}>
                  {setup.tp1.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-dim)", marginTop: 1 }}>R {setup.rrTp1}</div>
              </div>
              <div style={{
                background: "var(--bg)", borderRadius: 4,
                padding: "5px 8px",
                border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)" }}>TP 2</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--fg)", marginTop: 1 }}>
                  {setup.tp2.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-dim)", marginTop: 1 }}>R {setup.rrTp2}</div>
              </div>
            </div>

            {/* Stop loss — red bordered card */}
            <div style={{
              background: "var(--bg)", borderRadius: 4,
              padding: "5px 8px",
              border: "1px solid color-mix(in srgb, var(--bear) 35%, transparent)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--bear)" }}>Stop Loss</div>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--fg)", marginTop: 1 }}>
                {setup.sl.toFixed(2)}
              </div>
            </div>

            {/* Leverage row */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "5px 10px",
              background: "var(--bg)", borderRadius: 4,
            }}>
              <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>Leverage</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{setup.leverage}×</span>
            </div>

            {/* Indicators / pattern badges */}
            {(setup.pattern || setup.atr !== undefined || setup.rsi !== undefined) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                {setup.pattern && (
                  <span className="badge badge-accent" style={{ fontSize: 10 }}>{setup.pattern}</span>
                )}
                {setup.patternBias && (
                  <span className={`badge ${setup.patternBias === "Bullish" ? "badge-bull" : "badge-bear"}`}
                    style={{ fontSize: 10 }}>
                    {setup.patternBias}
                  </span>
                )}
                {setup.atr !== undefined && (
                  <span className="badge badge-dim" style={{ fontSize: 10 }}>
                    ATR {setup.atr.toFixed(2)}
                  </span>
                )}
                {setup.rsi !== undefined && (
                  <span className="badge badge-dim" style={{ fontSize: 10 }}>
                    RSI {setup.rsi.toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
