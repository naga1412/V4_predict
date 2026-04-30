/**
 * Meta-Brain (decision layer). Aggregates orchestrator + TA + regime + stability
 * into an 80-dim feature vector, runs an MLP, and returns a calibrated direction.
 */

import { put, withStore, req2promise } from "../data/idb.js";
import { MLP, paramCount, type SerializedMLP } from "../ml/nn.js";
import * as ModelStore from "../ml/modelStore.js";
import { EventBus } from "../core/bus.js";

const POOL_STORE = "metaBrainPool";
const MODEL_REGIME = "meta-brain";
const MIN_TRAIN_ROWS = 200;
const MAX_POOL_ROWS = 5000;

export interface AggregateCtx {
  t?: number;
  symbol?: string;
  tf?: string;
  orch?: { signals?: Array<{ signal?: number; confidence?: number; moduleId?: string }>; direction?: string; probability?: number; rawScore?: number; confidence?: number };
  ghost?: { direction?: number; bias?: number; confidence?: number; bars?: Array<{ width?: number; hi?: number; lo?: number; c?: number }>; atr?: number; firstBarBoost?: number };
  regime?: { trend?: string; strength?: string; volatility?: string };
  wyckoff?: { phase?: string };
  ta?: Record<string, unknown>;
  macro?: { score?: number; label?: string };
  deriv?: {
    premiumIndex?: { lastFundingRate?: number; markPrice?: number; indexPrice?: number };
    oiHist?: Array<{ openInterestUSD?: number }>;
    lsHist?: Array<{ longShortRatio?: number }>;
  };
  stability?: { score?: number; biasSigma?: number; flipRate?: number };
  adaptive?: { emaSnapshot?: () => Record<string, number> };
  antiPatternMatch?: { inRadius?: boolean; antiPattern?: { hitRate?: number } };
  recentErrorMag?: number;
}

export interface MetaBrainDecision {
  direction: "long" | "short" | "neutral";
  probability: number;
  confidence: number;
  rawScore: number;
  used: "meta-nn" | "orch-fallback" | "none";
  modelVersion?: string;
}

export interface DecideOpts {
  orchFallback?: AggregateCtx["orch"];
}

export interface MetaBrainStatus {
  hasModel: boolean;
  version: string | null;
  accuracy: number | null;
  trainedAt: number | null;
  rowsTrained: number | null;
  pending: number;
  ready: number;
}

interface PoolRow {
  id: string;
  kind: "meta-brain";
  predictionId: number | string;
  symbol: string | null;
  tf: string | null;
  t: number;
  input: number[];
  label: number | null;
  pending: boolean;
  createdAt: number;
  labeledAt?: number;
}

