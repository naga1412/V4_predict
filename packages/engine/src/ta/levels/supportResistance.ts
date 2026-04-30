/**
 * Support / Resistance level clustering from swing pivots.
 *
 * Bucket pivots by price (tolerance window). Score by (touch count) ×
 * recency-decay so older zones fade unless retested.
 */

import type { Pivot, SRLevel } from "../structure/types.js";

export interface SROpts {
  tolerance: number;
  halfLifeBars?: number;
}

export function clusterLevels(pivots: Pivot[], opts: SROpts): SRLevel[] {
  const { tolerance, halfLifeBars = 500 } = opts;
  if (!pivots?.length || !Number.isFinite(tolerance) || tolerance <= 0) return [];
  const sorted = pivots.slice().sort((a, b) => a.price - b.price);
  interface Cluster { first: number; last: number; pivots: Pivot[] }
  const clusters: Cluster[] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && p.price - last.last <= tolerance) {
      last.pivots.push(p);
      last.last = p.price;
    } else {
      clusters.push({ first: p.price, last: p.price, pivots: [p] });
    }
  }
  const mostRecentI = pivots.reduce((a, p) => Math.max(a, p.i), 0);
  const out: SRLevel[] = clusters.map((cl) => {
    const prices = cl.pivots.map((p) => p.price);
    const weight = cl.pivots.reduce((a, p) => a + recency(p.i, mostRecentI, halfLifeBars), 0);
    const highs = cl.pivots.filter((p) => p.kind === "high").length;
    const lows = cl.pivots.filter((p) => p.kind === "low").length;
    const kind: SRLevel["kind"] = highs && lows ? "both" : highs ? "resistance" : "support";
    const price = median(prices);
    const lastTouchedAt = Math.max(...cl.pivots.map((p) => p.t));
    return { price, strength: weight, touches: cl.pivots.length, kind, lastTouchedAt };
  });
  return out.sort((a, b) => b.strength - a.strength);
}

function recency(idx: number, newest: number, halfLife: number): number {
  const age = newest - idx;
  return Math.pow(0.5, age / halfLife);
}

function median(arr: number[]): number {
  const a = arr.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}
