/**
 * Validator (verdict computer) — pure transform from prediction + realized
 * candle into structured verdict object.
 */

import type { PredictionRow, PredictionKind } from "./predictionStore.js";

export interface OHLCBar {
  o: number; h: number; l: number; c: number; v?: number; t: number;
}

export const TF_MS: Record<string, number> = Object.freeze({
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
});

export function tfMs(tf: string): number {
  return TF_MS[tf] ?? NaN;
}

export function nextCandleOpen(lastT: number, tf: string): number {
  const d = tfMs(tf);
  if (!Number.isFinite(d) || !Number.isFinite(lastT)) return NaN;
  return lastT + d;
}

export function nextCloseAt(lastT: number, tf: string, graceMs = 4000): number {
  const nextOpen = nextCandleOpen(lastT, tf);
  if (!Number.isFinite(nextOpen)) return NaN;
  const d = tfMs(tf);
  return nextOpen + d + Math.max(0, graceMs | 0);
}

export function msUntilNextClose(lastT: number, tf: string, opts: { now?: number; graceMs?: number } = {}): number {
  const { now = Date.now(), graceMs = 4000 } = opts;
  const ca = nextCloseAt(lastT, tf, graceMs);
  if (!Number.isFinite(ca)) return NaN;
  return Math.max(0, ca - now);
}

export function realizedDirection(candle: OHLCBar | null | undefined, band = 0): "up" | "down" | "flat" {
  if (!candle || !Number.isFinite(candle.o) || !Number.isFinite(candle.c)) return "flat";
  const d = candle.c - candle.o;
  if (band > 0) {
    const thresh = Math.abs(candle.o) * band;
    if (Math.abs(d) <= thresh) return "flat";
  }
  if (d > 0) return "up";
  if (d < 0) return "down";
  return "flat";
}

export function realizedReturn(candle: OHLCBar | null | undefined, refPrice?: number): number {
  if (!candle || !Number.isFinite(candle.c)) return NaN;
  const ref = Number.isFinite(refPrice) ? (refPrice as number) : candle.o;
  if (!Number.isFinite(ref) || ref === 0) return NaN;
  return (candle.c - ref) / ref;
}

export interface BaseVerdict {
  ok: boolean;
  kind: PredictionKind | "unknown";
  error?: string;
}

export interface DirectionVerdict extends BaseVerdict {
  kind: "direction";
  predDir: "up" | "down" | "flat";
  realizedDir: "up" | "down" | "flat";
  hit: boolean;
  prob: number | null;
  brier: number | null;
  abstain: boolean;
  band: number;
}

export interface ReturnVerdict extends BaseVerdict {
  kind: "return";
  yhat: number;
  realized: number;
  residual: number;
  absError: number;
  sigma: number | null;
  zScore: number | null;
}

export interface IntervalVerdict extends BaseVerdict {
  kind: "interval";
  lo: number;
  hi: number;
  realized: number;
  covered: boolean;
  width: number;
  centreResidual: number;
}

export interface SetVerdict extends BaseVerdict {
  kind: "set";
  classes: string[];
  setSize: number;
  direction: string | null;
  realizedDir: "up" | "down" | "flat";
  covered: boolean;
  abstain: boolean;
  band: number;
}

export type Verdict =
  | DirectionVerdict | ReturnVerdict | IntervalVerdict | SetVerdict
  | (BaseVerdict & { kind: PredictionKind | "unknown" });

function errVerdict(kind: PredictionKind | "unknown", msg: string): BaseVerdict {
  return { ok: false, kind, error: msg };
}

export function verdictFor(prediction: PredictionRow, candle: OHLCBar, opts: { band?: number } = {}): Verdict {
  if (!prediction || typeof prediction !== "object") {
    return { ok: false, kind: "unknown", error: "prediction row required" };
  }
  if (!candle || typeof candle !== "object") {
    return errVerdict(prediction.kind ?? "unknown", "candle required");
  }
  const kind = prediction.kind ?? "direction";
  const payload = (prediction.payload ?? {}) as Record<string, unknown>;
  const band = Number.isFinite(opts.band) ? (opts.band as number) : 0;

  switch (kind) {
    case "direction":
      return verdictDirection(payload, candle, band);
    case "return":
      return verdictReturn(payload, candle);
    case "interval":
      return verdictInterval(payload, candle);
    case "set":
      return verdictSet(payload, candle, band);
    default:
      return errVerdict(kind, `unknown kind "${kind}"`);
  }
}

