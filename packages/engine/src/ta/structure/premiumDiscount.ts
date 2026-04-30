/**
 * Premium / Discount zones (ICT).
 *
 * Splits the structural range [rangeLow, rangeHigh] into zones:
 *   Discount    : 0 – 45 %
 *   Equilibrium : 45 – 55 %
 *   Premium     : 55 – 100 %
 */

import type { Bar, Pivot, PremiumDiscountInfo } from "./types.js";

export interface PremiumDiscountOpts {
  rangeHigh?: number;
  rangeLow?: number;
}

export function premiumDiscount(
  candles: Bar[],
  pivots: Pivot[] = [],
  opts: PremiumDiscountOpts = {}
): PremiumDiscountInfo | null {
  if (!candles?.length) return null;
  const lastClose = +candles[candles.length - 1]!.c;

  let rangeHigh: number;
  let rangeLow: number;
  if (Number.isFinite(opts.rangeHigh) && Number.isFinite(opts.rangeLow)) {
    rangeHigh = opts.rangeHigh!;
    rangeLow = opts.rangeLow!;
  } else {
    const sorted = pivots.slice().sort((a, b) => b.i - a.i);
    let lastHigh: Pivot | null = null;
    let lastLow: Pivot | null = null;
    for (const p of sorted) {
      if (!lastHigh && p.kind === "high") lastHigh = p;
      if (!lastLow && p.kind === "low") lastLow = p;
      if (lastHigh && lastLow) break;
    }
    if (!lastHigh || !lastLow) {
      rangeHigh = Math.max(...candles.map((c) => +c.h));
      rangeLow = Math.min(...candles.map((c) => +c.l));
    } else {
      rangeHigh = lastHigh.price;
      rangeLow = lastLow.price;
    }
  }
  if (rangeHigh <= rangeLow) return null;

  const width = rangeHigh - rangeLow;
  const mid = (rangeHigh + rangeLow) / 2;

  const zones = {
    discount: { from: rangeLow, to: rangeLow + width * 0.45 },
    equilibriumLow: { from: rangeLow + width * 0.45, to: mid },
    equilibriumHigh: { from: mid, to: rangeLow + width * 0.55 },
    premium: { from: rangeLow + width * 0.55, to: rangeHigh },
  };

  const pct = (lastClose - rangeLow) / width;
  let lastZone: PremiumDiscountInfo["lastZone"];
  if (pct < 0 || pct > 1) lastZone = "outside";
  else if (pct < 0.45) lastZone = "discount";
  else if (pct <= 0.55) lastZone = "equilibrium";
  else lastZone = "premium";

  return { rangeHigh, rangeLow, mid, width, zones, lastPct: pct, lastZone };
}
