/**
 * Order Block (OB) detector — ICT/SMC concept.
 *
 * Bullish OB = last down-candle before an impulsive up-move that breaks
 *              a prior swing high. Range [low, high] = institutional demand.
 * Bearish OB = mirror.
 *
 * Impulsive = subsequent move ≥ impulseATRMult × ATR(period) within
 * impulseLookahead bars AND crosses a prior pivot.
 */

import { atr } from "../indicators/volatility.js";
import type { Bar, OrderBlock, OrderBlockOpts, Pivot } from "./types.js";

const DEFAULT: Required<OrderBlockOpts> = {
  impulseATRMult: 1.5,
  impulseLookahead: 3,
  mitigateLookahead: Infinity,
  atrPeriod: 14,
};

export function detectOrderBlocks(
  candles: Bar[],
  pivots: Pivot[] = [],
  opts: OrderBlockOpts = {}
): OrderBlock[] {
  const { impulseATRMult, impulseLookahead, atrPeriod } = { ...DEFAULT, ...opts };
  if (!Array.isArray(candles) || candles.length < atrPeriod + impulseLookahead + 2) return [];

  const h = candles.map((c) => +c.h);
  const l = candles.map((c) => +c.l);
  const c = candles.map((c) => +c.c);
  const o = candles.map((c) => +c.o);
  const atrArr = atr(h, l, c, atrPeriod);

  const highPivots = pivots.filter((p) => p.kind === "high").sort((a, b) => a.i - b.i);
  const lowPivots = pivots.filter((p) => p.kind === "low").sort((a, b) => a.i - b.i);

  const blocks: OrderBlock[] = [];

  for (let i = 1; i < candles.length - impulseLookahead; i++) {
    const a = atrArr[i]!;
    if (!Number.isFinite(a) || a <= 0) continue;

    const isDown = c[i]! < o[i]!;
    const isUp = c[i]! > o[i]!;

    if (isDown) {
      let hitHigh = -Infinity;
      for (let j = i + 1; j <= i + impulseLookahead && j < candles.length; j++) {
        if (h[j]! > hitHigh) hitHigh = h[j]!;
      }
      const move = hitHigh - l[i]!;
      if (move >= impulseATRMult * a) {
        const prior = priorPivot(highPivots, i);
        if (prior && hitHigh > prior.price) {
          blocks.push(makeBlock("bull", candles, i, l[i]!, h[i]!));
        }
      }
    }

    if (isUp) {
      let hitLow = Infinity;
      for (let j = i + 1; j <= i + impulseLookahead && j < candles.length; j++) {
        if (l[j]! < hitLow) hitLow = l[j]!;
      }
      const move = h[i]! - hitLow;
      if (move >= impulseATRMult * a) {
        const prior = priorPivot(lowPivots, i);
        if (prior && hitLow < prior.price) {
          blocks.push(makeBlock("bear", candles, i, l[i]!, h[i]!));
        }
      }
    }
  }

  for (const b of blocks) {
    for (let j = b.i + 1; j < candles.length; j++) {
      const cb = candles[j]!;
      if (cb.l <= b.top && cb.h >= b.bot) {
        b.mitigated = true;
        b.mitigatedAt = cb.t;
        break;
      }
    }
  }
  return blocks;
}

function priorPivot(list: Pivot[], i: number): Pivot | null {
  let prev: Pivot | null = null;
  for (const p of list) {
    if (p.i < i) prev = p;
    else break;
  }
  return prev;
}

function makeBlock(
  kind: OrderBlock["kind"],
  candles: Bar[],
  i: number,
  bot: number,
  top: number
): OrderBlock {
  return {
    kind,
    i,
    t: candles[i]!.t,
    top,
    bot,
    mid: (top + bot) / 2,
    mitigated: false,
    mitigatedAt: null,
  };
}
