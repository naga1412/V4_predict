export {
  isDoji, isHammer, isInvertedHammer, isShootingStar,
  isBullishEngulfing, isBearishEngulfing,
  isBullishHarami, isBearishHarami,
  isMorningStar, isEveningStar,
  detectAll,
} from "./candles.js";
export type { CandleOpts, CandlePatternHit } from "./candles.js";
export {
  detectChartPatterns, summarizeChartPattern,
} from "./chartPatterns.js";
export type {
  PatternAnchor, ChartPattern, DetectChartOpts, DetectChartResult, ChartPatternSummary,
} from "./chartPatterns.js";
