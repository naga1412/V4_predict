/**
 * App tab-routing functionality tests.
 *
 * After the V1-pattern refactor, every tab is mounted at once and toggled
 * via display:none. So tab labels appear twice (Topbar nav + the tab body's
 * heading). Tests use getAllByText / role-scoped queries accordingly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useAppStore } from "../store/appStore.js";

vi.mock("../hooks/useEngine.js", () => ({ useEngine: () => undefined }));
vi.mock("../hooks/useFeed.js", () => ({ useFeed: () => undefined }));
vi.mock("../hooks/useTAEngine.js", () => ({ useTAEngine: () => undefined }));
vi.mock("../components/ChartPane.js", () => ({
  ChartPane: () => <div data-testid="chart-pane">CHART_PANE</div>,
}));
// Scanner and Backtest fetch from Binance on mount — mock them out for the
// store-driven tab-routing tests.
vi.mock("../components/ScannerTab.js", () => ({
  ScannerTab: () => <div data-testid="scanner-tab">Multi-symbol regime + setup ranking</div>,
}));
vi.mock("../components/BacktestTab.js", () => ({
  BacktestTab: () => <div data-testid="backtest-tab">Walk-forward backtest with equity curve</div>,
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

/** Click the topbar tab button (scoped to the navigation element). */
function clickTab(label: string): void {
  // Topbar's nav is the first nav element in the document
  const navs = document.querySelectorAll("nav");
  const topbarNav = navs[0]!;
  const btn = within(topbarNav as HTMLElement).getByText(label);
  fireEvent.click(btn);
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
    expect(screen.getByText(/Multi-symbol regime/)).toBeTruthy();
  });

  it("Backtest tab renders placeholder", () => {
    useAppStore.setState({ activeTab: "backtest" });
    render(<App />);
    expect(screen.getByText(/Walk-forward backtest/)).toBeTruthy();
  });

  it("News tab renders the NewsPanel as the main view", () => {
    useAppStore.setState({ activeTab: "news" });
    render(<App />);
    expect(screen.getAllByText("News & Sentiment").length).toBeGreaterThanOrEqual(1);
  });

  it("Chat tab renders placeholder", () => {
    useAppStore.setState({ activeTab: "chat" });
    render(<App />);
    expect(screen.getByText(/LLM market briefing/)).toBeTruthy();
  });

  it("System tab shows status fields", () => {
    useAppStore.setState({ activeTab: "system" });
    render(<App />);
    expect(screen.getByText("System Status")).toBeTruthy();
    expect(screen.getByText("WS Status")).toBeTruthy();
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.getByText("BTC/USDT")).toBeTruthy();
    // Regime, Wyckoff, Mistakes labels appear in System tab + Footer (≥2)
    expect(screen.getAllByText("Regime").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Wyckoff").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Mistakes").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("range-weak-normal-vol").length).toBeGreaterThanOrEqual(1);
  });

  it("clicking topbar tabs navigates between views", () => {
    render(<App />);
    expect(screen.getByTestId("chart-pane")).toBeTruthy();
    clickTab("Backtest");
    expect(useAppStore.getState().activeTab).toBe("backtest");
    clickTab("System");
    expect(useAppStore.getState().activeTab).toBe("system");
    clickTab("Scanner");
    expect(useAppStore.getState().activeTab).toBe("scanner");
    clickTab("Chart");
    expect(useAppStore.getState().activeTab).toBe("chart");
  });

  it("all tabs are persistently mounted (display-toggle pattern, V1 fix)", () => {
    render(<App />);
    // ChartPane renders via test mock; placeholders for other tabs render via PlaceholderTab.
    // Even though only 'chart' is the active tab, all the other detail strings exist in DOM, hidden.
    expect(screen.getByTestId("chart-pane")).toBeTruthy();
    expect(screen.getByText(/Multi-symbol regime/)).toBeTruthy();
    expect(screen.getByText(/Walk-forward backtest/)).toBeTruthy();
    expect(screen.getByText(/LLM market briefing/)).toBeTruthy();
  });

  it("footer KPI strip always renders", () => {
    render(<App />);
    expect(screen.getAllByText("Regime").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Wyckoff").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mistakes").length).toBeGreaterThanOrEqual(1);
  });
});