function verdictDirection(payload: Record<string, unknown>, candle: OHLCBar, band: number): DirectionVerdict | (BaseVerdict & { kind: "direction" }) {
  const predDir = String(payload.dir ?? "").toLowerCase() as "up" | "down" | "flat";
  if (!["up", "down", "flat"].includes(predDir)) {
    return { ok: false, kind: "direction", error: `invalid payload.dir "${payload.dir}"` };
  }
  const realDir = realizedDirection(candle, band);
  const abstain = predDir === "flat";
  const hit = !abstain && predDir === realDir;
  let brier: number | null = null;
  if (Number.isFinite(payload.prob)) {
    const target = hit ? 1 : 0;
    const d = (payload.prob as number) - target;
    brier = d * d;
  }
  return {
    ok: true,
    kind: "direction",
    predDir,
    realizedDir: realDir,
    hit,
    prob: Number.isFinite(payload.prob) ? (payload.prob as number) : null,
    brier,
    abstain,
    band,
  };
}

function verdictReturn(payload: Record<string, unknown>, candle: OHLCBar): ReturnVerdict | (BaseVerdict & { kind: "return" }) {
  if (!Number.isFinite(payload.yhat)) return { ok: false, kind: "return", error: "payload.yhat required" };
  const realized = realizedReturn(candle, payload.refPrice as number | undefined);
  if (!Number.isFinite(realized)) return { ok: false, kind: "return", error: "realized return not computable" };
  const residual = realized - (payload.yhat as number);
  const absError = Math.abs(residual);
  const sigma = Number.isFinite(payload.sigma) && (payload.sigma as number) > 0 ? (payload.sigma as number) : null;
  const zScore = sigma ? residual / sigma : null;
  return {
    ok: true, kind: "return",
    yhat: payload.yhat as number,
    realized, residual, absError, sigma, zScore,
  };
}

function verdictInterval(payload: Record<string, unknown>, candle: OHLCBar): IntervalVerdict | (BaseVerdict & { kind: "interval" }) {
  if (!Number.isFinite(payload.lo) || !Number.isFinite(payload.hi)) return { ok: false, kind: "interval", error: "payload.lo & payload.hi required" };
  if ((payload.lo as number) > (payload.hi as number)) return { ok: false, kind: "interval", error: "lo > hi" };
  const realized = realizedReturn(candle, payload.refPrice as number | undefined);
  if (!Number.isFinite(realized)) return { ok: false, kind: "interval", error: "realized return not computable" };
  const lo = payload.lo as number;
  const hi = payload.hi as number;
  const covered = realized >= lo && realized <= hi;
  const width = hi - lo;
  const centre = (lo + hi) / 2;
  return {
    ok: true, kind: "interval", lo, hi, realized, covered, width,
    centreResidual: realized - centre,
  };
}

function verdictSet(payload: Record<string, unknown>, candle: OHLCBar, band: number): SetVerdict {
  const classes = Array.isArray(payload.classes) ? (payload.classes as string[]) : [];
  const realDir = realizedDirection(candle, band);
  const abstain = classes.length === 0 || payload.direction === "abstain";
  const key = realDir === "up" ? "long" : realDir === "down" ? "short" : realDir;
  const covered = classes.includes(key) || classes.includes(realDir);
  return {
    ok: true,
    kind: "set",
    classes: classes.slice(),
    setSize: classes.length,
    direction: (payload.direction as string | undefined) ?? null,
    realizedDir: realDir,
    covered,
    abstain,
    band,
  };
}

export interface VerdictSummary {
  n: number;
  directional: { n: number; hits: number; accuracy: number | null; abstainN: number };
  regression: { n: number; mae: number | null; rmse: number | null; meanResidual: number | null; meanAbsResidual?: number };
  intervals: { n: number; coverage: number | null; meanWidth: number | null };
  sets: { n: number; coverage: number | null; meanSize: number | null; abstainN: number };
  brier: { n: number; mean: number | null };
}

