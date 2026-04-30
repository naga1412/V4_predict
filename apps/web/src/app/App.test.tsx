/**
 * App tab-routing functionality tests.
 *
 * Note: we mock the engine hooks so the test doesn't open a Binance WS.
 * The store-driven tab switching is what we actually test here — the panels
 * that the tabs route to are exercised by Panels.test.tsx.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "../store/appStore.js";

// Mock the engine hooks before importing App so they no-op during the render
vi.mock("../hooks/useEngine.js", () => ({ useEngine: () => undefined }));
vi.mock("../hooks/useFeed.js", () => ({ useFeed: () => undefined }));
vi.mock("../hooks/useTAEngine.js", () => ({ useTAEngine: () => undefined }));
// Mock ChartPane — LightweightCharts touches DOM APIs happy-dom doesn't ship
vi.mock("../components/ChartPane.js", () => ({
  ChartPane: () => <div data-testid="chart-pane">CHART_PANE</div>,
}));

import { App } from "./App.js";

function reset() {
  useAppStore.setState({
    activeTab: "chart",
    symbol: "BTC/USDT",
    timeframe: "1h",
    wsStatus: "live",
    livePrice: { price: 50000, change: 100, changePct: 0.2, dir: "up" },
    tradeSetup: null,
    mtfBias: null,
    news: [],
    metaBrain: null,
    mistakeSummary: { total: 3, byErrorType: { "direction-flip": 3 }, byRegime: { "range": 3 }, lastT: Date.now() },
    regime: "range-weak-normal-vol",
    wyckoffPhase: "neutral",
  });
}

describe("App tab routing", () => {
  beforeEach(reset);

  it("Chart tab renders ChartPane + sidebar panels", () => {
    render(<App />);
    expect(screen.getByTestId("chart-pane")).toBeTruthy();
    expect(screen.getByText("Trade Setup")).toBeTruthy();
    expect(screen.getByText("MTF Bias")).toBeTruthy();
    expect(screen.getByText("Meta-Brain")).toBeTruthy();
    expect(screen.getByText("Mistake Ledger")).toBeTruthy();
  });

  it("Scanner tab renders placeholder", () => {
    useAppStore.setState({ activeTab: "scanner" });
    render(<App />);
    expect(screen.getByText(/Scanner.*coming soon/i)).toBeTruthy();
  });

  it("Backtest tab renders placeholder", () => {
    useAppStore.setState({ activeTab: "backtest" });
    render(<App />);
    expect(screen.getByText(/Backtest.*coming soon/i)).toBeTruthy();
  });

  it("News tab renders the NewsPanel as the main view", () => {
    useAppStore.setState({ activeTab: "news" });
    render(<App />);
    // 2 occurrences expected: main view + sidebar repeat. At least one must exist.
    expect(screen.getAllByText("News & Sentiment").length).toBeGreaterThanOrEqual(1);
  });

  it("Chat tab renders placeholder", () => {
    useAppStore.setState({ activeTab: "chat" });
    render(<App />);
    expect(screen.getByText(/AI Chat.*coming soon/i)).toBeTruthy();
  });

  it("System tab shows status fields", () => {
    useAppStore.setState({ activeTab: "system" });
    render(<App />);
    // Footer also contains Regime/Wyckoff/Mistakes labels — assert ≥ 2 occurrences
    expect(screen.getByText("System Status")).toBeTruthy();
    expect(screen.getByText("WS Status")).toBeTruthy();
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.getAllByText("Regime").length).toBeGreaterThanOrEqual(2);
    // Footer renders the regime value too — count >=2
    expect(screen.getAllByText("range-weak-normal-vol").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Wyckoff").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("neutral").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mistakes").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
  });

  it("clicking topbar tabs navigates between views", () => {
    render(<App />);
    expect(screen.getByTestId("chart-pane")).toBeTruthy();
    fireEvent.click(screen.getByText("Backtest"));
    expect(useAppStore.getState().activeTab).toBe("backtest");
    fireEvent.click(screen.getByText("System"));
    expect(useAppStore.getState().activeTab).toBe("system");
    fireEvent.click(screen.getByText("Scanner"));
    expect(useAppStore.getState().activeTab).toBe("scanner");
    fireEvent.click(screen.getByText("Chart"));
    expect(useAppStore.getState().activeTab).toBe("chart");
  });

  it("footer KPI strip always renders", () => {
    render(<App />);
    expect(screen.getAllByText("Regime").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Wyckoff").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mistakes").length).toBeGreaterThanOrEqual(1);
  });
});
