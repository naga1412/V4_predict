/**
 * TA indicators barrel — Wave 5 ports.
 * All functions are pure: input arrays in → Float64Array(s) out, NaN during warm-up.
 */
export { sma, ema, wma, dema, tema } from "./moving.js";
export { rsi, macd, stochastic, roc } from "./oscillators.js";
export type { MACDResult, StochResult } from "./oscillators.js";
export { atr, adx } from "./volatility.js";
export type { ADXResult } from "./volatility.js";
export { bbands, keltner } from "./bands.js";
export type { Bands } from "./bands.js";
export { vwap, obv, cmf } from "./volume.js";
export type { VWAPOpts } from "./volume.js";
export { mfi } from "./mfi.js";
export { cci } from "./cci.js";
export { williamsR } from "./williamsr.js";
export { psar } from "./parabolic.js";
export type { PSAROpts, PSARResult } from "./parabolic.js";
export { ichimoku } from "./ichimoku.js";
export type { IchimokuOpts, IchimokuResult } from "./ichimoku.js";
