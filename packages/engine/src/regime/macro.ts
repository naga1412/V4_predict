/**
 * Macro Risk-ON / Risk-OFF aggregator from a basket of risk proxies.
 */

import type { MacroState, MacroContribution } from "./types.js";

interface Proxy {
  id: string;
  weight: number;
  sign: 1 | -1;
  label: string;
}

const PROXIES: readonly Proxy[] = Object.freeze([
  { id: "^VIX", weight: 0.25, sign: -1, label: "VIX" },
  { id: "^GSPC", weight: 0.25, sign: 1, label: "SPX" },
  { id: "DX-Y.NYB", weight: 0.2, sign: -1, label: "DXY" },
  { id: "^TNX", weight: 0.15, sign: -1, label: "10Y" },
  { id: "GC=F", weight: 0.15, sign: -1, label: "GOLD" },
] as const);

export function trendScore(closes: ArrayLike<number>, windowBars = 20): number {
  if (!closes || closes.length < 3) return 0;
  const n = Math.max(2, windowBars);
  const start = Math.max(0, closes.length - n);
  let sum = 0;
  let count = 0;
  for (let i = start; i < closes.length; i++) {
    const v = +closes[i]!;
    if (Number.isFinite(v) && v > 0) {
      sum += v;
      count++;
    }
  }
  if (count < 2) return 0;
  const avg = sum / count;
  const last = +closes[closes.length - 1]!;
  if (!Number.isFinite(last) || avg <= 0) return 0;
  const pct = (last - avg) / avg;
  return Math.tanh(pct * 8);
}

export function computeMacroState(
  samples: Record<string, ArrayLike<number>> | null | undefined,
  opts: { window?: number } = {}
): MacroState {
  const window = Number.isFinite(opts.window) ? (opts.window as number) : 20;
  const contributions: MacroContribution[] = [];
  let total = 0;
  let totalWeight = 0;
  const reasons: string[] = [];

  for (const px of PROXIES) {
    const series = samples?.[px.id];
    if (!series || series.length < 3) continue;
    const t = trendScore(series, window);
    const contrib = px.sign * t;
    contributions.push({
      id: px.id,
      label: px.label,
      score: +contrib.toFixed(3),
      weight: px.weight,
    });
    total += contrib * px.weight;
    totalWeight += px.weight;
    if (Math.abs(contrib) >= 0.4) {
      reasons.push(`${px.label} ${contrib > 0 ? "→ risk-on" : "→ risk-off"} (${(contrib * 100).toFixed(0)})`);
    }
  }

  if (totalWeight === 0) {
    return {
      score: 0, label: "unknown", contributions,
      reasons: ["no macro proxies available"], coverage: 0,
    };
  }

  const score = Math.max(-1, Math.min(1, total / totalWeight));
  const label: MacroState["label"] = score >= 0.15 ? "risk-on" : score <= -0.15 ? "risk-off" : "mixed";
  if (!reasons.length) reasons.push(`mixed signals (score=${score.toFixed(2)})`);

  return {
    score: +score.toFixed(3),
    label,
    contributions,
    reasons,
    coverage: +(totalWeight / 1.0).toFixed(2),
  };
}

export function summarizeMacro(state: MacroState | null): string {
  if (!state) return "—";
  const arrow = state.label === "risk-on" ? "▲" : state.label === "risk-off" ? "▼" : "—";
  return `${arrow} ${state.label.toUpperCase()} ${state.score >= 0 ? "+" : ""}${state.score.toFixed(2)}`;
}

export const _internals = { PROXIES };
