/**
 * Champion / Challenger — online retrainer with promotion gating + drift rollback.
 */

import { EventBus } from "../core/bus.js";
import * as MetaBrain from "./metaBrain.js";
import * as ModelStore from "../ml/modelStore.js";
import { MLP, type SerializedMLP } from "../ml/nn.js";

const MODEL_REGIME = "meta-brain";
const DEFAULT_EVAL_MARGIN = 0.01;
const DEFAULT_MIN_ROWS = 200;
const ROLLING_WINDOW = 50;
const DRIFT_DROP_THRESHOLD = 0.1;
const MAX_CYCLES = 20;

export interface CycleRecord {
  kind: "no-train" | "promoted" | "rejected" | "rollback";
  at: number;
  rows?: number;
  reason?: string;
  champion?: { version: string; accuracy: number } | null;
  challenger?: { version: string; accuracy: number } | null;
  retired?: { version: string; accuracy: number } | null;
  to?: string;
}

export interface VerdictMark {
  correct: 0 | 1;
  t: number;
}

interface InternalState {
  cycles: CycleRecord[];
  rolling: VerdictMark[];
  baseline: number | null;
}

const _state: InternalState = {
  cycles: [],
  rolling: [],
  baseline: null,
};

export interface RunCycleOpts {
  minRows?: number;
  evalMargin?: number;
}

export async function runCycle(opts: RunCycleOpts = {}): Promise<CycleRecord> {
  const { minRows = DEFAULT_MIN_ROWS, evalMargin = DEFAULT_EVAL_MARGIN } = opts;

  const trained = await MetaBrain.maybeTrain({ minRows, role: "challenger", returnModel: true });
  if (!trained.trained) {
    const rec: CycleRecord = { kind: "no-train", at: Date.now(), rows: trained.rows ?? 0 };
    pushCycle(rec);
    EventBus.emit("metabrain:cycle", rec);
    return rec;
  }

  const challenger = trained;
  const champRow = await MetaBrain.findChampion();

  if (!champRow) {
    if (challenger.id != null) await MetaBrain.setRole(challenger.id, "champion");
    const rec: CycleRecord = {
      kind: "promoted",
      reason: "no-incumbent",
      at: Date.now(),
      champion: { version: challenger.version!, accuracy: challenger.accuracy! },
      challenger: null,
      retired: null,
    };
    _state.baseline = challenger.accuracy ?? null;
    _state.rolling.length = 0;
    pushCycle(rec);
    EventBus.emit("metabrain:cycle", rec);
    return rec;
  }

  const champMlp = MLP.deserialize(champRow.weights as SerializedMLP);
  const champAcc = signAccuracy(champMlp, challenger.evalX!, challenger.evalY!, challenger.evalN!, challenger.D!);
  const chalAcc = signAccuracy(challenger.mlp!, challenger.evalX!, challenger.evalY!, challenger.evalN!, challenger.D!);

  const verdict = chalAcc >= champAcc + evalMargin ? "promote" : "reject";

  if (verdict === "promote") {
    if (champRow.id != null) await MetaBrain.setRole(champRow.id, "retired");
    if (challenger.id != null) await MetaBrain.setRole(challenger.id, "champion");
    _state.baseline = chalAcc;
    _state.rolling.length = 0;
    const rec: CycleRecord = {
      kind: "promoted",
      reason: `+${(chalAcc - champAcc).toFixed(3)}`,
      at: Date.now(),
      champion: { version: challenger.version!, accuracy: +chalAcc.toFixed(4) },
      challenger: { version: challenger.version!, accuracy: +chalAcc.toFixed(4) },
      retired: { version: champRow.version, accuracy: +champAcc.toFixed(4) },
    };
    pushCycle(rec);
    EventBus.emit("metabrain:cycle", rec);
    return rec;
  } else {
    try {
      if (challenger.id != null) await ModelStore.deleteModel(challenger.id);
    } catch {
      // ignore
    }
    const rec: CycleRecord = {
      kind: "rejected",
      reason: `${(chalAcc - champAcc).toFixed(3)}`,
      at: Date.now(),
      champion: { version: champRow.version, accuracy: +champAcc.toFixed(4) },
      challenger: { version: challenger.version!, accuracy: +chalAcc.toFixed(4) },
      retired: null,
    };
    pushCycle(rec);
    EventBus.emit("metabrain:cycle", rec);
    return rec;
  }
}

