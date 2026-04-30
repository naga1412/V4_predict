/**
 * Shared types for regime classification.
 *
 * `TASnapshot` is the loose contract from `ta/engine` — a bundle of indicator
 * arrays + structure events. Most fields are optional so partial snapshots
 * still drive the classifier.
 */

export interface TASnapshot {
  // Series
  open?: ArrayLike<number>;
  high?: ArrayLike<number>;
  low?: ArrayLike<number>;
  close?: ArrayLike<number>;
  volume?: ArrayLike<number>;
  // Indicator series (may be Float64Array or number[])
  ema20?: ArrayLike<number>;
  ema50?: ArrayLike<number>;
  ema200?: ArrayLike<number>;
  rsi14?: ArrayLike<number>;
  atr14?: ArrayLike<number>;
  adx14?: { adx: ArrayLike<number>; plusDI: ArrayLike<number>; minusDI: ArrayLike<number> };
  bb_20_2?: { mid: ArrayLike<number>; up: ArrayLike<number>; lo: ArrayLike<number> };
  macd_12_26_9?: { macd: ArrayLike<number>; signal: ArrayLike<number>; hist: ArrayLike<number> };
  // Structure events
  trend?: "up" | "down" | "range" | "unknown";
  breaks?: Array<{ i?: number; t?: number; type?: string; dir?: "up" | "down"; level?: number }>;
}

export interface RegimeThresholds {
  adx: { weak: number; moderate: number; strong: number };
  atrPct: { low: number; high: number };
  bbWidth: { low: number; high: number };
  rsi: { oversold: number; overbought: number };
  breakoutLookback: number;
}

export type RegimeTrend = "up" | "down" | "range";
export type RegimeStrength = "weak" | "moderate" | "strong";
export type RegimeVolatility = "low" | "normal" | "high";
export type RegimeAlignment = "bullish-stack" | "bearish-stack" | "mixed" | "flat";
export type RegimeMomentum = "up" | "down" | "flat";
export type RegimeBreakout = "up" | "down" | "none";

export interface RegimeDescriptor {
  trend: RegimeTrend;
  strength: RegimeStrength;
  volatility: RegimeVolatility;
  alignment: RegimeAlignment;
  momentum: RegimeMomentum;
  breakout: RegimeBreakout;
  label: string;
  score: { trend: number; vol: number; momentum: number };
  inputs?: {
    adx: number; atrPct: number; bbWidth: number;
    rsi14: number; macdHist: number;
    ema20: number; ema50: number; ema200: number;
    plusDI: number; minusDI: number;
  };
}

export type WyckoffPhase = "accumulation" | "markup" | "distribution" | "markdown" | "neutral";
export type WyckoffBias = "bullish" | "bearish" | "neutral";

export interface WyckoffDescriptor {
  phase: WyckoffPhase;
  bias: WyckoffBias;
  bullPct: number;
  rangePct?: number;
  volumeSlope?: number;
  score: { trend: number; vol: number; momentum: number; volume: number };
  reasons: string[];
}

export interface MacroContribution {
  id: string;
  label: string;
  score: number;
  weight: number;
}

export type MacroLabel = "risk-on" | "risk-off" | "mixed" | "unknown";

export interface MacroState {
  score: number;
  label: MacroLabel;
  contributions: MacroContribution[];
  reasons: string[];
  coverage: number;
}

export interface CalendarEvent {
  id: string;
  name: string;
  at: number;
  impact: "high" | "medium" | "low";
  category?: "macro" | "crypto" | "other";
  symbols?: string[];
  durationMs?: number;
}
