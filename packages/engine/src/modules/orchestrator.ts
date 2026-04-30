/**
 * Module Orchestrator — runs all modules and aggregates into ensemble prediction.
 */

import { MODULES } from "./registry.js";
import { clampSignal, type ModuleCtx, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export interface AggregatedSignal extends Signal {
  id: string;
  meta: ModuleMeta;
}

export interface OrchestratorOptions {
  weights?: Record<string, number>;
  ctx?: ModuleCtx;
  calibrator?: { predict: (score: number) => number };
  only?: string[] | Set<string>;
  exclude?: string[] | Set<string>;
}

export interface OrchestratorOutput {
  signals: AggregatedSignal[];
  rawScore: number;
  probability: number;
  direction: "long" | "short" | "neutral";
  confidence: number;
  globalMult: number;
  participating: number;
  reasonsByModule: Record<string, string[]>;
  bySignal: Record<string, { signal: number; confidence: number; direction: Signal["direction"] }>;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function runModules(ta: TAOutput, opts: OrchestratorOptions = {}): OrchestratorOutput {
  const weights = opts.weights ?? {};
  const only =
    opts.only instanceof Set ? opts.only : Array.isArray(opts.only) ? new Set(opts.only) : null;
  const exclude =
    opts.exclude instanceof Set ? opts.exclude : Array.isArray(opts.exclude) ? new Set(opts.exclude) : null;

  const signals: AggregatedSignal[] = [];
  for (const mod of MODULES) {
    const id = mod.meta.id;
    if (only && !only.has(id)) continue;
    if (exclude && exclude.has(id)) continue;
    let sig: Signal;
    try {
      const raw = mod.evaluate(ta, opts.ctx ?? {});
      sig = clampSignal({ ...raw } as Record<string, unknown>);
    } catch (err) {
      sig = clampSignal({ signal: 0, confidence: 0, reasons: [`error: ${(err as Error).message}`] });
    }
    signals.push({ id, meta: { ...mod.meta }, ...sig });
  }

  const sessSig = signals.find((s) => s.id === "session-calendar");
  const sessMult = sessSig?.payload?.["multiplier"];
  const globalMult = Number.isFinite(sessMult) ? (sessMult as number) : 1;

  let weightedSum = 0;
  let weightTotal = 0;
  let confidenceSum = 0;
  let participating = 0;
  for (const s of signals) {
    const w = weights[s.id] ?? s.meta.weight ?? 1;
    const effConf = s.id === "session-calendar" ? s.confidence : Math.min(1, s.confidence * globalMult);
    if (effConf < 0.05 && Math.abs(s.signal) < 0.1) continue;
    weightedSum += s.signal * effConf * w;
    weightTotal += w;
    confidenceSum += effConf;
    participating++;
  }
  const rawScore = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const avgConfidence = participating > 0 ? confidenceSum / participating : 0;

  const probability =
    opts.calibrator && typeof opts.calibrator.predict === "function"
      ? clamp01(opts.calibrator.predict(rawScore))
      : 1 / (1 + Math.exp(-rawScore * 3));

  const direction: OrchestratorOutput["direction"] =
    probability > 0.55 ? "long" : probability < 0.45 ? "short" : "neutral";

  const reasonsByModule = Object.fromEntries(signals.map((s) => [s.id, s.reasons]));
  const bySignal = Object.fromEntries(
    signals.map((s) => [s.id, { signal: s.signal, confidence: s.confidence, direction: s.direction }])
  );

  return {
    signals,
    rawScore,
    probability,
    direction,
    confidence: avgConfidence,
    globalMult,
    participating,
    reasonsByModule,
    bySignal,
  };
}
