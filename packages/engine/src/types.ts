/**
 * Shared TypeScript type definitions extracted from V3 JSDoc @typedef blocks.
 * Single source of truth — all modules import from here.
 */

export interface Candle {
  symbol: string;
  tf: string;
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface PredictionPayload {
  direction?: "long" | "short" | "neutral";
  dir?: "up" | "down" | "flat";
  probability?: number;
  target?: number;
  rawScore?: number;
  refPrice?: number;
}

export interface Prediction {
  id?: number;
  symbol: string;
  tf: string;
  t: number;
  kind: "direction" | "interval" | "set" | "return";
  payload: PredictionPayload;
  validated?: number;
}

export interface Verdict {
  kind?: string;
  hit?: boolean;
  abstain?: boolean;
  covered?: boolean;
  realizedDir?: string;
  realizedDirection?: string;
  realized?: number;
  realizedReturn?: number;
  realizedClose?: number;
  centreResidual?: number;
  absError?: number;
  t?: number;
}

export interface MistakePredicted {
  direction: string;
  prob: number | null;
  target: number | null;
  rawScore: number | null;
}

export interface MistakeRealized {
  direction: string;
  magnitude: number | null;
  close: number | null;
}

export interface TopModule {
  moduleId: string;
  signal: number;
  confidence: number;
}

export interface MistakeContext {
  featureVec: number[] | null;
  regime: string | null;
  wyckoff: string | null;
  macro: string | null;
  atr: number | null;
  topModules: TopModule[] | null;
}

export interface Mistake {
  id?: number;
  predictionId: number;
  symbol: string;
  tf: string;
  t: number;
  kind: string;
  errorType: "direction" | "magnitude" | "interval-miss" | "set-miss";
  errorMag: number;
  predicted: MistakePredicted;
  realized: MistakeRealized;
  context: MistakeContext;
  createdAt: number;
}

export interface AntiPattern {
  id?: number;
  regime: string | null;
  centroid: number[];
  radius: number;
  hitRate: number;
  sampleN: number;
  mistakeN: number;
  direction: "long" | "short" | "mixed";
  errorTypes: Record<string, number>;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export interface AntiPatternMatch {
  antiPattern: AntiPattern;
  distance: number;
  inRadius: boolean;
}

export interface Signal {
  signal: number;
  confidence: number;
  direction: "long" | "short" | "neutral";
  reasons: string[];
  payload?: Record<string, unknown>;
}

export interface ModuleMeta {
  id: string;
  name: string;
  category: string;
  description?: string;
  weight?: number;
}

export interface OrchestratorSignal extends Signal {
  id: string;
  moduleId?: string;
  meta: ModuleMeta;
}

export interface MetaVetoInfo {
  kind: "full" | "softened";
  reason: string | null;
  antiPatternId: number | null;
  antiPatternLabel: string | null;
  originalScore: number;
  originalProb: number;
}

export interface OrchestratorOutput {
  signals: OrchestratorSignal[];
  rawScore: number;
  probability: number;
  direction: "long" | "short" | "neutral";
  confidence: number;
  featureVec?: number[];
  metaVeto?: MetaVetoInfo;
}

export interface Capabilities {
  webgpu: boolean;
  wasm: boolean;
  wasmSIMD: boolean;
  workers: boolean;
  sharedWorker: boolean;
  sab: boolean;
  coiIsolated: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  opfs: boolean;
  fsAccess: boolean;
  persistent: boolean;
  quota: { quota: number; usage: number; freePct: number | null } | null;
  privateMode: boolean;
  websocket: boolean;
  broadcastCh: boolean;
  webLocks: boolean;
  serviceWorker: boolean;
  webCrypto: boolean;
  resizeObserver: boolean;
  intersection: boolean;
  prefersReduced: boolean;
  prefersContrast: boolean;
  touch: boolean;
  smallScreen: boolean;
  dpr: number;
  hardwareCores: number;
  deviceMemGB: number | null;
  ua: string;
  platform: string;
  online: boolean;
  lang: string;
  tz: string;
  _done?: boolean;
}
