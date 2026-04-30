/**
 * Bollinger Bands (SMA ± k * stdev) and Keltner Channels (EMA ± k * ATR).
 */
import { RollingWindow } from "../math.js";

export type Series = ArrayLike<number>;

export interface Bands {
  mid: Float64Array;
  up: Float64Array;
  lo: Float64Array;
}

export function bbands(values: Series, period = 20, k = 2): Bands {
  const n = values.length;
  const mid = new Float64Array(n).fill(NaN);
  const up = new Float64Array(n).fill(NaN);
  const lo = new Float64Array(n).fill(NaN);
  const w = new RollingWindow(period);
  for (let i = 0; i < n; i++) {
    w.push(+values[i]!);
    if (w.filled) {
      const m = w.mean();
      const sd = w.stdev();
      mid[i] = m;
      up[i] = m + k * sd;
      lo[i] = m - k * sd;
    }
  }
  return { mid, up, lo };
}

/** Keltner Channels: EMA ± k * ATR. Pre-computed `ema` and `atr` arrays. */
export function keltner(ema: Series, atr: Series, k = 2): Bands {
  const n = ema.length;
  const up = new Float64Array(n).fill(NaN);
  const lo = new Float64Array(n).fill(NaN);
  const mid = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const e = +ema[i]!;
    const a = +atr[i]!;
    if (Number.isFinite(e) && Number.isFinite(a)) {
      mid[i] = e;
      up[i] = e + k * a;
      lo[i] = e - k * a;
    } else if (Number.isFinite(e)) {
      mid[i] = e;
    }
  }
  return { mid, up, lo };
}
