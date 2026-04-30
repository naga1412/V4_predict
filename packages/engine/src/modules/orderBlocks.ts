import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "order-blocks",
  name: "Order Blocks",
  category: "smc",
  description: "Price interaction with unmitigated institutional order blocks",
  weight: 0.9,
});

interface OB { i?: number; top?: number; bot?: number; kind?: string; mitigated?: boolean }

export function evaluate(ta: TAOutput): Signal {
  const c = lastFinite(getSeries(ta, "close"));
  const atr = lastFinite(getSeries(ta, "atr14"));
  const obs = getObj<OB[]>(ta, "orderBlocks") ?? [];
  if (!Number.isFinite(c) || obs.length === 0) return neutral("no OBs or no close");
  const open = obs.filter((b) => !b.mitigated);
  if (open.length === 0) return clampSignal({ signal: 0, confidence: 0.05, reasons: ["no unmitigated OBs"] });

  const tol = Number.isFinite(atr) ? atr * 0.25 : c * 0.0025;
  const closeArr = getSeries(ta, "close");
  const lastIdx = (closeArr?.length ?? 1) - 1;

  let best: { b: OB; inside: boolean; dist: number } | null = null;
  let bestDist = Infinity;
  for (const b of open) {
    const top = b.top ?? -Infinity;
    const bot = b.bot ?? Infinity;
    if (!Number.isFinite(top) || !Number.isFinite(bot)) continue;
    const inside = c >= bot - tol && c <= top + tol;
    const dist = inside ? 0 : Math.min(Math.abs(c - top), Math.abs(c - bot));
    if (inside || dist < tol * 2) {
      if (dist < bestDist) {
        best = { b, inside, dist };
        bestDist = dist;
      }
    }
  }
  if (!best) return clampSignal({ signal: 0, confidence: 0.08, reasons: ["no OB in range"] });

  const kind = best.b.kind;
  const dir = kind === "bull" ? 1 : kind === "bear" ? -1 : 0;
  if (dir === 0) return neutral("OB kind unknown");

  const age = Number.isFinite(best.b.i) ? lastIdx - (best.b.i as number) : 0;
  const freshness = age <= 5 ? 1 : age <= 20 ? 0.7 : age <= 50 ? 0.4 : 0.2;
  const closeness = best.inside ? 1 : Math.max(0, 1 - best.dist / (tol * 2));
  const confidence = Math.min(1, 0.3 + 0.4 * freshness + 0.3 * closeness);
  const signal = dir * (0.3 + 0.7 * confidence);
  return clampSignal({
    signal, confidence,
    reasons: [
      `${kind!.toUpperCase()} OB [${best.b.bot?.toFixed(2) ?? "?"}..${best.b.top?.toFixed(2) ?? "?"}]`,
      best.inside ? "price inside OB" : `${best.dist.toFixed(3)} away`,
      `${age} bar${age === 1 ? "" : "s"} old`,
    ],
    payload: { ob: best.b, inside: best.inside, distance: best.dist },
  });
}
