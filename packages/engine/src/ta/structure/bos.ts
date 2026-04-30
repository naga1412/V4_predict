/**
 * Break of Structure (BoS) and Change of Character (CHoCH).
 *
 * Walks candles forward, absorbing classified pivots as they confirm.
 * Closes above/below the last unbroken swing emit BoS or CHoCH (first flip).
 */

import type { Bar, BreakEvent, Pivot, Trend } from "./types.js";

export function detectBreaks(candles: Bar[], pivots: Pivot[]): BreakEvent[] {
  const events: BreakEvent[] = [];
  let trend: Trend = "unknown";
  let lastSwingHigh: Pivot | null = null;
  let lastSwingLow: Pivot | null = null;

  let pIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    while (pIdx < pivots.length && pivots[pIdx]!.i <= i) {
      const p = pivots[pIdx++]!;
      if (p.kind === "high") lastSwingHigh = p;
      else lastSwingLow = p;
    }
    const c = candles[i]!;
    if (lastSwingHigh && c.c > lastSwingHigh.price) {
      const type: BreakEvent["type"] = trend === "down" ? "CHoCH" : "BoS";
      events.push({ i, t: c.t, type, dir: "up", level: lastSwingHigh.price });
      trend = "up";
      lastSwingHigh = null;
    } else if (lastSwingLow && c.c < lastSwingLow.price) {
      const type: BreakEvent["type"] = trend === "up" ? "CHoCH" : "BoS";
      events.push({ i, t: c.t, type, dir: "down", level: lastSwingLow.price });
      trend = "down";
      lastSwingLow = null;
    }
  }
  return events;
}
