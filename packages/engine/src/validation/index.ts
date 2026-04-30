/**
 * validation barrel — Wave 13.
 */
export * from "./predictionStore.js";
export {
  TF_MS, tfMs, nextCandleOpen, nextCloseAt, msUntilNextClose,
  realizedDirection, realizedReturn,
  verdictFor, validateBatch, summarizeVerdicts,
} from "./validator.js";
export type {
  OHLCBar, BaseVerdict, Verdict, DirectionVerdict, ReturnVerdict,
  IntervalVerdict, SetVerdict, VerdictSummary, BatchResult, CandleLookup,
} from "./validator.js";
export {
  newPageHinkley, updatePageHinkley, rollingAccuracy, newEWMA, updateEWMA,
} from "./drift.js";
export type {
  PageHinkleyState, PageHinkleyOpts, RollingAccuracy, RollingAccuracyOpts, EWMAState,
} from "./drift.js";
export {
  drainOnce, startIntervalMonitor,
} from "./monitor.js";
export type { MonitorOpts, MonitorResult, IntervalMonitorOpts, IntervalMonitor } from "./monitor.js";
