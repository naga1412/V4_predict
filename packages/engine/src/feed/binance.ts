/**
 * Binance public market-data feed.
 *
 * Two surfaces:
 *  - fetchKlines(): REST historical candles (no auth)
 *  - openKlineStream(): WebSocket live candle updates
 *
 * Both emit to EventBus on:
 *   "chart:history" → { symbol, tf, candles }
 *   "chart:tick"    → { t, o, h, l, c, v, closed }
 *   "price:update"  → { price, change, changePct, dir }
 */

import { EventBus } from "../core/bus.js";

export interface KlineCandle {
  t: number; // open time (ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  closed?: boolean;
}

const TF_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

/** "BTC/USDT" → "BTCUSDT" — Binance pair format */
export function toBinanceSymbol(symbol: string): string {
  return symbol.replace("/", "").toUpperCase();
}

/* ═════════════════════ REST history ═════════════════════ */

export async function fetchKlines(opts: {
  symbol: string;
  tf: string;
  limit?: number;
}): Promise<KlineCandle[]> {
  const { symbol, tf, limit = 500 } = opts;
  const interval = TF_MAP[tf] ?? "1h";
  const sym = toBinanceSymbol(symbol);
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance REST ${res.status}: ${res.statusText}`);
  const rows = (await res.json()) as unknown[];

  return rows.map((r) => {
    const row = r as [number, string, string, string, string, string, ...unknown[]];
    return {
      t: row[0],
      o: parseFloat(row[1]),
      h: parseFloat(row[2]),
      l: parseFloat(row[3]),
      c: parseFloat(row[4]),
      v: parseFloat(row[5]),
      closed: true,
    };
  });
}

export async function loadHistory(symbol: string, tf: string): Promise<void> {
  try {
    const candles = await fetchKlines({ symbol, tf, limit: 500 });
    EventBus.emit("chart:history", { symbol, tf, candles });
    if (candles.length >= 2) {
      const last = candles[candles.length - 1]!;
      const first = candles[0]!;
      const change = last.c - first.c;
      const changePct = first.c !== 0 ? (change / first.c) * 100 : 0;
      EventBus.emit("price:update", {
        price: last.c,
        change,
        changePct,
        dir: change > 0 ? "up" : change < 0 ? "down" : "flat",
      });
    }
  } catch (err) {
    EventBus.emit("feed:error", {
      stage: "history",
      error: (err as Error)?.message ?? String(err),
    });
  }
}

/* ═════════════════════ WebSocket stream ═════════════════════ */

export interface KlineStream {
  close: () => void;
  socket: WebSocket;
}

export function openKlineStream(opts: {
  symbol: string;
  tf: string;
  onStatus?: (s: "connecting" | "live" | "reconnecting" | "error" | "offline") => void;
}): KlineStream {
  const { symbol, tf, onStatus } = opts;
  const interval = TF_MAP[tf] ?? "1h";
  const sym = toBinanceSymbol(symbol).toLowerCase();
  const url = `wss://stream.binance.com:9443/ws/${sym}@kline_${interval}`;

  let manualClose = false;
  let backoff = 1_000;
  let socket: WebSocket;
  let lastClose: number | null = null;

  const connect = () => {
    onStatus?.("connecting");
    socket = new WebSocket(url);

    socket.onopen = () => {
      onStatus?.("live");
      backoff = 1_000;
    };

    socket.onmessage = (ev: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(ev.data) as {
          k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean };
        };
        const k = msg.k;
        const candle: KlineCandle = {
          t: k.t,
          o: parseFloat(k.o),
          h: parseFloat(k.h),
          l: parseFloat(k.l),
          c: parseFloat(k.c),
          v: parseFloat(k.v),
          closed: k.x,
        };
        EventBus.emit("chart:tick", candle);

        const prevClose = lastClose;
        if (k.x) lastClose = candle.c;
        if (prevClose != null) {
          const change = candle.c - prevClose;
          const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
          EventBus.emit("price:update", {
            price: candle.c,
            change,
            changePct,
            dir: change > 0 ? "up" : change < 0 ? "down" : "flat",
          });
        } else {
          EventBus.emit("price:update", {
            price: candle.c,
            change: 0,
            changePct: 0,
            dir: "flat",
          });
        }
      } catch (err) {
        EventBus.emit("feed:error", {
          stage: "stream-parse",
          error: (err as Error)?.message ?? String(err),
        });
      }
    };

    socket.onerror = () => {
      onStatus?.("error");
    };

    socket.onclose = () => {
      if (manualClose) {
        onStatus?.("offline");
        return;
      }
      onStatus?.("reconnecting");
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
  };

  connect();

  return {
    get socket() { return socket; },
    close: () => {
      manualClose = true;
      try { socket.close(); } catch { /* noop */ }
    },
  };
}
