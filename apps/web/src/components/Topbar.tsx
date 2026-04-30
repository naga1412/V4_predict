import { useState, useCallback } from "react";
import { useAppStore } from "../store/appStore.js";
import type { Timeframe, WsStatus, Tab } from "../store/appStore.js";

const SYMBOLS = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
  "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
  "MATIC/USDT", "UNI/USDT", "ATOM/USDT", "LTC/USDT", "BCH/USDT",
];

const TFS: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chart",    label: "Chart",    icon: "📊" },
  { id: "scanner",  label: "Scanner",  icon: "🔍" },
  { id: "backtest", label: "Backtest", icon: "⏪" },
  { id: "news",     label: "News",     icon: "📰" },
  { id: "chat",     label: "Chat",     icon: "🤖" },
  { id: "system",   label: "System",   icon: "⚙️" },
];

function statusColor(s: WsStatus): string {
  if (s === "live")         return "var(--bull)";
  if (s === "reconnecting") return "var(--warn)";
  if (s === "error")        return "var(--bear)";
  if (s === "connecting")   return "var(--accent)";
  return "var(--fg-dim)";
}

function statusLabel(s: WsStatus): string {
  if (s === "live")         return "Live";
  if (s === "connecting")   return "Connecting…";
  if (s === "reconnecting") return "Reconnecting…";
  if (s === "error")        return "Error";
  return "Offline";
}

export function Topbar() {
  const symbol = useAppStore((s) => s.symbol);
  const setSymbol = useAppStore((s) => s.setSymbol);
  const timeframe = useAppStore((s) => s.timeframe);
  const setTF = useAppStore((s) => s.setTimeframe);
  const activeTab = useAppStore((s) => s.activeTab);
  const setTab = useAppStore((s) => s.setActiveTab);
  const wsStatus = useAppStore((s) => s.wsStatus);
  const livePrice = useAppStore((s) => s.livePrice);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? SYMBOLS.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : SYMBOLS;

  const pick = useCallback((sym: string) => {
    setSymbol(sym);
    setSearchOpen(false);
    setQuery("");
  }, [setSymbol]);

  const isChart = activeTab === "chart";

  return (
    <>
      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        borderBottom: "1px solid var(--bg-elev-2)",
        background: "var(--bg-elev-1)",
        overflow: "hidden",
        flexWrap: "nowrap",
      }}>
        {/* Brand */}
        <span style={{
          fontWeight: 700, fontSize: 14, color: "var(--accent)",
          whiteSpace: "nowrap", flexShrink: 0, marginRight: 4,
        }}>
          ⚡ V.4
        </span>

        {/* Tabs (left) */}
        <nav style={{ display: "flex", gap: 0, flexShrink: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: activeTab === t.id ? 600 : 500,
                background: activeTab === t.id
                  ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                  : "transparent",
                border: "none",
                borderBottom: activeTab === t.id
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                color: activeTab === t.id ? "var(--fg)" : "var(--fg-dim)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "background var(--dur-fast), color var(--dur-fast)",
              }}
            >
              <span style={{ fontSize: 11 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Chart-only controls: symbol, price, TF */}
        {isChart && (
          <>
            <button
              onClick={() => setSearchOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--bg)",
                border: "1px solid var(--bg-elev-2)",
                borderRadius: 4,
                padding: "4px 10px",
                color: "var(--fg)",
                fontWeight: 600, fontSize: 13,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {symbol}
              <span style={{ fontSize: 9, color: "var(--fg-dim)" }}>▼</span>
            </button>

            {livePrice && (
              <>
                <span style={{
                  fontSize: 14, fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: livePrice.dir === "up" ? "var(--bull)"
                    : livePrice.dir === "down" ? "var(--bear)" : "var(--fg)",
                  flexShrink: 0,
                }}>
                  {livePrice.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: livePrice.changePct >= 0 ? "var(--bull)" : "var(--bear)",
                  flexShrink: 0,
                }}>
                  {livePrice.changePct >= 0 ? "+" : ""}{livePrice.changePct.toFixed(2)}%
                </span>
              </>
            )}

            <div style={{ flex: 1 }} />

            {/* TF group */}
            <div style={{
              display: "flex", gap: 1,
              background: "var(--bg)",
              border: "1px solid var(--bg-elev-2)",
              borderRadius: 4, padding: 2,
              flexShrink: 0,
            }}>
              {TFS.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTF(tf)}
                  style={{
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 500,
                    background: tf === timeframe ? "var(--accent)" : "transparent",
                    border: "none",
                    borderRadius: 3,
                    color: tf === timeframe ? "#fff" : "var(--fg-dim)",
                    cursor: "pointer",
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </>
        )}

        {!isChart && <div style={{ flex: 1 }} />}

        {/* WS status pill (right) */}
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 10, color: "var(--fg-dim)", flexShrink: 0,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: statusColor(wsStatus),
            boxShadow: wsStatus === "live" ? `0 0 4px ${statusColor(wsStatus)}` : "none",
          }} />
          {statusLabel(wsStatus)}
        </div>
      </header>

      {searchOpen && (
        <div
          className="search-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) { setSearchOpen(false); setQuery(""); } }}
        >
          <div className="search-box">
            <input
              className="search-input"
              autoFocus
              placeholder="Search symbol…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setSearchOpen(false); setQuery(""); }
                if (e.key === "Enter" && filtered[0]) pick(filtered[0]);
              }}
            />
            <div className="search-results">
              {filtered.map((sym) => (
                <div key={sym} className="search-result" onClick={() => pick(sym)}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{sym}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
