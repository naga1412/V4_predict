import { neutral, clampSignal, lastFinite, getSeries, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "volume-profile",
  name: "Volume Profile",
  category: "volume",
  description: "OBV slope + CMF + unusual-volume flag",
  weight: 0.8,
});

export function evaluate(ta: TAOutput): Signal {
  const obvArr = getSeries(ta, "obv");
  const cmfArr = getSeries(ta, "cmf20");
  const volArr = getSeries(ta, "volume");
  const obvLast = lastFinite(obvArr);
  const cmfLast = lastFinite(cmfArr);
  if (!Number.isFinite(obvLast) && !Number.isFinite(cmfLast)) return neutral("no volume indicators");

  let obvSlope = 0;
  if (obvArr && obvArr.length >= 21) {
    const a = obvArr[obvArr.length - 21]!;
    const b = obvArr[obvArr.length - 1]!;
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) > 1) {
      obvSlope = (b - a) / Math.max(1, Math.abs(a));
    }
  }
  const obvSign = obvSlope > 0.005 ? 1 : obvSlope < -0.005 ? -1 : 0;
  const cmfSign = Number.isFinite(cmfLast) ? (cmfLast > 0.05 ? 1 : cmfLast < -0.05 ? -1 : 0) : 0;

  const curVol = volArr ? volArr[volArr.length - 1]! : NaN;
  let volSma = 0;
  let cnt = 0;
  if (volArr) {
    for (let i = Math.max(0, volArr.length - 21); i < volArr.length - 1; i++) {
      if (Number.isFinite(volArr[i])) {
        volSma += volArr[i]!;
        cnt++;
      }
    }
  }
  volSma = cnt > 0 ? volSma / cnt : 0;
  const volRel = volSma > 0 && Number.isFinite(curVol) ? curVol / volSma : 1;
  const surge = volRel >= 1.5;

  const agree = obvSign !== 0 && obvSign === cmfSign ? 1 : 0;
  const baseDir = agree ? obvSign : (obvSign || cmfSign);
  const magnitudeCMF = Number.isFinite(cmfLast) ? Math.min(1, Math.abs(cmfLast) * 2) : 0;
  const magnitudeOBV = Math.min(1, Math.abs(obvSlope) * 10);
  const strength = Math.max(magnitudeCMF, magnitudeOBV);
  const signal = baseDir * (0.3 + 0.5 * strength + (surge ? 0.1 : 0) + (agree ? 0.1 : 0));
  const confidence = 0.25 + 0.35 * strength + (agree ? 0.2 : 0) + (surge ? 0.1 : 0);
  const reasons: string[] = [
    `OBV slope ${(obvSlope * 100).toFixed(2)}%`,
    `CMF ${Number.isFinite(cmfLast) ? cmfLast.toFixed(3) : "n/a"}`,
    surge ? `volume surge (${volRel.toFixed(2)}× avg)` : `vol ${volRel.toFixed(2)}× avg`,
    agree ? "OBV+CMF agree" : "OBV/CMF mixed",
  ];
  return clampSignal({ signal, confidence, reasons });
}
