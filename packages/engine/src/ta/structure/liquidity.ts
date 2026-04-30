/**
 * Liquidity zones — equal highs (EQH), equal lows (EQL), and sweeps.
 *
 * EQH/EQL: ≥ minTouches swing pivots within `tolerance` of each other.
 * Sweep: wick violates the level but body closes back inside.
 */

import type { Bar, EQLevel, LiquidityResult, LiquiditySweep, Pivot } from "./types.js";

export interface LiquidityOpts {
  /** Price tolerance (typically ATR-scaled). Required > 0. */
  tolerance?: number;
  minTouches?: number;
}

export function detectLiquidity(
  candles: Bar[],
  pivots: Pivot[] = [],
  opts: LiquidityOpts = {}
): LiquidityResult {
  const { tolerance = 0, minTouches = 2 } = opts;
  if (!Array.isArray(candles) || !Number.isFinite(tolerance) || tolerance <= 0) {
    return { eqHighs: [], eqLows: [], sweeps: [] };
  }
  const highs = pivots.filter((p) => p.kind === "high").slice().sort((a, b) => a.i - b.i);
  const lows = pivots.filter((p) => p.kind === "low").slice().sort((a, b) => a.i - b.i);

  const eqHighs = cluster(highs, tolerance, minTouches);
  const eqLows = cluster(lows, tolerance, minTouches);

  const sweeps: LiquiditySweep[] = [];
  for (const L of eqHighs) {
    const first = Math.max(...L.indices);
    for (let j = first + 1; j < candles.length; j++) {
      const b = candles[j]!;
      if (b.h > L.price && b.c < L.price) {
        sweeps.push({
          kind: "bearish",
          i: j,
          t: b.t,
          level: L.price,
          severity: (b.h - L.price) / tolerance,
        });
        L.sweptAt = b.t;
        break;
      }
    }
  }
  for (const L of eqLows) {
    const first = Math.max(...L.indices);
    for (let j = first + 1; j < candles.length; j++) {
      const b = candles[j]!;
      if (b.l < L.price && b.c > L.price) {
        sweeps.push({
          kind: "bullish",
          i: j,
          t: b.t,
          level: L.price,
          severity: (L.price - b.l) / tolerance,
        });
        L.sweptAt = b.t;
        break;
      }
    }
  }

  return { eqHighs, eqLows, sweeps };
}

function cluster(
  sortedPivots: Pivot[],
  tolerance: number,
  minTouches: number
): EQLevel[] {
  const byPrice = sortedPivots.slice().sort((a, b) => a.price - b.price);
  interface Group { pts: Pivot[]; avg: number }
  const groups: Group[] = [];
  for (const p of byPrice) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(p.price - last.avg) <= tolerance) {
      last.pts.push(p);
      last.avg = last.pts.reduce((a, x) => a + x.price, 0) / last.pts.length;
    } else {
      groups.push({ pts: [p], avg: p.price });
    }
  }
  return groups
    .filter((g) => g.pts.length >= minTouches)
    .map((g) => ({
      price: g.avg,
      indices: g.pts.map((p) => p.i),
      times: g.pts.map((p) => p.t),
      touches: g.pts.length,
      sweptAt: null,
    }))
    .sort((a, b) => a.price - b.price);
}
