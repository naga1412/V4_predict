/**
 * useFeed — opens a Binance kline stream for the current symbol/TF and
 * preloads historical candles. Switches feeds when symbol/TF change.
 *
 * Wires:
 *   - "chart:history" / "chart:tick" → ChartPane (already listens via useBusEvent)
 *   - "price:update"                  → store.setLivePrice
 *   - status callback                 → store.setWsStatus
 */
import { useEffect } from "react";
import { loadHistory, openKlineStream, EventBus } from "@v4/engine";
import type { KlineStream } from "@v4/engine";
import { useAppStore } from "../store/appStore.js";
import type { LivePrice } from "../store/appStore.js";

export function useFeed(): void {
  const symbol      = useAppStore((s) => s.symbol);
  const timeframe   = useAppStore((s) => s.timeframe);
  const setWsStatus = useAppStore((s) => s.setWsStatus);
  const setLivePrice = useAppStore((s) => s.setLivePrice);

  // price:update → store
  useEffect(() => {
    return EventBus.on<LivePrice>("price:update", (p) => {
      if (p) setLivePrice(p);
    });
  }, [setLivePrice]);

  // history + websocket per (symbol, tf)
  useEffect(() => {
    let stream: KlineStream | null = null;
    let cancelled = false;

    void loadHistory(symbol, timeframe).then(() => {
      if (cancelled) return;
      stream = openKlineStream({
        symbol,
        tf: timeframe,
        onStatus: (s) => setWsStatus(s),
      });
    });

    return () => {
      cancelled = true;
      stream?.close();
    };
  }, [symbol, timeframe, setWsStatus]);
}
