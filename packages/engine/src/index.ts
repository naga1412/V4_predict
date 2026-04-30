export const VERSION = "0.0.0";

// Core
export { EventBus } from "./core/bus.js";
export { CircuitBreaker, Health, withRetry, degrade, restore, isDegraded } from "./core/resilience.js";

// Types
export type {
  Candle,
  Prediction,
  PredictionPayload,
  Verdict,
  Mistake,
  AntiPattern,
  AntiPatternMatch,
  Signal,
  OrchestratorSignal,
  OrchestratorOutput,
  Capabilities,
} from "./types.js";

// Data
export { openDB, withStore, put, get, count, rangeByKey, metaGet, metaSet } from "./data/idb.js";
export { DB_NAME, DB_VERSION, STORES, MIGRATIONS } from "./data/schema.js";

// TA math
export { RollingWindow, EMAState, WilderState, RollingMax, RollingMin, trueRange, round, clamp, lastFinite } from "./ta/math.js";

// Learn — M-LEARN-1
export {
  classifyError,
  buildMistake,
  recordMistake,
  count as mistakeCount,
  recent as recentMistakes,
  summary as mistakeSummary,
  clearAll as clearMistakes,
  startAutoRecorder,
} from "./learn/mistakeLedger.js";

// Learn — M-LEARN-2
export {
  discoverAntiPatterns,
  listAntiPatterns,
  nearestAntiPattern,
  sqDist,
  kmeans,
} from "./learn/antiPatterns.js";

// Learn — M-LEARN-3
export { evaluate as evaluateVeto, applyVetoToOrch, applyToOrch } from "./learn/metaVeto.js";

// Feed — Binance public market-data
export { fetchKlines, loadHistory, openKlineStream, toBinanceSymbol } from "./feed/binance.js";
export type { KlineCandle, KlineStream } from "./feed/binance.js";
