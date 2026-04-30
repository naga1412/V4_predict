/**
 * Trendlines — least-squares fit through the most-recent swing pivots,
 * with channel geometry and breakout detection.
 */

import { findPivots } from "./swings.js";
import type { PivotOpts } from "./swings.js";
import type { Bar, TLLine, TLPoint, TLResult } from "./types.js";

export interface FitResult {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
  sumE2: number;
}

interface Point2D { x: number; y: number; t?: number }

export function leastSquares(points: Point2D[]): FitResult {
  if (!Array.isArray(points) || points.length < 2) {
    return { slope: 0, intercept: NaN, r2: 0, n: 0, sumE2: 0 };
  }
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of points) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  if (n < 2) return { slope: 0, intercept: NaN, r2: 0, n, sumE2: 0 };
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx <= 0) {
    return { slope: 0, intercept: my, r2: 0, n, sumE2: syy };
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sumE2 = 0;
  for (const p of points) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    const e = p.y - (slope * p.x + intercept);
    sumE2 += e * e;
  }
  const r2 = syy > 0 ? Math.max(0, Math.min(1, 1 - sumE2 / syy)) : 0;
  return { slope, intercept, r2, n, sumE2 };
}

function lineAt(line: { slope: number; intercept: number }, x: number): number {
  return line.slope * x + line.intercept;
}

function residualSigma(line: FitResult): number {
  const dof = Math.max(1, (line.n | 0) - 2);
  return Math.sqrt(line.sumE2 / dof);
}

export function touchPoints(
  line: { slope: number; intercept: number },
  points: Point2D[],
  tolerance: number
): Point2D[] {
  if (!Number.isFinite(line?.slope) || !Number.isFinite(line?.intercept)) return [];
  const tol = Math.max(0, +tolerance);
  const out: Point2D[] = [];
  for (const p of points) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    const yhat = line.slope * p.x + line.intercept;
    if (Math.abs(p.y - yhat) <= tol) out.push(p);
  }
  return out;
}

export interface TrendlineOpts {
  lookback?: number;
  minPivots?: number;
  atr?: number;
  tolerance?: number;
  toleranceATR?: number;
  breakoutATR?: number;
  pivots?: PivotOpts;
}

export function detectTrendlines(candles: Bar[], opts: TrendlineOpts = {}): TLResult {
  const out: TLResult = {
    upper: null,
    lower: null,
    channel: { widthATR: 0, parallel: false },
    lastBreakout: null,
    meta: { lookback: 0, tolerance: 0, atr: 0, lastBarIdx: -1 },
  };
  if (!Array.isArray(candles) || candles.length < 6) return out;

  const lookback = Math.max(2, Math.min(64, opts.lookback ?? 8));
  const minPivots = Math.max(2, opts.minPivots ?? 3);
  const toleranceATR = Number.isFinite(opts.toleranceATR) ? +opts.toleranceATR! : 0.5;
  const breakoutATR = Number.isFinite(opts.breakoutATR) ? +opts.breakoutATR! : 0.5;
  const piv = findPivots(candles, opts.pivots ?? {});
  if (!piv.length) return out;

  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx]?.c;
  let atr = Number.isFinite(opts.atr) && (opts.atr ?? 0) > 0 ? +opts.atr! : NaN;
  if (!Number.isFinite(atr)) {
    atr = Number.isFinite(lastClose) ? Math.max(1e-9, Math.abs(lastClose!) * 0.005) : 1;
  }
  const tolerance = Number.isFinite(opts.tolerance) && (opts.tolerance ?? 0) > 0
    ? +opts.tolerance!
    : atr * toleranceATR;

  out.meta = { lookback, tolerance, atr, lastBarIdx: lastIdx };

  const highs = piv.filter((p) => p.kind === "high").slice(-lookback);
  const lows = piv.filter((p) => p.kind === "low").slice(-lookback);

  const buildLine = (raw: typeof highs): TLLine | null => {
    if (!raw || raw.length < minPivots) return null;
    const points: Point2D[] = raw.map((p) => ({ x: p.i, y: p.price, t: p.t }));
    const fit = leastSquares(points);
    if (!Number.isFinite(fit.slope) || !Number.isFinite(fit.intercept)) return null;
    const tps = touchPoints(fit, points, tolerance);
    const sigma = residualSigma(fit);
    const score = fit.r2 * Math.min(1, tps.length / 4);
    const toTLPoint = (p: Point2D): TLPoint => ({ i: p.x, t: p.t ?? 0, p: p.y });
    return {
      slope: fit.slope,
      intercept: fit.intercept,
      r2: fit.r2,
      touches: tps.length,
      score,
      points: points.map(toTLPoint),
      touchPoints: tps.map(toTLPoint),
      startT: points[0]!.t ?? 0,
      endT: points[points.length - 1]!.t ?? 0,
      sigma,
    };
  };

  out.upper = buildLine(highs);
  out.lower = buildLine(lows);

  if (out.upper && out.lower) {
    const sigBoth = (out.upper.sigma + out.lower.sigma) / 2;
    out.channel.widthATR = atr > 0 ? sigBoth / atr : 0;
    const sU = out.upper.slope;
    const sL = out.lower.slope;
    if (Math.abs(sU) < 1e-12 && Math.abs(sL) < 1e-12) {
      out.channel.parallel = true;
    } else if (sU * sL > 0) {
      const r = Math.abs(sU) > Math.abs(sL) ? Math.abs(sL / sU) : Math.abs(sU / sL);
      out.channel.parallel = r >= 0.75;
    } else {
      out.channel.parallel = false;
    }
  }

  if (Number.isFinite(lastClose)) {
    const want = atr * breakoutATR;
    let best: TLResult["lastBreakout"] = null;
    if (out.upper) {
      const yhat = lineAt(out.upper, lastIdx);
      const distAbs = lastClose! - yhat;
      if (distAbs >= want) {
        const strength = Math.min(1, distAbs / Math.max(want, 1e-9));
        best = { side: "up", atBar: lastIdx, distATR: distAbs / atr, strength };
      }
    }
    if (out.lower) {
      const yhat = lineAt(out.lower, lastIdx);
      const distAbs = yhat - lastClose!;
      if (distAbs >= want) {
        const strength = Math.min(1, distAbs / Math.max(want, 1e-9));
        const cand = { side: "down" as const, atBar: lastIdx, distATR: distAbs / atr, strength };
        if (!best || cand.strength > best.strength) best = cand;
      }
    }
    out.lastBreakout = best;
  }

  return out;
}

export function positionInChannel(
  tl: TLResult,
  lastIdx: number,
  lastClose: number
): number {
  if (!tl?.upper || !tl?.lower) return NaN;
  if (!Number.isFinite(lastIdx) || !Number.isFinite(lastClose)) return NaN;
  const u = lineAt(tl.upper, lastIdx);
  const l = lineAt(tl.lower, lastIdx);
  if (!Number.isFinite(u) || !Number.isFinite(l) || u <= l) return NaN;
  const t = (lastClose - l) / (u - l);
  return Math.max(-2, Math.min(2, 2 * t - 1));
}
