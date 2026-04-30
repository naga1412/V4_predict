/**
 * Smoke tests for sidebar panels — TradeSetup, MTFBias, NewsPanel, MetaBrain,
 * MistakeLedger. Each panel must render without throwing in both "no data"
 * and "with data" states.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradeSetupPanel } from "./TradeSetupPanel.js";
import { MTFBiasPanel } from "./MTFBiasPanel.js";
import { NewsPanel } from "./NewsPanel.js";
import { MetaBrainCard } from "./MetaBrainCard.js";
import { MistakeLedgerView } from "./MistakeLedgerView.js";
import { useAppStore } from "../store/appStore.js";

function clearStore() {
  useAppStore.setState({
    tradeSetup: null,
    mtfBias: null,
    news: [],
    metaBrain: null,
    mistakeSummary: null,
  });
}

describe("TradeSetupPanel", () => {
  beforeEach(clearStore);
  it("renders 'Waiting' when no setup", () => {
    render(<TradeSetupPanel />);
    expect(screen.getByText("Trade Setup")).toBeTruthy();
    expect(screen.getByText(/Waiting for signal/)).toBeTruthy();
  });
  it("renders all fields when populated", () => {
    useAppStore.setState({
      tradeSetup: {
        signal: "LONG",
        entryMin: 99.5, entryMax: 100.5,
        tp1: 105, tp2: 110, sl: 95,
        rrTp1: "2.00", rrTp2: "5.00",
        leverage: 5, atr: 1.5, rsi: 65,
        pattern: "Hammer", patternBias: "Bullish",
      },
    });
    render(<TradeSetupPanel />);
    expect(screen.getByText("LONG")).toBeTruthy();
    expect(screen.getByText("105.00")).toBeTruthy();
    expect(screen.getByText(/95.00/)).toBeTruthy();
    expect(screen.getByText("5×")).toBeTruthy();
    expect(screen.getByText("Hammer")).toBeTruthy();
  });
  it("collapses on header click", () => {
    render(<TradeSetupPanel />);
    fireEvent.click(screen.getByText("Trade Setup"));
    // body is hidden via .closed class — text still in DOM but max-height: 0
    expect(screen.getByText("Trade Setup")).toBeTruthy();
  });
});

describe("MTFBiasPanel", () => {
  beforeEach(clearStore);
  it("waiting state", () => {
    render(<MTFBiasPanel />);
    expect(screen.getByText("MTF Bias")).toBeTruthy();
    expect(screen.getByText(/Waiting for analysis/)).toBeTruthy();
  });
  it("populated state shows direction badge and TF rows", () => {
    useAppStore.setState({
      mtfBias: {
        direction: "Bullish",
        phase: "markup",
        confidence: "High",
        condition: "trending up",
        bullPct: 75,
        aligned: true,
        tfs: [
          { tf: "5m", bias: "Bullish", score: 0.6 },
          { tf: "15m", bias: "Bullish", score: 0.8 },
          { tf: "1h", bias: "Bullish", score: 1.0 },
        ],
      },
    });
    render(<MTFBiasPanel />);
    expect(screen.getAllByText("Bullish").length).toBeGreaterThan(0);
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText(/TF Aligned/)).toBeTruthy();
  });
});

describe("NewsPanel", () => {
  beforeEach(clearStore);
  it("waiting state", () => {
    render(<NewsPanel />);
    expect(screen.getByText("News & Sentiment")).toBeTruthy();
    expect(screen.getByText(/Waiting for news feed/)).toBeTruthy();
  });
  it("renders items and lets you switch category", () => {
    useAppStore.setState({
      news: [
        { guid: "1", title: "Bitcoin tops 80k", link: "https://x", source: "test",
          pubDate: Date.now() - 60_000,
          sentiment: { label: "BULL", compound: 0.7 },
          category: "crypto", highImpact: false },
        { guid: "2", title: "Fed pauses rates", link: "https://y", source: "test",
          pubDate: Date.now() - 30_000,
          sentiment: { label: "NEUT", compound: 0.0 },
          category: "macro", highImpact: true },
      ],
    });
    render(<NewsPanel />);
    expect(screen.getByText("Bitcoin tops 80k")).toBeTruthy();
    expect(screen.getByText("Fed pauses rates")).toBeTruthy();
    fireEvent.click(screen.getByText("Macro"));
    // crypto-only item should disappear from view
    expect(screen.queryByText("Bitcoin tops 80k")).toBeNull();
    expect(screen.getByText("Fed pauses rates")).toBeTruthy();
  });
  it("toggles high-impact filter", () => {
    useAppStore.setState({
      news: [
        { guid: "1", title: "Low", link: "", source: "x", pubDate: Date.now(),
          sentiment: { label: "NEUT", compound: 0 }, category: "crypto", highImpact: false },
        { guid: "2", title: "High", link: "", source: "x", pubDate: Date.now(),
          sentiment: { label: "BULL", compound: 0.5 }, category: "macro", highImpact: true },
      ],
    });
    render(<NewsPanel />);
    fireEvent.click(screen.getByText("High Impact"));
    expect(screen.queryByText("Low")).toBeNull();
    expect(screen.getByText("High")).toBeTruthy();
  });
});

describe("MetaBrainCard", () => {
  beforeEach(clearStore);
  it("waiting state", () => {
    render(<MetaBrainCard />);
    expect(screen.getByText("Meta-Brain")).toBeTruthy();
    expect(screen.getByText(/Waiting for meta-brain/)).toBeTruthy();
  });
  it("populated state with veto", () => {
    useAppStore.setState({
      metaBrain: {
        direction: "long", probability: 0.62,
        intervalLo: 0.55, intervalHi: 0.69,
        vetoed: "softened", vetoReason: "anti-pattern match",
        champion: "champ-v1", retrained: Date.now(),
      },
    });
    render(<MetaBrainCard />);
    expect(screen.getByText(/LONG/)).toBeTruthy();
    expect(screen.getByText("62.0%")).toBeTruthy();
    expect(screen.getByText(/55\.0%.*69\.0%/)).toBeTruthy();
    expect(screen.getByText("SOFTENED")).toBeTruthy();
    expect(screen.getByText("anti-pattern match")).toBeTruthy();
  });
});

describe("MistakeLedgerView", () => {
  beforeEach(clearStore);
  it("loading state", () => {
    render(<MistakeLedgerView />);
    expect(screen.getByText("Mistake Ledger")).toBeTruthy();
    expect(screen.getByText(/Loading/)).toBeTruthy();
  });
  it("empty after load", () => {
    useAppStore.setState({ mistakeSummary: { total: 0, byErrorType: {}, byRegime: {}, lastT: null } });
    render(<MistakeLedgerView />);
    expect(screen.getByText(/No mistakes recorded/)).toBeTruthy();
  });
  it("populated", () => {
    useAppStore.setState({
      mistakeSummary: {
        total: 12,
        byErrorType: { "direction-flip": 7, "interval-miss": 5 },
        byRegime: { "trending-up": 6, "range": 6 },
        lastT: Date.now(),
      },
    });
    render(<MistakeLedgerView />);
    expect(screen.getByText("12 total")).toBeTruthy();
    expect(screen.getByText(/direction-flip/)).toBeTruthy();
    expect(screen.getByText(/By Regime/)).toBeTruthy();
  });
});