export function summarizeVerdicts(verdicts: Verdict[]): VerdictSummary {
  const out: VerdictSummary = {
    n: 0,
    directional: { n: 0, hits: 0, accuracy: null, abstainN: 0 },
    regression: { n: 0, mae: null, rmse: null, meanResidual: null },
    intervals: { n: 0, coverage: null, meanWidth: null },
    sets: { n: 0, coverage: null, meanSize: null, abstainN: 0 },
    brier: { n: 0, mean: null },
  };
  if (!Array.isArray(verdicts) || verdicts.length === 0) return out;
  out.n = verdicts.length;

  let sumAbs = 0;
  let sumSq = 0;
  let sumRes = 0;
  let nReg = 0;
  let covI = 0;
  let widthI = 0;
  let nI = 0;
  let covS = 0;
  let sizeS = 0;
  let nS = 0;
  let absS = 0;
  let nBr = 0;
  let sumBr = 0;

  for (const v of verdicts) {
    if (!v || !v.ok) continue;
    switch (v.kind) {
      case "direction": {
        const d = v as DirectionVerdict;
        out.directional.n++;
        if (d.abstain) out.directional.abstainN++;
        else if (d.hit) out.directional.hits++;
        if (Number.isFinite(d.brier)) { nBr++; sumBr += d.brier as number; }
        break;
      }
      case "return": {
        const r = v as ReturnVerdict;
        nReg++;
        sumAbs += r.absError;
        sumSq += r.residual * r.residual;
        sumRes += r.residual;
        break;
      }
      case "interval": {
        const ii = v as IntervalVerdict;
        nI++;
        if (ii.covered) covI++;
        widthI += ii.width;
        break;
      }
      case "set": {
        const ss = v as SetVerdict;
        nS++;
        if (ss.covered) covS++;
        sizeS += ss.setSize;
        if (ss.abstain) absS++;
        break;
      }
    }
  }

  if (out.directional.n > 0) {
    const nonAbs = out.directional.n - out.directional.abstainN;
    out.directional.accuracy = nonAbs > 0 ? out.directional.hits / nonAbs : null;
  }
  if (nReg > 0) {
    out.regression.n = nReg;
    out.regression.mae = sumAbs / nReg;
    out.regression.rmse = Math.sqrt(sumSq / nReg);
    out.regression.meanResidual = sumRes / nReg;
    out.regression.meanAbsResidual = sumAbs / nReg;
  }
  if (nI > 0) {
    out.intervals.n = nI;
    out.intervals.coverage = covI / nI;
    out.intervals.meanWidth = widthI / nI;
  }
  if (nS > 0) {
    out.sets.n = nS;
    out.sets.coverage = covS / nS;
    out.sets.meanSize = sizeS / nS;
    out.sets.abstainN = absS;
  }
  if (nBr > 0) {
    out.brier.n = nBr;
    out.brier.mean = sumBr / nBr;
  }
  return out;
}

export interface BatchResult {
  prediction: PredictionRow;
  verdict: Verdict | null;
  missing: boolean;
}

export type CandleLookup = (symbol: string, tf: string, t: number) => OHLCBar | null | undefined;

export function validateBatch(predictions: PredictionRow[], lookup: CandleLookup, opts: { band?: number } = {}): BatchResult[] {
  if (!Array.isArray(predictions)) throw new Error("validateBatch: predictions array required");
  if (typeof lookup !== "function") throw new Error("validateBatch: lookup required");
  const band = Number.isFinite(opts.band) ? (opts.band as number) : 0;
  const out: BatchResult[] = [];
  for (const p of predictions) {
    const target = nextCandleOpen(p.t, p.tf);
    if (!Number.isFinite(target)) {
      out.push({ prediction: p, verdict: { ok: false, kind: p.kind, error: "unknown tf" }, missing: false });
      continue;
    }
    const c = lookup(p.symbol, p.tf, target);
    if (!c) {
      out.push({ prediction: p, verdict: null, missing: true });
      continue;
    }
    const v = verdictFor(p, c, { band });
    out.push({ prediction: p, verdict: v, missing: false });
  }
  return out;
}
