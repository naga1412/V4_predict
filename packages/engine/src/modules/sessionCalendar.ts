import { clampSignal, getObj, type ModuleCtx, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "session-calendar",
  name: "Session / Calendar",
  category: "context",
  description: "Session bias + event-window damping",
  weight: 0.5,
});

export function evaluate(ta: TAOutput, ctx: ModuleCtx = {}): Signal {
  const sessObj = getObj<{ tags?: string[] }>(ta, "sessions");
  const tags = sessObj?.tags ?? [];
  const lastIdx = tags.length - 1;
  const tArr = (ta as { t?: number[] }).t;
  const t = Number.isFinite(ctx.now) ? (ctx.now as number) : (tArr?.[lastIdx] ?? null);
  const session = lastIdx >= 0 ? tags[lastIdx]! : "unknown";
  const reasons = [`session=${session}`];
  let multiplier = 1.0;
  let confidence = 0.1;

  if (session === "off-hours") {
    multiplier = 0.6;
    confidence = 0.1;
    reasons.push("off-hours (lower confidence)");
  } else if (session === "london" || session === "ny-am") {
    multiplier = 1.1;
    confidence = 0.25;
    reasons.push("active session (slight boost)");
  } else if (session === "ny-pm" || session === "asia") {
    multiplier = 1.0;
    confidence = 0.2;
  }

  if (ctx.calendar && Number.isFinite(t) && typeof ctx.calendar.isInEventWindow === "function") {
    const w = ctx.calendar.isInEventWindow(t!, { impact: "high" });
    if (w.active && w.event) {
      multiplier *= 0.4;
      confidence = Math.max(0, confidence - 0.15);
      reasons.push(`in ${w.phase} window of "${w.event.name}"`);
    }
  }

  return clampSignal({
    signal: 0,
    confidence,
    reasons,
    payload: { multiplier, session },
  });
}
