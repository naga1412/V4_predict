import { useState } from "react";
import { useAppStore } from "../store/appStore.js";
import type { NewsItem } from "../store/appStore.js";

type Category = "all" | "macro" | "crypto" | "onchain" | "social";

const CATEGORY_LABELS: { id: Category; label: string }[] = [
  { id: "all",     label: "All"     },
  { id: "macro",   label: "Macro"   },
  { id: "crypto",  label: "Crypto"  },
  { id: "onchain", label: "On-chain"},
  { id: "social",  label: "Social"  },
];

function sentimentClass(label: "BULL" | "BEAR" | "NEUT") {
  return label === "BULL" ? "badge nbull" : label === "BEAR" ? "badge nbear" : "badge nneutral";
}

function relativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <div style={{
      padding: "7px 10px",
      borderBottom: "1px solid var(--bg-elev-2)",
      display: "flex",
      flexDirection: "column",
      gap: 3,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <span className={sentimentClass(item.sentiment.label)} style={{ fontSize: 9, flexShrink: 0, marginTop: 1 }}>
          {item.sentiment.label}
        </span>
        {item.highImpact && (
          <span className="badge badge-warn" style={{ fontSize: 9, flexShrink: 0, marginTop: 1 }}>HIGH</span>
        )}
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: "var(--fg)", lineHeight: 1.35, textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--fg)")}
        >
          {item.title}
        </a>
      </div>
      <div style={{ fontSize: 10, color: "var(--fg-dim)", display: "flex", gap: 8 }}>
        <span>{item.source}</span>
        <span>{relativeTime(item.pubDate)}</span>
      </div>
    </div>
  );
}

export function NewsPanel() {
  const news     = useAppStore((s) => s.news);
  const [cat, setCat]         = useState<Category>("all");
  const [highOnly, setHighOnly] = useState(false);
  const [open, setOpen]       = useState(true);

  const filtered = news.filter((n) => {
    if (highOnly && !n.highImpact) return false;
    if (cat !== "all" && n.category !== cat) return false;
    return true;
  });

  return (
    <div className="card" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="card-header" onClick={() => setOpen((o) => !o)}>
        <span>News & Sentiment</span>
        <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button
            className={`ir-btn${highOnly ? " active" : ""}`}
            style={{ fontSize: 10, padding: "1px 6px" }}
            onClick={() => setHighOnly((v) => !v)}
          >
            High Impact
          </button>
        </div>
      </div>

      <div className={`acc-body${open ? "" : " closed"}`}
        style={{ maxHeight: open ? 420 : 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Category tabs */}
        <div style={{
          display: "flex",
          gap: 1,
          padding: "4px 8px",
          borderBottom: "1px solid var(--bg-elev-2)",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}>
          {CATEGORY_LABELS.map(({ id, label }) => (
            <button
              key={id}
              className={`ir-btn${cat === id ? " active" : ""}`}
              onClick={() => setCat(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 10px", fontSize: 12, color: "var(--fg-dim)" }}>
              {news.length === 0 ? "Waiting for news feed…" : "No items match filters."}
            </div>
          ) : (
            filtered.map((n) => <NewsRow key={n.guid} item={n} />)
          )}
        </div>
      </div>
    </div>
  );
}
