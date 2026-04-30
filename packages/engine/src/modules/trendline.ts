import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "trendline",
  name: "Trendlines & Channel",
  category: "structure",
  description: "Auto-fitted trendline: slope + R² · breakout · position-in-channel",
  weight: 1.0,
});

interface TLLine { slope: number; intercept: number; r2: number; touches: number; score: number }
interface TLBreakout { side: "up" | "down"; distATR: number; strength: number }
interface TL { upper?: TLLine | null; lower?: TLLine | null; lastBreakout?: TLBreakout | null }

export function evaluate(ta: TAOutput): Signal {
  const tl = getObj<TL>(ta, "trendlines");
  if (!tl || (!tl.upper && !tl.lower)) return neutral("no trendline yet");

  const closeArr = getSeries(ta, "close");
  const lastClose = lastFinite(closeArr);
  const lastBar = (closeArr?.length ?? 1) - 1;
  if (!Number.isFinite(lastClose)) return neutral("no last close");

  const atr = lastFinite(getSeries(ta, "atr14"));
  const best = tl.upper && tl.lower
    ? tl.upper.score >= tl.lower.score ? tl.upper : tl.lower
    : (tl.upper ?? tl.lower);
  if (!best || best.score < 0.3 || best.touches < 3) {
    return clampSignal({
      signal: 0,
      confidence: Math.max(0, Math.min(0.3, best?.score ?? 0)),
      reasons: [`Trendline weak (score=${(best?.score ?? 0).toFixed(2)}, touches=${best?.touches ?? 0})`],
    });
  }
  const slopeNorm = Number.isFinite(atr) && atr > 0 ? best.slope / atr : best.slope;
  const slopeContribution = 0.5 * Math.tanh(slopeNorm * 4);

  let breakoutContribution = 0;
  const reasons: string[] = [];
  if (tl.lastBreakout) {
    const dir = tl.lastBreakout.side === "up" ? 1 : -1;
    breakoutContribution = 0.3 * dir * Math.min(1, tl.lastBreakout.strength || 0);
    reasons.push(`Breakout ${tl.lastBreakout.side.toUpperCase()} (${tl.lastBreakout.distATR.toFixed(2)}·ATR)`);
  }

  let positionContribution = 0;
  if (tl.upper && tl.lower) {
    const yU = tl.upper.slope * lastBar + tl.upper.intercept;
    const yL = tl.lower.slope * lastBar + tl.lower.intercept;
    if (Number.isFinite(yU) && Number.isFinite(yL) && yU > yL) {
      const t = (lastClose - yL) / (yU - yL);
      const pos = Math.max(-1, Math.min(1, 2 * t - 1));
      positionContribution = -0.2 * pos;
      const where = pos > 0.66 ? "upper-band tag" : pos < -0.66 ? "lower-band tag" : "mid-channel";
      reasons.push(`In-channel: ${where} (pos=${pos.toFixed(2)})`);
    }
  }

  reasons.unshift(`Trendline slope=${slopeNorm.toFixed(3)}/ATR · R²=${best.r2.toFixed(2)} · touches=${best.touches}`);

  const signal = slopeContribution + breakoutContribution + positionContribution;
  const confidence = Math.max(0, Math.min(1, best.score * (tl.lastBreakout ? 1.0 : 0.85)));
  return clampSignal({ signal, confidence, reasons, payload: { trendline: tl as unknown as Record<string, unknown> } });
}
