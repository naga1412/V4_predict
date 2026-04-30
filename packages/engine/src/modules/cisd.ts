/**
 * CISD: Compression → Inducement → Sweep → Displacement.
 * 4-step structural setup tuned for crypto liquidity hunting.
 */

import { neutral, clampSignal, getSeries, getObj, type ModuleCtx, type ModuleMeta, type Signal } from "./baseModule.js";
import { sma } from "../ta/indicators/moving.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "cisd",
  name: "CISD",
  category: "smc",
  description: "Compression → Inducement → Sweep → Displacement sequence detector",
  weight: 1.1,
});

export interface CISDDefaults {
  lookback: number;
  atrPeriod: number;
  atrSmaPeriod: number;
  atrRunLen: number;
  bbwPeriod: number;
  bbwToleranceBin: number;
  mBosMaxATRMult: number;
  sweepWindow: number;
  sweepWickRatio: number;
  displaceWindow: number;
  volPeriod: number;
  volSpikeMult: number;
}

export const DEFAULTS: CISDDefaults = Object.freeze({
  lookback: 80,
  atrPeriod: 14,
  atrSmaPeriod: 100,
  atrRunLen: 3,
  bbwPeriod: 50,
  bbwToleranceBin: 0,
  mBosMaxATRMult: 1.5,
  sweepWindow: 5,
  sweepWickRatio: 1.5,
  displaceWindow: 6,
  volPeriod: 20,
  volSpikeMult: 1.5,
});

interface OHLC { o: number; h: number; l: number; c: number }

function bodySize(c: OHLC): number { return Math.abs(c.c - c.o); }
function upperWick(c: OHLC): number { return c.h - Math.max(c.o, c.c); }
function lowerWick(c: OHLC): number { return Math.min(c.o, c.c) - c.l; }

function wickBodyRatio(c: OHLC, side: "upper" | "lower"): number {
  const b = bodySize(c);
  const w = side === "upper" ? upperWick(c) : lowerWick(c);
  if (!(w > 0)) return 0;
  if (b <= 1e-12) return Infinity;
  return w / b;
}

function isMinInWindow(arr: ArrayLike<number>, i: number, windowLen: number, tolBin = 0): boolean {
  if (!arr || !Number.isInteger(i) || i < 0 || i >= arr.length) return false;
  const v = +arr[i]!;
  if (!Number.isFinite(v)) return false;
  const from = Math.max(0, i - windowLen + 1);
  let lower = 0;
  for (let k = from; k <= i; k++) {
    if (k === i) continue;
    const x = +arr[k]!;
    if (!Number.isFinite(x)) continue;
    if (x < v) lower++;
    if (lower > tolBin) return false;
  }
  return true;
}

export function bandWidthSeries(bb: { up?: ArrayLike<number>; mid?: ArrayLike<number>; lo?: ArrayLike<number> } | null | undefined): Float64Array | null {
  if (!bb?.up || !bb.lo || !bb.mid) return null;
  const n = Math.min(bb.up.length, bb.mid.length, bb.lo.length);
  const out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const u = +bb.up[i]!;
    const m = +bb.mid[i]!;
    const l = +bb.lo[i]!;
    if (Number.isFinite(u) && Number.isFinite(m) && Number.isFinite(l) && m !== 0) {
      out[i] = (u - l) / m;
    }
  }
  return out;
}

interface BreakRow { i?: number; t?: number; type?: string; dir?: "up" | "down"; level?: number }
interface SweepRow { i?: number; kind?: string; level?: number }
interface FVGRow { kind?: string; createdAtIdx?: number }
interface CISDCache {
  _cisdAtrSma?: Record<string, Float64Array>;
  _cisdBbw?: Float64Array | null;
  _cisdVolSma?: Record<string, Float64Array>;
}

