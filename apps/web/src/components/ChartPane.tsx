import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData } from "lightweight-charts";
import { useAppStore } from "../store/appStore.js";
import { useBusEvent } from "../hooks/useBus.js";

interface CandlePayload {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export function ChartPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef       = useRef<ISeriesApi<"Histogram"> | null>(null);

  const symbol    = useAppStore((s) => s.symbol);
  const timeframe = useAppStore((s) => s.timeframe);

  // Initialise chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#b2b5be",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e222d" },
        horzLines: { color: "#1e222d" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#4c525e", width: 1, style: 1 },
        horzLine: { color: "#4c525e", width: 1, style: 1 },
      },
      rightPriceScale: {
        borderColor: "#2a2e39",
        scaleMargins: { top: 0.1, bottom: 0.28 },
      },
      timeScale: {
        borderColor: "#2a2e39",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:   "#26a69a",
      downColor: "#ef5350",
      borderUpColor:   "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor:   "#26a69a",
      wickDownColor: "#ef5350",
    });

    const volSeries = chart.addHistogramSeries({
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current  = chart;
    candleRef.current = candleSeries;
    volRef.current    = volSeries;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      volRef.current    = null;
    };
  }, []);

  // Clear chart when symbol or timeframe changes
  useEffect(() => {
    candleRef.current?.setData([]);
    volRef.current?.setData([]);
  }, [symbol, timeframe]);

  // Receive bulk candle history
  useBusEvent<{ candles: CandlePayload[] }>("chart:history", ({ candles }) => {
    if (!candleRef.current || !volRef.current) return;
    const cd: CandlestickData[] = candles.map((c) => ({
      time: (c.t / 1000) as unknown as CandlestickData["time"],
      open: c.o, high: c.h, low: c.l, close: c.c,
    }));
    const vd: HistogramData[] = candles.map((c) => ({
      time: (c.t / 1000) as unknown as HistogramData["time"],
      value: c.v ?? 0,
      color: c.c >= c.o ? "#26a69a44" : "#ef535044",
    }));
    candleRef.current.setData(cd);
    volRef.current.setData(vd);
    chartRef.current?.timeScale().fitContent();
  }, []);

  // Receive single candle update (tick or close)
  useBusEvent<CandlePayload>("chart:tick", (c) => {
    if (!candleRef.current || !volRef.current) return;
    const time = (c.t / 1000) as unknown as CandlestickData["time"];
    candleRef.current.update({ time, open: c.o, high: c.h, low: c.l, close: c.c });
    volRef.current.update({ time, value: c.v ?? 0, color: c.c >= c.o ? "#26a69a44" : "#ef535044" });
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", background: "#131722" }}
    >
      {/* Overlay: symbol + tf watermark */}
      <div style={{
        position: "absolute",
        top: 8,
        left: 10,
        pointerEvents: "none",
        zIndex: 1,
        fontSize: 11,
        color: "#4c525e",
        fontWeight: 600,
        letterSpacing: "0.04em",
        userSelect: "none",
      }}>
        {symbol} · {timeframe}
      </div>
    </div>
  );
}
