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

// TA patterns (Wave 7)
export {
  isDoji, isHammer, isInvertedHammer, isShootingStar,
  isBullishEngulfing, isBearishEngulfing,
  isBullishHarami, isBearishHarami,
  isMorningStar, isEveningStar,
  detectAll as detectCandlePatterns,
  detectChartPatterns, summarizeChartPattern,
} from "./ta/patterns/index.js";
export type {
  CandleOpts, CandlePatternHit,
  PatternAnchor, ChartPattern, DetectChartOpts, DetectChartResult, ChartPatternSummary,
} from "./ta/patterns/index.js";

// TA volume profile (Wave 7)
export {
  computeVolumeProfile, summarizeProfile, tpoLetter, bucketIndex, valueArea,
} from "./ta/profile/volumeProfileEnhanced.js";
export type {
  VolumeProfileOpts, VPRow, VPBundle, VPSummary, ValueAreaResult,
} from "./ta/profile/volumeProfileEnhanced.js";

// TA structure (Wave 6)
export {
  findPivots, classifyPivots, currentTrend,
  detectBreaks,
  detectFVG,
  detectOrderBlocks,
  detectLiquidity,
  premiumDiscount,
  sessionOf, tagSessions, sessionStats, SESSIONS,
  detectTrendlines, positionInChannel, leastSquares, touchPoints,
} from "./ta/structure/index.js";
export type {
  Bar, Pivot, PivotKind, PivotClass, Trend,
  BreakEvent,
  FVGZone, FVGResult,
  OrderBlock, OrderBlockOpts,
  EQLevel, LiquiditySweep, LiquidityResult,
  PremiumDiscountInfo, PremiumDiscountZones,
  TLLine, TLPoint, TLChannel, TLBreakout, TLMeta, TLResult,
  SRLevel, SessionName, SessionStats,
} from "./ta/structure/index.js";
export { clusterLevels } from "./ta/levels/supportResistance.js";

// TA indicators (Wave 5)
export {
  sma, ema, wma, dema, tema,
  rsi, macd, stochastic, roc,
  atr, adx,
  bbands, keltner,
  vwap, obv, cmf,
  mfi, cci, williamsR, psar, ichimoku,
} from "./ta/indicators/index.js";
export type {
  MACDResult, StochResult,
  ADXResult,
  Bands,
  VWAPOpts,
  PSAROpts, PSARResult,
  IchimokuOpts, IchimokuResult,
} from "./ta/indicators/index.js";

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

// ML primitives (Wave 10)
export {
  mulberry32, gaussianFactory, shuffle, shuffledIndices, randInt, hashStringToU32,
  fitZScore, fitMinMax, applyStats, clipMatrix,
  walkForwardSplit, purgedKFold, gatherRows, gather,
  rollingReturnStd, tripleBarrier, metaLabels, uniquenessWeights, labelDistribution,
  MLP, paramCount, NN_VERSION,
  saveModel, loadModel, deleteModel, countModels, listModels, latestModel, loadByRegime, clearModels,
} from "./ml/index.js";
export type {
  ZScoreStats, MinMaxStats, NormStats,
  WalkForwardOpts, SplitIndices, KFoldOpts, Fold,
  TBLabel, BarrierTouch, TripleBarrierArgs, LabelDistribution,
  ActName, LossName, OptimizerName, LayerConfig, MLPConfig, FitOpts, FitResult, SerializedMLP,
  ModelKind, ModelRow, ModelFilter,
} from "./ml/index.js";

