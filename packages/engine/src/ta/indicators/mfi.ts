/**
 * Money Flow Index (MFI) — volume-weighted RSI.
 * Default period 14. Result in [0, 100].
 */

export type Series = ArrayLike<number>;

export function mfi(
  high: Series,
  low: Series,
  close: Series,
  volume: Series,
  period = 14
): Float64Array {
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  if (n < 2) return out;

  const tp = new Float64Array(n);
  for (let i = 0; i < n; i++) tp[i] = (+high[i]! + +low[i]! + +close[i]!) / 3;

  const plus = new Float64Array(n);
  const minus = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const rmf = tp[i]! * +volume[i]!;
    if (tp[i]! > tp[i - 1]!) plus[i] = rmf;
    else if (tp[i]! < tp[i - 1]!) minus[i] = rmf;
  }

  let pSum = 0;
  let mSum = 0;
  for (let i = 1; i < n; i++) {
    pSum += plus[i]!;
    mSum += minus[i]!;
    if (i > period) {
      pSum -= plus[i - period]!;
      mSum -= minus[i - period]!;
    }
    if (i >= period) {
      if (mSum === 0) out[i] = 100;
      else {
        const ratio = pSum / mSum;
        out[i] = 100 - 100 / (1 + ratio);
      }
    }
  }
  return out;
}
