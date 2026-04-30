/**
 * BacktestTab — walk-forward backtest of the orchestrator's directional
 * signal vs the next-bar realized direction over the recent history.
 *
 * For each bar i in [warmup, n-2]:
 *   - Run TAEngine + runModules on bars[0..i]
 *   - Predicted direction = orch.direction
 *   - Realized direction = sign(close[i+1] - close[i])
 *   - Track hits / misses / abstentions per regime
 *
 * Renders summary stats + a sparkline equity curve assuming equal-sized
 * trades on every directional signal.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { fetchKlines, TAEngine, runModules } from "@v4/engine";
import type { KlineCandle } from "@v4/engine";
import { useAppStore } from "../store/appStore.js";

interface BarLike { t: number; o: number; h: number; l: number; c: number; v: number }

interface Trade {
  i: number;
  t: number;
  predicted: "long" | "short" | "neutral";
  realized: "up" | "down" | "flat";
  hit: boolean;
  ret: number;
  regime: string;
}

interface BacktestResult {
  trades: Trade[];
  hits: number;
  misses: number;
  abstain: number;
  byRegime: Record<string, { hits: number; total: number }>;
  equity: number[];
  finalReturn: number;
  maxDD: number;
  sharpe: number;
}

function toBar(c: KlineCandle): BarLike {
  return { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v ?? 0 };
}

function backtest(bars: BarLike[], warmup = 200): BacktestResult {
  const trades: Trade[] = [];
  const equity: number[] = [1];
  let cum = 1;
  let peak = 1;
  let maxDD = 0;
  const byRegime: Record<string, { hits: number; total: number }> = {};

  for (let i = warmup; i < bars.length - 1; i++) {
    const slice = bars.slice(0, i + 1);
    let ta;
    let orch;
    try {
      ta = TAEngine.compute(slice);
      orch = runModules(ta);
    } catch {
      continue;
    }
    const next = bars[i + 1]!;
    const cur = bars[i]!;
    const ret = cur.c !== 0 ? (next.c - cur.c) / cur.c : 0;
    const realized: Trade["realized"] = ret > 0.0005 ? "up" : ret < -0.0005 ? "down" : "flat";
    const predicted = orch.direction;
    const reg = ta.regime as { trend?: string; strength?: string } | undefined;
    const regimeLabel = reg ? `${reg.trend ?? "—"}-${reg.strength ?? "—"}` : "—";

    let hit = false;
    let pnl = 0;
    if (predicted === "long" && realized === "up") { hit = true; pnl = ret; }
    else if (predicted === "short" && realized === "down") { hit = true; pnl = -ret; }
    else if (predicted === "long" && realized === "down") { pnl = ret; }
    else if (predicted === "short" && realized === "up") { pnl = -ret; }

    trades.push({ i, t: cur.t, predicted, realized, hit, ret, regime: regimeLabel });
    if (!byRegime[regimeLabel]) byRegime[regimeLabel] = { hits: 0, total: 0 };
    if (predicted !== "neutral") {
      byRegime[regimeLabel]!.total += 1;
      if (hit) byRegime[regimeLabel]!.hits += 1;
    }

    cum *= 1 + pnl;
    equity.push(cum);
    if (cum > peak) peak = cum;
    const dd = (peak - cum) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  let hits = 0;
  let misses = 0;
  let abstain = 0;
  for (const t of trades) {
    if (t.predicted === "neutral") abstain++;
    else if (t.hit) hits++;
    else misses++;
  }

  const directionalRets = trades
    .filter((t) => t.predicted !== "neutral")
    .map((t) => (t.predicted === "long" ? t.ret : -t.ret));
  const mean = directionalRets.reduce((a, b) => a + b, 0) / Math.max(1, directionalRets.length);
  const variance = directionalRets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, directionalRets.length);
  const stdev = Math.sqrt(variance);
  const sharpe = stdev > 0 ? (mean / stdev) * Math.sqrt(252) : 0;

  return {
    trades, hits, misses, abstain, byRegime, equity,
    finalReturn: cum - 1,
    maxDD, sharpe,
  };
}

export function BacktestTab() {
  const activeTab = useAppStore((s) => s.activeTab);
  const symbol = useAppStore((s) => s.symbol);
  const timeframe = useAppStore((s) => s.timeframe);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setProgress(0);
    try {
      const candles = await fetchKlines({ symbol, tf: timeframe, limit: 500 });
      if (candles.length < 250) {
        setError("Not enough history for a meaningful backtest (< 250 bars).");
        setRunning(false);
        return;
      }
      const bars = candles.map(toBar);
      // Yield to the browser between chunks
      const r = await new Promise<BacktestResult>((resolve) => {
        setTimeout(() => resolve(backtest(bars, 200)), 0);
      });
      setProgress(1);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [symbol, timeframe]);

  // Auto-run when tab becomes visible (only first time per session)
  useEffect(() => {
    if (activeTab === "backtest" && !result && !running) void run();
  }, [activeTab, result, running, run]);

  const accuracy = useMemo(() => {
    if (!result) return null;
    const decided = result.hits + result.misses;
    return decided > 0 ? result.hits / decided : null;
  }, [result]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", margin: 0 }}>
          Backtest — {symbol} {timeframe}
        </h2>
        <button
          onClick={() => void run()}
          disabled={running}
          style={{
            padding: "3px 12px", fontSize: 11, fontWeight: 600,
            background: running ? "var(--bg-elev-2)" : "var(--accent)",
            border: "none", borderRadius: 3,
            color: running ? "var(--fg-dim)" : "#fff",
            cursor: running ? "wait" : "pointer",
          }}
        >
          {running ? "Running…" : "Re-run"}
        </button>
        <span style={{ fontSize: 10, color: "var(--fg-dim)" }}>
          Walk-forward: 200-bar warmup, then orch.direction vs next-bar realized
        </span>
      </div>

      {error && (
        <div style={{ padding: 10, background: "color-mix(in srgb, var(--bear) 15%, transparent)",
          color: "var(--bear)", borderRadius: 4, fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {running && (
        <div style={{ padding: 16, color: "var(--fg-dim)", fontSize: 12 }}>
          Running walk-forward… each bar runs the full 15-module ensemble. {Math.round(progress * 100)}%
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* KPI strip */}
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <Kpi label="Trades" value={String(result.hits + result.misses)} sub={`${result.abstain} abstain`} />
            <Kpi
              label="Accuracy"
              value={accuracy != null ? `${(accuracy * 100).toFixed(1)}%` : "—"}
              color={accuracy != null && accuracy > 0.5 ? "var(--bull)" : "var(--bear)"}
              sub={`${result.hits} hits · ${result.misses} miss`}
            />
            <Kpi
              label="Final Return"
              value={`${result.finalReturn >= 0 ? "+" : ""}${(result.finalReturn * 100).toFixed(2)}%`}
              color={result.finalReturn >= 0 ? "var(--bull)" : "var(--bear)"}
              sub={`max DD ${(result.maxDD * 100).toFixed(2)}%`}
            />
            <Kpi
              label="Sharpe"
              value={result.sharpe.toFixed(2)}
              color={result.sharpe > 1 ? "var(--bull)" : result.sharpe < 0 ? "var(--bear)" : "var(--fg-dim)"}
              sub="annualised"
            />
          </div>

          {/* Equity curve */}
          <div style={{ background: "var(--bg-elev-1)", border: "1px solid var(--bg-elev-2)", borderRadius: 4, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-dim)", marginBottom: 6 }}>
              Equity Curve (×100 = +100%)
            </div>
            <EquitySpark equity={result.equity} />
          </div>

          {/* By-regime breakdown */}
          <div style={{ background: "var(--bg-elev-1)", border: "1px solid var(--bg-elev-2)", borderRadius: 4 }}>
            <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--fg-dim)",
              borderBottom: "1px solid var(--bg-elev-2)" }}>
              Accuracy by Regime
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Regime</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Trades</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Hits</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.byRegime)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([reg, s]) => {
                    const acc = s.total > 0 ? s.hits / s.total : 0;
                    return (
                      <tr key={reg} style={{ borderTop: "1px solid var(--bg-elev-2)" }}>
                        <td style={{ padding: "5px 10px", color: "var(--fg)" }}>{reg}</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "monospace", color: "var(--fg-dim)" }}>{s.total}</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "monospace", color: "var(--fg)" }}>{s.hits}</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 600,
                          color: acc > 0.55 ? "var(--bull)" : acc < 0.45 ? "var(--bear)" : "var(--fg)" }}>
                          {s.total > 0 ? `${(acc * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 10, color: "var(--fg-dim)" }}>
            Walk-forward simulation, no slippage / fees / position sizing.
            P&L computed as cumulative product of next-bar returns × signed direction.
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: "6px 10px", textAlign: "left" as const, fontSize: 10, fontWeight: 600,
  color: "var(--fg-dim)", borderBottom: "1px solid var(--bg-elev-2)" };

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--bg-elev-1)", border: "1px solid var(--bg-elev-2)", borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "var(--fg-dim)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? "var(--fg)", fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--fg-dim)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function EquitySpark({ equity }: { equity: number[] }) {
  const w = 800;
  const h = 90;
  if (equity.length < 2) return <div style={{ height: h, color: "var(--fg-dim)", fontSize: 11 }}>no data</div>;
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const span = Math.max(1e-9, max - min);
  const stepX = w / (equity.length - 1);
  const points = equity.map((v, i) => `${(i * stepX).toFixed(2)},${(h - ((v - min) / span) * h).toFixed(2)}`).join(" ");
  const finalReturn = equity[equity.length - 1]! - 1;
  const stroke = finalReturn >= 0 ? "var(--bull)" : "var(--bear)";
  const baselineY = h - ((1 - min) / span) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h, display: "block" }}>
      <line x1="0" x2={w} y1={baselineY} y2={baselineY} stroke="var(--bg-elev-2)" strokeDasharray="2 4" />
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={points} />
    </svg>
  );
}
