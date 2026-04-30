import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "trend-follow",
  name: "Trend Following",
  category: "trend",
  description: "MA stack alignment confirmed by ADX",
  weight: 1.2,
});

function adxConfidence(adx: number): number {
  if (!Number.isFinite(adx)) return 0;
  if (adx < 20) return 0;
  if (adx < 25) return 0.2;
  if (adx < 40) return 0.2 + ((adx - 25) / 15) * 0.7;
  return Math.min(1, 0.9 + ((adx - 40) / 40) * 0.1);
}

export function evaluate(ta: TAOutput): Signal {
  const e20 = lastFinite(getSeries(ta, "ema20"));
  const e50 = lastFinite(getSeries(ta, "ema50"));
  const e200 = lastFinite(getSeries(ta, "ema200"));
  const adxObj = getObj<{ adx?: ArrayLike<number>; plusDI?: ArrayLike<number>; minusDI?: ArrayLike<number> }>(ta, "adx14");
  const adx = lastFinite(adxObj?.adx);
  const plus = lastFinite(adxObj?.plusDI);
  const minus = lastFinite(adxObj?.minusDI);
  if (![e20, e50, e200, adx, plus, minus].every(Number.isFinite)) return neutral("MA or ADX not computed yet");
  const bullStack = e20 > e50 && e50 > e200;
  const bearStack = e20 < e50 && e50 < e200;
  if (!bullStack && !bearStack) return clampSignal({ signal: 0, confidence: 0.1, reasons: ["MAs not aligned"] });
  if (adx < 20) {
    return clampSignal({ signal: bullStack ? 0.15 : -0.15, confidence: 0.15, reasons: [`Weak trend (ADX=${adx.toFixed(1)})`] });
  }
  const diConfirms = bullStack ? plus > minus : minus > plus;
  if (!diConfirms) {
    return clampSignal({ signal: bullStack ? 0.2 : -0.2, confidence: 0.25, reasons: [`MA stack ${bullStack ? "bullish" : "bearish"} but DI disagrees`] });
  }
  const sign = bullStack ? 1 : -1;
  const conf = adxConfidence(adx);
  return clampSignal({
    signal: sign * (0.4 + 0.6 * conf),
    confidence: conf,
    reasons: [
      `${bullStack ? "Bullish" : "Bearish"} MA stack`,
      `ADX=${adx.toFixed(1)} (${conf >= 0.9 ? "very strong" : conf >= 0.5 ? "strong" : "moderate"})`,
      `DI confirms (${sign > 0 ? "+DI" : "-DI"} dominant)`,
    ],
  });
}
