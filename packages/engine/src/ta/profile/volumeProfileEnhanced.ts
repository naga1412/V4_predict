/**
 * Volume Profile (enhanced).
 *
 * Computes a price-bucketed volume profile with POC, value-area (VAH/VAL),
 * HVN/LVN density flags, and TPO letters per bar.
 *
 * Pure module — no DOM, no IDB. Caller passes a candle array and config.
 */

import type { Bar } from "../structure/types.js";

export interface VolumeProfileOpts {
  buckets?: number;
  lookback?: number;
  valueAreaPct?: number;
  hvnFactor?: number;
  lvnFactor?: number;
  sessionAnchored?: boolean;
  sessionStartT?: number | null;
  /** Optional callback `(candle, idx) => "asia"|"london"|"ny-am"|"ny-pm"|"off"`. */
  sessionForCandle?: ((c: Bar, i: number) => string | null) | null;
}

const DEFAULTS: Required<VolumeProfileOpts> = {
  buckets: 24,
  lookback: 200,
  valueAreaPct: 0.7,
  hvnFactor: 1.5,
  lvnFactor: 0.4,
  sessionAnchored: false,
  sessionStartT: null,
  sessionForCandle: null,
};

export interface VPRow {
  idx: number;
  lo: number;
  hi: number;
  mid: number;
  vol: number;
  up: number;
  dn: number;
  tpo: string[];
  isPOC: boolean;
  isVAH: boolean;
  isVAL: boolean;
  inValueArea: boolean;
  density: "HVN" | "LVN" | null;
}

export interface VPBundle {
  rows: VPRow[];
  pocIdx: number;
  pocPrice: number;
  vahIdx: number;
  vahPrice: number;
  valIdx: number;
  valPrice: number;
  valueAreaPct: number;
  totalVolume: number;
  buckets: number;
  lookback: number;
  priceRange: { lo: number; hi: number; step: number };
  window: { barsUsed: number; sessionStartT: number | null; sessionAnchored: boolean };
  hvnCount: number;
  lvnCount: number;
}

export interface VPSummary {
  poc: number;
  vah: number;
  val: number;
  vapct: number;
  buckets: number;
  bars: number;
  hvn: number;
  lvn: number;
}

/* ═════════════════════════ Helpers ═════════════════════════ */

export function tpoLetter(i: number): string {
  if (!Number.isInteger(i) || i < 0) return "";
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function bucketIndex(price: number, lo: number, hi: number, N: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(lo) || !Number.isFinite(hi)) return -1;
  if (hi <= lo || N <= 0) return -1;
  const step = (hi - lo) / N;
  if (step <= 0) return -1;
  if (price < lo) return -1;
  if (price > hi) return N - 1;
  return Math.min(N - 1, Math.max(0, Math.floor((price - lo) / step)));
}

export interface ValueAreaResult {
  vahIdx: number;
  valIdx: number;
  accumulatedVolume: number;
  areaPct: number;
}

export function valueArea(
  rows: VPRow[],
  pocIdx: number,
  opts: { valueAreaPct?: number } = {}
): ValueAreaResult {
  const target = opts.valueAreaPct ?? DEFAULTS.valueAreaPct;
  if (!Array.isArray(rows) || rows.length === 0 || pocIdx < 0 || pocIdx >= rows.length) {
    return { vahIdx: -1, valIdx: -1, accumulatedVolume: 0, areaPct: 0 };
  }
  const total = rows.reduce((s, r) => s + (r.vol || 0), 0);
  if (total <= 0) {
    return { vahIdx: pocIdx, valIdx: pocIdx, accumulatedVolume: 0, areaPct: 0 };
  }
  let lo = pocIdx;
  let hi = pocIdx;
  let acc = rows[pocIdx]?.vol ?? 0;
  const need = total * target;
  while (acc < need && (lo > 0 || hi < rows.length - 1)) {
    const above = hi + 1 < rows.length ? rows[hi + 1]!.vol : -Infinity;
    const below = lo - 1 >= 0 ? rows[lo - 1]!.vol : -Infinity;
    if (above >= below) {
      if (hi + 1 < rows.length) {
        hi++;
        acc += rows[hi]!.vol;
      } else if (lo - 1 >= 0) {
        lo--;
        acc += rows[lo]!.vol;
      } else break;
    } else {
      if (lo - 1 >= 0) {
        lo--;
        acc += rows[lo]!.vol;
      } else if (hi + 1 < rows.length) {
        hi++;
        acc += rows[hi]!.vol;
      } else break;
    }
  }
  return { vahIdx: hi, valIdx: lo, accumulatedVolume: acc, areaPct: total > 0 ? acc / total : 0 };
}

/* ═════════════════════════ Core ═════════════════════════ */

