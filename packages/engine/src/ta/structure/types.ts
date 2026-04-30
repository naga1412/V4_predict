/**
 * Shared types for ta/structure modules.
 *
 * All structure functions accept `Bar` (minimum OHLCV) rather than the full
 * Candle (which includes symbol+tf metadata). Bar = Pick<Candle,"t"|"o"|"h"|"l"|"c"|"v">.
 */

export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type PivotKind = "high" | "low";
export type PivotClass = "H" | "L" | "HH" | "HL" | "LH" | "LL";

export interface Pivot {
  i: number;
  t: number;
  price: number;
  kind: PivotKind;
  class?: PivotClass;
}

export type Trend = "up" | "down" | "range" | "unknown";

export interface BreakEvent {
  i: number;
  t: number;
  type: "BoS" | "CHoCH";
  dir: "up" | "down";
  level: number;
}

export interface FVGZone {
  i: number;
  t: number;
  kind: "bull" | "bear";
  top: number;
  bottom: number;
  createdAtIdx: number;
  mitigatedAt?: number;
  mitigatedT?: number;
}

export interface FVGResult {
  open: FVGZone[];
  mitigated: FVGZone[];
}

export interface OrderBlock {
  kind: "bull" | "bear";
  i: number;
  t: number;
  top: number;
  bot: number;
  mid: number;
  mitigated: boolean;
  mitigatedAt: number | null;
}

export interface OrderBlockOpts {
  impulseATRMult?: number;
  impulseLookahead?: number;
  mitigateLookahead?: number;
  atrPeriod?: number;
}

export interface EQLevel {
  price: number;
  indices: number[];
  times: number[];
  touches: number;
  sweptAt: number | null;
}

export interface LiquiditySweep {
  kind: "bullish" | "bearish";
  i: number;
  t: number;
  level: number;
  severity: number;
}

export interface LiquidityResult {
  eqHighs: EQLevel[];
  eqLows: EQLevel[];
  sweeps: LiquiditySweep[];
}

export interface PremiumDiscountZones {
  discount: { from: number; to: number };
  equilibriumLow: { from: number; to: number };
  equilibriumHigh: { from: number; to: number };
  premium: { from: number; to: number };
}

export interface PremiumDiscountInfo {
  rangeHigh: number;
  rangeLow: number;
  mid: number;
  width: number;
  zones: PremiumDiscountZones;
  lastPct: number;
  lastZone: "discount" | "equilibrium" | "premium" | "outside";
}

export interface TLPoint {
  i: number;
  t: number;
  p: number;
}

export interface TLLine {
  slope: number;
  intercept: number;
  r2: number;
  touches: number;
  score: number;
  points: TLPoint[];
  touchPoints: TLPoint[];
  startT: number;
  endT: number;
  sigma: number;
}

export interface TLChannel {
  widthATR: number;
  parallel: boolean;
}

export interface TLBreakout {
  side: "up" | "down";
  atBar: number;
  distATR: number;
  strength: number;
}

export interface TLMeta {
  lookback: number;
  tolerance: number;
  atr: number;
  lastBarIdx: number;
}

export interface TLResult {
  upper: TLLine | null;
  lower: TLLine | null;
  channel: TLChannel;
  lastBreakout: TLBreakout | null;
  meta: TLMeta;
}

export interface SRLevel {
  price: number;
  strength: number;
  touches: number;
  kind: "support" | "resistance" | "both";
  lastTouchedAt: number;
}

export type SessionName = "asia" | "london" | "ny-am" | "ny-pm" | "off-hours" | "unknown";

export interface SessionStats {
  count: number;
  avgRange: number;
  avgVol: number;
}