const safe = (v: unknown, fb = 0): number => (Number.isFinite(v) ? +(v as number) : fb);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function aggregate(ctx: AggregateCtx = {}): Float32Array {
  const out = new Float32Array(80);

  const sigs = Array.isArray(ctx?.orch?.signals) ? ctx.orch!.signals! : [];
  for (let i = 0; i < Math.min(15, sigs.length); i++) {
    const s = sigs[i]!;
    out[i * 2] = clamp(safe(s.signal), -1, 1);
    out[i * 2 + 1] = clamp(safe(s.confidence), 0, 1);
  }

  if (ctx?.ghost) {
    out[30] = clamp(safe(ctx.ghost.direction), -1, 1);
    out[31] = clamp(safe(ctx.ghost.bias), -1, 1);
    out[32] = clamp(safe(ctx.ghost.confidence), 0, 1);
    if (Array.isArray(ctx.ghost.bars) && ctx.ghost.bars.length) {
      const b0 = ctx.ghost.bars[0];
      const bL = ctx.ghost.bars[ctx.ghost.bars.length - 1];
      out[33] = clamp(safe(b0?.width) / Math.max(1e-9, safe(ctx.ghost.atr) || 1), 0, 10);
      out[34] = clamp(safe(bL?.width) / Math.max(1e-9, safe(ctx.ghost.atr) || 1), 0, 10);
      out[35] = clamp((safe(bL?.hi) - safe(bL?.lo)) / Math.max(1e-9, safe(bL?.c) || 1), 0, 1);
    }
    out[36] = clamp(safe(ctx.ghost.firstBarBoost, 1), 0, 2) - 1;
  }

  const r = ctx?.regime;
  if (r) {
    if (r.trend === "up") out[37] = 1;
    if (r.trend === "down") out[38] = 1;
    if (r.trend === "range") out[39] = 1;
    if (r.strength === "strong") out[40] = 1;
    if (r.strength === "moderate") out[41] = 1;
    if (r.strength === "weak") out[42] = 1;
    if (r.volatility === "high") out[43] = 1;
  }

  const w = ctx?.wyckoff;
  if (w?.phase) {
    if (w.phase === "markup") out[44] = 1;
    if (w.phase === "markdown") out[45] = 1;
    if (w.phase === "accumulation") out[46] = 1;
    if (w.phase === "distribution") out[47] = 1;
  }

  if (ctx?.macro) {
    out[48] = clamp(safe(ctx.macro.score), -1, 1);
    out[49] = ctx.macro.label === "risk-on" ? 1 : ctx.macro.label === "risk-off" ? -1 : 0;
  }

  if (ctx?.deriv) {
    out[50] = clamp(safe(ctx.deriv.premiumIndex?.lastFundingRate) * 100, -1, 1);
    if (Array.isArray(ctx.deriv.oiHist) && ctx.deriv.oiHist.length >= 24) {
      const cur = ctx.deriv.oiHist[ctx.deriv.oiHist.length - 1]?.openInterestUSD;
      const old = ctx.deriv.oiHist[ctx.deriv.oiHist.length - 24]?.openInterestUSD;
      if (Number.isFinite(cur) && Number.isFinite(old) && (old as number) > 0) {
        out[51] = clamp(((cur as number) - (old as number)) / (old as number), -1, 1);
      }
    }
    const lsHist = ctx.deriv.lsHist ?? [];
    const lsLast = lsHist[lsHist.length - 1];
    if (lsLast?.longShortRatio) {
      out[52] = Math.tanh(lsLast.longShortRatio - 1);
    }
    const pi = ctx.deriv.premiumIndex;
    if (pi && Number.isFinite(pi.markPrice) && Number.isFinite(pi.indexPrice)) {
      const basis = ((pi.markPrice as number) - (pi.indexPrice as number)) / Math.max(1e-9, pi.indexPrice as number);
      out[53] = clamp(basis * 100, -1, 1);
    }
  }

  if (ctx?.stability) {
    out[54] = clamp(safe(ctx.stability.score), 0, 1);
    out[55] = clamp(safe(ctx.stability.biasSigma), 0, 1);
    out[56] = clamp(safe(ctx.stability.flipRate), 0, 1);
  }

  if (ctx?.adaptive?.emaSnapshot) {
    const ema = ctx.adaptive.emaSnapshot();
    const vals = Object.values(ema).filter((v) => Number.isFinite(v));
    if (vals.length) {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      let s2 = 0;
      for (const v of vals) s2 += (v - m) * (v - m);
      const std = Math.sqrt(s2 / vals.length);
      out[57] = clamp(m, 0, 1);
      out[58] = clamp(std, 0, 1);
      out[59] = clamp(Math.max(...vals), 0, 1);
      out[60] = clamp(Math.min(...vals), 0, 1);
    }
  }

  if (ctx?.antiPatternMatch) {
    out[61] = ctx.antiPatternMatch.inRadius ? 1 : 0;
    out[62] = clamp(safe(ctx.antiPatternMatch.antiPattern?.hitRate, 0.5), 0, 1);
  } else {
    out[62] = 0.5;
  }

  const ta = ctx?.ta as Record<string, unknown> | undefined;
  if (ta && Array.isArray(ta.close)) {
    const closeArr = ta.close as number[];
    const openArr = ta.open as number[] | undefined;
    const highArr = ta.high as number[] | undefined;
    const lowArr = ta.low as number[] | undefined;
    const i = closeArr.length - 1;
    const c = +closeArr[i]!;
    const o = +(openArr?.[i] ?? NaN);
    const h = +(highArr?.[i] ?? NaN);
    const l = +(lowArr?.[i] ?? NaN);
    if (Number.isFinite(c) && Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && c > 0) {
      const ret1 = i >= 1 && closeArr[i - 1]! > 0 ? (c - closeArr[i - 1]!) / closeArr[i - 1]! : 0;
      const ret5 = i >= 5 && closeArr[i - 5]! > 0 ? (c - closeArr[i - 5]!) / closeArr[i - 5]! : 0;
      out[63] = clamp(ret1 * 50, -1, 1);
      out[64] = clamp(ret5 * 50, -1, 1);
      out[65] = clamp(Math.log(Math.max(1e-9, (h - l) / c)), -10, 0) / 10;
      out[66] = h !== l ? clamp((c - o) / (h - l), -1, 1) : 0;
      const atrArr = ta.atr14 as number[] | undefined;
      const atrV = atrArr?.[i];
      out[67] = Number.isFinite(atrV) && c > 0 ? clamp((atrV as number) / c, 0, 0.1) * 10 : 0;
      const rsiArr = ta.rsi14 as number[] | undefined;
      const rsi = rsiArr?.[i];
      out[68] = Number.isFinite(rsi) ? ((rsi as number) - 50) / 50 : 0;
      const macd = ta.macd_12_26_9 as { hist?: number[] } | undefined;
      const macdH = macd?.hist?.[i];
      out[69] = Number.isFinite(macdH) && c > 0 ? clamp(((macdH as number) / c) * 1000, -1, 1) : 0;
      const bb = ta.bb_20_2 as { mid?: number[]; up?: number[]; lo?: number[] } | undefined;
      if (bb) {
        const mid = bb.mid?.[i];
        const up = bb.up?.[i];
        const lo = bb.lo?.[i];
        if (Number.isFinite(mid) && Number.isFinite(up) && Number.isFinite(lo)) {
          const half = (up as number) - (mid as number);
          out[70] = half !== 0 ? clamp((c - (mid as number)) / half, -3, 3) / 3 : 0;
          out[71] = (mid as number) !== 0 ? clamp(((up as number) - (lo as number)) / (mid as number), 0, 0.2) * 5 : 0;
        }
      }
      const adxObj = ta.adx14 as { adx?: number[]; plusDI?: number[]; minusDI?: number[] } | undefined;
      const adx = adxObj?.adx?.[i];
      out[72] = Number.isFinite(adx) ? clamp((adx as number) / 100, 0, 1) : 0;
      const plus = adxObj?.plusDI?.[i];
      const minus = adxObj?.minusDI?.[i];
      out[73] = Number.isFinite(plus) && Number.isFinite(minus)
        ? clamp(((plus as number) - (minus as number)) / 100, -1, 1)
        : 0;
      const volArr = ta.volume as number[] | undefined;
      const v = +(volArr?.[i] ?? NaN);
      let volAvg = 0;
      if (volArr) {
        let s = 0;
        let n = 0;
        for (let k = Math.max(0, i - 19); k <= i; k++) {
          const x = +(volArr[k] ?? NaN);
          if (Number.isFinite(x)) {
            s += x;
            n++;
          }
        }
        volAvg = n > 0 ? s / n : 0;
      }
      out[74] = volAvg > 0 ? clamp(v / volAvg - 1, -1, 4) / 4 : 0;
      const fvg = ta.fvg as { open?: unknown[] } | undefined;
      const fvgOpen = Array.isArray(fvg?.open) ? fvg!.open!.length : 0;
      out[75] = clamp(fvgOpen / 10, 0, 1);
      const obs = ta.orderBlocks as Array<{ mitigated?: boolean }> | undefined;
      const obOpen = Array.isArray(obs) ? obs.filter((b) => !b.mitigated).length : 0;
      out[76] = clamp(obOpen / 10, 0, 1);
    }
  }

  const dt = new Date(ctx?.t ?? Date.now());
  out[77] = (dt.getUTCHours() / 24) * 2 - 1;
  out[78] = (dt.getUTCDay() / 6) * 2 - 1;
  out[79] = clamp(safe(ctx?.recentErrorMag, 0), 0, 5) / 5;

  return out;
}

