/**
 * Ichimoku Kinkō Hyō. Classic params: 9 / 26 / 52 / 26.
 *
 * Tenkan / Kijun / SenkouB are highest-high+lowest-low midpoints.
 * Senkou A/B are shifted FORWARD by `shift`; Chikou is close shifted BACKWARD.
 */

export type Series = ArrayLike<number>;

export interface IchimokuOpts {
  tenkan?: number;
  kijun?: number;
  senkouB?: number;
  shift?: number;
}

export interface IchimokuResult {
  tenkan: Float64Array;
  kijun: Float64Array;
  senkouA: Float64Array;
  senkouB: Float64Array;
  chikou: Float64Array;
}

export function ichimoku(
  high: Series,
  low: Series,
  close: Series,
  opts: IchimokuOpts = {}
): IchimokuResult {
  const { tenkan = 9, kijun = 26, senkouB = 52, shift = 26 } = opts;
  const n = close.length;
  const tenkanArr = new Float64Array(n).fill(NaN);
  const kijunArr = new Float64Array(n).fill(NaN);
  const senkouAArr = new Float64Array(n).fill(NaN);
  const senkouBArr = new Float64Array(n).fill(NaN);
  const chikouArr = new Float64Array(n).fill(NaN);

  const mid = (p: number): Float64Array => {
    const out = new Float64Array(n).fill(NaN);
    for (let i = p - 1; i < n; i++) {
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = i - p + 1; j <= i; j++) {
        if (high[j]! > hh) hh = high[j]!;
        if (low[j]! < ll) ll = low[j]!;
      }
      out[i] = (hh + ll) / 2;
    }
    return out;
  };

  const t = mid(tenkan);
  const k = mid(kijun);
  const b = mid(senkouB);
  for (let i = 0; i < n; i++) {
    tenkanArr[i] = t[i]!;
    kijunArr[i] = k[i]!;
  }
  for (let i = shift; i < n; i++) {
    if (Number.isFinite(t[i - shift]) && Number.isFinite(k[i - shift])) {
      senkouAArr[i] = (t[i - shift]! + k[i - shift]!) / 2;
    }
    if (Number.isFinite(b[i - shift])) senkouBArr[i] = b[i - shift]!;
  }
  for (let i = 0; i < n - shift; i++) chikouArr[i] = +close[i + shift]!;

  return {
    tenkan: tenkanArr,
    kijun: kijunArr,
    senkouA: senkouAArr,
    senkouB: senkouBArr,
    chikou: chikouArr,
  };
}
