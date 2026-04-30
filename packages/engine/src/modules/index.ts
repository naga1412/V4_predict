/**
 * modules barrel — Wave 12.
 */
export {
  neutral, clampSignal, num, lastFinite as moduleLastFinite, pctDist, sigmoid, getSeries, getObj,
} from "./baseModule.js";
export type { Signal, Module, ModuleMeta, ModuleCtx } from "./baseModule.js";
export { MODULES, MODULES_BY_ID, listModules, getModule } from "./registry.js";
export { runModules } from "./orchestrator.js";
export type { AggregatedSignal, OrchestratorOptions, OrchestratorOutput } from "./orchestrator.js";
