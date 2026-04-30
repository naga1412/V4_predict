/**
 * Smoke + functionality tests for the Topbar.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Topbar } from "./Topbar.js";
import { useAppStore } from "../store/appStore.js";

function reset() {
  useAppStore.setState({
    activeTab: "chart",
    symbol: "BTC/USDT",
    timeframe: "1h",
    wsStatus: "connecting",
    livePrice: null,
  });
}

describe("Topbar", () => {
  beforeEach(reset);

  it("renders brand, symbol, TFs, tabs, and status pill", () => {
    render(<Topbar />);
    expect(screen.getByText(/V\.4/)).toBeTruthy();
    expect(screen.getByText("BTC/USDT")).toBeTruthy();
    expect(screen.getByText("1m")).toBeTruthy();
    expect(screen.getByText("1h")).toBeTruthy();
    expect(screen.getByText("1w")).toBeTruthy();
    expect(screen.getByText("Chart")).toBeTruthy();
    expect(screen.getByText("Scanner")).toBeTruthy();
    expect(screen.getByText("Backtest")).toBeTruthy();
    expect(screen.getByText("News")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText(/Connecting/)).toBeTruthy();
  });

  it("changes timeframe when a TF button is clicked", () => {
    render(<Topbar />);
    fireEvent.click(screen.getByText("5m"));
    expect(useAppStore.getState().timeframe).toBe("5m");
    fireEvent.click(screen.getByText("4h"));
    expect(useAppStore.getState().timeframe).toBe("4h");
  });

  it("changes activeTab when a tab is clicked", () => {
    render(<Topbar />);
    fireEvent.click(screen.getByText("News"));
    expect(useAppStore.getState().activeTab).toBe("news");
    fireEvent.click(screen.getByText("System"));
    expect(useAppStore.getState().activeTab).toBe("system");
    fireEvent.click(screen.getByText("Backtest"));
    expect(useAppStore.getState().activeTab).toBe("backtest");
  });

  it("opens search modal on symbol-button click and picks a new symbol", () => {
    render(<Topbar />);
    const symbolBtn = screen.getByText("BTC/USDT");
    fireEvent.click(symbolBtn);
    const input = screen.getByPlaceholderText("Search symbol…");
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: "ETH" } });
    fireEvent.click(screen.getByText("ETH/USDT"));
    expect(useAppStore.getState().symbol).toBe("ETH/USDT");
  });

  it("closes search modal on Escape", () => {
    render(<Topbar />);
    fireEvent.click(screen.getByText("BTC/USDT"));
    const input = screen.getByPlaceholderText("Search symbol…");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Search symbol…")).toBeNull();
  });

  it("reflects live price + direction colour", () => {
    useAppStore.setState({ livePrice: { price: 50000, change: 100, changePct: 0.2, dir: "up" } });
    render(<Topbar />);
    expect(screen.getByText("50,000")).toBeTruthy();
    expect(screen.getByText("+0.20%")).toBeTruthy();
  });

  it("status pill switches with wsStatus", () => {
    useAppStore.setState({ wsStatus: "live" });
    const { rerender } = render(<Topbar />);
    expect(screen.getByText("Live")).toBeTruthy();
    useAppStore.setState({ wsStatus: "reconnecting" });
    rerender(<Topbar />);
    expect(screen.getByText(/Reconnecting/)).toBeTruthy();
    useAppStore.setState({ wsStatus: "error" });
    rerender(<Topbar />);
    expect(screen.getByText("Error")).toBeTruthy();
    useAppStore.setState({ wsStatus: "offline" });
    rerender(<Topbar />);
    expect(screen.getByText("Offline")).toBeTruthy();
  });

  it("hides chart-only controls (symbol picker, TFs) on non-chart tabs", () => {
    useAppStore.setState({ activeTab: "scanner" });
    render(<Topbar />);
    // symbol picker button should not be rendered on Scanner
    expect(screen.queryByText("BTC/USDT")).toBeNull();
    // TF buttons gone too
    expect(screen.queryByText("5m")).toBeNull();
  });
});
