/**
 * Candlestick pattern detectors. Tolerances are parameterised — crypto's
 * wild ranges require looser thresholds than equities.
 */

import type { Bar } from "../structure/types.js";

export interface CandleOpts {
  dojiBodyMax?: number;
  hammerShadowMin?: number;
  hammerUpperMax?: number;
  engulfingMin?: number;
  hararamiOutBodyMin?: number;
  starBodyMax?: number;
}

const DEFAULT: Required<CandleOpts> = {
  dojiBodyMax: 0.05,
  hammerShadowMin: 2.0,
  hammerUpperMax: 1.0,
  engulfingMin: 1.0,
  hararamiOutBodyMin: 1.0,
  starBodyMax: 0.3,
};

const body = (c: Bar): number => Math.abs(c.c - c.o);
const range = (c: Bar): number => c.h - c.l;
const upperShadow = (c: Bar): number => c.h - Math.max(c.o, c.c);
const lowerShadow = (c: Bar): number => Math.min(c.o, c.c) - c.l;
const isBull = (c: Bar): boolean => c.c > c.o;
const isBear = (c: Bar): boolean => c.c < c.o;

export function isDoji(c: Bar, opts: CandleOpts = {}): boolean {
  const { dojiBodyMax } = { ...DEFAULT, ...opts };
  const r = range(c);
  return r > 0 && body(c) / r <= dojiBodyMax;
}

export function isHammer(c: Bar, opts: CandleOpts = {}): boolean {
  const { hammerShadowMin, hammerUpperMax } = { ...DEFAULT, ...opts };
  const b = body(c);
  if (b === 0) return false;
  return lowerShadow(c) >= hammerShadowMin * b && upperShadow(c) <= hammerUpperMax * b;
}

export function isInvertedHammer(c: Bar, opts: CandleOpts = {}): boolean {
  const { hammerShadowMin, hammerUpperMax } = { ...DEFAULT, ...opts };
  const b = body(c);
  if (b === 0) return false;
  return upperShadow(c) >= hammerShadowMin * b && lowerShadow(c) <= hammerUpperMax * b;
}

/** Shooting star: same shape as inverted hammer; trend context is caller's job. */
export const isShootingStar = isInvertedHammer;

export function isBullishEngulfing(prev: Bar | null, cur: Bar | null): boolean {
  if (!prev || !cur) return false;
  return isBear(prev) && isBull(cur) && cur.c >= prev.o && cur.o <= prev.c;
}

export function isBearishEngulfing(prev: Bar | null, cur: Bar | null): boolean {
  if (!prev || !cur) return false;
  return isBull(prev) && isBear(cur) && cur.o >= prev.c && cur.c <= prev.o;
}

export function isBullishHarami(prev: Bar | null, cur: Bar | null): boolean {
  if (!prev || !cur) return false;
  return isBear(prev) && isBull(cur)
    && Math.max(cur.o, cur.c) <= Math.max(prev.o, prev.c)
    && Math.min(cur.o, cur.c) >= Math.min(prev.o, prev.c);
}

export function isBearishHarami(prev: Bar | null, cur: Bar | null): boolean {
  if (!prev || !cur) return false;
  return isBull(prev) && isBear(cur)
    && Math.max(cur.o, cur.c) <= Math.max(prev.o, prev.c)
    && Math.min(cur.o, cur.c) >= Math.min(prev.o, prev.c);
}

export function isMorningStar(c1: Bar | null, c2: Bar | null, c3: Bar | null, opts: CandleOpts = {}): boolean {
  const { starBodyMax } = { ...DEFAULT, ...opts };
  if (!c1 || !c2 || !c3) return false;
  if (!isBear(c1) || !isBull(c3)) return false;
  const r2 = range(c2);
  if (r2 === 0 || body(c2) / r2 > starBodyMax) return false;
  const mid1 = (c1.o + c1.c) / 2;
  return c3.c > mid1;
}

export function isEveningStar(c1: Bar | null, c2: Bar | null, c3: Bar | null, opts: CandleOpts = {}): boolean {
  const { starBodyMax } = { ...DEFAULT, ...opts };
  if (!c1 || !c2 || !c3) return false;
  if (!isBull(c1) || !isBear(c3)) return false;
  const r2 = range(c2);
  if (r2 === 0 || body(c2) / r2 > starBodyMax) return false;
  const mid1 = (c1.o + c1.c) / 2;
  return c3.c < mid1;
}

export interface CandlePatternHit {
  i: number;
  t: number;
  patterns: string[];
}

export function detectAll(candles: Bar[], opts: CandleOpts = {}): CandlePatternHit[] {
  const hits: CandlePatternHit[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1] ?? null;
    const pp = candles[i - 2] ?? null;
    const list: string[] = [];
    if (isDoji(c, opts)) list.push("doji");
    if (isHammer(c, opts)) list.push("hammer");
    if (isInvertedHammer(c, opts)) list.push("invHammer");
    if (p) {
      if (isBullishEngulfing(p, c)) list.push("bullEngulf");
      if (isBearishEngulfing(p, c)) list.push("bearEngulf");
      if (isBullishHarami(p, c)) list.push("bullHarami");
      if (isBearishHarami(p, c)) list.push("bearHarami");
    }
    if (pp && p) {
      if (isMorningStar(pp, p, c, opts)) list.push("morningStar");
      if (isEveningStar(pp, p, c, opts)) list.push("eveningStar");
    }
    if (list.length) hits.push({ i, t: c.t, patterns: list });
  }
  return hits;
}