export function computeVolumeProfile(candles: Bar[], opts: VolumeProfileOpts = {}): VPBundle | null {
  const cfg = { ...DEFAULTS, ...opts };
  if (!Array.isArray(candles) || candles.length < 2) return null;

  let from = Math.max(0, candles.length - ((cfg.lookback | 0) || candles.length));
  if (cfg.sessionAnchored && Number.isFinite(cfg.sessionStartT)) {
    for (let i = from; i < candles.length; i++) {
      const t = candles[i]?.t;
      if (Number.isFinite(t) && t! >= cfg.sessionStartT!) {
        from = i;
        break;
      }
    }
  }
  const window = candles.slice(from);
  if (window.length < 2) return null;

  let lo = +Infinity;
  let hi = -Infinity;
  for (const c of window) {
    if (Number.isFinite(c.l) && c.l < lo) lo = c.l;
    if (Number.isFinite(c.h) && c.h > hi) hi = c.h;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;

  const N = Math.max(4, Math.min(256, cfg.buckets | 0));
  const step = (hi - lo) / N;
  const rows: VPRow[] = new Array(N);
  for (let i = 0; i < N; i++) {
    rows[i] = {
      idx: i,
      lo: lo + step * i,
      hi: lo + step * (i + 1),
      mid: lo + step * (i + 0.5),
      vol: 0,
      up: 0,
      dn: 0,
      tpo: [],
      isPOC: false,
      isVAH: false,
      isVAL: false,
      inValueArea: false,
      density: null,
    };
  }

  for (let i = 0; i < window.length; i++) {
    const c = window[i]!;
    const o = c.o;
    const h = c.h;
    const l = c.l;
    const cl = c.c;
    const v = c.v > 0 ? c.v : 0;
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(cl)) continue;
    const tp = (h + l + cl) / 3;
    const idx = bucketIndex(tp, lo, hi, N);
    if (idx < 0) continue;
    rows[idx]!.vol += v;
    if (cl >= o) rows[idx]!.up += v;
    else rows[idx]!.dn += v;
    let tpoG = tpoLetter(i);
    if (typeof cfg.sessionForCandle === "function") {
      try {
        const tag = cfg.sessionForCandle(c, i);
        if (tag) tpoG = `${tag.slice(0, 1).toLowerCase()}${tpoG}`;
      } catch {
        // ignore tagger errors
      }
    }
    rows[idx]!.tpo.push(tpoG);
  }

  let pocIdx = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.vol > rows[pocIdx]!.vol) pocIdx = i;
  }
  rows[pocIdx]!.isPOC = true;

  const va = valueArea(rows, pocIdx, { valueAreaPct: cfg.valueAreaPct });
  if (va.vahIdx >= 0) {
    rows[va.vahIdx]!.isVAH = true;
    rows[va.valIdx]!.isVAL = true;
    for (let i = va.valIdx; i <= va.vahIdx; i++) rows[i]!.inValueArea = true;
  }

  const sortedVols = rows.map((r) => r.vol).sort((a, b) => a - b);
  let baseline = sortedVols[Math.floor(sortedVols.length / 2)] ?? 0;
  if (baseline <= 0) {
    let nz = 0;
    let sum = 0;
    for (const r of rows) if (r.vol > 0) { sum += r.vol; nz++; }
    baseline = nz > 0 ? sum / nz : 0;
  }
  let hvnCount = 0;
  let lvnCount = 0;
  for (const r of rows) {
    if (baseline > 0 && r.vol >= baseline * cfg.hvnFactor) {
      r.density = "HVN";
      hvnCount++;
    } else if (baseline > 0 && r.vol <= baseline * cfg.lvnFactor && r.vol > 0) {
      r.density = "LVN";
      lvnCount++;
    }
  }

  const totalVolume = rows.reduce((s, r) => s + r.vol, 0);

  return {
    rows,
    pocIdx,
    pocPrice: rows[pocIdx]!.mid,
    vahIdx: va.vahIdx,
    vahPrice: va.vahIdx >= 0 ? rows[va.vahIdx]!.hi : NaN,
    valIdx: va.valIdx,
    valPrice: va.valIdx >= 0 ? rows[va.valIdx]!.lo : NaN,
    valueAreaPct: va.areaPct,
    totalVolume,
    buckets: N,
    lookback: window.length,
    priceRange: { lo, hi, step },
    window: {
      barsUsed: window.length,
      sessionStartT: cfg.sessionAnchored ? (cfg.sessionStartT ?? null) : null,
      sessionAnchored: !!cfg.sessionAnchored,
    },
    hvnCount,
    lvnCount,
  };
}

export function summarizeProfile(bundle: VPBundle | null): VPSummary | null {
  if (!bundle) return null;
  return {
    poc: bundle.pocPrice,
    vah: bundle.vahPrice,
    val: bundle.valPrice,
    vapct: bundle.valueAreaPct,
    buckets: bundle.buckets,
    bars: bundle.lookback,
    hvn: bundle.hvnCount,
    lvn: bundle.lvnCount,
  };
}
