import { useAppStore } from "../store/appStore.js";

export function Footer() {
  const regime    = useAppStore((s) => s.regime);
  const wyckoff   = useAppStore((s) => s.wyckoffPhase);
  const livePrice = useAppStore((s) => s.livePrice);
  const ms        = useAppStore((s) => s.mistakeSummary);
  const mb        = useAppStore((s) => s.metaBrain);

  return (
    <footer className="kpi-strip">
      <div className="kpi-item">
        <span style={{ color: "var(--fg-dim)" }}>Regime</span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{regime}</span>
      </div>
      <div className="kpi-item">
        <span style={{ color: "var(--fg-dim)" }}>Wyckoff</span>
        <span style={{ color: "var(--fg)", fontWeight: 600 }}>{wyckoff}</span>
      </div>
      {livePrice && (
        <div className="kpi-item">
          <span style={{ color: "var(--fg-dim)" }}>Price</span>
          <span style={{
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: livePrice.dir === "up" ? "var(--bull)" : livePrice.dir === "down" ? "var(--bear)" : "var(--fg)",
          }}>
            {livePrice.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
      {ms && (
        <div className="kpi-item">
          <span style={{ color: "var(--fg-dim)" }}>Mistakes</span>
          <span style={{ fontWeight: 600, color: ms.total > 0 ? "var(--warn)" : "var(--bull)" }}>
            {ms.total}
          </span>
        </div>
      )}
      {mb && (
        <div className="kpi-item">
          <span style={{ color: "var(--fg-dim)" }}>P(win)</span>
          <span style={{
            fontWeight: 600,
            color: mb.direction === "long" ? "var(--bull)" : mb.direction === "short" ? "var(--bear)" : "var(--fg-dim)",
          }}>
            {(mb.probability * 100).toFixed(1)}%
          </span>
        </div>
      )}
      {mb?.vetoed && (
        <div className="kpi-item">
          <span className="badge badge-warn" style={{ fontSize: 9 }}>
            {mb.vetoed === "full" ? "VETOED" : "SOFTENED"}
          </span>
        </div>
      )}
    </footer>
  );
}