// Meta-Brain + Champion/Challenger (Wave 11)
export {
  aggregate as aggregateMetaBrainInput,
  decide as metaBrainDecide,
  pairForTraining as metaBrainPair,
  labelForTraining as metaBrainLabel,
  readyCount as metaBrainReadyCount,
  maybeTrain as metaBrainMaybeTrain,
  findChampion as metaBrainFindChampion,
  findChallenger as metaBrainFindChallenger,
  setRole as metaBrainSetRole,
  status as metaBrainStatus,
  invalidateModelCache as metaBrainInvalidateCache,
} from "./learn/metaBrain.js";
export type {
  AggregateCtx, MetaBrainDecision, DecideOpts, MetaBrainStatus, MaybeTrainOpts, MaybeTrainResult,
} from "./learn/metaBrain.js";
export {
  runCycle as ccRunCycle,
  onVerdict as ccOnVerdict,
  driftCheck as ccDriftCheck,
  recoverIfDrifted as ccRecoverIfDrifted,
  recentCycles as ccRecentCycles,
  status as ccStatus,
} from "./learn/championChallenger.js";
export type {
  CycleRecord, DriftState, CCStatus,
} from "./learn/championChallenger.js";

// TA Engine + Worker proxy (Wave 9)
export { TAEngine } from "./ta/engine.js";
export type { TAEngineOptions, TAOutput } from "./ta/engine.js";
export { TAEngineProxy } from "./ta/engineProxy.js";

// Validation + monitor + drift (Wave 13)
export {
  savePrediction, loadPrediction, deletePrediction, countPredictions,
  listAllPredictions, listPredictions, duePredictions, markValidated,
  clearPredictions,
  saveValidation, loadValidation, countValidations,
  listAllValidations, listValidations, recentValidations,
  clearValidations, clearAll as clearAllPredictions,
  TF_MS, tfMs, nextCandleOpen, nextCloseAt, msUntilNextClose,
  realizedDirection, realizedReturn,
  verdictFor, validateBatch, summarizeVerdicts,
  newPageHinkley, updatePageHinkley, rollingAccuracy, newEWMA, updateEWMA,
  drainOnce as monitorDrainOnce, startIntervalMonitor,
} from "./validation/index.js";
export type {
  PredictionRow, ValidationRow, PredictionFilter, ValidationFilter, PredictionKind,
  OHLCBar, BaseVerdict, Verdict as ValidatorVerdict,
  DirectionVerdict, ReturnVerdict, IntervalVerdict, SetVerdict,
  VerdictSummary, BatchResult, CandleLookup,
  PageHinkleyState, PageHinkleyOpts, EWMAState,
  MonitorOpts, MonitorResult, IntervalMonitorOpts, IntervalMonitor,
} from "./validation/index.js";

// Modules + Orchestrator (Wave 12)
export {
  MODULES, MODULES_BY_ID, listModules, getModule,
  runModules,
  neutral as moduleNeutral, clampSignal as moduleClampSignal,
} from "./modules/index.js";
export type {
  Signal as ModuleSignal,
  Module, ModuleMeta, ModuleCtx,
  AggregatedSignal, OrchestratorOptions,
  OrchestratorOutput as OrchestratorRunOutput,
} from "./modules/index.js";

// Regime (Wave 8)
export {
  classifyRegime, classifySeries, DEFAULT_THRESHOLDS,
  classifyWyckoff, summarizeWyckoff, bullPct, volumeSlope, rangePct,
  RegimeFSM,
  computeMacroState, summarizeMacro, trendScore,
  EventCalendar, defaultCalendar, DEFAULT_EVENTS, IMPACT,
} from "./regime/index.js";
export type {
  TASnapshot, RegimeThresholds,
  RegimeTrend, RegimeStrength, RegimeVolatility, RegimeAlignment, RegimeMomentum, RegimeBreakout,
  RegimeDescriptor,
  WyckoffPhase, WyckoffBias, WyckoffDescriptor,
  MacroState, MacroLabel, MacroContribution,
  CalendarEvent, NearbyEvent, EventWindow,
} from "./regime/index.js";

// Feed — Binance public market-data
export { fetchKlines, loadHistory, openKlineStream, toBinanceSymbol } from "./feed/binance.js";
export type { KlineCandle, KlineStream } from "./feed/binance.js";
