/**
 * Parabolic SAR (Wilder). Returns { psar, trend } where trend ∈ {+1 long, -1 short}.
 */

export type Series = ArrayLike<number>;

export interface PSAROpts {
  accStart?: number;
  accStep?: number;
  accMax?: number;
}

export interface PSARResult {
  psar: Float64Array;
  trend: Int8Array;
}

export function psar(high: Series, low: Series, opts: PSAROpts = {}): PSARResult {
  const { accStart = 0.02, accStep = 0.02, accMax = 0.2 } = opts;
  const n = high.length;
  const out = new Float64Array(n).fill(NaN);
  const tr = new Int8Array(n).fill(0);
  if (n < 2) return { psar: out, trend: tr };

  let isUp = high[1]! >= high[0]!;
  let ep = isUp ? +high[0]! : +low[0]!;
  let sar = isUp ? +low[0]! : +high[0]!;
  let af = accStart;
  out[0] = sar;
  tr[0] = isUp ? 1 : -1;

  for (let i = 1; i < n; i++) {
    sar = sar + af * (ep - sar);

    if (isUp) {
      const cap = Math.min(+low[i - 1]!, i >= 2 ? +low[i - 2]! : +low[i - 1]!);
      if (sar > cap) sar = cap;
    } else {
      const cap = Math.max(+high[i - 1]!, i >= 2 ? +high[i - 2]! : +high[i - 1]!);
      if (sar < cap) sar = cap;
    }

    let flip = false;
    if (isUp && +low[i]! < sar) {
      flip = true;
      isUp = false;
      sar = ep;
      ep = +low[i]!;
      af = accStart;
    } else if (!isUp && +high[i]! > sar) {
      flip = true;
      isUp = true;
      sar = ep;
      ep = +high[i]!;
      af = accStart;
    }

    if (!flip) {
      if (isUp && +high[i]! > ep) {
        ep = +high[i]!;
        af = Math.min(af + accStep, accMax);
      }
      if (!isUp && +low[i]! < ep) {
        ep = +low[i]!;
        af = Math.min(af + accStep, accMax);
      }
    }

    out[i] = sar;
    tr[i] = isUp ? 1 : -1;
  }
  return { psar: out, trend: tr };
}
