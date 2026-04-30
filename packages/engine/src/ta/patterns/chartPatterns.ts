/**
 * Chart pattern detection on swing-pivot stream.
 * H&S, Inv H&S, Double/Triple Top, Double/Triple Bottom, Asc/Desc Triangle.
 */

import { findPivots } from "../structure/swings.js";
import type { PivotOpts } from "../structure/swings.js";
import type { Bar, Pivot } from "../structure/types.js";

export interface PatternAnchor {
  i: number;
  t: number;
  p: number;
}

export interface ChartPattern {
  name: string;
  bias: "bullish" | "bearish";
  confidence: number;
  targetPrice: number | null;
  invalidationPrice: number | null;
  anchorPoints: PatternAnchor[];
  atBar: number;
  ageBars: number;
  broken: boolean;
  necklinePrice: number;
}

export interface DetectChartOpts {
  atr?: number;
  pivots?: PivotOpts;
}

export interface DetectChartResult {
  patterns: ChartPattern[];
  last: ChartPattern | null;
}

export interface ChartPatternSummary {
  name: string;
  bias: "bullish" | "bearish";
  confidence: number;
  target: number | null;
  invalidation: number | null;
  broken: boolean;
  age: number;
}

function withinPct(a: number, b: number, pct: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * pct;
}

function asAnchor(pivot: Pivot): PatternAnchor {
  return { i: pivot.i, t: pivot.t, p: pivot.price };
}

function classifyConfidence(score: number): number | null {
  if (!Number.isFinite(score) || score <= 0) return null;
  if (score >= 0.75) return 0.85;
  if (score >= 0.45) return 0.6;
  if (score >= 0.2) return 0.35;
  return null;
}