export function detectCompression(ta: TAOutput, idx: number, cfg: CISDDefaults = DEFAULTS): { i: number; t: number | null; atr: number; atrSma: number; bbw: number; atrRunLen: number } | null {
  const atrArr = getSeries(ta, `atr${cfg.atrPeriod}`);
  if (!atrArr || idx < 0 || idx >= atrArr.length) return null;
  const cache = ta as unknown as CISDCache;
  if (!cache._cisdAtrSma) cache._cisdAtrSma = {};
  const key = `atr${cfg.atrPeriod}_sma${cfg.atrSmaPeriod}`;
  let atrSma = cache._cisdAtrSma[key];
  if (!atrSma) {
    atrSma = sma(atrArr, cfg.atrSmaPeriod);
    cache._cisdAtrSma[key] = atrSma;
  }
  let runOk = true;
  for (let k = 0; k < cfg.atrRunLen; k++) {
    const j = idx - k;
    if (j < 0) { runOk = false; break; }
    const a = +atrArr[j]!;
    const s = +atrSma[j]!;
    if (!Number.isFinite(a) || !Number.isFinite(s) || !(a < s)) { runOk = false; break; }
  }
  if (!runOk) return null;
  const bbKey = Object.keys(ta).find((k) => k.startsWith("bb_"));
  const bb = bbKey ? getObj<{ up?: ArrayLike<number>; mid?: ArrayLike<number>; lo?: ArrayLike<number> }>(ta, bbKey) : null;
  if (!bb) return null;
  if (cache._cisdBbw === undefined) cache._cisdBbw = bandWidthSeries(bb);
  const bbw = cache._cisdBbw;
  if (!bbw || !isMinInWindow(bbw, idx, cfg.bbwPeriod, cfg.bbwToleranceBin)) return null;
  const tArr = (ta as { t?: number[] }).t;
  return {
    i: idx,
    t: tArr?.[idx] ?? null,
    atr: +atrArr[idx]!,
    atrSma: +atrSma[idx]!,
    bbw: +bbw[idx]!,
    atrRunLen: cfg.atrRunLen,
  };
}

export function detectInducement(ta: TAOutput, afterIdx: number, cfg: CISDDefaults = DEFAULTS): { i: number; t: number | null; dir: "up" | "down"; level: number; magnitudeATR: number } | null {
  const breaks = getObj<BreakRow[]>(ta, "breaks") ?? [];
  const atrArr = getSeries(ta, `atr${cfg.atrPeriod}`);
  const closeArr = getSeries(ta, "close");
  if (!breaks.length || !atrArr || !closeArr) return null;
  for (let k = breaks.length - 1; k >= 0; k--) {
    const b = breaks[k]!;
    if (!b || b.type !== "BoS" || !Number.isInteger(b.i)) continue;
    if ((b.i as number) <= afterIdx) break;
    const close = +closeArr[b.i as number]!;
    const a = +atrArr[b.i as number]!;
    if (!Number.isFinite(close) || !Number.isFinite(a) || a <= 0) continue;
    const mag = Math.abs(close - +(b.level as number));
    if (mag < cfg.mBosMaxATRMult * a) {
      return { i: b.i as number, t: b.t ?? null, dir: b.dir as "up" | "down", level: +(b.level as number), magnitudeATR: mag / a };
    }
  }
  return null;
}

export function detectSweep(ta: TAOutput, inducement: { i: number; level: number; dir: "up" | "down" } | null, cfg: CISDDefaults = DEFAULTS): { i: number; t: number | null; kind: "bullish" | "bearish"; level: number; wickRatio: number; barsAfterInducement: number } | null {
  if (!inducement) return null;
  const ind = inducement;
  const closeArr = getSeries(ta, "close");
  const openArr = getSeries(ta, "open");
  const highArr = getSeries(ta, "high");
  const lowArr = getSeries(ta, "low");
  const lastBar = (closeArr?.length ?? 1) - 1;
  const windowEnd = Math.min(lastBar, ind.i + cfg.sweepWindow);

  function validate(i: number, kind: "bullish" | "bearish"): { i: number; t: number | null; kind: "bullish" | "bearish"; level: number; wickRatio: number; barsAfterInducement: number } | null {
    const c = closeArr?.[i];
    const o = openArr?.[i];
    const h = highArr?.[i];
    const l = lowArr?.[i];
    if (![c, o, h, l].every(Number.isFinite)) return null;
    const bar: OHLC = { o: o as number, h: h as number, l: l as number, c: c as number };
    const side: "upper" | "lower" = kind === "bearish" ? "upper" : "lower";
    const ratio = wickBodyRatio(bar, side);
    if (!(ratio >= cfg.sweepWickRatio)) return null;
    const lvl = ind.level;
    if (kind === "bearish" && !(+(h as number) > lvl && +(c as number) < lvl)) return null;
    if (kind === "bullish" && !(+(l as number) < lvl && +(c as number) > lvl)) return null;
    const tArr = (ta as { t?: number[] }).t;
    return {
      i, t: tArr?.[i] ?? null, kind, level: lvl, wickRatio: ratio,
      barsAfterInducement: i - ind.i,
    };
  }

  const kind: "bullish" | "bearish" = ind.dir === "up" ? "bearish" : "bullish";
  const sweeps = (getObj<SweepRow[]>(ta, "liquidity") as { sweeps?: SweepRow[] } | undefined)?.sweeps ?? [];
  for (let k = sweeps.length - 1; k >= 0; k--) {
    const s = sweeps[k]!;
    if (!Number.isInteger(s.i) || (s.i as number) <= ind.i || (s.i as number) > windowEnd) continue;
    if (s.kind !== kind) continue;
    const v = validate(s.i as number, kind);
    if (v) return v;
  }
  for (let i = ind.i + 1; i <= windowEnd; i++) {
    const v = validate(i, kind);
    if (v) return v;
  }
  return null;
}

