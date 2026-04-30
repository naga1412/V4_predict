/**
 * Triple-Barrier Labeling (Lopez de Prado 2018).
 */

export type BarrierTouch = "upper" | "lower" | "time" | "nan";

export interface TBLabel {
  i: number;
  t1: number | null;
  side: 1 | -1 | 0;
  upper: number;
  lower: number;
  touched: BarrierTouch;
  ret: number;
}

export function rollingReturnStd(close: ArrayLike<number>, period = 20): number[] {
  const n = close.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < 2) return out;
  const rets: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = close[i - 1]!;
    const b = close[i]!;
    rets[i] = a > 0 && b > 0 ? Math.log(b / a) : 0;
  }
  let sum = 0;
  let sq = 0;
  for (let i = 1; i < n; i++) {
    sum += rets[i]!;
    sq += rets[i]! * rets[i]!;
    if (i >= period) {
      const drop = rets[i - period]!;
      sum -= drop;
      sq -= drop * drop;
    }
    if (i >= period) {
      const m = sum / period;
      const v = Math.max(0, sq / period - m * m);
      out[i] = Math.sqrt(v) * close[i]!;
    }
  }
  return out;
}

export interface TripleBarrierArgs {
  high: ArrayLike<number>;
  low: ArrayLike<number>;
  close: ArrayLike<number>;
  sigma: ArrayLike<number>;
  maxHorizon: number;
  ptSl?: [number, number];
  minRet?: number;
}

export function tripleBarrier(args: TripleBarrierArgs): TBLabel[] {
  const { high, low, close, sigma, maxHorizon, ptSl = [1, 1], minRet = 0 } = args;
  const n = close.length;
  const out: TBLabel[] = new Array(n);
  const [ptMult, slMult] = ptSl;

  for (let i = 0; i < n; i++) {
    const s = sigma[i];
    const c = close[i]!;
    if (!Number.isFinite(s) || !Number.isFinite(c) || (s as number) <= 0) {
      out[i] = { i, t1: null, side: 0, upper: NaN, lower: NaN, touched: "nan", ret: 0 };
      continue;
    }
    const upper = c + ptMult * (s as number);
    const lower = c - slMult * (s as number);
    const end = Math.min(n - 1, i + maxHorizon);
    let touched: BarrierTouch = "time";
    let t1: number = end;

    for (let j = i + 1; j <= end; j++) {
      const hitU = high[j]! >= upper;
      const hitL = low[j]! <= lower;
      if (hitU && hitL) {
        const prev = close[j - 1] ?? c;
        const openDistU = Math.abs(prev - upper);
        const openDistL = Math.abs(prev - lower);
        touched = openDistU <= openDistL ? "upper" : "lower";
        t1 = j;
        break;
      }
      if (hitU) {
        touched = "upper";
        t1 = j;
        break;
      }
      if (hitL) {
        touched = "lower";
        t1 = j;
        break;
      }
    }

    let side: 1 | -1 | 0 = 0;
    let ret = 0;
    if (touched === "upper") {
      side = 1;
      ret = (upper - c) / c;
    } else if (touched === "lower") {
      side = -1;
      ret = (lower - c) / c;
    } else {
      ret = (close[t1]! - c) / c;
      side = 0;
    }

    if (Math.abs(ret) < minRet) side = 0;
    out[i] = { i, t1, side, upper, lower, touched, ret };
  }
  return out;
}

export function metaLabels(tb: TBLabel[], primary: ArrayLike<number>): number[] {
  const n = Math.min(tb.length, primary.length);
  const out: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = Math.sign(primary[i] || 0);
    const s = tb[i]?.side ?? 0;
    if (p !== 0 && p === s) out[i] = 1;
  }
  return out;
}

export function uniquenessWeights(tb: TBLabel[]): number[] {
  const n = tb.length;
  const conc: number[] = new Array(n).fill(0);
  for (const lbl of tb) {
    if (!lbl || lbl.t1 == null) continue;
    for (let k = lbl.i; k <= lbl.t1; k++) conc[k]! += 1;
  }
  const w: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const lbl = tb[i];
    if (!lbl || lbl.t1 == null) {
      w[i] = 0;
      continue;
    }
    let s = 0;
    let cnt = 0;
    for (let k = lbl.i; k <= lbl.t1; k++) {
      if (conc[k]! > 0) {
        s += 1 / conc[k]!;
        cnt += 1;
      }
    }
    w[i] = cnt > 0 ? s / cnt : 0;
  }
  return w;
}

export interface LabelDistribution {
  total: number;
  pos: number;
  neg: number;
  zero: number;
  posPct: number;
  negPct: number;
  zeroPct: number;
  imbalance: number;
}

export function labelDistribution(sides: ArrayLike<number>): LabelDistribution {
  let pos = 0;
  let neg = 0;
  let zero = 0;
  for (let i = 0; i < sides.length; i++) {
    const s = sides[i]!;
    if (s > 0) pos++;
    else if (s < 0) neg++;
    else zero++;
  }
  const total = sides.length || 1;
  return {
    total: sides.length,
    pos,
    neg,
    zero,
    posPct: pos / total,
    negPct: neg / total,
    zeroPct: zero / total,
    imbalance: Math.abs(pos - neg) / Math.max(1, pos + neg),
  };
}