function slopeOf(pivots: Pivot[]): number {
  if (!Array.isArray(pivots) || pivots.length < 2) return NaN;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let n = 0;
  for (const p of pivots) {
    sx += p.i;
    sy += p.price;
    sxx += p.i * p.i;
    sxy += p.i * p.price;
    n++;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

interface DetectorCtx {
  pivots: Pivot[];
  candles: Bar[];
  atr: number;
  tolPct?: number;
}

function detectHS({ pivots, candles, atr, tolPct = 0.04 }: DetectorCtx): ChartPattern[] {
  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx]?.c ?? NaN;
  const out: ChartPattern[] = [];

  const tail = pivots.slice(-12);
  if (tail.length < 5) return out;

  for (let i = 0; i + 4 < tail.length; i++) {
    const a = tail[i]!;
    const b = tail[i + 1]!;
    const c = tail[i + 2]!;
    const d = tail[i + 3]!;
    const e = tail[i + 4]!;

    if (a.kind === "high" && b.kind === "low" && c.kind === "high" && d.kind === "low" && e.kind === "high") {
      const headHigher = c.price > a.price + atr * 0.3 && c.price > e.price + atr * 0.3;
      const shouldersAligned = withinPct(a.price, e.price, tolPct);
      if (headHigher && shouldersAligned) {
        const necklineSlope = (d.price - b.price) / Math.max(1, d.i - b.i);
        const necklineAt = (idx: number): number => b.price + necklineSlope * (idx - b.i);
        const nl = necklineAt(lastIdx);
        const broken = lastClose < nl - atr * 0.1;
        const head = c.price;
        const measure = head - necklineAt(c.i);
        const target = nl - measure;
        const invalid = head;
        const score = 0.4
          + (1 - Math.abs(a.price - e.price) / Math.max(a.price, e.price)) * 0.25
          + (broken ? 0.25 : 0)
          + Math.min(0.1, (head - Math.max(a.price, e.price)) / Math.max(atr, 1e-9) * 0.05);
        const confidence = classifyConfidence(score);
        if (confidence != null) {
          out.push({
            name: "Head & Shoulders",
            bias: "bearish",
            confidence,
            targetPrice: Number.isFinite(target) ? target : null,
            invalidationPrice: Number.isFinite(invalid) ? invalid : null,
            anchorPoints: [a, b, c, d, e].map(asAnchor),
            atBar: e.i,
            ageBars: lastIdx - e.i,
            broken,
            necklinePrice: nl,
          });
        }
      }
    }

    if (a.kind === "low" && b.kind === "high" && c.kind === "low" && d.kind === "high" && e.kind === "low") {
      const headLower = c.price < a.price - atr * 0.3 && c.price < e.price - atr * 0.3;
      const shouldersAligned = withinPct(a.price, e.price, tolPct);
      if (headLower && shouldersAligned) {
        const necklineSlope = (d.price - b.price) / Math.max(1, d.i - b.i);
        const necklineAt = (idx: number): number => b.price + necklineSlope * (idx - b.i);
        const nl = necklineAt(lastIdx);
        const broken = lastClose > nl + atr * 0.1;
        const head = c.price;
        const measure = necklineAt(c.i) - head;
        const target = nl + measure;
        const invalid = head;
        const score = 0.4
          + (1 - Math.abs(a.price - e.price) / Math.max(a.price, e.price)) * 0.25
          + (broken ? 0.25 : 0)
          + Math.min(0.1, (Math.min(a.price, e.price) - head) / Math.max(atr, 1e-9) * 0.05);
        const confidence = classifyConfidence(score);
        if (confidence != null) {
          out.push({
            name: "Inverse Head & Shoulders",
            bias: "bullish",
            confidence,
            targetPrice: Number.isFinite(target) ? target : null,
            invalidationPrice: Number.isFinite(invalid) ? invalid : null,
            anchorPoints: [a, b, c, d, e].map(asAnchor),
            atBar: e.i,
            ageBars: lastIdx - e.i,
            broken,
            necklinePrice: nl,
          });
        }
      }
    }
  }
  return out;
}

function detectMultiTop({ pivots, candles, atr, tolPct = 0.025 }: DetectorCtx): ChartPattern[] {
  const out: ChartPattern[] = [];
  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx]?.c ?? NaN;
  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");
  if (highs.length < 2) return out;

  const lastHighs = highs.slice(-3);
  const matchingPair = (a: Pivot, b: Pivot): boolean =>
    withinPct(a.price, b.price, tolPct) && Math.abs(a.i - b.i) >= 4;

  if (lastHighs.length === 3) {
    const [a, b, c] = lastHighs as [Pivot, Pivot, Pivot];
    if (matchingPair(a, b) && matchingPair(b, c) && matchingPair(a, c)) {
      const trough1 = lows.filter((p) => p.i > a.i && p.i < b.i).reduce<Pivot | null>(
        (m, p) => (!m || p.price < m.price ? p : m), null
      );
      const trough2 = lows.filter((p) => p.i > b.i && p.i < c.i).reduce<Pivot | null>(
        (m, p) => (!m || p.price < m.price ? p : m), null
      );
      if (trough1 && trough2) {
        const neckline = Math.min(trough1.price, trough2.price);
        const broken = Number.isFinite(lastClose) && lastClose < neckline - atr * 0.1;
        const head = (a.price + b.price + c.price) / 3;
        const measure = head - neckline;
        const target = neckline - measure;
        const score = 0.5
          + (1 - Math.abs(a.price - c.price) / Math.max(a.price, c.price)) * 0.3
          + (broken ? 0.2 : 0);
        const confidence = classifyConfidence(score);
        if (confidence != null) {
          out.push({
            name: "Triple Top",
            bias: "bearish",
            confidence,
            targetPrice: Number.isFinite(target) ? target : null,
            invalidationPrice: head,
            anchorPoints: [a, trough1, b, trough2, c].map(asAnchor),
            atBar: c.i,
            ageBars: lastIdx - c.i,
            broken,
            necklinePrice: neckline,
          });
          return out;
        }
      }
    }
  }

  if (lastHighs.length >= 2) {
    const a = lastHighs[lastHighs.length - 2]!;
    const b = lastHighs[lastHighs.length - 1]!;
    if (matchingPair(a, b)) {
      const trough = lows.filter((p) => p.i > a.i && p.i < b.i).reduce<Pivot | null>(
        (m, p) => (!m || p.price < m.price ? p : m), null
      );
      if (trough) {
        const neckline = trough.price;
        const broken = Number.isFinite(lastClose) && lastClose < neckline - atr * 0.1;
        const head = (a.price + b.price) / 2;
        const measure = head - neckline;
        const target = neckline - measure;
        const score = 0.45
          + (1 - Math.abs(a.price - b.price) / Math.max(a.price, b.price)) * 0.3
          + (broken ? 0.2 : 0);
        const confidence = classifyConfidence(score);
        if (confidence != null) {
          out.push({
            name: "Double Top",
            bias: "bearish",
            confidence,
            targetPrice: Number.isFinite(target) ? target : null,
            invalidationPrice: head,
            anchorPoints: [a, trough, b].map(asAnchor),
            atBar: b.i,
            ageBars: lastIdx - b.i,
            broken,
            necklinePrice: neckline,
          });
        }
      }
    }
  }
  return out;
}

