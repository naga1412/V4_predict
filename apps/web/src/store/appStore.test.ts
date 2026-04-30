/**
 * Unit tests for the Zustand store.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./appStore.js";

describe("appStore", () => {
  beforeEach(() => {
    useAppStore.setState({
      activeTab: "chart",
      symbol: "BTC/USDT",
      timeframe: "1h",
      wsStatus: "connecting",
      livePrice: null,
      tradeSetup: null,
      mtfBias: null,
      news: [],
      metaBrain: null,
      mistakeSummary: null,
      regime: "unknown",
      wyckoffPhase: "unknown",
    });
  });

  it("has sensible initial state", () => {
    const s = useAppStore.getState();
    expect(s.activeTab).toBe("chart");
    expect(s.symbol).toBe("BTC/USDT");
    expect(s.timeframe).toBe("1h");
    expect(s.wsStatus).toBe("connecting");
  });

  it("switches tabs", () => {
    useAppStore.getState().setActiveTab("news");
    expect(useAppStore.getState().activeTab).toBe("news");
    useAppStore.getState().setActiveTab("system");
    expect(useAppStore.getState().activeTab).toBe("system");
  });

  it("sets symbol", () => {
    useAppStore.getState().setSymbol("ETH/USDT");
    expect(useAppStore.getState().symbol).toBe("ETH/USDT");
  });

  it("sets timeframe", () => {
    useAppStore.getState().setTimeframe("5m");
    expect(useAppStore.getState().timeframe).toBe("5m");
  });

  it("sets WS status through full lifecycle", () => {
    const set = useAppStore.getState().setWsStatus;
    set("live");
    expect(useAppStore.getState().wsStatus).toBe("live");
    set("reconnecting");
    expect(useAppStore.getState().wsStatus).toBe("reconnecting");
    set("error");
    expect(useAppStore.getState().wsStatus).toBe("error");
    set("offline");
    expect(useAppStore.getState().wsStatus).toBe("offline");
  });

  it("sets live price with direction", () => {
    useAppStore.getState().setLivePrice({ price: 100, change: 1.5, changePct: 1.5, dir: "up" });
    const lp = useAppStore.getState().livePrice;
    expect(lp).not.toBeNull();
    expect(lp!.price).toBe(100);
    expect(lp!.dir).toBe("up");
  });

  it("sets trade setup and clears", () => {
    useAppStore.getState().setTradeSetup({
      signal: "LONG",
      entryMin: 99, entryMax: 101,
      tp1: 105, tp2: 110, sl: 95,
      rrTp1: "2.00", rrTp2: "5.00",
      leverage: 5, atr: 2,
    });
    expect(useAppStore.getState().tradeSetup?.signal).toBe("LONG");
    useAppStore.getState().setTradeSetup(null);
    expect(useAppStore.getState().tradeSetup).toBeNull();
  });

  it("sets MTF bias", () => {
    useAppStore.getState().setMTFBias({
      direction: "Bullish",
      phase: "markup",
      confidence: "High",
      condition: "trending up",
      bullPct: 75,
      aligned: true,
      tfs: [],
    });
    expect(useAppStore.getState().mtfBias?.direction).toBe("Bullish");
  });

  it("appends news items", () => {
    useAppStore.getState().setNews([
      { guid: "1", title: "x", link: "", source: "y", pubDate: 0,
        sentiment: { label: "BULL", compound: 0.5 }, category: "macro", highImpact: true },
    ]);
    expect(useAppStore.getState().news.length).toBe(1);
  });

  it("sets meta-brain decision", () => {
    useAppStore.getState().setMetaBrain({
      direction: "long", probability: 0.62,
      intervalLo: 0.55, intervalHi: 0.69,
      vetoed: false, vetoReason: null,
      champion: "default", retrained: null,
    });
    expect(useAppStore.getState().metaBrain?.direction).toBe("long");
  });

  it("sets regime + wyckoff", () => {
    useAppStore.getState().setRegime("trending-up-strong-normal-vol");
    useAppStore.getState().setWyckoffPhase("markup");
    expect(useAppStore.getState().regime).toContain("trending-up");
    expect(useAppStore.getState().wyckoffPhase).toBe("markup");
  });
});