function signAccuracy(mlp: MLP, X: Float32Array, Y: Float32Array, N: number, D: number): number {
  let correct = 0;
  let evaluable = 0;
  const xi = new Float32Array(D);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < D; j++) xi[j] = X[i * D + j]!;
    const py = mlp.predict(xi);
    const pred = py[0]!;
    const lbl = Y[i]!;
    if (Math.abs(lbl) < 1e-6) continue;
    evaluable++;
    if ((pred > 0 && lbl > 0) || (pred < 0 && lbl < 0)) correct++;
  }
  return evaluable > 0 ? correct / evaluable : 0;
}

export interface VerdictInput {
  hit?: boolean;
  realizedDir?: string;
  t?: number;
}

export interface PredictionInput {
  payload?: { dir?: string; direction?: string };
}

export function onVerdict(verdict: VerdictInput | null | undefined, prediction: PredictionInput | null | undefined): void {
  if (!verdict || !prediction?.payload) return;
  const dir = prediction.payload.dir ?? prediction.payload.direction;
  const realDir =
    verdict.realizedDir ??
    (verdict.hit === true && dir) ??
    (verdict.hit === false && (dir === "up" ? "down" : dir === "down" ? "up" : null));
  if (!dir || !realDir) return;
  const correct: 0 | 1 = dir === realDir ? 1 : 0;
  _state.rolling.push({ correct, t: verdict.t ?? Date.now() });
  if (_state.rolling.length > ROLLING_WINDOW) _state.rolling.shift();
}

export interface DriftState {
  drifted: boolean;
  ewma: number | null;
  baseline: number | null;
  n: number;
}

export function driftCheck(): DriftState {
  if (_state.rolling.length < 20 || _state.baseline == null) {
    return { drifted: false, ewma: null, baseline: _state.baseline, n: _state.rolling.length };
  }
  let ewma = _state.rolling[0]!.correct;
  for (let i = 1; i < _state.rolling.length; i++) {
    ewma = 0.9 * ewma + 0.1 * _state.rolling[i]!.correct;
  }
  return {
    drifted: ewma < _state.baseline - DRIFT_DROP_THRESHOLD,
    ewma: +ewma.toFixed(4),
    baseline: _state.baseline,
    n: _state.rolling.length,
  };
}

export async function recoverIfDrifted(): Promise<CycleRecord | null> {
  const d = driftCheck();
  if (!d.drifted) return null;
  const all = await ModelStore.listModels({ regime: MODEL_REGIME });
  const retired = all.filter((r) => r.meta?.role === "retired");
  if (!retired.length) return null;
  retired.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const target = retired[0]!;
  const champ = await MetaBrain.findChampion();
  if (champ?.id != null) await MetaBrain.setRole(champ.id, "rolled-back");
  if (target.id != null) await MetaBrain.setRole(target.id, "champion");
  _state.baseline = (target.meta?.accuracy as number | undefined) ?? null;
  _state.rolling.length = 0;
  const rec: CycleRecord = {
    kind: "rollback",
    at: Date.now(),
    to: target.version,
    reason: `ewma ${d.ewma} < baseline-${DRIFT_DROP_THRESHOLD}`,
  };
  pushCycle(rec);
  EventBus.emit("metabrain:rollback", rec);
  return rec;
}

export interface RecentOpts {
  limit?: number;
}

export function recentCycles(opts: RecentOpts = {}): CycleRecord[] {
  const limit = opts.limit ?? MAX_CYCLES;
  return _state.cycles.slice(-limit).reverse();
}

export interface CCStatus {
  lastCycle: CycleRecord | null;
  cycleCount: number;
  drift: DriftState;
}

export function status(): CCStatus {
  const drift = driftCheck();
  const last = _state.cycles[_state.cycles.length - 1] ?? null;
  return {
    lastCycle: last,
    cycleCount: _state.cycles.length,
    drift,
  };
}

export async function _resetForTests(): Promise<void> {
  _state.cycles.length = 0;
  _state.rolling.length = 0;
  _state.baseline = null;
}

function pushCycle(rec: CycleRecord): void {
  _state.cycles.push(rec);
  if (_state.cycles.length > MAX_CYCLES) _state.cycles.shift();
}