export function detectDisplacement(ta: TAOutput, sweep: { i: number; kind: "bullish" | "bearish" } | null, cfg: CISDDefaults = DEFAULTS): { break: BreakRow; fvg: FVGRow; volRatio: number } | null {
  if (!sweep) return null;
  const closeArr = getSeries(ta, "close");
  const lastBar = (closeArr?.length ?? 1) - 1;
  const windowEnd = Math.min(lastBar, sweep.i + cfg.displaceWindow);
  const breaks = getObj<BreakRow[]>(ta, "breaks") ?? [];
  const fvgObj = getObj<{ open?: FVGRow[]; mitigated?: FVGRow[] }>(ta, "fvg");
  const allFvg = (fvgObj?.open ?? []).concat(fvgObj?.mitigated ?? []);

  const wantDir: "up" | "down" = sweep.kind === "bearish" ? "down" : "up";
  let choch: BreakRow | null = null;
  for (let k = breaks.length - 1; k >= 0; k--) {
    const b = breaks[k]!;
    if (!b || b.type !== "CHoCH" || !Number.isInteger(b.i)) continue;
    if ((b.i as number) <= sweep.i || (b.i as number) > windowEnd) continue;
    if (b.dir !== wantDir) continue;
    choch = b;
    break;
  }
  if (!choch) return null;

  const wantFvgKind = wantDir === "up" ? "bull" : "bear";
  let fvg: FVGRow | null = null;
  for (let k = allFvg.length - 1; k >= 0; k--) {
    const g = allFvg[k]!;
    if (!g || g.kind !== wantFvgKind) continue;
    if (!(g.createdAtIdx! >= sweep.i && g.createdAtIdx! <= windowEnd)) continue;
    fvg = g;
    break;
  }
  if (!fvg) return null;

  const vol = getSeries(ta, "volume");
  if (!vol || vol.length <= (choch.i as number)) return null;
  const cache = ta as unknown as CISDCache;
  if (!cache._cisdVolSma) cache._cisdVolSma = {};
  const vKey = `v${cfg.volPeriod}`;
  let vSma = cache._cisdVolSma[vKey];
  if (!vSma) {
    vSma = sma(vol, cfg.volPeriod);
    cache._cisdVolSma[vKey] = vSma;
  }
  const vNow = +vol[choch.i as number]!;
  const vAvg = +vSma[choch.i as number]!;
  if (!(Number.isFinite(vNow) && Number.isFinite(vAvg) && vAvg > 0)) return null;
  const volRatio = vNow / vAvg;
  if (!(volRatio >= cfg.volSpikeMult)) return null;
  return { break: choch, fvg, volRatio };
}