interface ModelCache {
  mlp: MLP;
  version: string;
  trainedAt: number;
  accuracy: number | null;
  rows: number | null;
}

let _modelCache: ModelCache | null = null;
let _modelLoadInflight: Promise<ModelCache | null> | null = null;

async function loadModelOnce(): Promise<ModelCache | null> {
  if (_modelCache) return _modelCache;
  if (_modelLoadInflight) return _modelLoadInflight;
  _modelLoadInflight = (async () => {
    try {
      const all = await ModelStore.listModels({ regime: MODEL_REGIME });
      if (!all.length) return null;
      const champs = all.filter((r) => !r.meta?.role || r.meta.role === "champion");
      const pool = champs.length ? champs : all;
      pool.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const row = pool[0]!;
      const w = row.weights as SerializedMLP | undefined;
      if (!w) return null;
      const mlp = MLP.deserialize(w);
      const m = (row.meta ?? {}) as { accuracy?: number; rows?: number };
      _modelCache = {
        mlp,
        version: row.version ?? "?",
        trainedAt: row.createdAt ?? 0,
        accuracy: m.accuracy ?? null,
        rows: m.rows ?? null,
      };
      return _modelCache;
    } catch {
      return null;
    } finally {
      _modelLoadInflight = null;
    }
  })();
  return _modelLoadInflight;
}

