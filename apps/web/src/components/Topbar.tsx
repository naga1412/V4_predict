import { useState, useCallback } from "react";
import { useAppStore } from "../store/appStore.js";
import type { Timeframe, WsStatus, Tab } from "../store/appStore.js";

const SYMBOLS = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
  "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
  "MATIC/USDT", "UNI/USDT", "ATOM/USDT", "LTC/USDT", "BCH/USDT",
];

const TFS: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

const TABS: { id: Tab; label: string }[] = [
  { id: "chart",   label: "Chart"    },
  { id: "scanner", label: "Scanner"  },
  { id: "backtest",label: "Backtest" },
  { id: "news",    label: "News"     },
  { id: "chat",    label: "Chat"     },
  { id: "system",  label: "System"   },
];

function statusColor(s: WsStatus): string {
  if (s === "live")        return "var(--bull)";
  if (s === "reconnecting") return "var(--warn)";
  if (s === "error")       return "var(--bear)";
  return "var(--fg-dim)";
}

function statusLabel(s: WsStatus): string {
  if (s === "live")         return "LIVE";
  if (s === "connecting")   return "CONNECTING";
  if (s === "reconnecting") return "RETRY";
  if (s === "error")        return "ERROR";
  return "OFFLINE";
}

export function Topbar() {
  const symbol      = useAppStore((s) => s.symbol);
  const setSymbol   = useAppStore((s) => s.setSymbol);
  const timeframe   = useAppStore((s) => s.timeframe);
  const setTF       = useAppStore((s) => s.setTimeframe);
  const activeTab   = useAppStore((s) => s.activeTab);
  const setTab      = useAppStore((s) => s.setActiveTab);
  const wsStatus    = useAppStore((s) => s.wsStatus);
  const livePrice   = useAppStore((s) => s.livePrice);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState("");

  const filtered = query.trim()
    ? SYMBOLS.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : SYMBOLS;

  const pick = useCallback((sym: string) => {
    setSymbol(sym);
    setSearchOpen(false);
    setQuery("");
  }, [setSymbol]);

  return (
    <>
      {/* ── Row 1: brand + symbol + tf + price + status ── */}
      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        borderBottom: "1px solid var(--bg-elev-2)",
        background: "var(--bg-elev-1)",
        overflow: "hidden",
      }}>
        {/* Brand */}
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", whiteSpace: "nowrap", marginRight: 4 }}>
          ⚡ V.4
        </span>

        {/* Symbol picker trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          style={{
            background: "var(--bg-elev-2)",
            border: "1px solid var(--bg-elev-3, #363a45)",
            borderRadius: 4,
            color: "var(--fg)",
            fontWeight: 700,
            fontSize: 13,
            padding: "3px 10px",
            cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          {symbol}
        </button>

        {/* TF selector */}
        <div style={{ display: "flex", gap: 1 }}>
          {TFS.map((tf) => (
            <button
              key={tf}
              onClick={() => setTF(tf)}
              style={{
                padding: "3px 7px",
                fontSize: 11,
                fontWeight: tf === timeframe ? 700 : 400,
                background: tf === timeframe
                  ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                  : "transparent",
                border: "1px solid transparent",
                borderColor: tf === timeframe
                  ? "color-mix(in srgb, var(--accent) 35%, transparent)"
                  : "transparent",
                borderRadius: 3,
                color: tf === timeframe ? "var(--accent)" : "var(--fg-dim)",
                cursor: "pointer",
              }}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Live price */}
        {livePrice && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginLeft: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {livePrice.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: livePrice.dir === "up" ? "var(--bull)" : livePrice.dir === "down" ? "var(--bear)" : "var(--fg-dim)",
            }}>
              {livePrice.changePct >= 0 ? "+" : ""}{livePrice.changePct.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Tab bar */}
        <nav className="tab-bar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab-btn${activeTab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* WS status pill */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 10,
          background: "var(--bg-elev-2)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: statusColor(wsStatus),
          whiteSpace: "nowrap",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: statusColor(wsStatus),
            boxShadow: wsStatus === "live" ? `0 0 4px ${statusColor(wsStatus)}` : "none",
          }} />
          {statusLabel(wsStatus)}
        </div>
      </header>

      {/* ── Search modal ── */}
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
