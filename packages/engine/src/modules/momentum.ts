import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "momentum",
  name: "Momentum",
  category: "momentum",
  description: "MACD-histogram direction and acceleration + ROC agreement",
  weight: 1.0,
});

export function evaluate(ta: TAOutput): Signal {
  const c = lastFinite(getSeries(ta, "close"));
  const macdObj = getObj<{ hist?: ArrayLike<number> }>(ta, "macd_12_26_9");
  const histArr = macdObj?.hist;
  const rocArr = getSeries(ta, "roc10");
  const last = histArr && histArr.length ? histArr[histArr.length - 1]! : NaN;
  const prev = histArr && histArr.length >= 2 ? histArr[histArr.length - 2]! : NaN;
  const last2 = histArr && histArr.length >= 3 ? histArr[histArr.length - 3]! : NaN;
  const rocLast = lastFinite(rocArr);
  if (![c, last, prev].every(Number.isFinite)) return neutral("MACD missing");

  const dir = last > 0 ? 1 : last < 0 ? -1 : 0;
  const accel = (last - prev) * Math.sign(last || 1);
  const accelPrev = (prev - (Number.isFinite(last2) ? last2 : prev)) * Math.sign(last || 1);
  const magRel = c > 0 ? Math.abs(last) / c : 0;
  const rocSign = Number.isFinite(rocLast) ? Math.sign(rocLast) : 0;

  const magScore = Math.min(1, magRel * 2000);
  const accelScore = accel > 0 ? 0.4 : -0.1;
  const rocAgree = rocSign === dir ? 0.3 : rocSign === 0 ? 0 : -0.2;
  const signal = dir * (0.3 + 0.7 * magScore) + dir * accelScore + dir * rocAgree;

  const twoBarAccel = accel > 0 && accelPrev > 0;

  const confidence = Math.min(1, Math.max(0,
    magScore * 0.5
    + (accel > 0 ? 0.25 : 0)
    + (twoBarAccel ? 0.1 : 0)
    + (rocSign === dir ? 0.15 : 0)
  ));

  const reasons: string[] = [
    `MACD hist ${dir > 0 ? "positive" : "negative"} (${last.toExponential(2)})`,
    accel > 0 ? "accelerating" : "decelerating",
  ];
  if (rocSign === dir) reasons.push(`ROC agrees (${rocLast.toFixed(2)}%)`);
  else if (rocSign !== 0) reasons.push(`ROC disagrees (${rocLast.toFixed(2)}%)`);
  if (twoBarAccel) reasons.push("2-bar accel");
  return clampSignal({ signal, confidence, reasons });
}
