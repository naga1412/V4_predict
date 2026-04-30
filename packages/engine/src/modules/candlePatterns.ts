import { neutral, clampSignal, getSeries, getObj, type ModuleCtx, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "candle-patterns",
  name: "Candle Patterns",
  category: "patterns",
  description: "Recent bullish/bearish candle pattern with trend context",
  weight: 0.7,
});

const BULLISH = new Set(["hammer", "bullEngulf", "morningStar", "piercingLine", "tweezerBottom", "insideBullBreak"]);
const BEARISH = new Set(["shootingStar", "bearEngulf", "eveningStar", "darkCloudCover", "tweezerTop", "insideBearBreak"]);

function patternScore(name: string, trend: string): number {
  if (BULLISH.has(name)) return trend === "down" ? 0.7 : trend === "range" ? 0.45 : 0.25;
  if (BEARISH.has(name)) return trend === "up" ? 0.7 : trend === "range" ? 0.45 : 0.25;
  return 0.2;
}

interface PatternRow { i?: number; t?: number; patterns?: string[] }

export function evaluate(ta: TAOutput, ctx: ModuleCtx = {}): Signal {
  const lookback = ctx.lookback ?? 3;
  const pats = getObj<PatternRow[]>(ta, "patterns") ?? [];
  if (pats.length === 0) return neutral("no patterns");
  const closeArr = getSeries(ta, "close");
  const lastIdx = (closeArr?.length ?? 1) - 1;

  let recent: PatternRow | null = null;
  for (let i = pats.length - 1; i >= 0; i--) {
    const p = pats[i]!;
    if (!Number.isInteger(p.i)) continue;
    if (lastIdx - (p.i as number) <= lookback) {
      recent = p;
      break;
    }
    break;
  }
  if (!recent || !Array.isArray(recent.patterns) || recent.patterns.length === 0) {
    return clampSignal({ signal: 0, confidence: 0.05, reasons: ["no recent patterns"] });
  }

  const trend = (ta.trend as string | undefined) ?? "range";
  let bestName = recent.patterns[0]!;
  let bestScore = patternScore(bestName, trend);
  let bestDir = BULLISH.has(bestName) ? 1 : BEARISH.has(bestName) ? -1 : 0;
  for (const name of recent.patterns) {
    const s = patternScore(name, trend);
    if (s > bestScore) {
      bestScore = s;
      bestName = name;
      bestDir = BULLISH.has(name) ? 1 : BEARISH.has(name) ? -1 : 0;
    }
  }
  if (bestDir === 0) return neutral("pattern not directional");

  const age = lastIdx - (recent.i as number);
  const recencyBoost = age === 0 ? 0.15 : age === 1 ? 0.08 : 0;
  const signal = bestDir * Math.min(1, bestScore + recencyBoost);
  const confidence = Math.min(1, bestScore * 0.9 + recencyBoost);
  return clampSignal({
    signal, confidence,
    reasons: [
      `${bestName} (${bestDir > 0 ? "bullish" : "bearish"})`,
      `trend=${trend}`,
      `${age} bar${age === 1 ? "" : "s"} ago`,
    ],
    payload: { pattern: bestName, at: recent.i },
  });
}
