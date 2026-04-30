import { create } from "zustand";

export type Tab = "chart" | "scanner" | "backtest" | "news" | "chat" | "system";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
export type WsStatus = "connecting" | "live" | "reconnecting" | "error" | "offline";

export interface LivePrice {
  price: number;
  change: number;
  changePct: number;
  dir: "up" | "down" | "flat";
}

export interface TradeSetup {
  signal: "LONG" | "SHORT" | "NEUTRAL";
  entryMin: number;
  entryMax: number;
  tp1: number;
  tp2: number;
  sl: number;
  rrTp1: string;
  rrTp2: string;
  leverage: number;
  pattern?: string;
  patternBias?: string;
  atr?: number;
  rsi?: number;
}

export interface MTFBias {
  direction: "Bullish" | "Bearish" | "Neutral";
  phase: string;
  confidence: "High" | "Medium" | "Low";
  condition: string;
  bullPct: number;
  aligned: boolean;
  tfs: Array<{ tf: string; bias: string; score: number }>;
}

export interface NewsItem {
  guid: string;
  title: string;
  link: string;
  source: string;
  pubDate: number;
  sentiment: { label: "BULL" | "BEAR" | "NEUT"; compound: number };
  category: string;
  highImpact: boolean;
}

export interface MetaBrainState {
  direction: "long" | "short" | "neutral";
  probability: number;
  intervalLo: number;
  intervalHi: number;
  vetoed: false | "full" | "softened";
  vetoReason: string | null;
  champion: string | null;
  retrained: number | null;
}

export interface MistakeSummary {
  total: number;
  byErrorType: Record<string, number>;
  byRegime: Record<string, number>;
  lastT: number | null;
}

interface AppState {
  // Navigation
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  // Symbol & TF
  symbol: string;
  setSymbol: (s: string) => void;
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;

  // Connectivity
  wsStatus: WsStatus;
  setWsStatus: (s: WsStatus) => void;
  livePrice: LivePrice | null;
  setLivePrice: (p: LivePrice) => void;

  // Analysis data
  tradeSetup: TradeSetup | null;
  setTradeSetup: (s: TradeSetup | null) => void;
  mtfBias: MTFBias | null;
  setMTFBias: (b: MTFBias | null) => void;
  news: NewsItem[];
  setNews: (items: NewsItem[]) => void;
  metaBrain: MetaBrainState | null;
  setMetaBrain: (m: MetaBrainState | null) => void;
  mistakeSummary: MistakeSummary | null;
  setMistakeSummary: (s: MistakeSummary | null) => void;

  // Regime
  regime: string;
  setRegime: (r: string) => void;
  wyckoffPhase: string;
  setWyckoffPhase: (p: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "chart",
  setActiveTab: (tab) => set({ activeTab: tab }),

  symbol: "BTC/USDT",
  setSymbol: (symbol) => set({ symbol }),
  timeframe: "1h",
  setTimeframe: (timeframe) => set({ timeframe }),

  wsStatus: "connecting",
  setWsStatus: (wsStatus) => set({ wsStatus }),
  livePrice: null,
  setLivePrice: (livePrice) => set({ livePrice }),

  tradeSetup: null,
  setTradeSetup: (tradeSetup) => set({ tradeSetup }),
  mtfBias: null,
  setMTFBias: (mtfBias) => set({ mtfBias }),
  news: [],
  setNews: (news) => set({ news }),
  metaBrain: null,
  setMetaBrain: (metaBrain) => set({ metaBrain }),
  mistakeSummary: null,
  setMistakeSummary: (mistakeSummary) => set({ mistakeSummary }),

  regime: "unknown",
  setRegime: (regime) => set({ regime }),
  wyckoffPhase: "unknown",
  setWyckoffPhase: (wyckoffPhase) => set({ wyckoffPhase }),
}));