export function invalidateModelCache(): void {
  _modelCache = null;
}

export async function decide(input: Float32Array | ArrayLike<number> | null | undefined, opts: DecideOpts = {}): Promise<MetaBrainDecision> {
  if (!input || (input.length || 0) === 0) {
    return decideFromOrch(opts.orchFallback, "none");
  }
  const cache = await loadModelOnce();
  if (!cache) return decideFromOrch(opts.orchFallback, "orch-fallback");

  const x = input instanceof Float32Array ? input : Float32Array.from(input);
  let raw = 0;
  try {
    const y = cache.mlp.predict(x);
    raw = y[0] ?? 0;
  } catch {
    return decideFromOrch(opts.orchFallback, "orch-fallback");
  }
  const score = Math.max(-1, Math.min(1, +raw || 0));
  const prob = 0.5 + 0.5 * score;
  const direction: MetaBrainDecision["direction"] = score > 0.05 ? "long" : score < -0.05 ? "short" : "neutral";
  return {
    direction,
    probability: prob,
    confidence: Math.abs(score),
    rawScore: score,
    used: "meta-nn",
    modelVersion: cache.version,
  };
}

function decideFromOrch(orch: AggregateCtx["orch"] | undefined, used: MetaBrainDecision["used"]): MetaBrainDecision {
  if (!orch) return { direction: "neutral", probability: 0.5, confidence: 0, rawScore: 0, used: "none" };
  const dir = (orch.direction as MetaBrainDecision["direction"]) ?? "neutral";
  return {
    direction: dir,
    probability: Number.isFinite(orch.probability) ? (orch.probability as number) : 0.5,
    confidence: Number.isFinite(orch.confidence) ? (orch.confidence as number) : Math.abs(orch.rawScore ?? 0),
    rawScore: Number.isFinite(orch.rawScore) ? (orch.rawScore as number) : 0,
    used,
  };
}

