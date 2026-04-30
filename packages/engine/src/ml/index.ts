/**
 * ml barrel — Wave 10 primitives.
 */
export { mulberry32, gaussianFactory, shuffle, shuffledIndices, randInt, hashStringToU32 } from "./rng.js";
export {
  fitZScore, fitMinMax, applyStats, clipMatrix,
} from "./normalize.js";
export type { ZScoreStats, MinMaxStats, NormStats } from "./normalize.js";
export {
  walkForwardSplit, purgedKFold, gatherRows, gather,
} from "./splits.js";
export type { WalkForwardOpts, SplitIndices, KFoldOpts, Fold } from "./splits.js";
export {
  rollingReturnStd, tripleBarrier, metaLabels, uniquenessWeights, labelDistribution,
} from "./labels.js";
export type {
  TBLabel, BarrierTouch, TripleBarrierArgs, LabelDistribution,
} from "./labels.js";
export { MLP, paramCount, NN_VERSION } from "./nn.js";
export type {
  ActName, LossName, OptimizerName,
  LayerConfig, MLPConfig, FitOpts, FitResult, SerializedMLP,
} from "./nn.js";
export {
  saveModel, loadModel, deleteModel, countModels, listAll, listModels,
  latestModel, loadByRegime, clearAll as clearModels,
} from "./modelStore.js";
export type { ModelKind, ModelRow, ModelFilter } from "./modelStore.js";
