/**
 * Module-level candle cache.
 *
 * The `chart:history` event fires once on (symbol, tf) change. If the
 * ChartPane is unmounted at that moment (e.g. user is on a different tab),
 * the event is lost. This cache survives for the lifetime of the page so
 * a freshly-mounted ChartPane can re-hydrate from it.
 */

interface CandlePayload {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

interface CachedHistory {
  symbol: string;
  tf: string;
  candles: CandlePayload[];
}

let cache: CachedHistory | null = null;

export function setCachedHistory(symbol: string, tf: string, candles: CandlePayload[]): void {
  cache = { symbol, tf, candles: candles.slice() };
}

export function getCachedHistory(symbol: string, tf: string): CandlePayload[] | null {
  if (!cache) return null;
  if (cache.symbol !== symbol || cache.tf !== tf) return null;
  return cache.candles;
}

export function clearCachedHistory(): void {
  cache = null;
}