function detectMultiBottom({ pivots, candles, atr, tolPct = 0.025 }: DetectorCtx): ChartPattern[] {
  const out: ChartPattern[] = [];
  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx]?.c ?? NaN;
  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");
  if (lows.length < 2) return out;

  const lastLows = lows.slice(-3);
  const matchingPair = (a: Pivot, b: Pivot): boolean =>
    withinPct(a.price, b.price, tolPct) && Math.abs(a.i - b.i) >= 4;

  if (lastLows.length === 3) {
    const [a, b, c] = lastLows as [Pivot, Pivot, Pivot];
    if (matchingPair(a, b) && matchingPair(b, c) && matchingPair(a, c)) {
      const peak1 = highs.filter((p) => p.i > a.i && p.i < b.i).reduce<Pivot | null>(
        (m, p) => (!m || p.price > m.price ? p : m), null
      );
      const peak2 = highs.filter((p) => p.i > b.i && p.i < c.i).reduce<Pivot | null>(
        (m, p) => (!m || p.price > m.price ? p : m), null
      );
      if (peak1 && peak2) {
        const neckline = Math.max(peak1.price, peak2.price);
        const broken = Number.isFinite(lastClose) && lastClose > neckline + atr * 0.1;
        const base = (a.price + b.price + c.price) / 3;
        const measure = neckline - base;
        const target = neckline + measure;
        const score = 0.5
          + (1 - Math.abs(a.price - c.price) / Math.max(a.price, c.price)) * 0.3
          + (broken ? 0.2 : 0);
        const confidence = classifyConfidence(score);
        if (confidence != null) {
          out.push({
            name: "Triple Bottom",
            bias: "bullish",
            confidence,
            targetPrice: Number.isFinite(target) ? target : null,
            invalidationPrice: base,
            anchorPoints: [a, peak1, b, peak2, c].map(asAnchor),
            atBar: c.i,
            ageBars: lastIdx - c.i,
            broken,
            necklinePrice: neckline,
          });
          return out;
        }
      }
    }
  }

  if (lastLows.length >= 2) {
    const a = lastLows[lastLows.length - 2]!;
    const b = lastLows[lastLows.length - 1]!;
    if (matchingPair(a, b)) {
      const peak = highs.filter((p) => p.i > a.i && p.i < b.i).reduce<Pivot | null>(
        (m, p) => (!m || p.price > m.price ? p : m), null
      );
      if (peak) {
        const neckline = peak.price;
        const broken = Number.isFinite(lastClose) && lastClose > neckline + atr * 0.1;
        const base = (a.price + b.price) / 2;
        const measure = neckline - base;
        const target = neckline + measure;
        const score = 0.45
          + (1 - Math.abs(a.price - b.price) / Math.max(a.price, b.price)) * 0.3
          + (broken ? 0.2 : 0);
        const confidence = classifyConfidence(score);
        if (confidence != null) {
          out.push({
            name: "Double Bottom",
            bias: "bullish",
            confidence,
            targetPrice: Number.isFinite(target) ? target : null,
            invalidationPrice: base,
            anchorPoints: [a, peak, b].map(asAnchor),
            atBar: b.i,
            ageBars: lastIdx - b.i,
            broken,
            necklinePrice: neckline,
          });
        }
      }
    }
  }
  return out;
}

