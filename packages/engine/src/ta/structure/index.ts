/**
 * ta/structure barrel — Wave 6 ports.
 */
export { findPivots, classifyPivots, currentTrend } from "./swings.js";
export type { PivotOpts } from "./swings.js";
export { detectBreaks } from "./bos.js";
export { detectFVG } from "./fvg.js";
export type { FVGOpts } from "./fvg.js";
export { detectOrderBlocks } from "./orderBlocks.js";
export { detectLiquidity } from "./liquidity.js";
export type { LiquidityOpts } from "./liquidity.js";
export { premiumDiscount } from "./premiumDiscount.js";
export type { PremiumDiscountOpts } from "./premiumDiscount.js";
export { sessionOf, tagSessions, sessionStats, SESSIONS } from "./sessions.js";
export type { SessionOpts } from "./sessions.js";
export {
  detectTrendlines,
  positionInChannel,
  leastSquares,
  touchPoints,
} from "./trendlines.js";
export type { TrendlineOpts, FitResult } from "./trendlines.js";
export type {
  Bar,
  Pivot,
  PivotKind,
  PivotClass,
  Trend,
  BreakEvent,
  FVGZone,
  FVGResult,
  OrderBlock,
  OrderBlockOpts,
  EQLevel,
  LiquiditySweep,
  LiquidityResult,
  PremiumDiscountInfo,
  PremiumDiscountZones,
  TLLine,
  TLPoint,
  TLChannel,
  TLBreakout,
  TLMeta,
  TLResult,
  SRLevel,
  SessionName,
  SessionStats,
} from "./types.js";
