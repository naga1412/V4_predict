/**
 * Module Contract: each analysis module exports `meta` and `evaluate(ta, ctx) -> Signal`.
 */

import type { TAOutput } from "../ta/engine.js";

export interface ModuleMeta {
  id: string;
  name: string;
  category: string;
  description: string;
  weight: number;
}

export interface Signal {
  signal: number;
  confidence: number;
  direction: "long" | "short" | "neutral";
  reasons: string[];
  payload?: Record<string, unknown>;
}

export interface Module {
  meta: ModuleMeta;
  evaluate: (ta: TAOutput, ctx?: ModuleCtx) => Signal;
}

export interface ModuleCtx {
  lookback?: number;
  calendar?: { isInEventWindow: (t: number, opts?: { impact?: string }) => { active: boolean; event?: { name: string }; phase?: string | null } };
  now?: number;
  cisd?: Record<string, number | undefined>;
  [k: string]: unknown;
}

export function neutral(reason = "insufficient data"): Signal {
  return { signal: 0, confidence: 0, direction: "neutral", reasons: [reason] };
}

export function clampSignal(sig: Partial<Signal> & Record<string, unknown>): Signal {
  const s = Math.max(-1, Math.min(1, (sig?.signal as number) ?? 0));
  const c = Math.max(0, Math.min(1, (sig?.confidence as number) ?? 0));
  const dir: Signal["direction"] = s > 0.05 ? "long" : s < -0.05 ? "short" : "neutral";
  const reasons = Array.isArray(sig?.reasons) ? (sig.reasons as string[]) : [];
  const out: Signal = { signal: s, confidence: c, direction: dir, reasons };
  if (sig?.payload !== undefined) out.payload = sig.payload as Record<string, unknown>;
  return out;
}

export function num(x: unknown, fallback = NaN): number {
  return Number.isFinite(x) ? +(x as number) : fallback;
}

export function lastFinite(arr: ArrayLike<number> | undefined | null): number {
  if (arr == null) return NaN;
  const n = arr.length;
  if (!Number.isInteger(n)) return NaN;
  for (let i = n - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i] as number;
  }
  return NaN;
}

export function pctDist(c: number, base: number): number {
  return Number.isFinite(c) && Number.isFinite(base) && base !== 0 ? (c - base) / base : 0;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Helper: read indicator series from loose TAOutput by key. */
export function getSeries(ta: TAOutput, key: string): ArrayLike<number> | undefined {
  return (ta as unknown as Record<string, ArrayLike<number> | undefined>)[key];
}

export function getObj<T>(ta: TAOutput, key: string): T | undefined {
  return (ta as unknown as Record<string, T | undefined>)[key];
}
