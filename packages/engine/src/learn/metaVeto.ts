/**
 * My Next Prediction v3.0 — M-LEARN-3 · Meta-Veto Layer
 * Final gate between the orchestrator and the ghost-candle drawer.
 *
 * Decision table:
 *   inRadius & hitRate ≤ 0.25   → full veto: signal=0, confidence=0
 *   inRadius & hitRate ≤ 0.40   → soften:    signal *= 0.4, confidence *= 0.5
 *   otherwise                    → pass-through
 *
 * Pure module — evaluate() is sync; applyVetoToOrch() is async (IDB read).
 */

import type { AntiPattern, AntiPatternMatch, OrchestratorOutput } from "../types.js";
import * as AP from "./antiPatterns.js";

export interface VetoVerdict {
  signal: number;
  confidence: number;
  direction: string;
  vetoed: false | "full" | "softened";
  reason: string | null;
  antiPattern: AntiPattern | null;
  originalScore: number;
  originalProb: number;
}

type OrchLike = Pick<OrchestratorOutput, "rawScore" | "probability" | "direction" | "signals"> & {
  rawScore: number;
  probability: number;
  direction: string;
};

export function evaluate(orch: OrchLike, match: AntiPatternMatch | null): VetoVerdict {
  const orig = {
    signal: Number.isFinite(orch?.rawScore) ? +orch.rawScore : 0,
    confidence: Number.isFinite(orch?.probability)
      ? Math.max(0, Math.min(1, orch.probability))
      : 0.5,
    direction: orch?.direction ?? "neutral",
  };
  const baseOut: VetoVerdict = {
    signal: orig.signal,
    confidence: orig.confidence,
    direction: orig.direction,
    vetoed: false,
    reason: null,
    antiPattern: null,
    originalScore: orig.signal,
    originalProb: orig.confidence,
  };

  if (!match || !match.antiPattern || !match.inRadius) return baseOut;
  const ap = match.antiPattern;
  const hr = Number.isFinite(ap.hitRate) ? ap.hitRate : 1;

  if (hr <= 0.25) {
    return {
      ...baseOut,
      signal: 0,
      confidence: 0,
      direction: "neutral",
      vetoed: "full",
      antiPattern: ap,
      reason: `vetoed by anti-pattern '${ap.label}' — historical hit ${(hr * 100) | 0}%`,
    };
  }
  if (hr <= 0.4) {
    return {
      ...baseOut,
      signal: orig.signal * 0.4,
      confidence: orig.confidence * 0.5,
      direction: Math.abs(orig.signal * 0.4) < 0.05 ? "neutral" : orig.direction,
      vetoed: "softened",
      antiPattern: ap,
      reason: `softened by anti-pattern '${ap.label}' — historical hit ${(hr * 100) | 0}%`,
    };
  }
  return baseOut;
}

export async function applyVetoToOrch(
  orch: OrchLike,
  featureVec: number[],
  opts: { regime?: string } = {}
): Promise<VetoVerdict> {
  if (!Array.isArray(featureVec) || featureVec.length === 0) return evaluate(orch, null);
  let match: AntiPatternMatch | null = null;
  try {
    match = await AP.nearestAntiPattern(
      featureVec,
      opts.regime !== undefined ? { regime: opts.regime } : {}
    );
  } catch {
    // IDB unavailable
  }
  return evaluate(orch, match);
}

export function applyToOrch(
  orch: OrchestratorOutput,
  verdict: VetoVerdict
): OrchestratorOutput {
  if (!verdict || verdict.vetoed === false) return orch;
  return {
    ...orch,
    rawScore: verdict.signal,
    probability: 0.5 + 0.5 * verdict.signal,
    direction: verdict.direction as OrchestratorOutput["direction"],
    metaVeto: {
      kind: verdict.vetoed,
      reason: verdict.reason,
      antiPatternId: verdict.antiPattern?.id ?? null,
      antiPatternLabel: verdict.antiPattern?.label ?? null,
      originalScore: verdict.originalScore,
      originalProb: verdict.originalProb,
    },
  };
}
