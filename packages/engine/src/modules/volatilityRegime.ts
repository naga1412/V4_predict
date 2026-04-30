import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "volatility-regime",
  name: "Volatility Regime",
  category: "volatility",
  description: "BB squeeze and ATR expansion context",
  weight: 0.7,
});

function smaArr(arr: number[], lookback = 20): number {
  if (!arr || arr.length < 2) return NaN;
  const n = Math.min(lookback, arr.length);
  let s = 0;
  let c = 0;
  for (let i = arr.length - n; i < arr.length; i++) {
    if (Number.isFinite(arr[i])) {
      s += arr[i]!;
      c++;
    }
  }
  return c > 0 ? s / c : NaN;
}

export function evaluate(ta: TAOutput): Signal {
  const c = lastFinite(getSeries(ta, "close"));
  const bb = getObj<{ mid?: ArrayLike<number>; up?: ArrayLike<number>; lo?: ArrayLike<number> }>(ta, "bb_20_2");
  const mid = lastFinite(bb?.mid);
  const up = lastFinite(bb?.up);
  const lo = lastFinite(bb?.lo);
  const macdObj = getObj<{ hist?: ArrayLike<number> }>(ta, "macd_12_26_9");
  const hist = lastFinite(macdObj?.hist);
  if (![c, mid, up, lo].every(Number.isFinite)) return neutral("BB missing");
  const width = (up - lo) / (mid || 1);

  const widthHist: number[] = [];
  if (bb?.mid && bb?.up && bb?.lo) {
    const n = bb.mid.length;
    for (let i = 0; i < n; i++) {
      const m = bb.mid[i]!;
      const u = bb.up[i]!;
      const l = bb.lo[i]!;
      if (Number.isFinite(m) && Number.isFinite(u) && Number.isFinite(l) && m !== 0) {
        widthHist.push((u - l) / m);
      }
    }
  }
  const widthAvg = smaArr(widthHist, 50);
  const squeeze = Number.isFinite(widthAvg) && width < widthAvg * 0.7;
  const expansion = Number.isFinite(widthAvg) && width > widthAvg * 1.3;

  if (squeeze) {
    const dir = Number.isFinite(hist) ? Math.sign(hist) : 0;
    return clampSignal({
      signal: dir * 0.25,
      confidence: dir !== 0 ? 0.3 : 0.1,
      reasons: [
        `BB squeeze (width ${width.toFixed(4)} vs avg ${widthAvg.toFixed(4)})`,
        dir !== 0 ? `MACD hist hints ${dir > 0 ? "bullish" : "bearish"} expansion` : "no direction hint",
      ],
      payload: { squeeze: true, width, widthAvg },
    });
  }
  if (expansion) {
    return clampSignal({
      signal: 0,
      confidence: 0.1,
      reasons: [`BB expansion (width ${width.toFixed(4)})`, "signals less reliable under high vol"],
      payload: { expansion: true, width, widthAvg },
    });
  }
  return clampSignal({ signal: 0, confidence: 0.15, reasons: [`Normal volatility (BB width ${width.toFixed(4)})`] });
}
