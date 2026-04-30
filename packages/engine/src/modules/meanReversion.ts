import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "mean-reversion",
  name: "Mean Reversion",
  category: "mean-reversion",
  description: "BB extreme + RSI oversold/overbought",
  weight: 1.0,
});

export function evaluate(ta: TAOutput): Signal {
  const c = lastFinite(getSeries(ta, "close"));
  const rsi = lastFinite(getSeries(ta, "rsi14"));
  const adxObj = getObj<{ adx?: ArrayLike<number> }>(ta, "adx14");
  const adx = lastFinite(adxObj?.adx);
  const bb = getObj<{ mid?: ArrayLike<number>; up?: ArrayLike<number>; lo?: ArrayLike<number> }>(ta, "bb_20_2");
  const mid = lastFinite(bb?.mid);
  const up = lastFinite(bb?.up);
  const lo = lastFinite(bb?.lo);
  if (![c, rsi, mid, up, lo].every(Number.isFinite)) return neutral("BB/RSI missing");

  const half = up - mid;
  const z = half !== 0 ? (c - mid) / half : 0;
  const regimeBoost = Number.isFinite(adx)
    ? (adx < 20 ? 1.0 : adx < 25 ? 0.7 : adx < 30 ? 0.4 : 0.15)
    : 0.5;

  let signal = 0;
  let confidence = 0;
  const reasons: string[] = [];
  if (z <= -1 && rsi < 35) {
    signal = 0.4 + 0.4 * Math.min(1, Math.abs(z) - 1);
    signal += 0.2 * Math.max(0, (35 - rsi) / 35);
    signal *= regimeBoost;
    confidence = Math.min(1, 0.4 + 0.3 * (Math.abs(z) - 1) + regimeBoost * 0.3);
    reasons.push(`Below lower BB (z=${z.toFixed(2)})`, `RSI=${rsi.toFixed(1)} (oversold)`);
  } else if (z >= 1 && rsi > 65) {
    signal = -(0.4 + 0.4 * Math.min(1, z - 1));
    signal -= 0.2 * Math.max(0, (rsi - 65) / 35);
    signal *= regimeBoost;
    confidence = Math.min(1, 0.4 + 0.3 * (z - 1) + regimeBoost * 0.3);
    reasons.push(`Above upper BB (z=${z.toFixed(2)})`, `RSI=${rsi.toFixed(1)} (overbought)`);
  } else {
    if (rsi < 30) { signal = 0.15 * regimeBoost; confidence = 0.15; reasons.push("RSI oversold without BB touch"); }
    else if (rsi > 70) { signal = -0.15 * regimeBoost; confidence = 0.15; reasons.push("RSI overbought without BB touch"); }
    else return clampSignal({ signal: 0, confidence: 0.05, reasons: ["no extreme detected"] });
  }
  if (reasons.length === 0) reasons.push(`ADX=${Number.isFinite(adx) ? adx.toFixed(1) : "n/a"}`);
  return clampSignal({ signal, confidence, reasons });
}
