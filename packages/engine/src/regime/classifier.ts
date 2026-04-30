/**
 * Regime Classifier — converts a TA snapshot into a structured regime descriptor.
 */

import type { RegimeDescriptor, RegimeThresholds, TASnapshot } from "./types.js";

export const DEFAULT_THRESHOLDS: RegimeThresholds = Object.freeze({
  adx: { weak: 20, moderate: 25, strong: 40 },
  atrPct: { low: 0.003, high: 0.015 },
  bbWidth: { low: 0.02, high: 0.1 },
  rsi: { oversold: 35, overbought: 65 },
  breakoutLookback: 10,
});

const safe = (x: number | undefined): number => (Number.isFinite(x) ? (x as number) : NaN);
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export interface ClassifyOpts {
  i?: number;
  thresholds?: Partial<RegimeThresholds>;
}

const EMPTY_REGIME: RegimeDescriptor = {
  trend: "range",
  strength: "weak",
  volatility: "normal",
  alignment: "flat",
  momentum: "flat",
  breakout: "none",
  label: "range-weak-normal-vol",
  score: { trend: 0, vol: 0, momentum: 0 },
};

export function classifyRegime(ta: TASnapshot | null | undefined, opts: ClassifyOpts = {}): RegimeDescriptor {
  if (!ta?.close || ta.close.length === 0) return EMPTY_REGIME;
  const th: RegimeThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(opts.thresholds ?? {}),
    adx: { ...DEFAULT_THRESHOLDS.adx, ...(opts.thresholds?.adx ?? {}) },
    atrPct: { ...DEFAULT_THRESHOLDS.atrPct, ...(opts.thresholds?.atrPct ?? {}) },
    bbWidth: { ...DEFAULT_THRESHOLDS.bbWidth, ...(opts.thresholds?.bbWidth ?? {}) },
    rsi: { ...DEFAULT_THRESHOLDS.rsi, ...(opts.thresholds?.rsi ?? {}) },
  };
  const i = Number.isInteger(opts.i) ? (opts.i as number) : ta.close.length - 1;

  const c = safe(ta.close[i]);
  const ema20 = safe(ta.ema20?.[i]);
  const ema50 = safe(ta.ema50?.[i]);
  const ema200 = safe(ta.ema200?.[i]);
  const adx = safe(ta.adx14?.adx?.[i]);
  const plusDI = safe(ta.adx14?.plusDI?.[i]);
  const minusDI = safe(ta.adx14?.minusDI?.[i]);
  const atr14 = safe(ta.atr14?.[i]);
  const bbMid = safe(ta.bb_20_2?.mid?.[i]);
  const bbUp = safe(ta.bb_20_2?.up?.[i]);
  const bbLo = safe(ta.bb_20_2?.lo?.[i]);
  const rsi14 = safe(ta.rsi14?.[i]);
  const macdH = safe(ta.macd_12_26_9?.hist?.[i]);

  let strength: RegimeDescriptor["strength"] = "weak";
  if (Number.isFinite(adx)) {
    if (adx >= th.adx.strong) strength = "strong";
    else if (adx >= th.adx.moderate) strength = "moderate";
    else if (adx >= th.adx.weak) strength = "weak";
  }

  let volatility: RegimeDescriptor["volatility"] = "normal";
  let volScore = 0;
  const atrPct = Number.isFinite(atr14) && c > 0 ? atr14 / c : NaN;
  const bbW =
    Number.isFinite(bbUp) && Number.isFinite(bbLo) && bbMid
      ? (bbUp - bbLo) / bbMid
      : NaN;
  if (Number.isFinite(atrPct)) {
    if (atrPct <= th.atrPct.low) volatility = "low";
    else if (atrPct >= th.atrPct.high) volatility = "high";
    volScore = clamp((atrPct - th.atrPct.low) / (th.atrPct.high - th.atrPct.low), 0, 1);
  } else if (Number.isFinite(bbW)) {
    if (bbW <= th.bbWidth.low) volatility = "low";
    else if (bbW >= th.bbWidth.high) volatility = "high";
    volScore = clamp((bbW - th.bbWidth.low) / (th.bbWidth.high - th.bbWidth.low), 0, 1);
  }

  let alignment: RegimeDescriptor["alignment"] = "flat";
  if (Number.isFinite(ema20) && Number.isFinite(ema50) && Number.isFinite(ema200)) {
    if (ema20 > ema50 && ema50 > ema200) alignment = "bullish-stack";
    else if (ema20 < ema50 && ema50 < ema200) alignment = "bearish-stack";
    else alignment = "mixed";
  }

  let trend: RegimeDescriptor["trend"] = "range";
  let trendScore = 0;
  if (strength !== "weak" && Number.isFinite(plusDI) && Number.isFinite(minusDI)) {
    const diSign = plusDI > minusDI ? 1 : -1;
    trend = diSign > 0 ? "up" : "down";
    const diMag = Math.abs(plusDI - minusDI) / Math.max(1, plusDI + minusDI);
    trendScore = diSign * diMag;
  } else if (ta.trend === "up" || ta.trend === "down") {
    trend = ta.trend;
    trendScore = ta.trend === "up" ? 0.4 : -0.4;
  } else if (alignment === "bullish-stack") {
    trend = "up";
    trendScore = 0.3;
  } else if (alignment === "bearish-stack") {
    trend = "down";
    trendScore = -0.3;
  }

  let momentum: RegimeDescriptor["momentum"] = "flat";
  let momScore = 0;
  if (Number.isFinite(macdH) && c > 0) {
    const macdRel = macdH / c;
    momScore = clamp(macdRel * 1000, -1, 1);
  }
  if (Number.isFinite(rsi14)) {
    const rsiSigned = (rsi14 - 50) / 50;
    momScore = clamp(momScore + rsiSigned * 0.5, -1, 1);
  }
  if (momScore > 0.15) momentum = "up";
  else if (momScore < -0.15) momentum = "down";

  let breakout: RegimeDescriptor["breakout"] = "none";
  const breaks = Array.isArray(ta.breaks) ? ta.breaks : [];
  for (let k = breaks.length - 1; k >= 0; k--) {
    const b = breaks[k]!;
    if (!Number.isInteger(b.i)) continue;
    if (i - (b.i as number) > th.breakoutLookback) break;
    if (b.dir === "up" || b.type === "BoS-up" || b.type === "CHoCH-up") {
      breakout = "up";
      break;
    }
    if (b.dir === "down" || b.type === "BoS-down" || b.type === "CHoCH-down") {
      breakout = "down";
      break;
    }
  }

  const label = `${trend === "range" ? "range" : `trending-${trend}`}-${strength}-${volatility}-vol`;
  return {
    trend, strength, volatility, alignment, momentum, breakout,
    label,
    score: { trend: trendScore, vol: volScore, momentum: momScore },
    inputs: { adx, atrPct, bbWidth: bbW, rsi14, macdHist: macdH, ema20, ema50, ema200, plusDI, minusDI },
  };
}

export function classifySeries(ta: TASnapshot, opts: ClassifyOpts = {}): RegimeDescriptor[] {
  const n = ta?.close?.length ?? 0;
  const out: RegimeDescriptor[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = classifyRegime(ta, { ...opts, i });
  return out;
}
