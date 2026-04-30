import { useState } from "react";
import { useAppStore } from "../store/appStore.js";

function SignalBadge({ signal }: { signal: "LONG" | "SHORT" | "NEUTRAL" }) {
  const cls =
    signal === "LONG"    ? "badge badge-bull" :
    signal === "SHORT"   ? "badge badge-bear" :
    "badge badge-dim";
  return <span className={cls}>{signal}</span>;
}

export function TradeSetupPanel() {
  const setup = useAppStore((s) => s.tradeSetup);
  const [open, setOpen] = useState(true);

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((o) => !o)}>
        <span>Trade Setup</span>
        {setup && <SignalBadge signal={setup.signal} />}
      </div>
      <div className={`acc-body${open ? "" : " closed"}`} style={{ maxHeight: open ? 300 : 0 }}>
        {!setup ? (
          <div className="card-body" style={{ color: "var(--fg-dim)", fontSize: 12 }}>
            Waiting for signal…
          </div>
        ) : (
          <div className="card-body">
            {/* Entry zone */}
            <div style={{ marginBottom: 8 }}>
              <div className="kv-label">Entry Zone</div>
              <div className="kv-value" style={{ fontSize: 12 }}>
                {setup.entryMin.toFixed(2)} – {setup.entryMax.toFixed(2)}
              </div>
            </div>

            {/* TP / SL row */}
            <div className="grid-2" style={{ marginBottom: 8 }}>
              <div>
                <div className="kv-label">TP 1</div>
                <div className="kv-value bull" style={{ fontSize: 12 }}>
                  {setup.tp1.toFixed(2)}
                  <span className="dim" style={{ fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                    R {setup.rrTp1}
                  </span>
                </div>
              </div>
              <div>
                <div className="kv-label">TP 2</div>
                <div className="kv-value bull" style={{ fontSize: 12 }}>
                  {setup.tp2.toFixed(2)}
                  <span className="dim" style={{ fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                    R {setup.rrTp2}
                  </span>
                </div>
              </div>
              <div>
                <div className="kv-label">Stop Loss</div>
                <div className="kv-value bear" style={{ fontSize: 12 }}>{setup.sl.toFixed(2)}</div>
              </div>
              <div>
                <div className="kv-label">Leverage</div>
                <div className="kv-value accent" style={{ fontSize: 12 }}>{setup.leverage}×</div>
              </div>
            </div>

            {/* Pattern + indicators */}
            {(setup.pattern || setup.atr !== undefined || setup.rsi !== undefined) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
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
