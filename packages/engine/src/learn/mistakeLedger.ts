/**
 * My Next Prediction v3.0 — M-LEARN-1 · Mistake Ledger
 * Persistent record of every wrong prediction with the full feature
 * snapshot at predict-time. Downstream consumers: anti-pattern discovery,
 * online learner, UI surfaces.
 *
 * listen:  validation:verdict
 * emit:    mistake:recorded   { mistake }
 *
 * Pure-IDB module — no DOM. Tests can use the in-memory IDB shim.
 */

import type { Mistake, Prediction, Verdict } from "../types.js";
import { EventBus } from "../core/bus.js";
import { put, withStore, req2promise, count as idbCount } from "../data/idb.js";

const STORE = "mistakes" as const;

/* ═══════════════════════════ Error classification ═══════════════════════════ */

export interface ClassifyErrorResult {
  errorType: Mistake["errorType"];
  errorMag: number;
}

export function classifyError(
  prediction: Prediction,
  verdict: Verdict,
  hint: { atr?: number } = {}
): ClassifyErrorResult | null {
  if (!prediction || !verdict) return null;
  const k = verdict.kind ?? prediction.kind;
  if (verdict.abstain) return null;

  switch (k) {
    case "direction": {
      if (verdict.hit === false) {
        const realizedRet = +(verdict.realized ?? verdict.realizedReturn ?? NaN);
        const errorMag = Number.isFinite(realizedRet)
          ? Number.isFinite(hint.atr) && (hint.atr ?? 0) > 0
            ? (Math.abs(realizedRet) * (prediction.payload?.refPrice ?? 1)) / hint.atr!
            : Math.abs(realizedRet)
          : 1.0;
        return { errorType: "direction", errorMag };
      }
      return null;
    }
    case "interval": {
      if (verdict.covered === false) {
        const cr = +(verdict.centreResidual ?? NaN);
        return {
          errorType: "interval-miss",
          errorMag: Number.isFinite(cr) ? Math.abs(cr) : 1.0,
        };
      }
      return null;
    }
    case "return": {
      const ae = +(verdict.absError ?? NaN);
      if (
        Number.isFinite(ae) &&
        ae > 0 &&
        Number.isFinite(hint.atr) &&
        (hint.atr ?? 0) > 0 &&
        ae > hint.atr!
      ) {
        return { errorType: "magnitude", errorMag: ae / hint.atr! };
      }
      return null;
    }
    case "set": {
      if (verdict.covered === false) return { errorType: "set-miss", errorMag: 1.0 };
      return null;
    }
    default:
      return null;
  }
}

/* ═══════════════════════════ Building mistakes ═══════════════════════════ */

interface OrchSignalLike {
  moduleId?: string;
  id?: string;
  signal?: number;
  confidence?: number;
}

export interface BuildMistakeCtx {
  prediction: Prediction;
  verdict: Verdict;
  ta?: {
    atr14?: number | number[];
    regime?: { label?: string };
    wyckoff?: { phase?: string };
    lastFeatureVec?: number[];
  };
  orch?: {
    signals?: OrchSignalLike[];
    featureVec?: number[];
  };
  regime?: string;
  wyckoff?: string;
  macro?: { label?: string };
}

export function buildMistake(ctx: BuildMistakeCtx): Omit<Mistake, "id"> | null {
  const { prediction, verdict, ta, orch, regime, wyckoff, macro } = ctx;
  if (!prediction || !verdict) return null;
  const atrArr = ta?.atr14;
  const atr = Array.isArray(atrArr) ? atrArr[atrArr.length - 1] ?? null : (atrArr ?? null);
  const cls = classifyError(prediction, verdict, atr != null ? { atr } : {});
  if (!cls) return null;

  let topModules: Mistake["context"]["topModules"] = null;
  if (orch?.signals && Array.isArray(orch.signals)) {
    topModules = orch.signals
      .slice()
      .sort(
        (a, b) =>
          Math.abs((b.signal ?? 0) * (b.confidence ?? 0)) -
          Math.abs((a.signal ?? 0) * (a.confidence ?? 0))
      )
      .slice(0, 4)
      .map((s) => ({
        moduleId: s.moduleId ?? s.id ?? "",
        signal: +(+(s.signal ?? 0)).toFixed(3),
        confidence: +(+(s.confidence ?? 0)).toFixed(3),
      }));
  }

  return {
    predictionId: prediction.id!,
    symbol: prediction.symbol,
    tf: prediction.tf,
    t: prediction.t,
    kind: prediction.kind ?? verdict.kind ?? "direction",
    errorType: cls.errorType,
    errorMag: +cls.errorMag.toFixed(4),
    predicted: {
      direction: prediction.payload?.direction ?? "?",
      prob: Number.isFinite(prediction.payload?.probability ?? NaN)
        ? (prediction.payload?.probability ?? null)
        : null,
      target: Number.isFinite(prediction.payload?.target ?? NaN)
        ? (prediction.payload?.target ?? null)
        : null,
      rawScore: Number.isFinite(prediction.payload?.rawScore ?? NaN)
        ? (prediction.payload?.rawScore ?? null)
        : null,
    },
    realized: {
      direction:
        verdict.realizedDir ??
        verdict.realizedDirection ??
        (verdict.hit === false && prediction.payload?.direction
          ? prediction.payload.direction === "long"
            ? "short"
            : prediction.payload.direction === "short"
              ? "long"
              : "?"
          : "?"),
      magnitude: Number.isFinite(+(verdict.realized ?? verdict.realizedReturn ?? NaN))
        ? +(verdict.realized ?? verdict.realizedReturn!)
        : null,
      close: Number.isFinite(+(verdict.realizedClose ?? NaN))
        ? +(verdict.realizedClose!)
        : null,
    },
    context: {
      regime: regime ?? ta?.regime?.label ?? null,
      wyckoff: wyckoff ?? ta?.wyckoff?.phase ?? null,
      macro: macro?.label ?? null,
      atr: Number.isFinite(atr ?? NaN) ? +(atr!) : null,
      topModules,
      featureVec: Array.isArray(orch?.featureVec)
        ? orch.featureVec.slice()
        : Array.isArray(ta?.lastFeatureVec)
          ? ta.lastFeatureVec!.slice()
          : null,
    },
    createdAt: Date.now(),
  };
}

