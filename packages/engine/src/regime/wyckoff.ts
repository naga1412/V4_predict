/**
 * Wyckoff phase classifier — accumulation / markup / distribution / markdown.
 */

import type { TASnapshot, WyckoffDescriptor } from "./types.js";

const DEFAULTS = Object.freeze({
  lookback: 30,
  bullPct: { low: 38, high: 62 },
  rangePct: 0.04,
  volSlopeBars: 20,
});

const lastFinite = (arr: ArrayLike<number> | undefined): number => {
  if (!arr || !arr.length) return NaN;
  for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i] as number;
  return NaN;
};

export function bullPct(ta: TASnapshot, n: number = DEFAULTS.lookback): number {
  if (!ta?.close || !ta.open) return NaN;
  const len = ta.close.length;
  if (len === 0) return NaN;
  const start = Math.max(0, len - n);
  let bull = 0;
  let total = 0;
  for (let i = start; i < len; i++) {
    const o = +ta.open[i]!;
    const c = +ta.close[i]!;
    if (!Number.isFinite(o) || !Number.isFinite(c)) continue;
    total++;
    if (c > o) bull++;
  }
  return total > 0 ? (bull / total) * 100 : NaN;
}

export function volumeSlope(ta: TASnapshot, n: number = DEFAULTS.volSlopeBars): number {
  if (!ta?.volume) return 0;
  const v = ta.volume;
  const len = v.length;
  if (len < n * 2) return 0;
  const sma = (i: number, k: number): number => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - k + 1); j <= i; j++) {
      const x = +v[j]!;
      if (Number.isFinite(x)) {
        s += x;
        c++;
      }
    }
    return c > 0 ? s / c : NaN;
  };
  const cur = sma(len - 1, n);
  const prev = sma(len - 1 - n, n);
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return 0;
  return Math.max(-1, Math.min(1, (cur - prev) / prev));
}

export function rangePct(ta: TASnapshot): number {
  const bb = ta?.bb_20_2;
  const up = lastFinite(bb?.up);
  const lo = lastFinite(bb?.lo);
  const mid = lastFinite(bb?.mid);
  if (!Number.isFinite(up) || !Number.isFinite(lo) || !Number.isFinite(mid) || mid === 0) return NaN;
  return (up - lo) / mid;
}

export function classifyWyckoff(ta: TASnapshot | null | undefined, opts: { lookback?: number; volSlopeBars?: number } = {}): WyckoffDescriptor {
  const cfg = { ...DEFAULTS, ...opts };
  const reasons: string[] = [];

  if (!ta?.close || ta.close.length < 5) {
    return {
      phase: "neutral", bias: "neutral", bullPct: NaN,
      score: { trend: 0, vol: 0, momentum: 0, volume: 0 },
      reasons: ["insufficient data"],
    };
  }

  const ema20 = lastFinite(ta.ema20);
  const ema50 = lastFinite(ta.ema50);
  const ema200 = lastFinite(ta.ema200);
  let stack: "bull" | "bear" | "mixed" = "mixed";
  if (Number.isFinite(ema20) && Number.isFinite(ema50) && Number.isFinite(ema200)) {
    if (ema20 > ema50 && ema50 > ema200) stack = "bull";
    else if (ema20 < ema50 && ema50 < ema200) stack = "bear";
  }

  const adx = lastFinite(ta.adx14?.adx);
  const adxStrong = Number.isFinite(adx) && adx >= 22;

  const bp = bullPct(ta, cfg.lookback);
  const rng = rangePct(ta);
  const volSlope = volumeSlope(ta, cfg.volSlopeBars);

  let phase: WyckoffDescriptor["phase"] = "neutral";
  let bias: WyckoffDescriptor["bias"] = "neutral";

  if (stack === "bull" && adxStrong && volSlope >= 0) {
    phase = "markup"; bias = "bullish";
    reasons.push("EMA stack bull + ADX strong + rising volume → markup");
  } else if (stack === "bear" && adxStrong && volSlope >= 0) {
    phase = "markdown"; bias = "bearish";
    reasons.push("EMA stack bear + ADX strong + rising volume → markdown");
  } else if (Number.isFinite(bp) && bp >= cfg.bullPct.high && (!Number.isFinite(rng) || rng >= 0.03)) {
    phase = "markup"; bias = "bullish";
    reasons.push(`bull% ${bp.toFixed(0)}% (high) → markup`);
  } else if (Number.isFinite(bp) && bp <= cfg.bullPct.low && (!Number.isFinite(rng) || rng >= 0.03)) {
    phase = "markdown"; bias = "bearish";
    reasons.push(`bull% ${bp.toFixed(0)}% (low) → markdown`);
  } else if (stack === "bull" && volSlope < 0 && Number.isFinite(rng) && rng <= cfg.rangePct) {
    phase = "distribution"; bias = "bearish";
    reasons.push("EMA bull stack but volume falling + range pinch → distribution");
  } else if (stack === "bear" && volSlope < 0 && Number.isFinite(rng) && rng <= cfg.rangePct) {
    phase = "accumulation"; bias = "bullish";
    reasons.push("EMA bear stack but volume falling + range pinch → accumulation");
  } else if (Number.isFinite(rng) && rng <= cfg.rangePct) {
    if (Number.isFinite(bp) && bp >= 50) {
      phase = "accumulation"; bias = "bullish";
      reasons.push(`tight range + bull% ${bp.toFixed(0)}% → accumulation`);
    } else {
      phase = "distribution"; bias = "bearish";
      reasons.push(`tight range + bull% ${(Number.isFinite(bp) ? bp : 0).toFixed(0)}% → distribution`);
    }
  } else {
    phase = "neutral"; bias = "neutral";
    reasons.push("no decisive signal — neutral");
  }

  const trendScore =
    stack === "bull" ? (adxStrong ? 0.8 : 0.4) :
    stack === "bear" ? (adxStrong ? -0.8 : -0.4) : 0;
  const volScore = Number.isFinite(rng) ? Math.max(0, Math.min(1, rng / 0.08)) : 0;
  const momentumScore = Number.isFinite(bp) ? (bp - 50) / 50 : 0;
  const volumeScore = Number.isFinite(volSlope) ? volSlope : 0;

  return {
    phase,
    bias,
    bullPct: Number.isFinite(bp) ? +bp.toFixed(1) : NaN,
    rangePct: Number.isFinite(rng) ? +rng.toFixed(4) : NaN,
    volumeSlope: +volumeScore.toFixed(3),
    score: {
      trend: +trendScore.toFixed(3),
      vol: +volScore.toFixed(3),
      momentum: +momentumScore.toFixed(3),
      volume: +volumeScore.toFixed(3),
    },
    reasons,
  };
}

export function summarizeWyckoff(w: WyckoffDescriptor | null): { phase: string; bias: string; bullPct: number } | null {
  if (!w) return null;
  return { phase: w.phase, bias: w.bias, bullPct: w.bullPct };
}
