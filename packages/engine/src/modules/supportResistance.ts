import { neutral, clampSignal, lastFinite, getSeries, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "support-resistance",
  name: "Support / Resistance",
  category: "levels",
  description: "Proximity to clustered S/R levels weighted by strength",
  weight: 0.9,
});

interface Level { price: number; strength?: number; touches?: number }

export function evaluate(ta: TAOutput): Signal {
  const c = lastFinite(getSeries(ta, "close"));
  const levels = getObj<Level[]>(ta, "levels") ?? [];
  const atr = lastFinite(getSeries(ta, "atr14"));
  if (!Number.isFinite(c) || levels.length === 0) return neutral("no levels");
  const tol = Number.isFinite(atr) ? atr * 0.5 : c * 0.005;

  let supp: Level | null = null;
  let res: Level | null = null;
  for (const L of levels) {
    if (!Number.isFinite(L.price)) continue;
    if (L.price <= c && (!supp || L.price > supp.price)) supp = L;
    if (L.price >= c && (!res || L.price < res.price)) res = L;
  }
  if (!supp && !res) return neutral("no nearby levels");

  const distSupp = supp ? c - supp.price : Infinity;
  const distRes = res ? res.price - c : Infinity;
  const atSupp = distSupp <= tol;
  const atRes = distRes <= tol;

  if (atSupp && supp && !atRes) {
    const strength = Math.min(1, (supp.strength ?? supp.touches ?? 1) / 5);
    return clampSignal({
      signal: 0.4 + 0.4 * strength,
      confidence: 0.4 + 0.3 * strength,
      reasons: [`At support ${supp.price.toFixed(2)}`, `strength=${(supp.strength ?? supp.touches ?? 1).toFixed(1)}`],
      payload: { support: supp, distance: distSupp },
    });
  }
  if (atRes && res && !atSupp) {
    const strength = Math.min(1, (res.strength ?? res.touches ?? 1) / 5);
    return clampSignal({
      signal: -(0.4 + 0.4 * strength),
      confidence: 0.4 + 0.3 * strength,
      reasons: [`At resistance ${res.price.toFixed(2)}`, `strength=${(res.strength ?? res.touches ?? 1).toFixed(1)}`],
      payload: { resistance: res, distance: distRes },
    });
  }

  const total = distSupp + distRes;
  if (!Number.isFinite(total) || total === 0) return neutral("collapsed range");
  const pos = distSupp / total;
  const bias = (0.5 - pos) * 0.5;
  return clampSignal({
    signal: bias,
    confidence: Math.abs(bias) * 2,
    reasons: [
      `Between ${supp?.price?.toFixed(2) ?? "—"} and ${res?.price?.toFixed(2) ?? "—"}`,
      `position ${(pos * 100).toFixed(0)}% of range`,
    ],
  });
}
