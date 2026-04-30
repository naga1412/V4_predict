/**
 * TAEngine — orchestrates indicators + structure + patterns + regime
 * into a single TA snapshot bundle. Used by both UI render path and the
 * feature-vector / orchestrator stage.
 */

import { ema } from "./indicators/moving.js";
import { rsi, macd, stochastic, roc } from "./indicators/oscillators.js";
import { bbands } from "./indicators/bands.js";
import { atr, adx } from "./indicators/volatility.js";
import { vwap, obv, cmf } from "./indicators/volume.js";
import { psar } from "./indicators/parabolic.js";
import { ichimoku } from "./indicators/ichimoku.js";
import { cci } from "./indicators/cci.js";
import { williamsR } from "./indicators/williamsr.js";
import { mfi } from "./indicators/mfi.js";
import { detectAll as detectCandlePatterns } from "./patterns/candles.js";
import { findPivots, classifyPivots, currentTrend } from "./structure/swings.js";
import { detectBreaks } from "./structure/bos.js";
import { detectFVG } from "./structure/fvg.js";
import { detectOrderBlocks } from "./structure/orderBlocks.js";
import { detectLiquidity } from "./structure/liquidity.js";
import { premiumDiscount } from "./structure/premiumDiscount.js";
import { detectTrendlines } from "./structure/trendlines.js";
import { detectChartPatterns } from "./patterns/chartPatterns.js";
import { tagSessions, sessionStats } from "./structure/sessions.js";
import { clusterLevels } from "./levels/supportResistance.js";
import { lastFinite } from "./math.js";
import { classifyRegime } from "../regime/classifier.js";
import { classifyWyckoff } from "../regime/wyckoff.js";
import type { Bar } from "./structure/types.js";

export interface TAEngineOptions {
  indicators?: {
    ema?: number[];
    rsi?: number[];
    macd?: Array<[number, number, number]>;
    bb?: Array<[number, number]>;
    atr?: number[];
    adx?: number[];
    stoch?: Array<[number, number]>;
    vwap?: { mode?: "rolling" | "anchored"; period?: number };
    roc?: number[];
    cmf?: number[];
    psar?: { accStart?: number; accStep?: number; accMax?: number };
    ichimoku?: { tenkan?: number; kijun?: number; senkouB?: number; shift?: number };
    cci?: number[];
    williamsR?: number[];
    mfi?: number[];
  };
  structure?: {
    pivots?: { left?: number; right?: number };
    sr?: { atrMult?: number; halfLifeBars?: number; topN?: number };
    fvg?: boolean;
    bos?: boolean;
    orderBlocks?: false | { impulseATRMult?: number; impulseLookahead?: number };
    liquidity?: false | { atrMult?: number; minTouches?: number };
    premiumDiscount?: false | true;
    sessions?: boolean;
    regime?: boolean;
    wyckoff?: false | { lookback?: number; volSlopeBars?: number };
    trendlines?: false | { lookback?: number; toleranceATR?: number; breakoutATR?: number };
    chartPatterns?: boolean;
  };
  patterns?: boolean;
}

const DEFAULT_INDICATORS: Required<TAEngineOptions>["indicators"] = {
  ema: [20, 50, 200],
  rsi: [14],
  macd: [[12, 26, 9]],
  bb: [[20, 2]],
  atr: [14],
  adx: [14],
  stoch: [[14, 3]],
  vwap: { mode: "rolling", period: 20 },
  roc: [10],
  cmf: [20],
  psar: { accStart: 0.02, accStep: 0.02, accMax: 0.2 },
  ichimoku: { tenkan: 9, kijun: 26, senkouB: 52, shift: 26 },
  cci: [20],
  williamsR: [14],
  mfi: [14],
};

const DEFAULT_STRUCTURE: Required<TAEngineOptions>["structure"] = {
  pivots: { left: 2, right: 2 },
  sr: { atrMult: 0.5, halfLifeBars: 500, topN: 20 },
  fvg: true,
  bos: true,
  orderBlocks: { impulseATRMult: 1.5, impulseLookahead: 3 },
  liquidity: { atrMult: 0.25, minTouches: 2 },
  premiumDiscount: true,
  sessions: true,
  regime: true,
  wyckoff: {},
  trendlines: { lookback: 8, toleranceATR: 0.5, breakoutATR: 0.5 },
  chartPatterns: true,
};

