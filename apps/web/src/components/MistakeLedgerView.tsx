import { useState } from "react";
import { useAppStore } from "../store/appStore.js";

export function MistakeLedgerView() {
  const ms   = useAppStore((s) => s.mistakeSummary);
  const mb   = useAppStore((s) => s.metaBrain);
  const [open, setOpen] = useState(true);

  const topErrors = ms
    ? Object.entries(ms.byErrorType).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : [];

  const topRegimes = ms
    ? Object.entries(ms.byRegime).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : [];

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen((o) => !o)}>
        <span>Mistake Ledger</span>
        {ms && (
          <span className="badge badge-dim" style={{ fontSize: 9 }}>
            {ms.total} total
          </span>
        )}
      </div>

      <div className={`acc-body${open ? "" : " closed"}`} style={{ maxHeight: open ? 280 : 0 }}>
        {!ms || ms.total === 0 ? (
          <div className="card-body" style={{ color: "var(--fg-dim)", fontSize: 12 }}>
            {ms ? "No mistakes recorded yet." : "Loading…"}
          </div>
        ) : (
          <div className="card-body">
            {/* Error type breakdown */}
            <div style={{ marginBottom: 10 }}>
              <div className="kv-label" style={{ marginBottom: 5 }}>Error Types</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {topErrors.map(([type, count]) => {
                  const pct = ms.total > 0 ? (count / ms.total) * 100 : 0;
                  return (
                    <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 72, fontSize: 10, color: "var(--fg-dim)",
                        textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {type}
                      </span>
                      <div className="prog-bar" style={{ flex: 1 }}>
                        <div className="prog-fill" style={{
                          width: `${pct}%`,
                          background: "var(--bear)",
                        }} />
                      </div>
                      <span style={{ width: 24, fontSize: 10, textAlign: "right",
                        color: "var(--fg-dim)", fontVariantNumeric: "tabular-nums" }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Regime breakdown */}
            {topRegimes.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div className="kv-label" style={{ marginBottom: 5 }}>By Regime</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {topRegimes.map(([regime, count]) => (
                    <span key={regime} className="badge badge-dim" style={{ fontSize: 9 }}>
                      {regime}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Last mistake time */}
            {ms.lastT && (
              <div style={{ fontSize: 10, color: "var(--fg-dim)" }}>
                Last: {new Date(ms.lastT).toLocaleString()}
              </div>
            )}

            {/* Active veto status */}
            {mb?.vetoed && (
              <div style={{ marginTop: 8, padding: "5px 8px",
                background: "color-mix(in srgb, var(--warn) 10%, transparent)",
                borderRadius: 4, borderLeft: "2px solid var(--warn)",
              }}>
                <span style={{ fontSize: 10, color: "var(--warn)", fontWeight: 600 }}>
                  Anti-pattern veto active: {mb.vetoed}
                </span>
                {mb.vetoReason && (
                  <div style={{ fontSize: 10, color: "var(--fg-dim)", marginTop: 2 }}>
                    {mb.vetoReason}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