/* ═══════════════════════════ Persistence ═══════════════════════════ */

export async function recordMistake(mistake: Omit<Mistake, "id">): Promise<IDBValidKey> {
  if (!mistake || typeof mistake !== "object") throw new Error("recordMistake: object required");
  const id = await put(STORE, mistake);
  const stored = { ...mistake, id };
  try {
    EventBus.emit("mistake:recorded", { mistake: stored });
  } catch {
    // suppress bus errors
  }
  return id;
}

/* ═══════════════════════════ Read API ═══════════════════════════ */

export async function count(): Promise<number> {
  return idbCount(STORE);
}

export interface RecentOpts {
  limit?: number;
  symbol?: string;
  tf?: string;
  errorType?: string;
  regime?: string;
}

export async function recent(opts: RecentOpts = {}): Promise<Mistake[]> {
  const { limit = 50, symbol, tf, errorType, regime } = opts;
  return withStore<Mistake[]>(STORE, "readonly", async (s) => {
    const rows = await req2promise<Mistake[]>(s.getAll() as IDBRequest<Mistake[]>);
    const out: Mistake[] = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]!;
      if (symbol && r.symbol !== symbol) continue;
      if (tf && r.tf !== tf) continue;
      if (errorType && r.errorType !== errorType) continue;
      if (regime && r.context?.regime !== regime) continue;
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  });
}

export interface MistakeSummary {
  total: number;
  byErrorType: Record<string, number>;
  byRegime: Record<string, number>;
  lastT: number | null;
}

export async function summary(): Promise<MistakeSummary> {
  return withStore<MistakeSummary>(STORE, "readonly", async (s) => {
    const rows = await req2promise<Mistake[]>(s.getAll() as IDBRequest<Mistake[]>);
    const out: MistakeSummary = { total: rows.length, byErrorType: {}, byRegime: {}, lastT: null };
    for (const r of rows) {
      out.byErrorType[r.errorType] = (out.byErrorType[r.errorType] ?? 0) + 1;
      const rg = r.context?.regime ?? "unknown";
      out.byRegime[rg] = (out.byRegime[rg] ?? 0) + 1;
      if (!out.lastT || r.t > out.lastT) out.lastT = r.t;
    }
    return out;
  });
}

export async function clearAll(): Promise<void> {
  return withStore<void>(STORE, "readwrite", async (s) => req2promise(s.clear()));
}

/* ═══════════════════════════ Auto-recorder ═══════════════════════════ */

interface AutoRecorderCtx {
  ta?: BuildMistakeCtx["ta"];
  orch?: BuildMistakeCtx["orch"];
  regime?: string;
  wyckoff?: string;
  macro?: BuildMistakeCtx["macro"];
}

export interface AutoRecorderOpts {
  getCtx: () => AutoRecorderCtx;
}

export function startAutoRecorder(opts: AutoRecorderOpts): () => void {
  if (typeof opts.getCtx !== "function") {
    throw new Error("startAutoRecorder: getCtx() resolver required");
  }
  const off = EventBus.on<{ prediction?: Prediction; verdict?: Verdict }>(
    "validation:verdict",
    async (e) => {
      try {
        const prediction = e?.prediction;
        const verdict = e?.verdict;
        if (!prediction || !verdict) return;
        const ctx = opts.getCtx() ?? {};
        const m = buildMistake({
          prediction,
          verdict,
          ...(ctx.ta !== undefined ? { ta: ctx.ta } : {}),
          ...(ctx.orch !== undefined ? { orch: ctx.orch } : {}),
          ...(ctx.regime !== undefined ? { regime: ctx.regime } : {}),
          ...(ctx.wyckoff !== undefined ? { wyckoff: ctx.wyckoff } : {}),
          ...(ctx.macro !== undefined ? { macro: ctx.macro } : {}),
        });
        if (m) await recordMistake(m);
      } catch (err) {
        try {
          EventBus.emit("mistake:error", {
            error: (err as Error)?.message ?? String(err),
          });
        } catch {
          // suppress
        }
      }
    }
  );
  return off;
}