// The output is intentionally loose-typed — many fields are dynamic
// (`ema20`, `cci20`, `mfi14`, etc.). Consumers cast to a more specific shape.
export type TAOutput = Record<string, unknown> & {
  empty?: boolean;
  candles?: Bar[];
  __workerMs?: number;
};

export const TAEngine = {
  compute(candles: Bar[], opts: TAEngineOptions = {}): TAOutput {
    if (!Array.isArray(candles) || candles.length < 2) {
      return { candles: candles ?? [], empty: true };
    }
    const indicators = { ...DEFAULT_INDICATORS, ...(opts.indicators ?? {}) };
    const structure = { ...DEFAULT_STRUCTURE, ...(opts.structure ?? {}) };
    const patterns = opts.patterns ?? true;

    const open = candles.map((c) => +c.o);
    const high = candles.map((c) => +c.h);
    const low = candles.map((c) => +c.l);
    const close = candles.map((c) => +c.c);
    const volume = candles.map((c) => +c.v);
    const t = candles.map((c) => +c.t);

    const out: TAOutput = { t, open, high, low, close, volume };

    for (const p of indicators.ema ?? []) (out as Record<string, unknown>)[`ema${p}`] = ema(close, p);
    for (const p of indicators.rsi ?? []) (out as Record<string, unknown>)[`rsi${p}`] = rsi(close, p);
    for (const [f, s, sig] of indicators.macd ?? []) (out as Record<string, unknown>)[`macd_${f}_${s}_${sig}`] = macd(close, f, s, sig);
    for (const [p, k] of indicators.bb ?? []) (out as Record<string, unknown>)[`bb_${p}_${k}`] = bbands(close, p, k);
    for (const p of indicators.atr ?? []) (out as Record<string, unknown>)[`atr${p}`] = atr(high, low, close, p);
    for (const p of indicators.adx ?? []) (out as Record<string, unknown>)[`adx${p}`] = adx(high, low, close, p);
    for (const [k, d] of indicators.stoch ?? []) (out as Record<string, unknown>)[`stoch_${k}_${d}`] = stochastic(high, low, close, k, d);
    if (indicators.vwap) {
      out.vwap = vwap(high, low, close, volume, { ...indicators.vwap, t });
    }
    for (const p of indicators.roc ?? []) (out as Record<string, unknown>)[`roc${p}`] = roc(close, p);
    for (const p of indicators.cmf ?? []) (out as Record<string, unknown>)[`cmf${p}`] = cmf(high, low, close, volume, p);
    out.obv = obv(close, volume);
    if (indicators.psar) out.psar = psar(high, low, indicators.psar);
    if (indicators.ichimoku) out.ichimoku = ichimoku(high, low, close, indicators.ichimoku);
    for (const p of indicators.cci ?? []) (out as Record<string, unknown>)[`cci${p}`] = cci(high, low, close, p);
    for (const p of indicators.williamsR ?? []) (out as Record<string, unknown>)[`wr${p}`] = williamsR(high, low, close, p);
    for (const p of indicators.mfi ?? []) (out as Record<string, unknown>)[`mfi${p}`] = mfi(high, low, close, volume, p);

    const piv = findPivots(candles, structure.pivots ?? {});
    classifyPivots(piv);
    out.pivots = piv;
    out.trend = currentTrend(piv);
    if (structure.bos !== false) out.breaks = detectBreaks(candles, piv);
    if (structure.fvg !== false) out.fvg = detectFVG(candles);

    const atrArr = (out as { atr14?: Float64Array }).atr14 ?? atr(high, low, close, 14);
    const atrLast = lastFinite(Array.from(atrArr));
    const atrMult = structure.sr?.atrMult ?? 0.5;
    const tol = Number.isFinite(atrLast) ? atrLast * atrMult : (lastFinite(close) || 1) * 0.005;
    out.levels = clusterLevels(piv, {
      tolerance: tol,
      halfLifeBars: structure.sr?.halfLifeBars ?? 500,
    }).slice(0, structure.sr?.topN ?? 20);

    if (structure.orderBlocks !== false) {
      out.orderBlocks = detectOrderBlocks(candles, piv, structure.orderBlocks || {});
    }

    if (structure.liquidity !== false) {
      const liqOpts = (typeof structure.liquidity === "object" ? structure.liquidity : null) ?? {};
      const liqTol = Number.isFinite(atrLast)
        ? atrLast * (liqOpts.atrMult ?? 0.25)
        : (lastFinite(close) || 1) * 0.0025;
      out.liquidity = detectLiquidity(candles, piv, {
        tolerance: liqTol,
        minTouches: liqOpts.minTouches ?? 2,
      });
    }

    if (structure.premiumDiscount !== false) {
      out.premiumDiscount = premiumDiscount(candles, piv, {});
    }

    if (structure.sessions !== false) {
      out.sessions = {
        tags: tagSessions(candles),
        stats: sessionStats(candles),
      };
    }

    if (patterns !== false) out.patterns = detectCandlePatterns(candles);

    if (structure.trendlines !== false) {
      const tlOpts = (typeof structure.trendlines === "object" ? structure.trendlines : null) ?? {};
      out.trendlines = detectTrendlines(candles, {
        ...(Number.isFinite(atrLast) ? { atr: atrLast } : {}),
        pivots: structure.pivots ?? {},
        ...tlOpts,
      });
    }
    if (structure.chartPatterns !== false) {
      out.chartPatterns = detectChartPatterns(candles, {
        ...(Number.isFinite(atrLast) ? { atr: atrLast } : {}),
        pivots: structure.pivots ?? {},
      });
    }

    if (structure.regime !== false) {
      out.regime = classifyRegime(out as never);
    }
    if (structure.wyckoff !== false) {
      const wyckoffOpts = typeof structure.wyckoff === "object" ? structure.wyckoff : {};
      out.wyckoff = classifyWyckoff(out as never, wyckoffOpts);
    }

    interface HasMitigated { mitigated?: boolean; kind?: string }
    const obsList = (out.orderBlocks ?? []) as HasMitigated[];
    const obsOpen = obsList.filter((b) => !b.mitigated);
    const lvls = (out.levels ?? []) as Array<{ price: number }>;
    const lastClose = close[close.length - 1] ?? NaN;
    const sessTags = (out.sessions as { tags?: string[] } | undefined)?.tags;
    const liq = out.liquidity as { eqHighs?: unknown[]; eqLows?: unknown[]; sweeps?: unknown[] } | undefined;
    const fvgInfo = out.fvg as { open?: unknown[] } | undefined;
    const breaksInfo = out.breaks as unknown[] | undefined;
    const patList = (out.patterns ?? []) as unknown[];
    const reg = out.regime as { label?: string; trend?: string; strength?: string; volatility?: string } | undefined;
    const pd = out.premiumDiscount as { lastZone?: string } | undefined;

    out.summary = {
      last: {
        close: lastClose,
        ema20: lastFinite(Array.from((out as { ema20?: Float64Array }).ema20 ?? [])),
        ema50: lastFinite(Array.from((out as { ema50?: Float64Array }).ema50 ?? [])),
        ema200: lastFinite(Array.from((out as { ema200?: Float64Array }).ema200 ?? [])),
        rsi14: lastFinite(Array.from((out as { rsi14?: Float64Array }).rsi14 ?? [])),
        atr14: atrLast,
        adx14: lastFinite(Array.from(((out as { adx14?: { adx?: Float64Array } }).adx14?.adx ?? []))),
      },
      trend: out.trend,
      nearestResistance: lvls.find((L) => L.price >= lastClose)?.price ?? null,
      nearestSupport: [...lvls].reverse().find((L) => L.price <= lastClose)?.price ?? null,
      breakCount: breaksInfo?.length ?? 0,
      fvgOpenCount: fvgInfo?.open?.length ?? 0,
      patternsLastN: patList.slice(-5),
      orderBlocksOpen: obsOpen.length,
      bullOBsOpen: obsOpen.filter((b) => b.kind === "bull").length,
      bearOBsOpen: obsOpen.filter((b) => b.kind === "bear").length,
      liquidityEQH: liq?.eqHighs?.length ?? 0,
      liquidityEQL: liq?.eqLows?.length ?? 0,
      recentSweep: liq?.sweeps?.slice(-1)[0] ?? null,
      zone: pd?.lastZone ?? "unknown",
      session: sessTags?.[sessTags.length - 1] ?? "unknown",
      regime: reg?.label ?? "unknown",
      regimeTrend: reg?.trend ?? "unknown",
      regimeStrength: reg?.strength ?? "unknown",
      regimeVolatility: reg?.volatility ?? "unknown",
    };
    return out;
  },
};