export async function pairForTraining(predictionId: number | string, ctx: AggregateCtx): Promise<string | null> {
  if (predictionId == null) return null;
  const vec = aggregate(ctx);
  const row: PoolRow = {
    id: `mb-${predictionId}`,
    kind: "meta-brain",
    predictionId,
    symbol: ctx?.symbol ?? null,
    tf: ctx?.tf ?? null,
    t: ctx?.t ?? Date.now(),
    input: Array.from(vec),
    label: null,
    pending: true,
    createdAt: Date.now(),
  };
  try {
    await put(POOL_STORE, row);
  } catch {
    return null;
  }
  return row.id;
}

export async function labelForTraining(predictionId: number | string, realizedDir: "up" | "down" | "flat" | string): Promise<boolean> {
  if (predictionId == null) return false;
  const id = `mb-${predictionId}`;
  return withStore<boolean>(POOL_STORE, "readwrite", async (s) => {
    const row = await req2promise<PoolRow | undefined>(s.get(id) as IDBRequest<PoolRow | undefined>);
    if (!row || !row.pending) return false;
    row.label = realizedDir === "up" ? 1 : realizedDir === "down" ? -1 : 0;
    row.pending = false;
    row.labeledAt = Date.now();
    await req2promise(s.put(row));
    return true;
  });
}

export async function readyCount(): Promise<number> {
  return withStore<number>(POOL_STORE, "readonly", async (s) => {
    const rows = await req2promise<PoolRow[]>(s.getAll() as IDBRequest<PoolRow[]>);
    return rows.filter((r) => r.pending === false).length;
  });
}

export interface MaybeTrainOpts {
  minRows?: number;
  force?: boolean;
  role?: string;
  returnModel?: boolean;
}

export interface MaybeTrainResult {
  trained: boolean;
  rows: number;
  accuracy?: number;
  version?: string;
  role?: string;
  id?: IDBValidKey;
  mlp?: MLP;
  evalX?: Float32Array;
  evalY?: Float32Array;
  evalN?: number;
  D?: number;
}

async function loadLabeledRows(): Promise<PoolRow[]> {
  return withStore<PoolRow[]>(POOL_STORE, "readonly", async (s) => {
    const rows = await req2promise<PoolRow[]>(s.getAll() as IDBRequest<PoolRow[]>);
    const out: PoolRow[] = [];
    for (const r of rows) {
      if (r.pending) continue;
      if (!Array.isArray(r.input)) continue;
      out.push(r);
    }
    if (out.length > MAX_POOL_ROWS) {
      out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return out.slice(0, MAX_POOL_ROWS);
    }
    return out;
  });
}

