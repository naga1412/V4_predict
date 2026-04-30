/**
 * ScannerTab — multi-symbol bias scan.
 *
 * Fetches recent candles for ~10 symbols in parallel, runs TAEngine +
 * orchestrator on each, and displays a ranked table (most bullish at top,
 * most bearish at bottom). Click a row to switch the chart to that symbol.
 *
 * Data refresh: every 60 s while the tab is visible.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { fetchKlines, TAEngine, runModules } from "@v4/engine";
import type { KlineCandle } from "@v4/engine";
import { useAppStore } from "../store/appStore.js";

const SYMBOLS = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
  "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
  "MATIC/USDT", "ATOM/USDT",
];

interface ScanRow {
  symbol: string;
  price: number;
  changePct: number;
  rawScore: number;
  probability: number;
  direction: "long" | "short" | "neutral";
  confidence: number;
  regime: string;
  wyckoff: string;
  modules: number;
  loading?: boolean;
  error?: string;
}

interface BarLike { t: number; o: number; h: number; l: number; c: number; v: number }

function toBar(c: KlineCandle): BarLike {
  return { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v ?? 0 };
}

async function scanSymbol(symbol: string, tf: string): Promise<ScanRow> {
  try {
    const candles = await fetchKlines({ symbol, tf, limit: 250 });
    if (candles.length < 100) {
      return {
        symbol, price: 0, changePct: 0, rawScore: 0, probability: 0.5,
        direction: "neutral", confidence: 0, regime: "—", wyckoff: "—",
        modules: 0, error: "insufficient data",
      };
    }
    const bars = candles.map(toBar);
    const ta = TAEngine.compute(bars);
    const orch = runModules(ta);
    const last = bars[bars.length - 1]!;
    const first = bars[0]!;
    const changePct = first.c !== 0 ? ((last.c - first.c) / first.c) * 100 : 0;
    const reg = (ta as { regime?: { trend?: string; strength?: string }; wyckoff?: { phase?: string } });
    const regimeLabel = reg.regime ? `${reg.regime.trend ?? "—"}-${reg.regime.strength ?? "—"}` : "—";
    return {
      symbol,
      price: last.c,
      changePct,
      rawScore: orch.rawScore,
      probability: orch.probability,
      direction: orch.direction,
      confidence: orch.confidence,
      regime: regimeLabel,
      wyckoff: reg.wyckoff?.phase ?? "—",
      modules: orch.participating,
    };
  } catch (err) {
    return {
      symbol, price: 0, changePct: 0, rawScore: 0, probability: 0.5,
      direction: "neutral", confidence: 0, regime: "—", wyckoff: "—",
      modules: 0, error: (err as Error).message,
    };
  }
}

type SortKey = "probability" | "rawScore" | "changePct" | "confidence" | "symbol";

export function ScannerTab() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setSymbol = useAppStore((s) => s.setSymbol);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const timeframe = useAppStore((s) => s.timeframe);

  const [rows, setRows] = useState<ScanRow[]>(() =>
    SYMBOLS.map((s) => ({
      symbol: s, price: 0, changePct: 0, rawScore: 0, probability: 0.5,
      direction: "neutral" as const, confidence: 0, regime: "—", wyckoff: "—",
      modules: 0, loading: true,
    }))
  );
  const [sortKey, setSortKey] = useState<SortKey>("probability");
  const [sortDesc, setSortDesc] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScanT, setLastScanT] = useState<number | null>(null);
  const tickerRef = useRef<number | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    const results = await Promise.all(SYMBOLS.map((s) => scanSymbol(s, timeframe)));
    setRows(results);
    setLastScanT(Date.now());
    setScanning(false);
  }, [timeframe]);

  // Initial + recurring scan when tab is visible
  useEffect(() => {
    if (activeTab !== "scanner") {
      if (tickerRef.current != null) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      return;
    }
    void runScan();
    tickerRef.current = window.setInterval(() => void runScan(), 60_000);
    return () => {
      if (tickerRef.current != null) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, [activeTab, runScan]);

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
    }
    return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });

  const onRowClick = (sym: string): void => {
    setSymbol(sym);
    setActiveTab("chart");
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", margin: 0 }}>
          Scanner — {SYMBOLS.length} symbols, {timeframe}
        </h2>
        <button
          onClick={() => void runScan()}
          disabled={scanning}
          style={{
            padding: "3px 12px",
            fontSize: 11,
            fontWeight: 600,
            background: scanning ? "var(--bg-elev-2)" : "var(--accent)",
            border: "none",
            borderRadius: 3,
            color: scanning ? "var(--fg-dim)" : "#fff",
            cursor: scanning ? "wait" : "pointer",
          }}
        >
          {scanning ? "Scanning…" : "Refresh"}
        </button>
        {lastScanT && (
          <span style={{ fontSize: 10, color: "var(--fg-dim)" }}>
            Last scan {Math.round((Date.now() - lastScanT) / 1000)}s ago · auto-refresh 60 s
          </span>
        )}
      </div>

      <div style={{ overflow: "auto", flex: 1, border: "1px solid var(--bg-elev-2)", borderRadius: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-elev-1)", zIndex: 1 }}>
            <tr>
              <Th label="Symbol"     onClick={() => handleSort("symbol")}     active={sortKey === "symbol"}     desc={sortDesc} />
              <Th label="Price"      align="right" />
              <Th label="Δ %"        onClick={() => handleSort("changePct")}  active={sortKey === "changePct"}  desc={sortDesc} align="right" />
              <Th label="Direction"  align="center" />
              <Th label="P(win)"     onClick={() => handleSort("probability")} active={sortKey === "probability"} desc={sortDesc} align="right" />
              <Th label="Score"      onClick={() => handleSort("rawScore")}   active={sortKey === "rawScore"}   desc={sortDesc} align="right" />
              <Th label="Conf."      onClick={() => handleSort("confidence")} active={sortKey === "confidence"} desc={sortDesc} align="right" />
              <Th label="Regime" />
              <Th label="Wyckoff" />
              <Th label="Modules" align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.symbol}
                onClick={() => onRowClick(r.symbol)}
                style={{
                  cursor: "pointer",
                  borderTop: "1px solid var(--bg-elev-2)",
                  background: r.loading ? "transparent" : undefined,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--fg)" }}>{r.symbol}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: "var(--fg)" }}>
                  {r.loading ? "—" : r.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace",
                  color: r.changePct >= 0 ? "var(--bull)" : "var(--bear)" }}>
                  {r.loading ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%`}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center" }}>
                  {r.loading ? "—" : <DirectionBadge dir={r.direction} />}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace",
                  color: r.probability > 0.55 ? "var(--bull)" : r.probability < 0.45 ? "var(--bear)" : "var(--fg-dim)",
                  fontWeight: 600 }}>
                  {r.loading ? "—" : `${(r.probability * 100).toFixed(1)}%`}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: "var(--fg)" }}>
                  {r.loading ? "—" : r.rawScore.toFixed(3)}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: "var(--fg-dim)" }}>
                  {r.loading ? "—" : r.confidence.toFixed(2)}
                </td>
                <td style={{ padding: "5px 8px", color: "var(--fg-dim)", fontSize: 10 }}>{r.regime}</td>
                <td style={{ padding: "5px 8px", color: "var(--fg-dim)", fontSize: 10 }}>{r.wyckoff}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--fg-dim)" }}>
                  {r.loading ? "—" : r.modules}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: "var(--fg-dim)" }}>
        Click any row to load it on the Chart tab. P(win) = ensemble probability of upward move from 15 modules.
      </div>
    </div>
  );
}

function Th({ label, onClick, active, desc, align }: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  desc?: boolean;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: "6px 8px",
        textAlign: align ?? "left",
        fontSize: 10,
        fontWeight: 600,
        color: active ? "var(--accent)" : "var(--fg-dim)",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        whiteSpace: "nowrap",
        borderBottom: "1px solid var(--bg-elev-2)",
      }}
    >
      {label}
      {active && <span style={{ marginLeft: 3 }}>{desc ? "▼" : "▲"}</span>}
    </th>
  );
}

function DirectionBadge({ dir }: { dir: "long" | "short" | "neutral" }) {
  const cls = dir === "long" ? "badge badge-bull" : dir === "short" ? "badge badge-bear" : "badge badge-dim";
  return <span className={cls} style={{ fontSize: 9 }}>{dir.toUpperCase()}</span>;
}
