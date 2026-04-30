import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleCtx, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "liquidity",
  name: "Liquidity",
  category: "smc",
  description: "Post-sweep reversals and liquidity-target bias",
  weight: 0.9,
});

interface Sweep { i?: number; kind?: string; level?: number }
interface EQ { price?: number; touches?: number }

export function evaluate(ta: TAOutput, ctx: ModuleCtx = {}): Signal {
  const lookback = ctx.lookback ?? 5;
  const c = lastFinite(getSeries(ta, "close"));
  const liq = getObj<{ sweeps?: Sweep[]; eqHighs?: EQ[]; eqLows?: EQ[] }>(ta, "liquidity") ?? {};
  const closeArr = getSeries(ta, "close");
  const lastIdx = (closeArr?.length ?? 1) - 1;
  const sweeps = liq.sweeps ?? [];
  const eqh = liq.eqHighs ?? [];
  const eql = liq.eqLows ?? [];
  if (!Number.isFinite(c)) return neutral("no close");

  let recentSweep: Sweep | null = null;
  for (let k = sweeps.length - 1; k >= 0; k--) {
    const s = sweeps[k]!;
    if (!Number.isInteger(s.i)) continue;
    if (lastIdx - (s.i as number) <= lookback) {
      recentSweep = s;
      break;
    }
    break;
  }
  if (recentSweep) {
    const dir = recentSweep.kind === "bearish" ? 1 : recentSweep.kind === "bullish" ? -1 : 0;
    if (dir !== 0) {
      const age = lastIdx - (recentSweep.i as number);
      const fresh = age === 0 ? 1 : age <= 2 ? 0.8 : 0.5;
      const confidence = 0.35 + 0.45 * fresh;
      return clampSignal({
        signal: dir * (0.4 + 0.4 * fresh),
        confidence,
        reasons: [
          `${recentSweep.kind} sweep ${age} bar${age === 1 ? "" : "s"} ago`,
          `direction ${dir > 0 ? "long (trap reversal)" : "short (trap reversal)"}`,
        ],
        payload: { sweep: recentSweep },
      });
    }
  }

  const tol = (lastFinite(getSeries(ta, "atr14")) || c * 0.005) * 2;
  let nearestEQH: EQ | null = null;
  let nearestEQL: EQ | null = null;
  for (const e of eqh) {
    if (!Number.isFinite(e.price)) continue;
    if (c < (e.price as number) && (!nearestEQH || (e.price as number) < (nearestEQH.price as number))) nearestEQH = e;
  }
  for (const e of eql) {
    if (!Number.isFinite(e.price)) continue;
    if (c > (e.price as number) && (!nearestEQL || (e.price as number) > (nearestEQL.price as number))) nearestEQL = e;
  }
  const distUp = nearestEQH ? (nearestEQH.price as number) - c : Infinity;
  const distDn = nearestEQL ? c - (nearestEQL.price as number) : Infinity;
  if (!Number.isFinite(distUp) && !Number.isFinite(distDn)) {
    return clampSignal({ signal: 0, confidence: 0.05, reasons: ["no liquidity pools"] });
  }
  if (distUp < distDn && distUp < tol * 4) {
    const touches = nearestEQH?.touches ?? 2;
    const strength = Math.min(1, touches / 4);
    return clampSignal({
      signal: 0.15 + 0.2 * strength,
      confidence: 0.2 + 0.2 * strength,
      reasons: [`EQH target ${nearestEQH!.price!.toFixed(2)} above`, `touches=${touches}`],
    });
  }
  if (distDn < distUp && distDn < tol * 4) {
    const touches = nearestEQL?.touches ?? 2;
    const strength = Math.min(1, touches / 4);
    return clampSignal({
      signal: -(0.15 + 0.2 * strength),
      confidence: 0.2 + 0.2 * strength,
      reasons: [`EQL target ${nearestEQL!.price!.toFixed(2)} below`, `touches=${touches}`],
    });
  }
  return clampSignal({ signal: 0, confidence: 0.05, reasons: ["liquidity pools distant"] });
}