function detectAscendingTriangle({ pivots, candles, atr, tolPct = 0.02 }: DetectorCtx): ChartPattern[] {
  const out: ChartPattern[] = [];
  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx]?.c ?? NaN;
  const highs = pivots.filter((p) => p.kind === "high").slice(-4);
  const lows = pivots.filter((p) => p.kind === "low").slice(-4);
  if (highs.length < 2 || lows.length < 2) return out;

  const a = highs[highs.length - 2]!;
  const b = highs[highs.length - 1]!;
  if (!withinPct(a.price, b.price, tolPct)) return out;

  const slopeLow = slopeOf(lows);
  if (!Number.isFinite(slopeLow) || slopeLow <= 0) return out;

  const resistance = (a.price + b.price) / 2;
  const broken = Number.isFinite(lastClose) && lastClose > resistance + atr * 0.1;
  const lastLow = lows[lows.length - 1]!;
  const height = resistance - lastLow.price;
  const target = resistance + Math.max(0, height);
  const score = 0.45
    + Math.min(0.25, slopeLow * (lastLow.i - lows[0]!.i) / Math.max(atr, 1e-9))
    + (broken ? 0.2 : 0);
  const confidence = classifyConfidence(score);
  if (confidence == null) return out;
  out.push({
    name: "Ascending Triangle",
    bias: "bullish",
    confidence,
    targetPrice: Number.isFinite(target) ? target : null,
    invalidationPrice: lastLow.price,
    anchorPoints: [a, b, ...lows.slice(-2)].map(asAnchor),
    atBar: b.i,
    ageBars: lastIdx - b.i,
    broken,
    necklinePrice: resistance,
  });
  return out;
}

function detectDescendingTriangle({ pivots, candles, atr, tolPct = 0.02 }: DetectorCtx): ChartPattern[] {
  const out: ChartPattern[] = [];
  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx]?.c ?? NaN;
  const highs = pivots.filter((p) => p.kind === "high").slice(-4);
  const lows = pivots.filter((p) => p.kind === "low").slice(-4);
  if (highs.length < 2 || lows.length < 2) return out;

  const a = lows[lows.length - 2]!;
  const b = lows[lows.length - 1]!;
  if (!withinPct(a.price, b.price, tolPct)) return out;

  const slopeHigh = slopeOf(highs);
  if (!Number.isFinite(slopeHigh) || slopeHigh >= 0) return out;

  const support = (a.price + b.price) / 2;
  const broken = Number.isFinite(lastClose) && lastClose < support - atr * 0.1;
  const lastHigh = highs[highs.length - 1]!;
  const height = lastHigh.price - support;
  const target = support - Math.max(0, height);
  const score = 0.45
    + Math.min(0.25, -slopeHigh * (lastHigh.i - highs[0]!.i) / Math.max(atr, 1e-9))
    + (broken ? 0.2 : 0);
  const confidence = classifyConfidence(score);
  if (confidence == null) return out;
  out.push({
    name: "Descending Triangle",
    bias: "bearish",
    confidence,
    targetPrice: Number.isFinite(target) ? target : null,
    invalidationPrice: lastHigh.price,
    anchorPoints: [a, b, ...highs.slice(-2)].map(asAnchor),
    atBar: b.i,
    ageBars: lastIdx - b.i,
    broken,
    necklinePrice: support,
  });
  return out;
}

export function detectChartPatterns(candles: Bar[], opts: DetectChartOpts = {}): DetectChartResult {
  if (!Array.isArray(candles) || candles.length < 8) return { patterns: [], last: null };
  const piv = findPivots(candles, opts.pivots ?? {});
  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx]?.c ?? NaN;
  let atr = Number.isFinite(opts.atr) && (opts.atr ?? 0) > 0 ? +opts.atr! : NaN;
  if (!Number.isFinite(atr)) {
    atr = Number.isFinite(lastClose) ? Math.max(1e-9, Math.abs(lastClose) * 0.005) : 1;
  }

  const ctx: DetectorCtx = { pivots: piv, candles, atr };
  const patterns: ChartPattern[] = [
    ...detectHS(ctx),
    ...detectMultiTop(ctx),
    ...detectMultiBottom(ctx),
    ...detectAscendingTriangle(ctx),
    ...detectDescendingTriangle(ctx),
  ];

  patterns.sort((x, y) => (y.atBar - x.atBar) || (y.confidence - x.confidence));
  const last = patterns.length ? patterns[0]! : null;
  return { patterns, last };
}

export function summarizeChartPattern(p: ChartPattern | null): ChartPatternSummary | null {
  if (!p) return null;
  return {
    name: p.name,
    bias: p.bias,
    confidence: p.confidence,
    target: p.targetPrice,
    invalidation: p.invalidationPrice,
    broken: !!p.broken,
    age: p.ageBars,
  };
}