export async function maybeTrain(opts: MaybeTrainOpts = {}): Promise<MaybeTrainResult> {
  const { minRows = MIN_TRAIN_ROWS, force = false, role = "champion", returnModel = false } = opts;
  const labeled = await loadLabeledRows();
  if (!force && labeled.length < minRows) return { trained: false, rows: labeled.length };

  const D = labeled[0]!.input.length;
  const X = new Float32Array(labeled.length * D);
  const Y = new Float32Array(labeled.length);
  for (let i = 0; i < labeled.length; i++) {
    for (let j = 0; j < D; j++) X[i * D + j] = +labeled[i]!.input[j]! || 0;
    Y[i] = +labeled[i]!.label! || 0;
  }

  const mlp = new MLP({
    layers: [
      { in: D, out: 32, act: "relu" },
      { in: 32, out: 16, act: "relu" },
      { in: 16, out: 1, act: "tanh" },
    ],
    loss: "mse",
    optimizer: "adam",
    lr: 0.005,
    l2: 1e-5,
    seed: 42,
  });

  const { valHistory } = mlp.fit(X, Y, { epochs: 30, batchSize: 32, valFrac: 0.2 });
  const lastLoss = valHistory.length ? valHistory[valHistory.length - 1]! : NaN;

  const split = Math.floor(labeled.length * 0.8);
  let correct = 0;
  let evaluable = 0;
  for (let i = split; i < labeled.length; i++) {
    const xi = X.slice(i * D, (i + 1) * D);
    const py = mlp.predict(xi);
    const pred = py[0]!;
    const lbl = Y[i]!;
    if (Math.abs(lbl) < 1e-6) continue;
    evaluable++;
    if ((pred > 0 && lbl > 0) || (pred < 0 && lbl < 0)) correct++;
  }
  const accuracy = evaluable > 0 ? correct / evaluable : 0;

  const version = `mb-${Date.now()}`;
  const meta: Record<string, unknown> = {
    accuracy: +accuracy.toFixed(4),
    rows: labeled.length,
    valRows: Math.floor(labeled.length * 0.2),
    params: paramCount(mlp),
    lastLoss: Number.isFinite(lastLoss) ? +lastLoss.toFixed(6) : null,
    role,
  };
  const id = await ModelStore.saveModel({
    kind: "mlp",
    regime: MODEL_REGIME,
    version,
    weights: mlp.serialize(),
    meta,
    createdAt: Date.now(),
  });
  if (role === "champion") invalidateModelCache();
  try {
    EventBus.emit("metabrain:trained", { rows: labeled.length, accuracy, version, role });
  } catch {
    // suppress emit failures
  }
  const result: MaybeTrainResult = { trained: true, rows: labeled.length, accuracy, version, role, id };
  if (returnModel) {
    const evalN = labeled.length - split;
    const evalX = new Float32Array(evalN * D);
    const evalY = new Float32Array(evalN);
    for (let i = 0; i < evalN; i++) {
      const src = labeled[split + i]!;
      for (let j = 0; j < D; j++) evalX[i * D + j] = +src.input[j]! || 0;
      evalY[i] = +src.label! || 0;
    }
    result.mlp = mlp;
    result.evalX = evalX;
    result.evalY = evalY;
    result.evalN = evalN;
    result.D = D;
  }
  return result;
}

export async function findChampion(): Promise<ModelStore.ModelRow | null> {
  const all = await ModelStore.listModels({ regime: MODEL_REGIME });
  const eligible = all.filter((r) => !r.meta?.role || r.meta.role === "champion");
  if (!eligible.length) return null;
  eligible.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return eligible[0]!;
}

export async function findChallenger(): Promise<ModelStore.ModelRow | null> {
  const all = await ModelStore.listModels({ regime: MODEL_REGIME });
  const ch = all.filter((r) => r.meta?.role === "challenger");
  if (!ch.length) return null;
  ch.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return ch[0]!;
}

export async function setRole(id: IDBValidKey, role: string): Promise<boolean> {
  const row = await ModelStore.loadModel(id);
  if (!row) return false;
  row.meta = { ...(row.meta ?? {}), role };
  await ModelStore.saveModel(row);
  invalidateModelCache();
  return true;
}

export async function status(): Promise<MetaBrainStatus> {
  const cache = await loadModelOnce();
  const pending = await withStore<number>(POOL_STORE, "readonly", async (s) => {
    const rows = await req2promise<PoolRow[]>(s.getAll() as IDBRequest<PoolRow[]>);
    return rows.filter((r) => r.pending).length;
  });
  const ready = await readyCount();
  return {
    hasModel: !!cache,
    version: cache?.version ?? null,
    accuracy: cache?.accuracy ?? null,
    trainedAt: cache?.trainedAt ?? null,
    rowsTrained: cache?.rows ?? null,
    pending,
    ready,
  };
}

export async function _resetForTests(): Promise<void> {
  await withStore<void>(POOL_STORE, "readwrite", async (s) => {
    await req2promise(s.clear());
  });
  invalidateModelCache();
}

export const _internals = { aggregate, loadLabeledRows, MIN_TRAIN_ROWS };