export function evaluate(ta: TAOutput, ctx: ModuleCtx = {}): Signal {
  const cfg: CISDDefaults = { ...DEFAULTS, ...(ctx.cisd ?? {}) } as CISDDefaults;
  if (!ta || ta.empty) return neutral("empty TA");
  const closeArr = getSeries(ta, "close");
  const n = closeArr?.length ?? 0;
  if (n < Math.max(cfg.atrSmaPeriod, cfg.bbwPeriod, cfg.volPeriod) + cfg.atrRunLen + cfg.displaceWindow) {
    return neutral("insufficient history for CISD");
  }

  const breaks = getObj<BreakRow[]>(ta, "breaks") ?? [];
  const lastIdx = n - 1;
  let best: { compression: NonNullable<ReturnType<typeof detectCompression>>; inducement: NonNullable<ReturnType<typeof detectInducement>>; sweep: NonNullable<ReturnType<typeof detectSweep>>; displacement: NonNullable<ReturnType<typeof detectDisplacement>>; choch: BreakRow } | null = null;

  for (let k = breaks.length - 1; k >= 0 && !best; k--) {
    const b = breaks[k]!;
    if (!b || b.type !== "CHoCH") continue;
    if (lastIdx - (b.i as number) > cfg.lookback) break;

    const sweepFrom = Math.max(0, (b.i as number) - cfg.displaceWindow);
    const wantSweepKind: "bullish" | "bearish" = b.dir === "down" ? "bearish" : "bullish";
    const liqObj = getObj<{ sweeps?: SweepRow[] }>(ta, "liquidity");
    const sweeps = (liqObj?.sweeps ?? []).filter(
      (s) => s && s.kind === wantSweepKind && (s.i as number) >= sweepFrom && (s.i as number) < (b.i as number)
    );

    for (let si = sweeps.length - 1; si >= 0 && !best; si--) {
      const s = sweeps[si]!;
      const indDir: "up" | "down" = b.dir === "down" ? "up" : "down";
      const atrArr = getSeries(ta, `atr${cfg.atrPeriod}`);
      let inducement: NonNullable<ReturnType<typeof detectInducement>> | null = null;
      for (let ki = breaks.length - 1; ki >= 0; ki--) {
        const ib = breaks[ki]!;
        if (!ib || ib.type !== "BoS" || ib.dir !== indDir) continue;
        if (!((ib.i as number) < (s.i as number) && (s.i as number) - (ib.i as number) <= cfg.sweepWindow)) continue;
        const close = +closeArr![ib.i as number]!;
        const a = atrArr ? +atrArr[ib.i as number]! : NaN;
        if (!Number.isFinite(close) || !Number.isFinite(a) || a <= 0) continue;
        const mag = Math.abs(close - +(ib.level as number));
        if (mag < cfg.mBosMaxATRMult * a) {
          inducement = { i: ib.i as number, t: ib.t ?? null, dir: ib.dir as "up" | "down", level: +(ib.level as number), magnitudeATR: mag / a };
          break;
        }
      }
      if (!inducement) continue;
      const compression = detectCompression(ta, inducement.i - 1, cfg) ?? detectCompression(ta, inducement.i, cfg);
      if (!compression) continue;
      const sweepValid = detectSweep(ta, inducement, cfg);
      if (!sweepValid || sweepValid.i !== s.i) continue;
      const displacement = detectDisplacement(ta, sweepValid, cfg);
      if (!displacement || displacement.break.i !== b.i) continue;

      best = { compression, inducement, sweep: sweepValid, displacement, choch: b };
    }
  }

  if (!best) {
    return clampSignal({ signal: 0, confidence: 0.05, reasons: ["no full CISD sequence in window"] });
  }

  const dir = best.sweep.kind === "bullish" ? 1 : -1;
  const age = lastIdx - (best.choch.i as number);
  const fresh = age === 0 ? 1 : age <= 2 ? 0.85 : age <= 5 ? 0.65 : 0.4;
  const wickBonus = Math.min(1, (best.sweep.wickRatio - cfg.sweepWickRatio) / 2);
  const volBonus = Math.min(1, (best.displacement.volRatio - cfg.volSpikeMult) / 2);
  const confidence = Math.max(0, Math.min(1, 0.45 + 0.25 * fresh + 0.15 * wickBonus + 0.15 * volBonus));
  const strength = Math.max(0.4, Math.min(1, 0.5 + 0.25 * fresh + 0.25 * (wickBonus * 0.5 + volBonus * 0.5)));

  return clampSignal({
    signal: dir * strength,
    confidence,
    reasons: [
      `compression at bar ${best.compression.i} (bbw=${best.compression.bbw.toFixed(4)})`,
      `mBOS ${best.inducement.dir} at bar ${best.inducement.i} (mag=${best.inducement.magnitudeATR.toFixed(2)}×ATR)`,
      `${best.sweep.kind} sweep at bar ${best.sweep.i} (wick:body=${best.sweep.wickRatio.toFixed(2)})`,
      `displacement CHoCH ${best.choch.dir} at bar ${best.choch.i} (vol=${best.displacement.volRatio.toFixed(2)}× avg)`,
      `age=${age} bar${age === 1 ? "" : "s"}`,
    ],
    payload: {
      compression: best.compression as unknown as Record<string, unknown>,
      inducement: best.inducement as unknown as Record<string, unknown>,
      sweep: best.sweep as unknown as Record<string, unknown>,
      displacement: best.displacement as unknown as Record<string, unknown>,
      dir: dir > 0 ? "long" : "short",
    },
  });
}
