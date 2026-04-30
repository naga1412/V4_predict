/**
 * App shell — V1-pattern persistent-mount tabs.
 *
 * Every tab is mounted once and hidden via `display: none`. This is the
 * pattern Crp_Pre uses and is the fix for the "chart blank when returning
 * to Chart tab" bug. The chart instance, websocket, and computed analysis
 * survive tab switches — only paint visibility toggles.
 */
import type { CSSProperties } from "react";
import { useEngine } from "../hooks/useEngine.js";
import { useFeed } from "../hooks/useFeed.js";
import { useTAEngine } from "../hooks/useTAEngine.js";
import { useAppStore } from "../store/appStore.js";
import { Topbar } from "../components/Topbar.js";
import { ChartPane } from "../components/ChartPane.js";
import { TradeSetupPanel } from "../components/TradeSetupPanel.js";
import { MTFBiasPanel } from "../components/MTFBiasPanel.js";
import { NewsPanel } from "../components/NewsPanel.js";
import { MetaBrainCard } from "../components/MetaBrainCard.js";
import { MistakeLedgerView } from "../components/MistakeLedgerView.js";
import { Footer } from "./Footer.js";

const tabStyle = (visible: boolean): CSSProperties => ({
  display: visible ? "flex" : "none",
  flex: 1,
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
});

export function App() {
  useEngine();
  useFeed();
  useTAEngine();

  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <>
      <Topbar />

      {/* ── Main workspace ── */}
      <main className="workspace">
        {/* Left column — every tab persistently mounted, toggled via display */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          {/* Chart tab — must persist across tab switches so candles / WS / chart instance survive */}
          <div style={tabStyle(activeTab === "chart")}>
            <ChartPane />
          </div>
          <div style={tabStyle(activeTab === "scanner")}>
            <PlaceholderTab label="Scanner" detail="Multi-symbol regime + setup ranking — coming soon" />
          </div>
          <div style={tabStyle(activeTab === "backtest")}>
            <PlaceholderTab label="Backtest" detail="Walk-forward backtest with equity curve — coming soon" />
          </div>
          <div style={tabStyle(activeTab === "news")}>
            <NewsPanel />
          </div>
          <div style={tabStyle(activeTab === "chat")}>
            <PlaceholderTab label="AI Chat" detail="LLM market briefing — coming soon" />
          </div>
          <div style={tabStyle(activeTab === "system")}>
            <SystemTab />
          </div>
        </div>

        {/* Right sidebar — visible on every tab */}
        <aside className="sidebar">
          <TradeSetupPanel />
          <MTFBiasPanel />
          <MetaBrainCard />
          <MistakeLedgerView />
        </aside>
      </main>

      <Footer />
    </>
  );
}

function PlaceholderTab({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 8,
      color: "var(--fg-dim)",
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>{label}</div>
      <div style={{ fontSize: 12 }}>{detail}</div>
    </div>
  );
}

function SystemTab() {
  const wsStatus = useAppStore((s) => s.wsStatus);
  const regime = useAppStore((s) => s.regime);
  const wyckoff = useAppStore((s) => s.wyckoffPhase);
  const mistakeSummary = useAppStore((s) => s.mistakeSummary);
  const symbol = useAppStore((s) => s.symbol);
  const timeframe = useAppStore((s) => s.timeframe);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", margin: 0 }}>System Status</h2>
      <div className="grid-2" style={{ maxWidth: 480 }}>
        <InfoRow label="Symbol" value={symbol} />
        <InfoRow label="Timeframe" value={timeframe} />
        <InfoRow label="WS Status" value={wsStatus} />
        <InfoRow label="Regime" value={regime} />
        <InfoRow label="Wyckoff" value={wyckoff} />
        <InfoRow label="Mistakes" value={String(mistakeSummary?.total ?? 0)} />
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 8, lineHeight: 1.5 }}>
        Engine v0.0.0 — Phase 1 Waves 0–13 ported. 15 analysis modules + meta-brain orchestration. Predictions persist in IndexedDB.
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kv-label">{label}</div>
      <div className="kv-value" style={{ fontSize: 12 }}>{value}</div>
    </div>
  );
}
