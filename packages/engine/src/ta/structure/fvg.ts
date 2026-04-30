/**
 * Fair Value Gap (FVG) detector — 3-candle ICT pattern.
 *
 * Bullish FVG: candle[i-2].high < candle[i].low
 * Bearish FVG: candle[i-2].low  > candle[i].high
 *
 * Tracks mitigation: an FVG closes once price trades back through its zone.
 */

import type { Bar, FVGResult, FVGZone } from "./types.js";

export interface FVGOpts {
  fromIdx?: number;
}

export function detectFVG(candles: Bar[], opts: FVGOpts = {}): FVGResult {
  const { fromIdx = 2 } = opts;
  const open: FVGZone[] = [];
  const mitigated: FVGZone[] = [];
  for (let i = Math.max(2, fromIdx); i < candles.length; i++) {
    const a = candles[i - 2]!;
    const c = candles[i]!;
    if (a.h < c.l) {
      open.push({ i, t: c.t, kind: "bull", top: c.l, bottom: a.h, createdAtIdx: i });
    } else if (a.l > c.h) {
      open.push({ i, t: c.t, kind: "bear", top: a.l, bottom: c.h, createdAtIdx: i });
    }
    for (let j = open.length - 1; j >= 0; j--) {
      const g = open[j]!;
      if (g.createdAtIdx >= i) continue;
      const c2 = candles[i]!;
      const touched = c2.l <= g.top && c2.h >= g.bottom;
      if (touched) {
        mitigated.push({ ...g, mitigatedAt: i, mitigatedT: c2.t });
        open.splice(j, 1);
      }
    }
  }
  return { open, mitigated };
}
