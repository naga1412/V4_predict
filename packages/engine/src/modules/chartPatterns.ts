import { neutral, clampSignal, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "chart-patterns",
  name: "Chart Patterns",
  category: "structure",
  description: "Geometric patterns: H&S, double/triple top/bottom, triangles",
  weight: 1.0,
});

interface ChartPat {
  name: string;
  bias: "bullish" | "bearish";
  confidence: number;
  broken: boolean;
  targetPrice: number | null;
  invalidationPrice: number | null;
}

export function evaluate(ta: TAOutput): Signal {
  const cp = getObj<{ last?: ChartPat | null; patterns?: ChartPat[] }>(ta, "chartPatterns");
  if (!cp?.last) return neutral("no chart pattern detected");
  const p = cp.last;
  if (!Number.isFinite(p.confidence) || p.confidence < 0.35) return neutral(`pattern ${p.name} below confidence floor`);

  const sign = p.bias === "bullish" ? 1 : p.bias === "bearish" ? -1 : 0;
  if (sign === 0) return neutral(`unknown pattern bias for ${p.name}`);

  const breakoutMul = p.broken ? 1.0 : 0.6;
  const signal = sign * p.confidence * breakoutMul;
  const reasons: string[] = [
    `${p.name} (${p.bias}, conf=${p.confidence.toFixed(2)})`,
    p.broken ? "Pattern confirmed (neckline/trigger broken)" : "Pattern formed (awaiting confirmation)",
  ];
  if (Number.isFinite(p.targetPrice)) reasons.push(`Target ≈ ${(p.targetPrice as number).toFixed(4)}`);
  if (Number.isFinite(p.invalidationPrice)) reasons.push(`Invalidation @ ${(p.invalidationPrice as number).toFixed(4)}`);
  return clampSignal({
    signal,
    confidence: p.confidence,
    reasons,
    payload: { pattern: p as unknown as Record<string, unknown>, total: cp.patterns?.length ?? 0 },
  });
}
