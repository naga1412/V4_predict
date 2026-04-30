/**
 * Swing / pivot detection (Bill Williams "fractal" method).
 *
 * A high at index i is a swing-high if  high[i] > max(high[i-L..i-1]) AND
 * high[i] >= max(high[i+1..i+R]). Symmetric for lows. L/R default 2 (5-bar pivot).
 */

import type { Bar, Pivot, PivotKind, Trend } from "./types.js";

export interface PivotOpts {
  left?: number;
  right?: number;
}

export function findPivots(candles: Bar[], opts: PivotOpts = {}): Pivot[] {
  const { left = 2, right = 2 } = opts;
  const n = candles.length;
  const out: Pivot[] = [];
  for (let i = left; i < n - right; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= left; k++) {
      if (candles[i - k]!.h >= c.h) isHigh = false;
      if (candles[i - k]!.l <= c.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    for (let k = 1; k <= right; k++) {
      if (candles[i + k]!.h > c.h) isHigh = false;
      if (candles[i + k]!.l < c.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ i, t: c.t, price: c.h, kind: "high" });
    if (isLow) out.push({ i, t: c.t, price: c.l, kind: "low" });
  }
  return out;
}

/**
 * Classify each pivot vs its previous same-kind pivot:
 *   HH = higher high, LH = lower high, HL = higher low, LL = lower low.
 * Mutates `pivots` and returns it.
 */
export function classifyPivots(pivots: Pivot[]): Pivot[] {
  let lastHigh: Pivot | null = null;
  let lastLow: Pivot | null = null;
  for (const p of pivots) {
    if (p.kind === "high") {
      p.class = !lastHigh ? "H" : (p.price > lastHigh.price ? "HH" : "LH");
      lastHigh = p;
    } else {
      p.class = !lastLow ? "L" : (p.price > lastLow.price ? "HL" : "LL");
      lastLow = p;
    }
  }
  return pivots;
}

/**
 * Derive the instantaneous trend from the last few classified pivots:
 *   uptrend = HH+HL, downtrend = LH+LL, range = mixed.
 */
export function currentTrend(pivots: Pivot[]): Trend {
  const last = pivots.slice(-4);
  const findLast = <T,>(arr: T[], pred: (x: T) => boolean): T | undefined => {
    for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i]!)) return arr[i]!;
    return undefined;
  };
  const h = findLast(last, (p: Pivot) => p.kind === "high");
  const l = findLast(last, (p: Pivot) => p.kind === "low");
  if (!h || !l) return "unknown";
  if (h.class === "HH" && l.class === "HL") return "up";
  if (h.class === "LH" && l.class === "LL") return "down";
  return "range";
}

export type { PivotKind };
