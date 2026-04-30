/**
 * Commodity Channel Index (CCI). Default period 20, k = 0.015 (Lambert).
 */

export type Series = ArrayLike<number>;

export function cci(
  high: Series,
  low: Series,
  close: Series,
  period = 20,
  k = 0.015
): Float64Array {
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  if (n === 0) return out;
  const tp = new Float64Array(n);
  for (let i = 0; i < n; i++) tp[i] = (+high[i]! + +low[i]! + +close[i]!) / 3;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += tp[i]!;
    if (i >= period) sum -= tp[i - period]!;
    if (i >= period - 1) {
      const sma = sum / period;
      let md = 0;
      for (let j = i - period + 1; j <= i; j++) md += Math.abs(tp[j]! - sma);
      md /= period;
      out[i] = md === 0 ? 0 : (tp[i]! - sma) / (k * md);
    }
  }
  return out;
}
