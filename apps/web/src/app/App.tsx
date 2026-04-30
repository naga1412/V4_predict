import { useEngine } from "../hooks/useEngine.js";
import { useAppStore } from "../store/appStore.js";
import { Topbar } from "../components/Topbar.js";
import { ChartPane } from "../components/ChartPane.js";
import { TradeSetupPanel } from "../components/TradeSetupPanel.js";
import { MTFBiasPanel } from "../components/MTFBiasPanel.js";
import { NewsPanel } from "../components/NewsPanel.js";
import { MetaBrainCard } from "../components/MetaBrainCard.js";
import { MistakeLedgerView } from "../components/MistakeLedgerView.js";
import { Footer } from "./Footer.js";

export function App() {
  useEngine();

  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <>
      <Topbar />

      {/* ── Main workspace: chart + sidebar ── */}
      <main className="workspace">
        {/* Left: chart / tab view */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          {activeTab === "chart"    && <ChartPane />}
          {activeTab === "scanner"  && <PlaceholderTab label="Scanner — coming soon" />}
          {activeTab === "backtest" && <PlaceholderTab label="Backtest — coming soon" />}
          {activeTab === "news"     && <NewsPanel />}
          {activeTab === "chat"     && <PlaceholderTab label="AI Chat — coming soon" />}
          {activeTab === "system"   && <SystemTab />}
        </div>

        {/* Right: sidebar panels */}
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

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--fg-dim)", fontSize: 14,
    }}>
      {label}
    </div>
  );
}

function SystemTab() {
  const wsStatus    = useAppStore((s) => s.wsStatus);
  const regime      = useAppStore((s) => s.regime);
  const wyckoff     = useAppStore((s) => s.wyckoffPhase);
  const mistakeSummary = useAppStore((s) => s.mistakeSummary);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)", margin: 0 }}>System Status</h2>
      <div className="grid-2" style={{ maxWidth: 400 }}>
        <InfoRow label="WS Status"    value={wsStatus} />
        <InfoRow label="Regime"       value={regime} />
        <InfoRow label="Wyckoff"      value={wyckoff} />
        <InfoRow label="Mistakes"     value={String(mistakeSummary?.total ?? 0)} />
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
