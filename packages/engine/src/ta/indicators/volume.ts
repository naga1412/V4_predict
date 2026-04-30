/**
 * Volume-based indicators: VWAP (rolling/anchored), OBV, CMF.
 */

export type Series = ArrayLike<number>;

function typicalPrice(h: number, l: number, c: number): number {
  return (h + l + c) / 3;
}

export interface VWAPOpts {
  mode?: "rolling" | "anchored";
  period?: number;
  /** Anchor period in ms (default 86_400_000 = daily). */
  anchorMs?: number;
  /** Bar timestamps (ms). Required for "anchored". */
  t?: ArrayLike<number>;
}

export function vwap(
  high: Series,
  low: Series,
  close: Series,
  volume: Series,
  opts: VWAPOpts = {}
): Float64Array {
  const { mode = "rolling", period = 20, anchorMs = 86_400_000, t } = opts;
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  if (mode === "rolling") {
    let pvSum = 0;
    let vSum = 0;
    const pvBuf: number[] = [];
    const vBuf: number[] = [];
    for (let i = 0; i < n; i++) {
      const tp = typicalPrice(+high[i]!, +low[i]!, +close[i]!);
      const v = +volume[i]!;
      const pv = tp * v;
      pvBuf.push(pv);
      vBuf.push(v);
      pvSum += pv;
      vSum += v;
      if (pvBuf.length > period) {
        pvSum -= pvBuf.shift()!;
        vSum -= vBuf.shift()!;
      }
      if (pvBuf.length === period && vSum > 0) out[i] = pvSum / vSum;
    }
    return out;
  }
  if (!t) throw new Error("anchored VWAP requires `t` timestamps");
  let pvAcc = 0;
  let vAcc = 0;
  let curAnchor = Math.floor(+t[0]! / anchorMs);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(+t[i]! / anchorMs);
    if (a !== curAnchor) {
      pvAcc = 0;
      vAcc = 0;
      curAnchor = a;
    }
    pvAcc += typicalPrice(+high[i]!, +low[i]!, +close[i]!) * +volume[i]!;
    vAcc += +volume[i]!;
    if (vAcc > 0) out[i] = pvAcc / vAcc;
  }
  return out;
}

/** On-Balance Volume. Cumulative; first value = 0. */
export function obv(close: Series, volume: Series): Float64Array {
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  if (!n) return out;
  out[0] = 0;
  for (let i = 1; i < n; i++) {
    let v = out[i - 1]!;
    if (close[i]! > close[i - 1]!) v += +volume[i]!;
    else if (close[i]! < close[i - 1]!) v -= +volume[i]!;
    out[i] = v;
  }
  return out;
}

/** Chaikin Money Flow, period typically 20. */
export function cmf(
  high: Series,
  low: Series,
  close: Series,
  volume: Series,
  period = 20
): Float64Array {
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  const mfvBuf: number[] = [];
  const vBuf: number[] = [];
  let mfvSum = 0;
  let vSum = 0;
  for (let i = 0; i < n; i++) {
    const h = +high[i]!;
    const l = +low[i]!;
    const c = +close[i]!;
    const v = +volume[i]!;
    const rng = h - l;
    const mfm = rng === 0 ? 0 : ((c - l) - (h - c)) / rng;
    const mfv = mfm * v;
    mfvBuf.push(mfv);
    vBuf.push(v);
    mfvSum += mfv;
    vSum += v;
    if (mfvBuf.length > period) {
      mfvSum -= mfvBuf.shift()!;
      vSum -= vBuf.shift()!;
    }
    if (mfvBuf.length === period && vSum > 0) out[i] = mfvSum / vSum;
  }
  return out;
}
