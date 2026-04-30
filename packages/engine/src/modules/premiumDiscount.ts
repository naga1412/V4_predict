import { neutral, clampSignal, getObj, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "premium-discount",
  name: "Premium / Discount",
  category: "smc",
  description: "Fibonacci-based zone bias within structural range",
  weight: 0.7,
});

interface PD { lastPct?: number; lastZone?: string }

export function evaluate(ta: TAOutput): Signal {
  const pd = getObj<PD>(ta, "premiumDiscount");
  if (!pd || !Number.isFinite(pd.lastPct)) return neutral("no PD range");
  const pct = pd.lastPct as number;
  const zone = pd.lastZone ?? "unknown";

  if (zone === "discount") {
    const extremity = Math.max(0, (0.45 - pct) / 0.45);
    return clampSignal({
      signal: 0.2 + 0.4 * extremity,
      confidence: 0.25 + 0.35 * extremity,
      reasons: [`discount zone (${(pct * 100).toFixed(0)}% of range)`, `extremity=${extremity.toFixed(2)}`],
      payload: { pct, zone },
    });
  }
  if (zone === "premium") {
    const extremity = Math.max(0, (pct - 0.55) / 0.45);
    return clampSignal({
      signal: -(0.2 + 0.4 * extremity),
      confidence: 0.25 + 0.35 * extremity,
      reasons: [`premium zone (${(pct * 100).toFixed(0)}% of range)`, `extremity=${extremity.toFixed(2)}`],
      payload: { pct, zone },
    });
  }
  return clampSignal({
    signal: 0, confidence: 0.1,
    reasons: [`equilibrium (${(pct * 100).toFixed(0)}% of range)`],
  });
}
